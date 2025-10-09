import { useMemo, useRef, useState } from 'react';
import type { DetectedMedia } from '@/src/types/media';
import type { ProviderPolicyResult } from '@/src/core/policy/evaluate-provider-policy';
import { ProtectedActionGate } from '@/src/ui/protected/ProtectedActionGate';
import { OverflowMenu, type MenuAction } from '@/src/ui/shared/OverflowMenu';
import { TrackPicker } from './TrackPicker';
import { TrimControls } from './TrimControls';
import { VariantPicker } from './VariantPicker';
import './MediaCard.css';

interface MediaCardProps {
  media: DetectedMedia;
  onPreview: () => void;
  onRemove: () => void;
  onDownload: () => void;
  onQualityChange: (quality: string) => void;
  onAudioTrackChange?: (trackIds: string[]) => void;
  onSubtitleTrackChange?: (trackIds: string[]) => void;
  onTrimChange?: (trim: DetectedMedia['trim']) => void;
  onPreviewHover?: () => void;
  onCopyUrl?: (url: string) => void;
  onCopyFilename?: () => void;
  onCopyAllUrls?: () => void;
  providerPolicy?: ProviderPolicyResult;
  onProtectedProceed?: (
    policy: Extract<ProviderPolicyResult, { kind: 'authorized-workflow' }>,
  ) => void;
}

function selectedQualityLabel(media: DetectedMedia): string {
  return (
    media.qualities.find((quality) => quality.value === media.selectedQuality)?.label ??
    media.selectedQuality
  );
}

function protectionBadge(media: DetectedMedia): string | null {
  if (media.status === 'protected' || media.protection?.kind === 'drm') {
    return 'Protected';
  }

  if (media.protection?.kind === 'aes-128') {
    return 'AES-128';
  }

  return null;
}

export function MediaCard({
  media,
  onPreview,
  onRemove,
  onDownload,
  onQualityChange,
  onAudioTrackChange = () => {},
  onSubtitleTrackChange = () => {},
  onTrimChange = () => {},
  onPreviewHover = () => {},
  onCopyUrl,
  onCopyFilename,
  onCopyAllUrls,
  providerPolicy,
  onProtectedProceed,
}: MediaCardProps) {
  const isAudio = media.mediaType === 'audio';
  const primaryAction = media.primaryAction ?? {
    kind: 'download' as const,
    label: 'Download',
  };
  const isBlocked = primaryAction.kind === 'blocked';
  const protectedLabel = protectionBadge(media);
  const trimEnabled = media.protocol === 'hls' || media.protocol === 'dash';
  const [hoveringThumb, setHoveringThumb] = useState(false);
  const hoverRequested = useRef(false);

  function handleThumbEnter() {
    setHoveringThumb(true);
    if (!hoverRequested.current) {
      hoverRequested.current = true;
      onPreviewHover();
    }
  }

  function handleThumbLeave() {
    setHoveringThumb(false);
  }

  const hasAudioUrl = (media.audioTracks ?? []).some((track) => !!track.url);
  const hasSubtitleUrl = (media.subtitleTracks ?? []).some((track) => !!track.url);

  const menuActions = useMemo<MenuAction[]>(() => {
    const items: MenuAction[] = [];
    if (media.url) {
      items.push({ id: 'copy-video-url', label: 'Copy video URL' });
    }
    if (hasAudioUrl) {
      items.push({ id: 'copy-audio-url', label: 'Copy audio URL' });
    }
    if (hasSubtitleUrl) {
      items.push({ id: 'copy-subtitle-url', label: 'Copy subtitle URL' });
    }
    items.push({ id: 'copy-filename', label: 'Copy filename' });
    items.push({ id: 'copy-all-urls', label: 'Copy all URLs' });
    items.push({ id: 'remove', label: 'Remove', danger: true, divider: true });
    return items;
  }, [media.url, hasAudioUrl, hasSubtitleUrl]);

  function handleMenuAction(actionId: string) {
    switch (actionId) {
      case 'copy-video-url':
        if (media.url) {
          onCopyUrl?.(media.url);
        }
        break;
      case 'copy-audio-url': {
        const url = (media.audioTracks ?? []).find((track) => !!track.url)?.url;
        if (url) {
          onCopyUrl?.(url);
        }
        break;
      }
      case 'copy-subtitle-url': {
        const url = (media.subtitleTracks ?? []).find((track) => !!track.url)?.url;
        if (url) {
          onCopyUrl?.(url);
        }
        break;
      }
      case 'copy-filename':
        onCopyFilename?.();
        break;
      case 'copy-all-urls':
        onCopyAllUrls?.();
        break;
      case 'remove':
        onRemove();
        break;
    }
  }

  return (
    <div className="media-card">
      <div className="media-card__row">
        <div
          className="media-card__thumb"
          data-testid="media-thumb"
          onMouseEnter={handleThumbEnter}
          onMouseLeave={handleThumbLeave}
        >
          {hoveringThumb && media.previewAssetUrl ? (
            <video
              className="media-card__thumb-video"
              aria-label="Hover preview"
              src={media.previewAssetUrl}
              muted
              loop
              autoPlay
              playsInline
            />
          ) : hoveringThumb && media.previewLoading ? (
            <span className="media-card__preview-loading">Loading</span>
          ) : media.thumbnailUrl ? (
            <img
              className="media-card__thumb-img"
              src={media.thumbnailUrl}
              alt={`${media.title} thumbnail`}
              referrerPolicy="no-referrer"
            />
          ) : isAudio ? (
            <span className="media-card__audio-icon" data-testid="audio-icon">
              Audio
            </span>
          ) : (
            <span className="media-card__video-icon">Play</span>
          )}
          <span className="media-card__duration">{media.duration}</span>
        </div>

        <div className="media-card__info">
          <span className="media-card__title truncate" title={media.title}>
            {media.title}
          </span>
          <div className="media-card__meta">
            <span className="media-card__chip">{media.format}</span>
            {media.selectedQuality ? (
              <span className="media-card__chip media-card__chip--quality">
                {selectedQualityLabel(media)}
              </span>
            ) : null}
            {protectedLabel ? (
              <span className="media-card__chip media-card__chip--protected">
                {protectedLabel}
              </span>
            ) : null}
            <span className="media-card__size label-xs">{media.size}</span>
          </div>
        </div>
      </div>

      <div className="media-card__controls">
        <TrackPicker
          kind="audio"
          tracks={media.audioTracks ?? []}
          selectedIds={media.selectedAudioTrackIds ?? []}
          onChange={onAudioTrackChange}
        />
        <TrackPicker
          kind="subtitle"
          tracks={media.subtitleTracks ?? []}
          selectedIds={media.selectedSubtitleTrackIds ?? []}
          onChange={onSubtitleTrackChange}
        />
        <TrimControls
          enabled={trimEnabled}
          value={media.trim ?? null}
          onChange={onTrimChange}
        />
      </div>

      <div className="media-card__actions">
        <VariantPicker
          options={media.qualities}
          selectedValue={media.selectedQuality}
          onChange={onQualityChange}
        />

        <div className="media-card__buttons">
          <button
            className="media-card__icon-btn"
            onClick={onPreview}
            aria-label="Preview"
            title="Preview"
          >
            <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
              <path d="M10 4.5C5.8 4.5 2.3 7.3 1 10c1.3 2.7 4.8 5.5 9 5.5s7.7-2.8 9-5.5c-1.3-2.7-4.8-5.5-9-5.5zm0 9a3.5 3.5 0 110-7 3.5 3.5 0 010 7zm0-5.5a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
          </button>
          <OverflowMenu
            actions={menuActions}
            onAction={handleMenuAction}
            aria-label="More actions"
          />
          <button
            className={`media-card__download-btn ${
              isBlocked ? 'media-card__download-btn--blocked' : ''
            }`}
            onClick={isBlocked ? undefined : onDownload}
            aria-label={primaryAction.label}
            disabled={isBlocked}
            title={primaryAction.reason}
          >
            {primaryAction.label}
          </button>
        </div>
      </div>
      {isBlocked && providerPolicy ? (
        <ProtectedActionGate
          policy={providerPolicy}
          onProceed={onProtectedProceed ?? (() => {})}
        />
      ) : null}
    </div>
  );
}
