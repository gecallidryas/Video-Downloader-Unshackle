import { useEffect, useMemo, useState } from 'react';
import type { NativeHelperDiagnostic } from '@/src/native/native-helper-diagnostics';
import type { NativeHelperInstallTarget } from '@/src/native/native-helper-links';
import { WelcomeMark } from './illustrations/WelcomeMark';
import { GithubMark } from './illustrations/GithubMark';
import './OnboardingFlow.css';

type ScreenId =
  | 'welcome'
  | 'source'
  | 'theme'
  | 'language'
  | 'native'
  | 'download'
  | 'health'
  | 'donate';

export interface OnboardingFlowProps {
  theme: 'dark' | 'light';
  language: 'en';
  nativeFeaturesEnabled: boolean;
  diagnostic: NativeHelperDiagnostic | null;
  installTarget: NativeHelperInstallTarget;
  busy?: boolean;
  onThemeChange: (theme: 'dark' | 'light') => void;
  onLanguageChange: (language: 'en') => void;
  onNativeFeaturesChange: (enabled: boolean) => void;
  onRequestPermission: () => void;
  onCheckHealth: () => void;
  onDownloadInstaller: () => void;
  onOpenSource: () => void;
  onOpenDonate: () => void;
  onComplete: () => void;
  onSkip: () => void;
}

const SCREEN_LABELS: Record<ScreenId, string> = {
  welcome: 'Welcome',
  source: 'Open source',
  theme: 'Theme',
  language: 'Language',
  native: 'Native',
  download: 'Install',
  health: 'Health',
  donate: 'Support',
};

export function OnboardingFlow(props: OnboardingFlowProps) {
  const {
    theme,
    language,
    nativeFeaturesEnabled,
    diagnostic,
    installTarget,
    busy = false,
    onThemeChange,
    onLanguageChange,
    onNativeFeaturesChange,
    onRequestPermission,
    onCheckHealth,
    onDownloadInstaller,
    onOpenSource,
    onOpenDonate,
    onComplete,
    onSkip,
  } = props;

  const screens = useMemo<ScreenId[]>(() => {
    const base: ScreenId[] = ['welcome', 'source', 'theme', 'language', 'native'];
    if (nativeFeaturesEnabled) {
      base.push('download', 'health');
    }
    base.push('donate');
    return base;
  }, [nativeFeaturesEnabled]);

  const [index, setIndex] = useState(0);
  const activeIndex = Math.min(index, screens.length - 1);
  const current = screens[activeIndex];
  const atLast = activeIndex === screens.length - 1;

  useEffect(() => {
    if (index > screens.length - 1) {
      setIndex(screens.length - 1);
    }
  }, [index, screens.length]);

  function goNext() {
    if (atLast) {
      onComplete();
      return;
    }
    setIndex((value) => Math.min(screens.length - 1, value + 1));
  }

  function goBack() {
    setIndex((value) => Math.max(0, value - 1));
  }

  return (
    <div className="onboarding" role="dialog" aria-modal="true" aria-label="Unshackle onboarding">
      <div className="onboarding__grain" aria-hidden="true" />

      <header className="onboarding__bar">
        <span className="onboarding__wordmark">UNSHACKLE</span>
        <button type="button" className="onboarding__skip" onClick={onSkip}>
          Skip
        </button>
      </header>

      <div className="onboarding__rail" aria-hidden="true">
        {screens.map((screen, i) => (
          <span
            key={screen}
            className={
              i === activeIndex
                ? 'onboarding__rail-seg onboarding__rail-seg--active'
                : i < activeIndex
                  ? 'onboarding__rail-seg onboarding__rail-seg--done'
                  : 'onboarding__rail-seg'
            }
          />
        ))}
      </div>

      <div className="onboarding__viewport">
        <div
          className="onboarding__track"
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        >
          {screens.map((screen) => (
            <section
              key={screen}
              className="onboarding__screen"
              aria-hidden={screen !== current}
              data-active={screen === current}
            >
              {renderScreen(screen, props)}
            </section>
          ))}
        </div>
      </div>

      <footer className="onboarding__nav">
        <button
          type="button"
          className="onboarding__nav-btn"
          onClick={goBack}
          disabled={activeIndex === 0}
        >
          Back
        </button>
        <span className="onboarding__nav-step">
          {SCREEN_LABELS[current]} · {activeIndex + 1}/{screens.length}
        </span>
        <button type="button" className="onboarding__nav-btn onboarding__nav-btn--primary" onClick={goNext}>
          {atLast ? 'Get started' : 'Next'}
        </button>
      </footer>
    </div>
  );

  function renderScreen(screen: ScreenId, p: OnboardingFlowProps) {
    switch (screen) {
      case 'welcome':
        return (
          <div className="onboarding__content onboarding__content--center">
            <WelcomeMark className="onboarding__hero" />
            <p className="onboarding__eyebrow">Quick start</p>
            <h2 className="onboarding__headline">Welcome to Unshackle</h2>
            <p className="onboarding__copy">
              Detect and save the video and audio playing on the page you are already
              viewing — HLS, DASH, and direct streams, all local.
            </p>
          </div>
        );

      case 'source':
        return (
          <div className="onboarding__content onboarding__content--center">
            <GithubMark className="onboarding__github" />
            <h2 className="onboarding__headline">Free, limitless, open source</h2>
            <p className="onboarding__copy">
              A completely free, limitless, open-source extension — built and maintained by a
              few great people. No accounts, no quotas, no telemetry.
            </p>
            <button type="button" className="onboarding__cta" onClick={p.onOpenSource}>
              View on GitHub
            </button>
          </div>
        );

      case 'theme':
        return (
          <div className="onboarding__content">
            <p className="onboarding__eyebrow">Appearance</p>
            <h2 className="onboarding__headline">Choose a theme</h2>
            <div className="onboarding__cards" role="radiogroup" aria-label="Theme">
              <ChoiceCard
                name="onboarding-theme"
                selected={theme === 'dark'}
                onSelect={() => onThemeChange('dark')}
                title="Dark"
                copy="Low-glare monochrome surface."
              />
              <ChoiceCard
                name="onboarding-theme"
                selected={theme === 'light'}
                onSelect={() => onThemeChange('light')}
                title="Light"
                copy="Bright, high-contrast surface."
              />
            </div>
          </div>
        );

      case 'language':
        return (
          <div className="onboarding__content">
            <p className="onboarding__eyebrow">Language</p>
            <h2 className="onboarding__headline">Pick the interface language</h2>
            <div className="onboarding__cards" role="radiogroup" aria-label="Language">
              <ChoiceCard
                name="onboarding-language"
                selected={language === 'en'}
                onSelect={() => onLanguageChange('en')}
                title="English"
                copy="More languages can slot in later."
              />
            </div>
          </div>
        );

      case 'native':
        return (
          <div className="onboarding__content">
            <p className="onboarding__eyebrow">Power features</p>
            <h2 className="onboarding__headline">Use local FFmpeg &amp; native helpers?</h2>
            <p className="onboarding__copy">
              A small companion program runs FFmpeg and yt-dlp on your machine, with background
              workers handling segment fetch and muxing. That unlocks merged HLS/DASH output,
              cleaner trims, and 1000+ sites.
            </p>
            <div className="onboarding__cards" role="radiogroup" aria-label="Native options">
              <ChoiceCard
                name="onboarding-native"
                selected={nativeFeaturesEnabled}
                onSelect={() => onNativeFeaturesChange(true)}
                title="Yes, enable native"
                copy="Full-quality output via the local helper."
              />
              <ChoiceCard
                name="onboarding-native"
                selected={!nativeFeaturesEnabled}
                onSelect={() => onNativeFeaturesChange(false)}
                title="No, stay browser-only"
                copy="Use the built-in fallback path."
              />
            </div>
            <p className="onboarding__note">
              Optional. A mature browser-only fallback works just fine — it just won&apos;t reach
              full quality on every site.
            </p>
            <p className="onboarding__fineprint">
              Enabling native requires downloading and running a small setup script. The script is
              fully reviewable on GitHub before you run it.
            </p>
          </div>
        );

      case 'download':
        return (
          <div className="onboarding__content">
            <p className="onboarding__eyebrow">Install</p>
            <h2 className="onboarding__headline">Set up the helper</h2>
            <p className="onboarding__copy">
              {p.installTarget.kind === 'windows-bat'
                ? 'Download the one-click setup file, then double-click it. It installs FFmpeg + yt-dlp and registers the helper for this exact extension.'
                : 'Open the setup guide for your platform to install FFmpeg and register the native helper.'}
            </p>
            <button type="button" className="onboarding__cta" onClick={p.onDownloadInstaller}>
              {p.installTarget.kind === 'windows-bat' ? 'Download installer' : 'Open setup'}
            </button>
            <p className="onboarding__fineprint">
              After it finishes, return here and re-check on the next screen.
            </p>
          </div>
        );

      case 'health':
        return (
          <div className="onboarding__content">
            <p className="onboarding__eyebrow">Diagnostics</p>
            <h2 className="onboarding__headline">Helper health</h2>
            <HealthMetrics diagnostic={diagnostic} />
            <div className="onboarding__health-actions">
              <button
                type="button"
                className="onboarding__cta"
                onClick={onCheckHealth}
                disabled={busy}
              >
                {busy ? 'Checking…' : 'Refresh health'}
              </button>
              {diagnostic?.readiness === 'permission-needed' ||
              diagnostic?.readiness === 'permission-denied' ? (
                <button type="button" className="onboarding__nav-btn" onClick={onRequestPermission}>
                  Allow native messaging
                </button>
              ) : null}
            </div>
          </div>
        );

      case 'donate':
        return (
          <div className="onboarding__content onboarding__content--center">
            <div className="onboarding__heart" aria-hidden="true">❤</div>
            <h2 className="onboarding__headline">Support the project</h2>
            <p className="onboarding__copy">
              Unshackle is free and always will be. If it saves you time, a small donation helps
              keep the lights on and the project maintained.
            </p>
            <button type="button" className="onboarding__cta" onClick={onOpenDonate}>
              Donate
            </button>
          </div>
        );

      default:
        return null;
    }
  }
}

interface ChoiceCardProps {
  name: string;
  selected: boolean;
  onSelect: () => void;
  title: string;
  copy: string;
}

function ChoiceCard({ name, selected, onSelect, title, copy }: ChoiceCardProps) {
  return (
    <label
      className={selected ? 'onboarding__card onboarding__card--selected' : 'onboarding__card'}
    >
      <input type="radio" name={name} checked={selected} onChange={onSelect} />
      <span className="onboarding__card-title">{title}</span>
      <span className="onboarding__card-copy">{copy}</span>
    </label>
  );
}

interface HealthMetricsProps {
  diagnostic: NativeHelperDiagnostic | null;
}

type HealthTone = 'ok' | 'warn' | 'err' | 'idle';

function HealthMetrics({ diagnostic }: HealthMetricsProps) {
  const rows: Array<{ label: string; value: string; tone: HealthTone }> = diagnostic
    ? [
        {
          label: 'Permission',
          value: permissionCopy(diagnostic.permission),
          tone:
            diagnostic.permission === 'granted'
              ? 'ok'
              : diagnostic.permission === 'denied'
                ? 'err'
                : 'warn',
        },
        {
          label: 'Messaging host',
          value: installCopy(diagnostic.install),
          tone:
            diagnostic.install === 'registered'
              ? 'ok'
              : diagnostic.install === 'unknown'
                ? 'warn'
                : 'err',
        },
        {
          label: 'FFmpeg / FFprobe',
          value: ffmpegCopy(diagnostic.ffmpeg),
          tone:
            diagnostic.ffmpeg === 'available'
              ? 'ok'
              : diagnostic.ffmpeg === 'unknown'
                ? 'warn'
                : 'err',
        },
        {
          label: 'Helper version',
          value: diagnostic.helperVersion ?? '—',
          tone: diagnostic.helperVersion ? 'ok' : 'idle',
        },
      ]
    : [];

  return (
    <div className="onboarding__health">
      <div
        className="onboarding__health-overall"
        data-tone={diagnostic ? overallTone(diagnostic.readiness) : 'idle'}
      >
        <span className="onboarding__health-overall-label">Overall</span>
        <span className="onboarding__health-overall-value">
          {diagnostic ? overallCopy(diagnostic.readiness) : 'Not checked'}
        </span>
      </div>
      <dl className="onboarding__health-rows">
        {rows.map((row) => (
          <div key={row.label} className="onboarding__health-row" data-tone={row.tone}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function permissionCopy(state: NativeHelperDiagnostic['permission']): string {
  return state === 'granted' ? 'Granted' : state === 'denied' ? 'Denied' : 'Not granted';
}

function installCopy(state: NativeHelperDiagnostic['install']): string {
  switch (state) {
    case 'registered':
      return 'Registered';
    case 'missing':
      return 'Not installed';
    case 'forbidden':
      return 'Blocked';
    default:
      return 'Unknown';
  }
}

function ffmpegCopy(state: NativeHelperDiagnostic['ffmpeg']): string {
  return state === 'available' ? 'Available' : state === 'missing' ? 'Missing' : 'Unknown';
}

function overallTone(readiness: NativeHelperDiagnostic['readiness']): HealthTone {
  switch (readiness) {
    case 'ready':
      return 'ok';
    case 'ffmpeg-missing':
    case 'host-missing':
    case 'host-forbidden':
    case 'permission-needed':
      return 'warn';
    case 'permission-denied':
    case 'error':
      return 'err';
    default:
      return 'idle';
  }
}

function overallCopy(readiness: NativeHelperDiagnostic['readiness']): string {
  switch (readiness) {
    case 'ready':
      return 'Ready';
    case 'ffmpeg-missing':
      return 'FFmpeg missing';
    case 'host-missing':
      return 'Helper not installed';
    case 'host-forbidden':
      return 'Helper blocked';
    case 'permission-needed':
      return 'Permission needed';
    case 'permission-denied':
      return 'Permission denied';
    case 'error':
      return 'Error';
    default:
      return 'Not checked';
  }
}
