import { useState } from 'react';
import { usePanelStore } from '@/src/state/usePanelStore';
import { PanelHeader } from '@/src/ui/layout/PanelHeader';
import { BottomNav } from '@/src/ui/layout/BottomNav';
import { MediaCard } from '@/src/ui/media/MediaCard';
import { HistoryApp } from '@/src/app/surfaces/history/HistoryApp';
import { PopupApp } from '@/src/app/surfaces/popup/PopupApp';
import type { PanelSurfaceState } from '@/src/types/ui-state';
import './SidePanelApp.css';

type PanelTab = 'history' | 'current' | 'settings';

function DetectionStateMessage({
  surfaceState,
  errorMessage,
}: {
  surfaceState: PanelSurfaceState;
  errorMessage: string | null;
}) {
  switch (surfaceState) {
    case 'detecting':
      return <p>Detecting media on this page</p>;
    case 'empty':
      return <p>No media detected on this page</p>;
    case 'error':
      return <p>{errorMessage ?? 'Something went wrong while inspecting this page'}</p>;
    case 'protected_only':
      return (
        <div>
          <p>Protected media detected</p>
          <p>Proceed only if you have explicit permission from the content owner or service.</p>
        </div>
      );
    case 'disabled':
      return <p>Automatic detection is currently disabled</p>;
    default:
      return null;
  }
}

function DetectionView() {
  const surfaceState = usePanelStore((s) => s.surfaceState);
  const mediaItems = usePanelStore((s) => s.mediaItems);
  const errorMessage = usePanelStore((s) => s.errorMessage);
  const removeItem = usePanelStore((s) => s.removeItem);
  const setQuality = usePanelStore((s) => s.setQuality);
  const downloadItem = usePanelStore((s) => s.downloadItem);
  const fileCount = mediaItems.length;
  const fileLabel = `${fileCount} ${fileCount === 1 ? 'File' : 'Files'}`;
  const showResults = surfaceState === 'results';

  return (
    <>
      <div className="side-panel__section-header">
        <span className="heading-caps">Detected Media</span>
        <span className="side-panel__badge label-xs">{fileLabel}</span>
      </div>
      {showResults ? (
        <div className="side-panel__list">
          {mediaItems.map((item) => (
            <MediaCard
              key={item.id}
              media={item}
              onPreview={() => {}}
              onRemove={() => removeItem(item.id)}
              onDownload={() => downloadItem(item.id)}
              onQualityChange={(q) => setQuality(item.id, q)}
            />
          ))}
        </div>
      ) : (
        <div className="side-panel__list">
          <DetectionStateMessage
            surfaceState={surfaceState}
            errorMessage={errorMessage}
          />
        </div>
      )}
    </>
  );
}

export function SidePanelApp() {
  const [activeTab, setActiveTab] = useState<PanelTab>('current');

  return (
    <div className="side-panel">
      <PanelHeader />

      <main className="side-panel__body">
        {activeTab === 'current' && <DetectionView />}
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
