import type { NativeHelperDiagnostic } from '@/src/native/native-helper-diagnostics';
import { OnboardingShell } from './OnboardingShell';
import './NativeHelperOnboarding.css';

export interface NativeHelperOnboardingProps {
  diagnostic: NativeHelperDiagnostic;
  variant?: 'first-run' | 'settings';
  theme: 'dark' | 'light';
  language: 'en';
  busy?: boolean;
  onThemeChange: (theme: 'dark' | 'light') => void;
  onLanguageChange: (language: 'en') => void;
  onRequestPermission: () => void | Promise<void>;
  onCheckAgain: () => void | Promise<void>;
  onOpenSetup: () => void;
  onDismiss: () => void;
  onComplete?: () => void;
}

export function NativeHelperOnboarding({
  diagnostic,
  variant = 'first-run',
  theme,
  language,
  busy = false,
  onThemeChange,
  onLanguageChange,
  onRequestPermission,
  onCheckAgain,
  onOpenSetup,
  onDismiss,
  onComplete,
}: NativeHelperOnboardingProps) {
  const title = variant === 'first-run' ? 'Welcome to Unshackle' : 'Native FFmpeg helper';

  return (
    <OnboardingShell
      title={title}
      variant={variant}
      statusLabel={readinessLabel(diagnostic.readiness)}
      onDismiss={onDismiss}
    >
      {variant === 'first-run' ? (
        <>
          <div className="native-helper-onboarding__grid" aria-label="Project intro">
            <span>Open source</span>
            <span>Local-first</span>
          </div>
          <p className="native-helper-onboarding__copy">
            Detection and normal browser downloads work without native helper.
          </p>
          <p className="native-helper-onboarding__copy">
            Native helper is optional and unlocks local FFmpeg features.
          </p>
          <ul className="native-helper-onboarding__features" aria-label="Feature summary">
            <li>Stream detection</li>
            <li>Direct downloads</li>
            <li>HLS/DASH fallback</li>
            <li>Queue and previews</li>
          </ul>
        </>
      ) : null}

      <div className="native-helper-onboarding__row">
        <span className="native-helper-onboarding__label">Choose theme</span>
        <div className="native-helper-onboarding__segmented" role="radiogroup" aria-label="Theme">
          {(['dark', 'light'] as const).map((choice) => (
            <label key={choice} className="native-helper-onboarding__choice">
              <input
                type="radio"
                name={`native-helper-theme-${variant}`}
                checked={theme === choice}
                onChange={() => onThemeChange(choice)}
              />
              <span>{choice === 'dark' ? 'Dark' : 'Light'}</span>
            </label>
          ))}
        </div>
      </div>

      <label className="native-helper-onboarding__row">
        <span className="native-helper-onboarding__label">Language</span>
        <select
          className="native-helper-onboarding__select"
          aria-label="Language"
          value={language}
          onChange={() => onLanguageChange('en')}
        >
          <option value="en">English</option>
        </select>
      </label>
      <p className="native-helper-onboarding__copy">
        English is the only UI language for now.
      </p>

      <NativeStep
        diagnostic={diagnostic}
        busy={busy}
        onRequestPermission={onRequestPermission}
        onCheckAgain={onCheckAgain}
        onOpenSetup={onOpenSetup}
        onComplete={onComplete}
      />

      <details className="native-helper-onboarding__diagnostics">
        <summary>Diagnostics</summary>
        <input aria-label="Readiness code" readOnly value={diagnostic.readiness} />
        <input aria-label="Host code" readOnly value={diagnostic.hostName} />
      </details>
    </OnboardingShell>
  );
}

function NativeStep({
  diagnostic,
  busy,
  onRequestPermission,
  onCheckAgain,
  onOpenSetup,
  onComplete,
}: Pick<
  NativeHelperOnboardingProps,
  'diagnostic' | 'busy' | 'onRequestPermission' | 'onCheckAgain' | 'onOpenSetup' | 'onComplete'
>) {
  switch (diagnostic.readiness) {
    case 'permission-needed':
      return (
        <div className="native-helper-onboarding__native-step">
          <span className="native-helper-onboarding__label">Native access</span>
          <p className="native-helper-onboarding__copy">
            Native helper access is required for FFmpeg export.
          </p>
          <button type="button" onClick={onRequestPermission} disabled={busy}>
            Enable native helper
          </button>
        </div>
      );
    case 'permission-denied':
      return (
        <div className="native-helper-onboarding__native-step">
          <span className="native-helper-onboarding__label">Permission denied</span>
          <button type="button" onClick={onCheckAgain} disabled={busy}>
            Enable in Chrome
          </button>
        </div>
      );
    case 'host-missing':
    case 'host-forbidden':
      return (
        <div className="native-helper-onboarding__native-step">
          <span className="native-helper-onboarding__label">Helper not installed</span>
          <p className="native-helper-onboarding__copy">
            PowerShell setup wrapper checks Node.js, FFmpeg, and FFprobe first.
          </p>
          <p className="native-helper-onboarding__copy">
            It asks before installing missing dependencies.
          </p>
          <div className="native-helper-onboarding__actions">
            <button type="button" onClick={onOpenSetup}>
              Open setup
            </button>
            <button type="button" onClick={onCheckAgain} disabled={busy}>
              Check again
            </button>
          </div>
        </div>
      );
    case 'ffmpeg-missing':
      return (
        <div className="native-helper-onboarding__native-step">
          <span className="native-helper-onboarding__label">FFmpeg not found</span>
          <p className="native-helper-onboarding__copy">
            Install FFmpeg with setup script or use your system package manager.
          </p>
          <button type="button" onClick={onCheckAgain} disabled={busy}>
            Check again
          </button>
        </div>
      );
    case 'ready':
      return (
        <div className="native-helper-onboarding__native-step">
          <span className="native-helper-onboarding__label">Native export</span>
          <div className="native-helper-onboarding__actions">
            <button type="button" onClick={onCheckAgain} disabled={busy}>
              Recheck
            </button>
            <button type="button" onClick={onComplete}>
              Complete
            </button>
          </div>
        </div>
      );
    case 'error':
      return (
        <div className="native-helper-onboarding__native-step">
          <span className="native-helper-onboarding__label">Error</span>
          <button type="button" onClick={onCheckAgain} disabled={busy}>
            Check again
          </button>
        </div>
      );
    case 'not-checked':
    default:
      return (
        <div className="native-helper-onboarding__native-step">
          <span className="native-helper-onboarding__label">Install helper</span>
          <button type="button" onClick={onCheckAgain} disabled={busy}>
            Check native helper
          </button>
        </div>
      );
  }
}

function readinessLabel(readiness: NativeHelperDiagnostic['readiness']): string {
  switch (readiness) {
    case 'permission-needed':
      return 'Permission needed';
    case 'permission-denied':
      return 'Permission denied';
    case 'host-missing':
    case 'host-forbidden':
      return 'Install helper';
    case 'ffmpeg-missing':
      return 'FFmpeg missing';
    case 'ready':
      return 'Ready';
    case 'error':
      return 'Error';
    case 'not-checked':
    default:
      return 'Not checked';
  }
}
