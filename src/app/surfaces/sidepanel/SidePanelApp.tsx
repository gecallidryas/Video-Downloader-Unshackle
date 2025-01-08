import { useEffect, useMemo, useState } from 'react';
import { usePanelStore } from '@/src/state/usePanelStore';
import { PanelHeader } from '@/src/ui/layout/PanelHeader';
import { BottomNav } from '@/src/ui/layout/BottomNav';
import { MediaCard } from '@/src/ui/media/MediaCard';
import { ProtectedWarning } from '@/src/ui/feedback/ProtectedWarning';
import { RuntimeStatus } from '@/src/ui/feedback/RuntimeStatus';
import { HistoryApp } from '@/src/app/surfaces/history/HistoryApp';
import { PopupApp } from '@/src/app/surfaces/popup/PopupApp';
import {
  createRuntimeClient,
  type RuntimeClient,
} from '@/src/lib/runtime/client';
import { evaluateProviderPolicy } from '@/src/core/policy/evaluate-provider-policy';
import './SidePanelApp.css';

type PanelTab = 'history' | 'current' | 'settings';

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
  const downloadItem = usePanelStore((s) => s.downloadItem);
  const fileCount = mediaItems.length;
  const fileLabel = `${fileCount} ${fileCount === 1 ? 'File' : 'Files'}`;
  const showResults = surfaceState === 'results';

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

  return (
    <>
      <div className="side-panel__section-header">
        <span className="heading-caps">Detected Media</span>
        <span className="side-panel__badge label-xs">{fileLabel}</span>
      </div>
      {showResults ? (
        <div className="side-panel__list">
          <ProtectedWarning items={mediaItems} />
          {mediaItems.map((item) => (
            <MediaCard
              key={item.id}
              media={item}
              onPreview={() => {}}
              onRemove={() => removeItem(item.id)}
              onDownload={() => downloadItem(item.id)}
              onQualityChange={(q) => setQuality(item.id, q)}
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

interface SidePanelAppProps {
  activeTabId?: number;
  runtimeClient?: RuntimeClient;
}

export function SidePanelApp({
  activeTabId,
  runtimeClient,
}: SidePanelAppProps = {}) {
  const [activeTab, setActiveTab] = useState<PanelTab>('current');
  const resolvedRuntimeClient = useMemo(
    () => runtimeClient ?? createRuntimeClient(),
    [runtimeClient],
  );

  return (
    <div className="side-panel">
      <PanelHeader />

      <main className="side-panel__body">
        {activeTab === 'current' && (
          <DetectionView
            activeTabId={activeTabId}
            runtimeClient={resolvedRuntimeClient}
          />
        )}
        {activeTab === 'history' && <HistoryApp embedded />}
        {activeTab === 'settings' && <PopupApp embedded />}
      </main>

      <BottomNav
        activeTab={activeTab}
        onHistoryClick={() => setActiveTab('history')}
        onCurrentClick={() => setActiveTab('current')}
        onSettingsClick={() => setActiveTab('settings')}
      />
    </div>
  );
}
