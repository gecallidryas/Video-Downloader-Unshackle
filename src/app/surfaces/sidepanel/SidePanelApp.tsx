import { useEffect, useMemo, useRef, useState } from 'react';
import { usePanelStore } from '@/src/state/usePanelStore';
import { useHistoryStore } from '@/src/state/useHistoryStore';
import {
  hydrateSettingsStore,
  useSettingsStore,
} from '@/src/state/useSettingsStore';
import { PanelHeader } from '@/src/ui/layout/PanelHeader';
import { BottomNav } from '@/src/ui/layout/BottomNav';
import { MediaCard } from '@/src/ui/media/MediaCard';
import { MediaControlPanel } from '@/src/ui/media/MediaControlPanel';
import { PreviewGrid } from '@/src/ui/media/PreviewGrid';
import { DirectUrlPanel, type DirectUrlPanelResult } from '@/src/ui/media/DirectUrlPanel';
import { ProtectedWarning } from '@/src/ui/feedback/ProtectedWarning';
import { RuntimeStatus } from '@/src/ui/feedback/RuntimeStatus';
import { PopupApp } from '@/src/app/surfaces/popup/PopupApp';
import { PreviewModal } from '@/src/ui/preview/PreviewModal';
import { QueueView, type QueueAction, type QueueViewItem } from '@/src/ui/queue/QueueView';
import type { HistoryRow } from '@/src/ui/queue/QueueView';
import { StorageFooter, type StorageLevel } from '@/src/ui/shared/StorageFooter';
import { QRModal } from '@/src/ui/shared/QRModal';
import { copyText } from '@/src/ui/shared/copy-text';
import {
  createRuntimeClient,
  type RuntimeClient,
} from '@/src/lib/runtime/client';
import { createMediaControlBridge } from '@/src/content/media-control-bridge';
import { createDemoMediaCandidates } from '@/src/debug/demo-flow';
import { createAria2Client } from '@/src/integrations/aria2-client';
import { createExternalHub } from '@/src/integrations/external-hub';
import { createPlayerLauncher } from '@/src/integrations/player-launcher';
import { resolveOnlineFilename } from '@/src/core/naming/online-filename-resolver';
import { generateSmartFilename } from '@/src/core/naming/smart-naming';
import { renderProfileCommand } from '@/src/core/export/command-profiles';
import { isAutoDownloadEligible } from '@/src/core/download/auto-download-policy';
import { resolveActiveTabIdFromChrome } from './resolve-active-tab-id';
import { evaluateProviderPolicy } from '@/src/core/policy/evaluate-provider-policy';
import {
  resolveBrowserDownloadCapability,
  resolveBrowserPreviewCapability,
  resolveBrowserThumbnailCapability,
} from '@/src/core/capabilities/browser-capabilities';
import {
  loadPreviousDetections,
} from '@/src/background/state/previous-detections';
import { toDetectedMedia } from '@/src/shared/adapters/media-card';
import type { DetectedMedia } from '@/src/types/media';
import type {
  DownloadJob,
  DownloadPhase,
  GeneratedAssetResult,
  MediaCandidate,
} from '@/video_downloader_types_skeleton';
import './SidePanelApp.css';

type PanelTab = 'downloads' | 'current' | 'settings';
type DetectionView = 'current' | 'all' | 'previous';

const ACTIVE_TAB_STORAGE_KEY = 'unshackle:sidepanel:activeTab';
const CURRENT_TAB_REFRESH_INTERVAL_MS = 1_500;

function mergeCandidatesById(candidates: MediaCandidate[]): MediaCandidate[] {
  return Array.from(new Map(candidates.map((candidate) => [candidate.id, candidate])).values());
}

function readPersistedTab(): PanelTab | null {
  try {
    const raw = globalThis.localStorage?.getItem(ACTIVE_TAB_STORAGE_KEY);
    if (raw === 'downloads' || raw === 'current' || raw === 'settings') {
      return raw;
    }
    if (raw === 'history' || raw === 'queue') {
      return 'downloads';
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function persistTab(tab: PanelTab) {
  try {
    globalThis.localStorage?.setItem(ACTIVE_TAB_STORAGE_KEY, tab);
  } catch {
    // ignore
  }
}

function computeStorageLevel(usage: number, quota: number): StorageLevel {
  if (quota <= 0) {
    return 'ok';
  }
  const pct = (usage / quota) * 100;
  if (pct >= 95) return 'critical';
  if (pct >= 80) return 'high';
  if (pct >= 60) return 'moderate';
  return 'ok';
}

interface DetectionViewProps {
  activeTabId?: number;
  runtimeClient?: RuntimeClient;
}

function DetectionView({ activeTabId, runtimeClient }: DetectionViewProps) {
  const surfaceState = usePanelStore((s) => s.surfaceState);
  const candidates = usePanelStore((s) => s.candidates);
  const liveMediaItems = usePanelStore((s) => s.mediaItems);
  const [detectionView, setDetectionView] = useState<DetectionView>('current');
  const [previousCandidates, setPreviousCandidates] = useState<MediaCandidate[]>([]);
  const [allTabCandidates, setAllTabCandidates] = useState<MediaCandidate[]>([]);
  const [recentOnly, setRecentOnly] = useState(false);
  const [recentExpanded, setRecentExpanded] = useState(false);
  const previousSessionLimit = useSettingsStore((s) => s.previousSessionLimit);

  useEffect(() => {
    if (detectionView !== 'previous') return;
    let cancelled = false;
    void loadPreviousDetections().then((items) => {
      if (cancelled) return;
      const limited = previousSessionLimit > 0
        ? items.slice(0, previousSessionLimit)
        : items;
      setPreviousCandidates(limited);
    });
    return () => {
      cancelled = true;
    };
  }, [detectionView, previousSessionLimit]);

  const viewCandidates =
    detectionView === 'previous'
      ? previousCandidates
      : detectionView === 'all'
        ? allTabCandidates
        : candidates;
  const viewMediaItems =
    detectionView === 'previous'
      ? previousCandidates.map(toDetectedMedia)
      : detectionView === 'all'
        ? allTabCandidates.map(toDetectedMedia)
        : liveMediaItems;
  const mediaItems = recentOnly && !recentExpanded
    ? viewMediaItems
        .map((item) => ({
          item,
          candidate: viewCandidates.find((candidate) => candidate.id === item.id),
        }))
        .sort((a, b) => (b.candidate?.createdAt ?? 0) - (a.candidate?.createdAt ?? 0))
        .slice(0, 20)
        .map(({ item }) => item)
    : viewMediaItems;
  const errorMessage = usePanelStore((s) => s.errorMessage);
  const loadCandidates = usePanelStore((s) => s.loadCandidates);
  const removeItem = usePanelStore((s) => s.removeItem);
  const setQuality = usePanelStore((s) => s.setQuality);
  const setAudioTracks = usePanelStore((s) => s.setAudioTracks);
  const setSubtitleTracks = usePanelStore((s) => s.setSubtitleTracks);
  const setSubtitleOutput = usePanelStore((s) => s.setSubtitleOutput);
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
  const [thumbnailAssets, setThumbnailAssets] = useState<Record<string, GeneratedAssetResult>>({});
  const [previewLoadingIds, setPreviewLoadingIds] = useState<Set<string>>(new Set());
  const [manualHlsInput, setManualHlsInput] = useState('');
  const [manualHlsBaseUrl, setManualHlsBaseUrl] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [resolvedFilenames, setResolvedFilenames] = useState<Record<string, string>>({});
  const [directUrlResults, setDirectUrlResults] = useState<DirectUrlPanelResult[]>([]);
  const autoDownloadedIdsRef = useRef<Set<string>>(new Set());
  const pendingManualCandidatesRef = useRef<MediaCandidate[]>([]);
  const advancedMode = useSettingsStore((s) => s.advancedMode);
  const aria2Enabled = useSettingsStore((s) => s.aria2Enabled);
  const aria2RpcUrl = useSettingsStore((s) => s.aria2RpcUrl);
  const aria2Secret = useSettingsStore((s) => s.aria2Secret);
  const webhookEnabled = useSettingsStore((s) => s.webhookEnabled);
  const webhookUrl = useSettingsStore((s) => s.webhookUrl);
  const externalPlayerProfiles = useSettingsStore((s) => s.externalPlayerProfiles);
  const customCommandTemplate = useSettingsStore((s) => s.customCommandTemplate);
  const autoDownloadEnabled = useSettingsStore((s) => s.autoDownloadEnabled);
  const autoDownloadMinSize = useSettingsStore((s) => s.autoDownloadMinSize);
  const autoDownloadBlacklist = useSettingsStore((s) => s.autoDownloadBlacklist);
  const enableNativeFeatures = useSettingsStore((s) => s.enableNativeFeatures);
  const enableBrowserFallbacks = useSettingsStore((s) => s.enableBrowserFallbacks);
  const [toolPanelOpen, setToolPanelOpen] = useState(false);

  const mediaControlBridge = useMemo(
    () =>
      createMediaControlBridge({
        dispatch: async (command) => {
          if (activeTabId === undefined) return;
          await globalThis.chrome?.tabs?.sendMessage?.(activeTabId, {
            type: 'media-control',
            command,
          });
        },
      }),
    [activeTabId],
  );

  const candidateById = useMemo(
    () => new Map(viewCandidates.map((candidate) => [candidate.id, candidate])),
    [viewCandidates],
  );

  const duplicateCounts = useMemo(() => {
    const keys = new Map<string, number>();
    for (const item of mediaItems) {
      const key = `${item.url ?? ''}|${item.title}`;
      keys.set(key, (keys.get(key) ?? 0) + 1);
    }

    return new Map(
      mediaItems.map((item) => {
        const key = `${item.url ?? ''}|${item.title}`;
        return [item.id, keys.get(key) ?? 1] as const;
      }),
    );
  }, [mediaItems]);

  useEffect(() => {
    if (activeTabId === undefined || !runtimeClient) {
      return;
    }

    void loadCandidates(runtimeClient, activeTabId);
  }, [activeTabId, loadCandidates, runtimeClient]);

  useEffect(() => {
    if (detectionView !== 'all' || !runtimeClient) {
      return;
    }
    let cancelled = false;
    void runtimeClient.getAllCandidates().then((items) => {
      if (!cancelled) {
        setAllTabCandidates(items);
      }
    }).catch((error) => {
      if (!cancelled) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load all tab detections');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [detectionView, runtimeClient, setErrorMessage]);

  useEffect(() => {
    if (activeTabId === undefined || !runtimeClient) {
      return;
    }

    let cancelled = false;
    const refresh = async () => {
      try {
        const candidates = await runtimeClient.getCandidates(activeTabId);
        if (!cancelled) {
          const pendingManual = pendingManualCandidatesRef.current.filter(
            (manualCandidate) =>
              !candidates.some((candidate) => candidate.id === manualCandidate.id),
          );

          if (pendingManual.length !== pendingManualCandidatesRef.current.length) {
            pendingManualCandidatesRef.current = pendingManual;
          }

          setCandidates(mergeCandidatesById([...candidates, ...pendingManual]));
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Unable to refresh detected media',
          );
        }
      }
    };
    const intervalId = window.setInterval(() => void refresh(), CURRENT_TAB_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeTabId, runtimeClient, setCandidates, setErrorMessage]);

  useEffect(() => {
    if (!runtimeClient) return;
    for (const candidate of viewCandidates) {
      if (autoDownloadedIdsRef.current.has(candidate.id)) continue;
      const eligible = isAutoDownloadEligible({
        url: candidate.sourceUrl ?? candidate.manifestUrl ?? '',
        sizeBytes: candidate.sizeEstimateBytes,
        mediaKind: candidate.protocol === 'direct' ? 'direct_media' : candidate.mediaKind,
        protected:
          candidate.status === 'protected' ||
          candidate.protection.kind === 'drm' ||
          candidate.protection.kind === 'unknown',
      }, {
        advancedMode,
        autoDownloadEnabled,
        autoDownloadMinSize,
        autoDownloadBlacklist,
      });
      if (!eligible) continue;
      autoDownloadedIdsRef.current.add(candidate.id);
      void startDownloadWithSelection(candidate.id, { mode: 'best' });
    }
  }, [
    advancedMode,
    autoDownloadBlacklist,
    autoDownloadEnabled,
    autoDownloadMinSize,
    runtimeClient,
    viewCandidates,
  ]);

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

    if (!runtimeClient || !candidate) {
      return undefined;
    }

    const capability = resolveBrowserPreviewCapability(candidate, {
      enableBrowserFallbacks,
    });
    if (!capability.available) {
      return undefined;
    }

    if (!enableNativeFeatures && candidate.protocol !== 'direct') {
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

    if (enableNativeFeatures) {
      await loadPreviewAsset(id);
    }

    setPreviewCandidateId(id);
  }

  useEffect(() => {
    if (!runtimeClient || enableNativeFeatures || !enableBrowserFallbacks) {
      return;
    }

    let cancelled = false;
    const candidatesNeedingBrowserThumb = viewCandidates.filter((candidate) => {
      if (thumbnailAssets[candidate.id]) {
        return false;
      }

      return (
        resolveBrowserThumbnailCapability(candidate, { enableBrowserFallbacks }).capability ===
        'direct-frame-thumbnail'
      );
    });

    for (const candidate of candidatesNeedingBrowserThumb) {
      void runtimeClient
        .getThumbnailAsset(candidate.id)
        .then((asset) => {
          if (cancelled) {
            return;
          }

          setThumbnailAssets((current) => ({ ...current, [candidate.id]: asset }));
        })
        .catch((error) => {
          if (!cancelled) {
            setErrorMessage(
              error instanceof Error ? error.message : 'Unable to load thumbnail asset',
            );
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [
    enableBrowserFallbacks,
    enableNativeFeatures,
    runtimeClient,
    setErrorMessage,
    thumbnailAssets,
    viewCandidates,
  ]);

  async function downloadPreviewSelection(
    trim: { startSec?: number; endSec?: number } | null,
    options?: { outputKind: 'webm' },
  ) {
    if (!previewCandidateId) {
      return;
    }

    const selection = getDownloadSelection(previewCandidateId) ?? { mode: 'custom' as const };
    await startDownloadWithSelection(previewCandidateId, {
      ...selection,
      ...(trim ? { trim } : {}),
      ...(options?.outputKind ? { outputKind: options.outputKind } : {}),
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
      pendingManualCandidatesRef.current = ingested;
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

  function addDemoMedia() {
    const tabId = activeTabId ?? 0;
    const demoCandidates = createDemoMediaCandidates({
      tabId,
      origin: globalThis.location?.origin ?? '',
      pageUrl: globalThis.location?.href ?? '',
      pageTitle: 'Debug demo',
    });
    const merged = mergeCandidatesById([...viewCandidates, ...demoCandidates]);
    pendingManualCandidatesRef.current = mergeCandidatesById([
      ...pendingManualCandidatesRef.current,
      ...demoCandidates,
    ]);
    setCandidates(merged);
  }

  async function resolveFilenameFor(item: DetectedMedia) {
    const candidate = candidateById.get(item.id);
    const url = item.url;
    if (!url) {
      return;
    }

    try {
      const filename = await resolveOnlineFilename({
        url,
        extension: candidate?.fileExtensionHint ?? item.format.toLowerCase(),
        userInitiated: true,
      });
      setResolvedFilenames((current) => ({ ...current, [item.id]: filename }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to resolve filename');
    }
  }

  async function sendToIntegrations(item: DetectedMedia) {
    if (!item.url) {
      return;
    }

    try {
      const hub = createExternalHub({
        aria2Enabled,
        webhookEnabled,
        webhookUrl,
        aria2Client: createAria2Client({
          rpcUrl: aria2RpcUrl,
          secret: aria2Secret,
        }),
        webhookFetch: fetch,
        playerLauncher: createPlayerLauncher({
          sendNativeMessage: async (payload) => {
            const runtime = globalThis.chrome?.runtime;
            if (!runtime?.sendNativeMessage) {
              throw new Error('Native messaging is unavailable.');
            }
            return runtime.sendNativeMessage(
              'com.unshackle.ffmpeg',
              payload,
            ) as Promise<{ ok: boolean }>;
          },
        }),
      });

      await hub.dispatch({
        url: item.url,
        filename: resolvedFilenames[item.id] ?? item.title,
        advancedMode,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to send to integrations');
    }
  }

  async function launchPlayer(item: DetectedMedia, profileId: string) {
    const profile = externalPlayerProfiles.find((entry) => entry.id === profileId);
    if (!profile || !item.url) return;
    try {
      const hub = createExternalHub({
        aria2Enabled: false,
        webhookEnabled: false,
        aria2Client: createAria2Client({ rpcUrl: aria2RpcUrl, secret: aria2Secret }),
        webhookFetch: fetch,
        playerLauncher: createPlayerLauncher({
          sendNativeMessage: async (payload) => {
            const runtime = globalThis.chrome?.runtime;
            if (!runtime?.sendNativeMessage) {
              throw new Error('Native messaging is unavailable.');
            }
            return runtime.sendNativeMessage('com.unshackle.ffmpeg', payload) as Promise<{ ok: boolean }>;
          },
        }),
      });
      await hub.launchPlayer(profile, { url: item.url });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to launch player');
    }
  }

  function expectedOutputFilename(candidate: MediaCandidate | undefined, item: DetectedMedia): string {
    if (resolvedFilenames[item.id]) {
      return resolvedFilenames[item.id];
    }

    return generateSmartFilename({
      id: candidate?.id ?? item.id,
      displayName: candidate?.displayName ?? item.title,
      pageTitle: candidate?.pageTitle,
      pageUrl: candidate?.pageUrl,
      sourceUrl: candidate?.sourceUrl,
      manifestUrl: candidate?.manifestUrl,
      height: candidate?.variants.find((variant) => variant.id === item.selectedQuality)?.height,
      bitrate: candidate?.variants.find((variant) => variant.id === item.selectedQuality)?.bitrate,
      outputFormat: candidate?.fileExtensionHint ?? item.format.toLowerCase(),
    });
  }

  async function submitDirectUrl(input: { url: string; filename?: string; referer?: string; origin?: string }) {
    if (!runtimeClient || activeTabId === undefined) return;
    const tempId = `manual:${Date.now()}`;
    setDirectUrlResults((current) => [
      ...current,
      { id: tempId, url: input.url, filename: input.filename, status: 'pending' },
    ]);
    try {
      const job = await runtimeClient.ingestDirectUrl({ tabId: activeTabId, ...input });
      setDirectUrlResults((current) =>
        current.map((result) =>
          result.id === tempId
            ? { ...result, id: job?.id ?? tempId, status: job ? 'running' : 'completed' }
            : result,
        ),
      );
      if (job) {
        upsertQueueJob(job);
      }
    } catch (error) {
      setDirectUrlResults((current) =>
        current.map((result) =>
          result.id === tempId
            ? {
                ...result,
                status: 'failed',
                error: error instanceof Error ? error.message : 'Manual download failed',
              }
            : result,
        ),
      );
    }
  }

  const previewCandidate = previewCandidateId ? candidateById.get(previewCandidateId) : undefined;
  const previewMedia = previewCandidateId ? mediaItems.find((item) => item.id === previewCandidateId) : undefined;
  const previewSourceUrl =
    previewCandidateId && previewAssets[previewCandidateId]
      ? previewAssets[previewCandidateId].assetUrl
      : previewCandidate?.sourceUrl ?? previewCandidate?.manifestUrl ?? '';
  const previewBrowserRecordingAvailable = previewCandidate
    ? resolveBrowserDownloadCapability({
        candidate: previewCandidate,
        selection: {
          mode: 'custom',
          trim: { startSec: 0, endSec: 1 },
        },
        allowBrowserRecording: true,
        enableBrowserFallbacks,
      }).capability === 'direct-webm-recording'
    : false;

  return (
    <>
      <div className="side-panel__section-header">
        <span className="heading-caps">Detected Media</span>
        <span className="side-panel__badge label-xs">{fileLabel}</span>
        {advancedMode && (
          <button
            type="button"
            className={`side-panel__tool-btn ${toolPanelOpen ? 'side-panel__tool-btn--active' : ''}`}
            aria-label="Manual ingest tools"
            onClick={() => setToolPanelOpen((prev) => !prev)}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z" />
            </svg>
          </button>
        )}
      </div>
      {toolPanelOpen && advancedMode && (
        <div className="manual-hls">
          <PreviewGrid
            advancedMode={advancedMode}
            items={mediaItems.flatMap((item) =>
              item.url
                ? [{
                    id: item.id,
                    url: item.url,
                    filename: item.title,
                    thumbnailUrl: item.thumbnailUrl ?? null,
                    durationSec: item.durationSec,
                    sizeBytes: candidateById.get(item.id)?.sizeEstimateBytes,
                    detectedAt: candidateById.get(item.id)?.createdAt,
                  }]
                : [],
            )}
            onDownloadSelected={(ids) => {
              ids.forEach((id) => void startDownloadWithSelection(id, { mode: 'custom' }));
            }}
            onCopyUrls={(urls) => void copyText(urls.join('\n'))}
            onRemoveSelected={(ids) => ids.forEach((id) => removeItem(id))}
            onRetryProbe={(id) => void loadPreviewAsset(id)}
          />
          <DirectUrlPanel
            results={directUrlResults}
            onSubmit={(input) => void submitDirectUrl(input)}
            onRetry={(id) => {
              const result = directUrlResults.find((item) => item.id === id);
              if (result) {
                void submitDirectUrl({
                  url: result.url,
                  ...(result.filename ? { filename: result.filename } : {}),
                });
              }
            }}
            onStop={(id) => {
              void runtimeClient?.cancelDownload(id).catch(() => undefined);
            }}
          />
          <form
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
              <button type="button" className="manual-hls__button" onClick={addDemoMedia}>
                Add demo media
              </button>
            </div>
          </form>
          <MediaControlPanel bridge={mediaControlBridge} advancedMode={advancedMode} />
        </div>
      )}
      <div className="side-panel__view-tabs" role="tablist" aria-label="Detection scope">
        {(['current', 'all', 'previous'] as const).map((view) => (
          <button
            key={view}
            role="tab"
            aria-selected={detectionView === view}
            className={`side-panel__view-tab ${detectionView === view ? 'side-panel__view-tab--active' : ''}`}
            onClick={() => setDetectionView(view)}
          >
            {view === 'current' ? 'Current Tab' : view === 'all' ? 'All Tabs' : 'Previous Session'}
          </button>
        ))}
      </div>
      <label className="side-panel__recent-toggle">
        <input
          type="checkbox"
          aria-label="Recent only"
          checked={recentOnly}
          onChange={(event) => {
            setRecentOnly(event.target.checked);
            setRecentExpanded(false);
          }}
        />
        Recent only
      </label>
      {showResults || detectionView === 'previous' ? (
        <div className="side-panel__list">
          <ProtectedWarning items={mediaItems} />
          {mediaItems.map((item) => (
            <MediaCard
              key={item.id}
              media={{
                ...item,
                thumbnailUrl: thumbnailAssets[item.id]?.assetUrl ?? item.thumbnailUrl,
                previewAssetUrl: previewAssets[item.id]?.assetUrl,
                previewLoading: previewLoadingIds.has(item.id),
              }}
              onPreview={() => void openPreviewFor(item.id)}
              onPreviewHover={() => void loadPreviewAsset(item.id)}
              onRemove={() => removeItem(item.id)}
              onDownload={() => void startDownload(item.id)}
              onCopyUrl={(url) => void copyText(url).catch((error: unknown) => {
                setErrorMessage(error instanceof Error ? error.message : 'Unable to copy URL');
              })}
              onCopyAllUrls={() => {
                const urls = [
                  item.url,
                  ...(item.audioTracks ?? []).map((track) => track.url),
                  ...(item.subtitleTracks ?? []).map((track) => track.url),
                  ...(item.qualities ?? []).map((quality) => quality.url),
                ].filter((url): url is string => typeof url === 'string' && url.length > 0);

                void copyText(urls.join('\n')).catch((error: unknown) => {
                  setErrorMessage(error instanceof Error ? error.message : 'Unable to copy URLs');
                });
              }}
              onCopyFilename={() => void copyText(item.title).catch((error: unknown) => {
                setErrorMessage(error instanceof Error ? error.message : 'Unable to copy filename');
              })}
              onShareUrl={(url) => setShareUrl(url)}
              onResolveFilename={() => void resolveFilenameFor(item)}
              onSendToIntegrations={() => void sendToIntegrations(item)}
              externalPlayerProfiles={externalPlayerProfiles}
              onLaunchExternalPlayer={(profileId) => void launchPlayer(item, profileId)}
              showIntegrationActions={advancedMode && (aria2Enabled || webhookEnabled || externalPlayerProfiles.length > 0)}
              onQualityChange={(q) => setQuality(item.id, q)}
              onAudioTrackChange={(trackIds) => setAudioTracks(item.id, trackIds)}
              onSubtitleTrackChange={(trackIds) =>
                setSubtitleTracks(item.id, trackIds)
              }
              onSubtitleOutputChange={(output) => setSubtitleOutput(item.id, output)}
              providerPolicy={
                candidateById.has(item.id)
                  ? evaluateProviderPolicy(candidateById.get(item.id)!)
                  : undefined
              }
              onProtectedProceed={(policy) => {
                window.open(policy.proceedUrl, '_blank', 'noopener,noreferrer');
              }}
              duplicateCount={(duplicateCounts.get(item.id) ?? 1) > 1 ? duplicateCounts.get(item.id) : undefined}
              onDuplicateClick={() => setRecentExpanded(true)}
              outputFilename={expectedOutputFilename(candidateById.get(item.id), item)}
            />
          ))}
          {recentOnly && !recentExpanded && viewMediaItems.length > mediaItems.length ? (
            <button
              type="button"
              className="manual-hls__button"
              onClick={() => setRecentExpanded(true)}
            >
              Show {viewMediaItems.length - mediaItems.length} more
            </button>
          ) : null}
          {previewCandidate && previewMedia ? (
            <PreviewModal
              open
              title={previewMedia.title}
              sourceUrl={previewSourceUrl}
              protocol={previewCandidate.protocol}
              browserRecordingAvailable={previewBrowserRecordingAvailable}
              onClose={() => setPreviewCandidateId(null)}
              onDownload={(trim, options) => void downloadPreviewSelection(trim, options)}
            />
          ) : null}
          <QRModal
            url={shareUrl ?? ''}
            open={shareUrl !== null}
            onClose={() => setShareUrl(null)}
          />
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

interface DownloadsPanelProps {
  runtimeClient: RuntimeClient;
}

function DownloadsPanel({ runtimeClient }: DownloadsPanelProps) {
  const mediaItems = usePanelStore((s) => s.mediaItems);
  const candidates = usePanelStore((s) => s.candidates);
  const queueJobs = usePanelStore((s) => s.queueJobs);
  const downloadingIds = usePanelStore((s) => s.downloadingIds);
  const upsertQueueJob = usePanelStore((s) => s.upsertQueueJob);
  const setErrorMessage = usePanelStore((s) => s.setErrorMessage);
  const customCommandTemplate = useSettingsStore((s) => s.customCommandTemplate);
  const advancedMode = useSettingsStore((s) => s.advancedMode);
  const historyRecords = useHistoryStore((s) => s.records);
  const [storage, setStorage] = useState<{ usage: number; quota: number }>({
    usage: 0,
    quota: 0,
  });

  useEffect(() => {
    let cancelled = false;
    const estimate = globalThis.navigator?.storage?.estimate;
    if (typeof estimate !== 'function') {
      return;
    }
    void estimate.call(globalThis.navigator.storage).then((result) => {
      if (cancelled) return;
      setStorage({
        usage: typeof result.usage === 'number' ? result.usage : 0,
        quota: typeof result.quota === 'number' ? result.quota : 0,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const queueItems = useMemo<QueueViewItem[]>(
    () => {
      const mediaById = new Map(mediaItems.map((item) => [item.id, item]));
      const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
      const startedJobIds = new Set(queueJobs.map((job) => job.candidateId));
      const runtimeQueueItems: QueueViewItem[] = queueJobs.map((job) => {
        const item = mediaById.get(job.candidateId);
        const candidate = candidateById.get(job.candidateId);

        return {
          id: job.id,
          title: item?.title ?? job.candidateId,
          status: queueStatusFromPhase(job.phase),
          progressPct: job.progressPct,
          statusText: queueStatusText(job),
          outputUrl: job.output?.outputUrl ?? candidate?.sourceUrl ?? candidate?.manifestUrl,
          outputLabel: job.output?.fileName ?? item?.format,
          outputMimeType: job.output?.mimeType,
          notes: job.output?.notes,
          segments: job.segmentStatuses?.map((segment) => ({
            index: segment.index,
            status: segment.status,
          })),
          selectedSegmentRange: job.selectedSegmentRange,
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
    [candidates, downloadingIds, mediaItems, queueJobs],
  );

  const historyRows = useMemo<HistoryRow[]>(
    () => historyRecords.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      protocol: r.protocol,
      status: r.status,
      mediaKind: r.mediaKind,
      fileName: r.fileName,
      outputMimeType: r.outputMimeType,
      outputNotes: r.outputNotes,
      fileSizeBytes: r.fileSizeBytes,
      pageTitle: r.pageTitle,
      createdAt: r.createdAt,
    })),
    [historyRecords],
  );

  async function handleQueueAction(action: QueueAction, id: string) {
    const item = queueItems.find((queueItem) => queueItem.id === id);
    const job = queueJobs.find((queueJob) => queueJob.id === id);

    try {
      if (action === 'cancel' && job) {
        await runtimeClient.cancelDownload(id);
        upsertQueueJob({
          ...job,
          phase: 'cancelled',
          failure: {
            code: 'USER_CANCELLED',
            message: 'Cancelled by user',
            retryable: false,
          },
        });
        return;
      }

      if (action === 'copy-url' && item?.outputUrl) {
        await copyText(item.outputUrl);
        return;
      }

      if (action === 'copy-filename' && item) {
        await copyText(job?.output?.fileName ?? item.title);
        return;
      }

      if (action === 'open' && item?.outputUrl) {
        window.open(item.outputUrl, '_blank', 'noopener,noreferrer');
        return;
      }

      if (action === 'retry' && job) {
        const updated = await runtimeClient.retryDownload(job.id);
        if (updated) {
          upsertQueueJob(updated);
        }
        return;
      }

      if (action === 'resave' && job) {
        const updated = await runtimeClient.resaveDownload(job.id);
        if (updated) {
          upsertQueueJob(updated);
        }
        return;
      }

      if (action === 'remove' && job) {
        const removed = await runtimeClient.removeDownload(job.id);
        if (removed) {
          usePanelStore.setState((state) => ({
            queueJobs: state.queueJobs.filter((queueJob) => queueJob.id !== job.id),
          }));
        }
        return;
      }

      if (action === 'retry-failed-segments' && job) {
        const updated = await runtimeClient.retryFailedSegments(job.id);
        if (updated) {
          upsertQueueJob(updated);
        }
        return;
      }

      if (action === 'export-partial' && job && item?.selectedSegmentRange) {
        const updated = await runtimeClient.exportPartialHls(
          job.id,
          item.selectedSegmentRange,
        );
        if (updated) {
          upsertQueueJob(updated);
        }
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Queue action failed');
    }
  }

  async function handleCopyCommand(profileId: string, id: string) {
    const item = queueItems.find((queueItem) => queueItem.id === id);
    const job = queueJobs.find((queueJob) => queueJob.id === id);
    const candidate = job ? candidates.find((entry) => entry.id === job.candidateId) : undefined;
    const url = item?.outputUrl ?? candidate?.sourceUrl ?? candidate?.manifestUrl;

    if (!url) {
      setErrorMessage('No URL is available for this queue item');
      return;
    }

    try {
      const command = renderProfileCommand(
        profileId,
        {
          url,
          filename: job?.output?.fileName ?? item?.title,
          referer: candidate?.pageUrl,
          origin: candidate?.origin,
          includeAuthHeaders: false,
        },
        {
          customTemplate: customCommandTemplate,
          advancedMode,
        },
      );
      await copyText(command.command);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to copy command');
    }
  }

  async function handleSegmentRetry(id: string, segmentIndex: number) {
    try {
      const updated = await runtimeClient.retrySegment(id, segmentIndex);
      if (updated) {
        upsertQueueJob(updated);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Segment retry failed');
    }
  }

  async function handleSegmentRangeChange(
    id: string,
    range: { start: number; end: number },
  ) {
    try {
      const updated = await runtimeClient.updateHlsSegmentRange(id, range);
      if (updated) {
        upsertQueueJob(updated);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Segment range update failed');
    }
  }

  return (
    <>
      <QueueView
        items={queueItems}
        historyRecords={historyRows}
        onAction={(action, id) => void handleQueueAction(action, id)}
        onSegmentRetry={(id, segmentIndex) => void handleSegmentRetry(id, segmentIndex)}
        onSegmentRangeChange={(id, range) => void handleSegmentRangeChange(id, range)}
        onCopyCommand={(profileId, id) => void handleCopyCommand(profileId, id)}
      />
      <StorageFooter
        usageBytes={storage.usage}
        quotaBytes={storage.quota}
        level={computeStorageLevel(storage.usage, storage.quota)}
      />
    </>
  );
}

interface SidePanelAppProps {
  activeTabId?: number;
  runtimeClient?: RuntimeClient;
}

export function SidePanelApp({
  activeTabId,
  runtimeClient,
}: SidePanelAppProps = {}) {
  const [activeTab, setActiveTabState] = useState<PanelTab>(
    () => readPersistedTab() ?? 'current',
  );
  const setActiveTab = (tab: PanelTab) => {
    setActiveTabState(tab);
    persistTab(tab);
  };
  const [resolvedActiveTabId, setResolvedActiveTabId] = useState(activeTabId);
  const resolvedRuntimeClient = useMemo(
    () => runtimeClient ?? createRuntimeClient(),
    [runtimeClient],
  );

  useEffect(() => {
    if (runtimeClient) {
      return;
    }

    void hydrateSettingsStore();
  }, [runtimeClient]);

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
        {activeTab === 'downloads' && <DownloadsPanel runtimeClient={resolvedRuntimeClient} />}
        {activeTab === 'settings' && <PopupApp embedded />}
      </main>

      <BottomNav
        activeTab={activeTab}
        onDownloadsClick={() => setActiveTab('downloads')}
        onCurrentClick={() => setActiveTab('current')}
        onSettingsClick={() => setActiveTab('settings')}
      />
    </div>
  );
}
