import { useEffect, useMemo, useState } from 'react';
import { usePanelStore } from '@/src/state/usePanelStore';
import { PanelHeader } from '@/src/ui/layout/PanelHeader';
import { BottomNav } from '@/src/ui/layout/BottomNav';
import { MediaCard } from '@/src/ui/media/MediaCard';
import { ProtectedWarning } from '@/src/ui/feedback/ProtectedWarning';
import { RuntimeStatus } from '@/src/ui/feedback/RuntimeStatus';
import { HistoryApp } from '@/src/app/surfaces/history/HistoryApp';
import { PopupApp } from '@/src/app/surfaces/popup/PopupApp';
import { PreviewModal } from '@/src/ui/preview/PreviewModal';
import { QueueView, type QueueViewItem } from '@/src/ui/queue/QueueView';
import {
  createRuntimeClient,
  type RuntimeClient,
} from '@/src/lib/runtime/client';
import { resolveActiveTabIdFromChrome } from './resolve-active-tab-id';
import { evaluateProviderPolicy } from '@/src/core/policy/evaluate-provider-policy';
import type { DownloadJob, DownloadPhase, GeneratedAssetResult } from '@/video_downloader_types_skeleton';
import './SidePanelApp.css';

type PanelTab = 'history' | 'current' | 'queue' | 'settings';

interface DetectionViewProps {
  activeTabId?: number;
  runtimeClient?: RuntimeClient;
}

function DetectionView({ activeTabId, runtimeClient }: DetectionViewProps) {
  const surfaceState = usePanelStore((s) => s.surfaceState);
  const candidates = usePanelStore((s) => s.candidates);
  const mediaItems = usePanelStore((s) => s.mediaItems);
  const errorMessage = usePanelStore((s) => s.errorMessage);
  const loadCandidates = usePanelStore((s) => s.loadCandidates);
  const removeItem = usePanelStore((s) => s.removeItem);
  const setQuality = usePanelStore((s) => s.setQuality);
  const setAudioTracks = usePanelStore((s) => s.setAudioTracks);
  const setSubtitleTracks = usePanelStore((s) => s.setSubtitleTracks);
  const setTrim = usePanelStore((s) => s.setTrim);
  const getDownloadSelection = usePanelStore((s) => s.getDownloadSelection);
  const upsertQueueJob = usePanelStore((s) => s.upsertQueueJob);
  const downloadItem = usePanelStore((s) => s.downloadItem);
  const setCandidates = usePanelStore((s) => s.setCandidates);
  const setErrorMessage = usePanelStore((s) => s.setErrorMessage);
  const fileCount = mediaItems.length;
  const fileLabel = `${fileCount} ${fileCount === 1 ? 'File' : 'Files'}`;
  const showResults = surfaceState === 'results';
  const [previewCandidateId, setPreviewCandidateId] = useState<string | null>(null);
  const [previewAssets, setPreviewAssets] = useState<Record<string, GeneratedAssetResult>>({});
  const [previewLoadingIds, setPreviewLoadingIds] = useState<Set<string>>(new Set());
  const [manualHlsInput, setManualHlsInput] = useState('');
  const [manualHlsBaseUrl, setManualHlsBaseUrl] = useState('');

  const candidateById = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.id, candidate])),
    [candidates],
  );

  useEffect(() => {
    if (activeTabId === undefined || !runtimeClient) {
      return;
    }

    void loadCandidates(runtimeClient, activeTabId);
  }, [activeTabId, loadCandidates, runtimeClient]);

  async function startDownload(id: string) {
    const selection = getDownloadSelection(id);

    if (!runtimeClient || !selection) {
      downloadItem(id);
      return;
    }

    try {
      const job = await runtimeClient.startDownload(id, selection);
      upsertQueueJob(job);
      downloadItem(id);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to start download',
      );
    }
  }

  async function loadPreviewAsset(id: string): Promise<GeneratedAssetResult | undefined> {
    const candidate = candidateById.get(id);

    if (!runtimeClient || !candidate || candidate.protocol === 'direct') {
      return undefined;
    }

    const existing = previewAssets[id];
    if (existing) {
      return existing;
    }

    setPreviewLoadingIds((current) => new Set([...current, id]));

    try {
      const asset = await runtimeClient.getPreviewAsset(id, { format: 'webm' });
      setPreviewAssets((current) => ({ ...current, [id]: asset }));
      return asset;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load preview asset');
      return undefined;
    } finally {
      setPreviewLoadingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  async function openPreviewFor(id: string) {
    const candidate = candidateById.get(id);
    if (!candidate) {
      return;
    }

    if (candidate.protocol !== 'direct') {
      await loadPreviewAsset(id);
    }

    setPreviewCandidateId(id);
  }

  async function downloadPreviewSelection(trim: { startSec?: number; endSec?: number } | null) {
    if (!previewCandidateId) {
      return;
    }

    const selection = getDownloadSelection(previewCandidateId) ?? { mode: 'custom' as const };
    await startDownloadWithSelection(previewCandidateId, {
      ...selection,
      ...(trim ? { trim } : {}),
    });
    setPreviewCandidateId(null);
  }

  async function startDownloadWithSelection(id: string, selection: ReturnType<typeof getDownloadSelection>) {
    if (!selection) {
      downloadItem(id);
      return;
    }

    if (!runtimeClient) {
      downloadItem(id);
      return;
    }

    try {
      const job = await runtimeClient.startDownload(id, selection);
      upsertQueueJob(job);
      downloadItem(id);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to start download',
      );
    }
  }

  async function ingestManualHls() {
    if (!runtimeClient || activeTabId === undefined) {
      return;
    }

    try {
      const ingested = await runtimeClient.ingestManualHls({
        tabId: activeTabId,
        pageUrl: '',
        input: manualHlsInput,
        ...(manualHlsBaseUrl.trim() ? { baseUrl: manualHlsBaseUrl.trim() } : {}),
      });
      setCandidates(ingested);
      setManualHlsInput('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to ingest HLS input');
    }
  }

  async function loadManualHlsFile(file: File | undefined) {
    if (!file) {
      return;
    }

    setManualHlsInput(await file.text());
  }

  const previewCandidate = previewCandidateId ? candidateById.get(previewCandidateId) : undefined;
  const previewMedia = previewCandidateId ? mediaItems.find((item) => item.id === previewCandidateId) : undefined;
  const previewSourceUrl =
    previewCandidateId && previewAssets[previewCandidateId]
      ? previewAssets[previewCandidateId].assetUrl
      : previewCandidate?.sourceUrl ?? previewCandidate?.manifestUrl ?? '';

  return (
    <>
      <div className="side-panel__section-header">
        <span className="heading-caps">Detected Media</span>
        <span className="side-panel__badge label-xs">{fileLabel}</span>
      </div>
      <form
        className="manual-hls"
        onSubmit={(event) => {
          event.preventDefault();
          void ingestManualHls();
        }}
      >
        <label className="manual-hls__field">
          <span className="label-xs">Manual HLS input</span>
          <textarea
            aria-label="Manual HLS input"
            value={manualHlsInput}
            onChange={(event) => setManualHlsInput(event.target.value)}
            className="manual-hls__textarea"
            rows={3}
          />
        </label>
        <label className="manual-hls__field">
          <span className="label-xs">Base URL</span>
          <input
            aria-label="Base URL"
            value={manualHlsBaseUrl}
            onChange={(event) => setManualHlsBaseUrl(event.target.value)}
            className="manual-hls__input"
          />
        </label>
        <div className="manual-hls__actions">
          <input
            aria-label="Manual HLS file"
            type="file"
            accept=".m3u8,.m3u,.txt,text/plain,application/vnd.apple.mpegurl"
            onChange={(event) => void loadManualHlsFile(event.currentTarget.files?.[0])}
            className="manual-hls__file"
          />
          <button
            type="submit"
            className="manual-hls__button"
            disabled={!manualHlsInput.trim()}
          >
            Ingest HLS
          </button>
        </div>
      </form>
      {showResults ? (
        <div className="side-panel__list">
          <ProtectedWarning items={mediaItems} />
          {mediaItems.map((item) => (
            <MediaCard
              key={item.id}
              media={{
                ...item,
                previewAssetUrl: previewAssets[item.id]?.assetUrl,
                previewLoading: previewLoadingIds.has(item.id),
              }}
              onPreview={() => void openPreviewFor(item.id)}
              onPreviewHover={() => void loadPreviewAsset(item.id)}
              onRemove={() => removeItem(item.id)}
              onDownload={() => void startDownload(item.id)}
              onQualityChange={(q) => setQuality(item.id, q)}
              onAudioTrackChange={(trackIds) => setAudioTracks(item.id, trackIds)}
              onSubtitleTrackChange={(trackIds) =>
                setSubtitleTracks(item.id, trackIds)
              }
              onTrimChange={(trim) => setTrim(item.id, trim)}
              providerPolicy={
                candidateById.has(item.id)
                  ? evaluateProviderPolicy(candidateById.get(item.id)!)
                  : undefined
              }
              onProtectedProceed={(policy) => {
                window.open(policy.proceedUrl, '_blank', 'noopener,noreferrer');
              }}
            />
          ))}
          {previewCandidate && previewMedia ? (
            <PreviewModal
              open
              title={previewMedia.title}
              sourceUrl={previewSourceUrl}
              protocol={previewCandidate.protocol}
              nativeHelperAvailable
              onClose={() => setPreviewCandidateId(null)}
              onDownload={(trim) => void downloadPreviewSelection(trim)}
            />
          ) : null}
        </div>
      ) : (
        <div className="side-panel__list">
          <RuntimeStatus
            surfaceState={surfaceState}
            errorMessage={errorMessage}
          />
        </div>
      )}
    </>
  );
}

function queueStatusFromPhase(phase: DownloadPhase): QueueViewItem['status'] {
  if (phase === 'queued') {
    return 'pending';
  }

  if (phase === 'paused') {
    return 'paused';
  }

  if (phase === 'completed') {
    return 'completed';
  }

  if (phase === 'failed' || phase === 'cancelled') {
    return 'failed';
  }

  return 'running';
}

function queueStatusText(job: DownloadJob): string {
  if (job.failure?.message) {
    return job.failure.message;
  }

  if (job.phase === 'cancelled') {
    return 'Cancelled';
  }

  return job.phase;
}

function QueuePanel() {
  const mediaItems = usePanelStore((s) => s.mediaItems);
  const queueJobs = usePanelStore((s) => s.queueJobs);
  const downloadingIds = usePanelStore((s) => s.downloadingIds);
  const queueItems = useMemo<QueueViewItem[]>(
    () => {
      const mediaById = new Map(mediaItems.map((item) => [item.id, item]));
      const startedJobIds = new Set(queueJobs.map((job) => job.candidateId));
      const runtimeQueueItems: QueueViewItem[] = queueJobs.map((job) => {
        const item = mediaById.get(job.candidateId);

        return {
          id: job.id,
          title: item?.title ?? job.candidateId,
          status: queueStatusFromPhase(job.phase),
          progressPct: job.progressPct,
          statusText: queueStatusText(job),
          outputLabel: item?.format ?? job.output?.fileName,
        };
      });
      const localQueueItems: QueueViewItem[] = mediaItems
        .filter((item) => downloadingIds.has(item.id) && !startedJobIds.has(item.id))
        .map((item) => ({
          id: item.id,
          title: item.title,
          status: 'running' as const,
          progressPct: 1,
          statusText: 'Queued',
          outputLabel: item.format,
        }));

      return [...runtimeQueueItems, ...localQueueItems];
    },
    [downloadingIds, mediaItems, queueJobs],
  );

  return <QueueView items={queueItems} onAction={() => {}} />;
}

interface SidePanelAppProps {
  activeTabId?: number;
  runtimeClient?: RuntimeClient;
}

export function SidePanelApp({
  activeTabId,
  runtimeClient,
}: SidePanelAppProps = {}) {
  const [activeTab, setActiveTab] = useState<PanelTab>('current');
  const [resolvedActiveTabId, setResolvedActiveTabId] = useState(activeTabId);
  const resolvedRuntimeClient = useMemo(
    () => runtimeClient ?? createRuntimeClient(),
    [runtimeClient],
  );

  useEffect(() => {
    if (activeTabId !== undefined) {
      setResolvedActiveTabId(activeTabId);
      return;
    }

    let cancelled = false;

    void resolveActiveTabIdFromChrome().then((tabId) => {
      if (!cancelled) {
        setResolvedActiveTabId(tabId);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeTabId]);

  return (
    <div className="side-panel">
      <PanelHeader />

      <main className="side-panel__body">
        {activeTab === 'current' && (
          <DetectionView
            activeTabId={resolvedActiveTabId}
            runtimeClient={resolvedRuntimeClient}
          />
        )}
        {activeTab === 'queue' && <QueuePanel />}
        {activeTab === 'history' && <HistoryApp embedded />}
        {activeTab === 'settings' && <PopupApp embedded />}
      </main>

      <BottomNav
        activeTab={activeTab}
        onHistoryClick={() => setActiveTab('history')}
        onCurrentClick={() => setActiveTab('current')}
        onQueueClick={() => setActiveTab('queue')}
        onSettingsClick={() => setActiveTab('settings')}
      />
    </div>
  );
}
