import { useEffect, useMemo, useRef, useState } from 'react';
import type { DetectedMedia } from '@/src/types/media';
import type { ExternalPlayerProfile } from '@/src/background/settings/settings-store';
import type { ProviderPolicyResult } from '@/src/core/policy/evaluate-provider-policy';
import { ProtectedActionGate } from '@/src/ui/protected/ProtectedActionGate';
import { OverflowMenu, type MenuAction } from '@/src/ui/shared/OverflowMenu';
import { DuplicateBadge } from './DuplicateBadge';
import { TrackPicker } from './TrackPicker';
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
  onSubtitleOutputChange?: (
    output: NonNullable<DetectedMedia['selectedSubtitleOutput']>,
  ) => void;
  onPreviewHover?: () => void;
  onCopyUrl?: (url: string) => void;
  onCopyFilename?: () => void;
  onCopyAllUrls?: () => void;
  onShareUrl?: (url: string) => void;
  onResolveFilename?: () => void;
  onSendToIntegrations?: () => void;
  externalPlayerProfiles?: ExternalPlayerProfile[];
  onLaunchExternalPlayer?: (profileId: string) => void;
  showIntegrationActions?: boolean;
  remainingStorageBytes?: number;
  duplicateCount?: number;
  onDuplicateClick?: () => void;
  outputFilename?: string;
  providerPolicy?: ProviderPolicyResult;
  onProtectedProceed?: (
    policy: Extract<ProviderPolicyResult, { kind: 'authorized-workflow' }>,
  ) => void;
  onOverrideDownload?: (kind: 'protected' | 'geo') => void;
  isDownloading?: boolean;
  showAssetDiagnostics?: boolean;
  posterDiagnostic?: string;
  hoverDiagnostic?: string;
}

function selectedQualityLabel(media: DetectedMedia): string {
  return (
    media.qualities.find((quality) => quality.value === media.selectedQuality)?.label ??
    media.selectedQuality
  );
}

function formatEstimatedSize(bytes: number): string {
  if (bytes >= 1_073_741_824) {
    return `~${(bytes / 1_073_741_824).toFixed(2)} GB`;
  }
  if (bytes >= 1_048_576) {
    return `~${Math.round(bytes / 1_048_576)} MB`;
  }
  if (bytes >= 1024) {
    return `~${Math.round(bytes / 1024)} KB`;
  }
  return `~${bytes} B`;
}

function estimatedBytes(media: DetectedMedia): number | null {
  if (typeof media.bitrate === 'number' && typeof media.durationSec === 'number') {
    if (media.bitrate > 0 && media.durationSec > 0) {
      return Math.round((media.bitrate / 8) * media.durationSec);
    }
  }
  return null;
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
  onSubtitleOutputChange = () => {},
  onPreviewHover = () => {},
  onCopyUrl,
  onCopyFilename,
  onCopyAllUrls,
  onShareUrl,
  onResolveFilename,
  onSendToIntegrations,
  externalPlayerProfiles = [],
  onLaunchExternalPlayer,
  showIntegrationActions = false,
  remainingStorageBytes,
  duplicateCount,
  onDuplicateClick,
  outputFilename,
  providerPolicy,
  onProtectedProceed,
  onOverrideDownload,
  isDownloading = false,
  showAssetDiagnostics = false,
  posterDiagnostic,
  hoverDiagnostic,
}: MediaCardProps) {
  const isAudio = media.mediaType === 'audio';
  const primaryAction = media.primaryAction ?? {
    kind: 'download' as const,
    label: 'Download',
  };
  const isBlocked = primaryAction.kind === 'blocked';
  const downloadLabel = isDownloading && !isBlocked ? 'Downloading' : primaryAction.label;
  const downloadDisabled = isBlocked || isDownloading;
  const protectedLabel = protectionBadge(media);
  const [hoveringThumb, setHoveringThumb] = useState(false);
  const [showHoverLoading, setShowHoverLoading] = useState(false);
  const hoverRequested = useRef(false);
  const [filenameTooltipVisible, setFilenameTooltipVisible] = useState(false);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (tooltipTimer.current !== null) {
        clearTimeout(tooltipTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!media.previewLoading && !media.previewAssetUrl) {
      hoverRequested.current = false;
    }
  }, [media.previewAssetUrl, media.previewLoading]);

  useEffect(() => {
    if (!hoveringThumb || !media.previewLoading || media.previewAssetUrl) {
      setShowHoverLoading(false);
      return;
    }

    const timer = setTimeout(() => setShowHoverLoading(true), 250);
    return () => clearTimeout(timer);
  }, [hoveringThumb, media.previewAssetUrl, media.previewLoading]);

  function handleTitleEnter() {
    if (tooltipTimer.current !== null) {
      clearTimeout(tooltipTimer.current);
    }
    tooltipTimer.current = setTimeout(() => {
      setFilenameTooltipVisible(true);
    }, 300);
  }

  function handleTitleLeave() {
    if (tooltipTimer.current !== null) {
      clearTimeout(tooltipTimer.current);
      tooltipTimer.current = null;
    }
    setFilenameTooltipVisible(false);
  }

  const estimateBytes = estimatedBytes(media);
  const displaySize = estimateBytes !== null ? formatEstimatedSize(estimateBytes) : media.size;
  const overStorage =
    typeof remainingStorageBytes === 'number' &&
    estimateBytes !== null &&
    estimateBytes > remainingStorageBytes;
  const selectedSubtitleCount = media.selectedSubtitleTrackIds?.length ?? 0;

  function handleThumbEnter() {
    setHoveringThumb(true);
    if (media.previewUnavailableReason) {
      return;
    }
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
      items.push({ id: 'share-qr', label: 'Share QR' });
      items.push({ id: 'resolve-filename', label: 'Resolve filename' });
    }
    if (hasAudioUrl) {
      items.push({ id: 'copy-audio-url', label: 'Copy audio URL' });
    }
    if (hasSubtitleUrl) {
      items.push({ id: 'copy-subtitle-url', label: 'Copy subtitle URL' });
    }
    items.push({ id: 'copy-filename', label: 'Copy filename' });
    items.push({ id: 'copy-all-urls', label: 'Copy all URLs' });
    if (showIntegrationActions && media.url) {
      items.push({ id: 'send-integrations', label: 'Send to integrations' });
      for (const profile of externalPlayerProfiles) {
        items.push({ id: `launch-player:${profile.id}`, label: `Open in ${profile.name}` });
      }
    }
    items.push({ id: 'remove', label: 'Remove', danger: true, divider: true });
    return items;
  }, [media.url, hasAudioUrl, hasSubtitleUrl, showIntegrationActions, externalPlayerProfiles]);

  function handleMenuAction(actionId: string) {
    if (actionId.startsWith('launch-player:')) {
      onLaunchExternalPlayer?.(actionId.slice('launch-player:'.length));
      return;
    }

    switch (actionId) {
      case 'copy-video-url':
        if (media.url) {
          onCopyUrl?.(media.url);
        }
        break;
      case 'share-qr':
        if (media.url) {
          onShareUrl?.(media.url);
        }
        break;
      case 'resolve-filename':
        onResolveFilename?.();
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
      case 'send-integrations':
        onSendToIntegrations?.();
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
          {hoveringThumb && media.previewUnavailableReason ? (
            <span className="media-card__preview-loading">
              {media.previewUnavailableReason}
            </span>
          ) : hoveringThumb && media.previewAssetUrl ? (
            <video
              className="media-card__thumb-video"
              aria-label="Hover preview"
              src={media.previewAssetUrl}
              muted
              loop
              autoPlay
              playsInline
            />
          ) : hoveringThumb && media.previewLoading && showHoverLoading ? (
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
          {typeof duplicateCount === 'number' && duplicateCount > 0 ? (
            <DuplicateBadge
              count={duplicateCount}
              onClick={onDuplicateClick ?? (() => {})}
            />
          ) : null}
          <span
            className="media-card__title truncate"
            onMouseEnter={handleTitleEnter}
            onMouseLeave={handleTitleLeave}
            onFocus={handleTitleEnter}
            onBlur={handleTitleLeave}
            tabIndex={0}
          >
            {media.title}
            {filenameTooltipVisible ? (
              <span
                className="media-card__filename-tooltip"
                role="tooltip"
                data-testid="media-filename-tooltip"
              >
                <span className="media-card__filename-tooltip-name">{media.title}</span>
                <span className="media-card__filename-tooltip-meta">
                  {displaySize}
                  {media.duration ? ` · ${media.duration}` : ''}
                </span>
              </span>
            ) : null}
          </span>
          {outputFilename && outputFilename !== media.title ? (
            <span className="media-card__output-preview">{`→ ${outputFilename}`}</span>
          ) : null}
          <div className="media-card__meta">
            <span className="media-card__chip" title={media.categoryLabel}>
              {media.format}
            </span>
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
            {typeof media.fps === 'number' ? (
              <span className="media-card__chip media-card__chip--fps">
                {media.fps}fps
              </span>
            ) : null}
            {media.channels ? (
              <span className="media-card__chip media-card__chip--channels">
                {media.channels}ch
              </span>
            ) : null}
            {media.default ? (
              <span className="media-card__chip media-card__chip--default">default</span>
            ) : null}
            {media.autoselect ? (
              <span className="media-card__chip media-card__chip--autoselect">
                autoselect
              </span>
            ) : null}
            <span className="media-card__size label-xs">
              {displaySize}
              {overStorage ? (
                <span
                  className="media-card__storage-warning"
                  data-testid="media-storage-warning"
                  aria-label="Estimated size exceeds remaining storage"
                  title="Estimated size exceeds remaining storage"
                >
                  {' '}
                  &#9888;
                </span>
              ) : null}
            </span>
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
        {selectedSubtitleCount > 0 ? (
          <label className="media-card__track">
            <span className="media-card__control-label">Subtitle output</span>
            <select
              aria-label="Subtitle output"
              className="media-card__track-select"
              value={media.selectedSubtitleOutput ?? 'embed'}
              onChange={(event) =>
                onSubtitleOutputChange(
                  event.target.value as NonNullable<DetectedMedia['selectedSubtitleOutput']>,
                )
              }
            >
              <option value="embed">Embed</option>
              <option value="sidecar">Sidecar</option>
              <option value="both">Both</option>
            </select>
          </label>
        ) : null}
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
            onClick={media.previewUnavailableReason ? undefined : onPreview}
            aria-label="Preview"
            title={media.previewUnavailableReason ?? 'Preview'}
            disabled={Boolean(media.previewUnavailableReason)}
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
            onClick={downloadDisabled ? undefined : onDownload}
            aria-label={downloadLabel}
            disabled={downloadDisabled}
            title={isDownloading && !isBlocked ? 'Download in progress' : primaryAction.reason}
          >
            {downloadLabel}
          </button>
          {isBlocked && primaryAction.overridable && onOverrideDownload ? (
            <button
              type="button"
              className="media-card__override-btn"
              onClick={() => onOverrideDownload(primaryAction.consentKind ?? 'protected')}
              title={
                primaryAction.consentKind === 'geo'
                  ? 'Attempt this region-locked download anyway'
                  : 'Download this protected media anyway'
              }
            >
              Download anyway
            </button>
          ) : null}
        </div>
      </div>
      {showAssetDiagnostics && (posterDiagnostic || hoverDiagnostic) ? (
        <div className="media-card__asset-diagnostics" data-testid="media-asset-diagnostics">
          {posterDiagnostic ? (
            <span className="media-card__asset-diagnostic">
              Poster: {posterDiagnostic}
            </span>
          ) : null}
          {hoverDiagnostic ? (
            <span className="media-card__asset-diagnostic">
              Hover: {hoverDiagnostic}
            </span>
          ) : null}
        </div>
      ) : null}
      {isBlocked && providerPolicy ? (
        <ProtectedActionGate
          policy={providerPolicy}
          onProceed={onProtectedProceed ?? (() => {})}
        />
      ) : null}
    </div>
  );
}
