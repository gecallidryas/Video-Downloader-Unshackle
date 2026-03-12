import { useCallback, useEffect, useRef, useState } from 'react';
import './VideoPlayer.css';

export interface VideoPlayerProps {
  videoRef: (element: HTMLVideoElement | null) => void;
  sourceUrl: string;
  playerKey: number;
}

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export function VideoPlayer({ videoRef, sourceUrl, playerKey }: VideoPlayerProps) {
  const internalRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setVideoElement = useCallback(
    (el: HTMLVideoElement | null) => {
      internalRef.current = el;
      videoRef(el);
    },
    [videoRef],
  );

  useEffect(() => {
    const video = internalRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      if (!seeking) setCurrentTime(video.currentTime);
    };
    const onDuration = () => {
      if (Number.isFinite(video.duration)) setDuration(video.duration);
    };
    const onProgress = () => {
      if (video.buffered.length > 0) {
        setBufferedEnd(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    const onVolumeChange = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDuration);
    video.addEventListener('loadedmetadata', onDuration);
    video.addEventListener('progress', onProgress);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('volumechange', onVolumeChange);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDuration);
      video.removeEventListener('loadedmetadata', onDuration);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('volumechange', onVolumeChange);
    };
  }, [playerKey, seeking]);

  function togglePlay() {
    const video = internalRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }

  function seekBy(deltaSec: number) {
    const video = internalRef.current;
    if (!video) return;
    const videoDuration = Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : duration;
    const upperBound = videoDuration > 0 ? videoDuration : Number.MAX_SAFE_INTEGER;
    const nextTime = Math.max(0, Math.min(upperBound, video.currentTime + deltaSec));
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function handleVideoDoubleClick(e: React.MouseEvent<HTMLVideoElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    seekBy(e.clientX < midpoint ? -10 : 10);
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const t = Number(e.target.value);
    setCurrentTime(t);
    if (internalRef.current) internalRef.current.currentTime = t;
  }

  function handleVolumeInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value);
    setVolume(v);
    if (internalRef.current) {
      internalRef.current.volume = v;
      internalRef.current.muted = false;
      setMuted(false);
    }
  }

  function toggleMute() {
    if (!internalRef.current) return;
    const next = !internalRef.current.muted;
    internalRef.current.muted = next;
    setMuted(next);
  }

  function changeSpeed(rate: number) {
    setSpeed(rate);
    if (internalRef.current) internalRef.current.playbackRate = rate;
    setSpeedMenuOpen(false);
  }

  async function toggleFullscreen() {
    const c = containerRef.current;
    if (!c) return;
    const video = internalRef.current;
    const playResult = video?.play();
    if (playResult && typeof playResult.catch === 'function') {
      void playResult.catch(() => undefined);
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    try {
      if (!c.requestFullscreen) {
        window.open(sourceUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      await c.requestFullscreen();
    } catch {
      window.open(sourceUrl, '_blank', 'noopener,noreferrer');
    }
  }

  function togglePiP() {
    const v = internalRef.current;
    if (!v) return;
    if (document.pictureInPictureElement) void document.exitPictureInPicture();
    else if (v.requestPictureInPicture) void v.requestPictureInPicture();
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function handleKeyDown(e: KeyboardEvent) {
      const video = internalRef.current;
      if (!video) return;
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekBy(-5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekBy(5);
          break;
        case 'j':
          e.preventDefault();
          seekBy(-10);
          break;
        case 'l':
          e.preventDefault();
          seekBy(10);
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
          e.preventDefault();
          void toggleFullscreen();
          break;
        case 'ArrowUp':
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.1);
          break;
      }
    }

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [duration]);

  function scheduleHide() {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setControlsVisible(true);
    if (playing) {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
    }
  }

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufPct = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`vp ${controlsVisible ? '' : 'vp--hide-ui'}`}
      onMouseMove={scheduleHide}
      onMouseLeave={() => playing && setControlsVisible(false)}
      tabIndex={0}
      role="group"
      aria-label="Video player"
    >
      <video
        key={playerKey}
        ref={setVideoElement}
        className="vp__video"
        aria-label="Preview video"
        src={sourceUrl}
        preload="metadata"
        onClick={togglePlay}
        onDoubleClick={handleVideoDoubleClick}
      />

      {!playing && (
        <button className="vp__big-play" onClick={togglePlay} aria-label="Play">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      )}

      <div className="vp__controls">
        <div className="vp__seek-row">
          <div className="vp__seek-track">
            <div className="vp__seek-buf" style={{ width: `${bufPct}%` }} />
            <div className="vp__seek-fill" style={{ width: `${pct}%` }} />
            <input
              type="range"
              className="vp__seek-input"
              aria-label="Seek"
              min={0}
              max={duration || 0}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              onMouseDown={() => setSeeking(true)}
              onMouseUp={() => setSeeking(false)}
            />
          </div>
        </div>

        <div className="vp__bar">
          <div className="vp__left">
            <button className="vp__btn" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button className="vp__btn" onClick={() => seekBy(-10)} aria-label="Back 10 seconds">
              <SkipBackIcon />
            </button>
            <button className="vp__btn" onClick={() => seekBy(10)} aria-label="Forward 10 seconds">
              <SkipForwardIcon />
            </button>

            <button className="vp__btn" onClick={toggleMute} aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'}>
              {muted || volume === 0 ? <VolumeMutedIcon /> : volume < 0.5 ? <VolumeLowIcon /> : <VolumeHighIcon />}
            </button>
            <input
              type="range"
              className="vp__vol"
              aria-label="Volume"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={handleVolumeInput}
            />

            <span className="vp__time" data-testid="player-time">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="vp__right">
            <div className="vp__speed-wrap">
              <button
                className="vp__btn vp__speed-toggle"
                onClick={() => setSpeedMenuOpen((v) => !v)}
                aria-label="Playback speed"
                aria-expanded={speedMenuOpen}
              >
                {speed}x
              </button>
              {speedMenuOpen && (
                <ul className="vp__speed-menu" role="menu" aria-label="Speed options">
                  {SPEED_OPTIONS.map((rate) => (
                    <li key={rate}>
                      <button
                        role="menuitem"
                        className={`vp__speed-item ${rate === speed ? 'vp__speed-item--on' : ''}`}
                        onClick={() => changeSpeed(rate)}
                      >
                        {rate}x
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button className="vp__btn" onClick={togglePiP} aria-label="Picture-in-picture">
              <PipIcon />
            </button>
            <button
              className="vp__btn"
              onClick={() => void toggleFullscreen()}
              aria-label={document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'}
            >
              <FullscreenIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

function SkipBackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M11 18V6l-8.5 6L11 18zm1.5-6l8.5 6V6l-8.5 6z" />
    </svg>
  );
}

function SkipForwardIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M13 6v12l8.5-6L13 6zm-1.5 6L3 6v12l8.5-6z" />
    </svg>
  );
}

function VolumeHighIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  );
}

function VolumeLowIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M18.5 12A4.5 4.5 0 0016 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
    </svg>
  );
}

function VolumeMutedIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
    </svg>
  );
}

function PipIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z" />
    </svg>
  );
}

function FullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
    </svg>
  );
}
