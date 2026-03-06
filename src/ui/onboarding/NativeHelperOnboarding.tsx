import { useEffect, useState } from 'react';
import type { NativeHelperDiagnostic } from '@/src/native/native-helper-diagnostics';
import type { NativeHelperInstallTarget } from '@/src/native/native-helper-links';
import { OnboardingShell } from './OnboardingShell';
import './NativeHelperOnboarding.css';

type FirstRunStep =
  | 'purpose'
  | 'source'
  | 'theme'
  | 'language'
  | 'native-choice'
  | 'native-permission'
  | 'native-install';

type SettingsStep = 'native-choice' | 'native-permission' | 'native-install';

type OnboardingStep = FirstRunStep | SettingsStep;

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
  onOpenSource: () => void;
  onDismiss: () => void;
  onComplete?: () => void;
  nativeFeaturesEnabled: boolean;
  onNativeFeaturesChange: (enabled: boolean) => void;
  installTarget?: NativeHelperInstallTarget;
}

const FIRST_RUN_STEPS: FirstRunStep[] = [
  'purpose',
  'source',
  'theme',
  'language',
  'native-choice',
];

const SETTINGS_STEPS: SettingsStep[] = ['native-choice'];

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
  onOpenSource,
  onDismiss,
  onComplete,
  nativeFeaturesEnabled,
  onNativeFeaturesChange,
  installTarget = { kind: 'docs', href: 'native-helper.html' },
}: NativeHelperOnboardingProps) {
  const title = variant === 'first-run' ? 'Welcome to Unshackle' : 'Native FFmpeg setup';
  const [activeStep, setActiveStep] = useState<OnboardingStep>(
    variant === 'first-run' ? 'purpose' : 'native-choice',
  );
  const steps = buildSteps(variant, nativeFeaturesEnabled);
  const activeIndex = Math.max(0, steps.indexOf(activeStep));
  const currentStep = steps[activeIndex] ?? steps[0];
  const currentStepTitle = stepTitle(currentStep);
  const atLastStep = activeIndex === steps.length - 1;

  useEffect(() => {
    if (!steps.includes(activeStep)) {
      setActiveStep(steps[steps.length - 1] ?? steps[0]);
    }
  }, [activeStep, steps]);

  function moveToPrevious() {
    setActiveStep(steps[Math.max(0, activeIndex - 1)] ?? steps[0]);
  }

  function moveToNext() {
    if (atLastStep) {
      (onComplete ?? onDismiss)();
      return;
    }

    setActiveStep(steps[Math.min(steps.length - 1, activeIndex + 1)] ?? steps[0]);
  }

  return (
    <OnboardingShell
      title={title}
      variant={variant}
      statusLabel={`Step ${activeIndex + 1} of ${steps.length}`}
      onDismiss={onDismiss}
    >
      <section className="native-helper-onboarding__screen" aria-label={currentStepTitle}>
        {currentStep === 'purpose' ? (
          <>
            <p className="native-helper-onboarding__eyebrow">Quick start</p>
            <h3 className="native-helper-onboarding__headline">Find downloadable video and audio on the page you are already viewing.</h3>
            <p className="native-helper-onboarding__copy">
              Unshackle detects clear streams, keeps the workflow local, and helps you save media without leaving the tab.
            </p>
          </>
        ) : null}

        {currentStep === 'source' ? (
          <>
            <p className="native-helper-onboarding__eyebrow">Open source</p>
            <h3 className="native-helper-onboarding__headline">The extension code is public.</h3>
            <p className="native-helper-onboarding__copy">
              Review the source, track changes, and report issues directly on GitHub.
            </p>
            <button
              type="button"
              className="native-helper-onboarding__primary"
              onClick={onOpenSource}
            >
              View on GitHub
            </button>
          </>
        ) : null}

        {currentStep === 'theme' ? (
          <>
            <p className="native-helper-onboarding__eyebrow">Appearance</p>
            <h3 className="native-helper-onboarding__headline">Choose a theme.</h3>
            <div className="native-helper-onboarding__card-list" role="radiogroup" aria-label="Theme">
              <label className={theme === 'dark' ? 'native-helper-onboarding__card native-helper-onboarding__card--selected' : 'native-helper-onboarding__card'}>
                <input
                  type="radio"
                  name={`theme-${variant}`}
                  checked={theme === 'dark'}
                  onChange={() => onThemeChange('dark')}
                />
                <span className="native-helper-onboarding__card-title">Dark</span>
                <span className="native-helper-onboarding__card-copy">Lower contrast around video pages.</span>
              </label>
              <label className={theme === 'light' ? 'native-helper-onboarding__card native-helper-onboarding__card--selected' : 'native-helper-onboarding__card'}>
                <input
                  type="radio"
                  name={`theme-${variant}`}
                  checked={theme === 'light'}
                  onChange={() => onThemeChange('light')}
                />
                <span className="native-helper-onboarding__card-title">Light</span>
                <span className="native-helper-onboarding__card-copy">Bright surface for utility-first browsing.</span>
              </label>
            </div>
          </>
        ) : null}

        {currentStep === 'language' ? (
          <>
            <p className="native-helper-onboarding__eyebrow">Language</p>
            <h3 className="native-helper-onboarding__headline">Pick the interface language.</h3>
            <div className="native-helper-onboarding__card-list" role="radiogroup" aria-label="Language">
              <label className="native-helper-onboarding__card native-helper-onboarding__card--selected">
                <input
                  type="radio"
                  name={`language-${variant}`}
                  checked={language === 'en'}
                  onChange={() => onLanguageChange('en')}
                />
                <span className="native-helper-onboarding__card-title">English</span>
                <span className="native-helper-onboarding__card-copy">More languages can slot into this flow later.</span>
              </label>
            </div>
          </>
        ) : null}

        {currentStep === 'native-choice' ? (
          <>
            <p className="native-helper-onboarding__eyebrow">Native options</p>
            <h3 className="native-helper-onboarding__headline">Use local FFmpeg features?</h3>
            <div className="native-helper-onboarding__card-list" role="radiogroup" aria-label="Native options">
              <label className={nativeFeaturesEnabled ? 'native-helper-onboarding__card native-helper-onboarding__card--selected' : 'native-helper-onboarding__card'}>
                <input
                  type="radio"
                  name={`native-choice-${variant}`}
                  checked={nativeFeaturesEnabled}
                  onChange={() => onNativeFeaturesChange(true)}
                />
                <span className="native-helper-onboarding__card-title">Yes, use native</span>
                <span className="native-helper-onboarding__card-copy">Merged HLS and DASH output, better trims, and local FFmpeg export.</span>
              </label>
              <label className={!nativeFeaturesEnabled ? 'native-helper-onboarding__card native-helper-onboarding__card--selected' : 'native-helper-onboarding__card'}>
                <input
                  type="radio"
                  name={`native-choice-${variant}`}
                  checked={!nativeFeaturesEnabled}
                  onChange={() => onNativeFeaturesChange(false)}
                />
                <span className="native-helper-onboarding__card-title">No, stay browser-only</span>
                <span className="native-helper-onboarding__card-copy">Skip native messaging and keep downloads on the built-in path.</span>
              </label>
            </div>
            <div className="native-helper-onboarding__rows" aria-label="Native tradeoffs">
              <div className="native-helper-onboarding__row native-helper-onboarding__row--panel">
                <span className="native-helper-onboarding__label">Pros</span>
                <span className="native-helper-onboarding__copy">Higher quality output, fewer raw segment files, more complete export tools.</span>
              </div>
              <div className="native-helper-onboarding__row native-helper-onboarding__row--panel">
                <span className="native-helper-onboarding__label">Cons</span>
                <span className="native-helper-onboarding__copy">Requires native messaging permission plus helper and FFmpeg setup on this computer.</span>
              </div>
            </div>
          </>
        ) : null}

        {currentStep === 'native-permission' ? (
          <>
            <p className="native-helper-onboarding__eyebrow">Permission</p>
            <h3 className="native-helper-onboarding__headline">Allow Chrome to talk to the native helper.</h3>
            <p className="native-helper-onboarding__copy">
              This permission is only used for local FFmpeg tasks. It does not turn on browser fallbacks or remote services.
            </p>
            <div className="native-helper-onboarding__rows">
              <div className="native-helper-onboarding__row native-helper-onboarding__row--panel">
                <span className="native-helper-onboarding__label">Current state</span>
                <span className="native-helper-onboarding__copy">{readinessPermissionCopy(diagnostic.readiness)}</span>
              </div>
            </div>
            <div className="native-helper-onboarding__actions">
              <button
                type="button"
                className="native-helper-onboarding__primary"
                onClick={onRequestPermission}
                disabled={busy}
              >
                Allow native messaging
              </button>
              <button type="button" onClick={onCheckAgain} disabled={busy}>
                Check again
              </button>
            </div>
          </>
        ) : null}

        {currentStep === 'native-install' ? (
          <>
            <p className="native-helper-onboarding__eyebrow">Install</p>
            <h3 className="native-helper-onboarding__headline">Set up the helper and FFmpeg.</h3>
            <p className="native-helper-onboarding__copy">{installIntroCopy(installTarget)}</p>
            <div className="native-helper-onboarding__rows">
              {installRows(diagnostic.readiness).map((row) => (
                <div key={row.label} className="native-helper-onboarding__row native-helper-onboarding__row--panel">
                  <span className="native-helper-onboarding__label">{row.label}</span>
                  <span className="native-helper-onboarding__copy">{row.copy}</span>
                </div>
              ))}
            </div>
            <div className="native-helper-onboarding__actions">
              <button
                type="button"
                className="native-helper-onboarding__primary"
                onClick={onOpenSetup}
              >
                Open setup
              </button>
              <button type="button" onClick={onCheckAgain} disabled={busy}>
                Check again
              </button>
            </div>
          </>
        ) : null}
      </section>

      <div className="native-helper-onboarding__nav">
        <button
          type="button"
          onClick={moveToPrevious}
          disabled={activeIndex === 0}
        >
          Previous
        </button>
        <span>{currentStepTitle}</span>
        <button type="button" onClick={moveToNext}>
          {atLastStep ? 'Finish' : 'Next'}
        </button>
      </div>

      {variant === 'settings' ? (
        <details className="native-helper-onboarding__diagnostics">
          <summary>Diagnostics</summary>
          <input aria-label="Readiness code" readOnly value={diagnostic.readiness} />
          <input aria-label="Host code" readOnly value={diagnostic.hostName} />
        </details>
      ) : null}
    </OnboardingShell>
  );
}

function buildSteps(
  variant: NativeHelperOnboardingProps['variant'],
  nativeFeaturesEnabled: boolean,
): OnboardingStep[] {
  const baseSteps = variant === 'first-run' ? [...FIRST_RUN_STEPS] : [...SETTINGS_STEPS];
  if (nativeFeaturesEnabled) {
    baseSteps.push('native-permission', 'native-install');
  }
  return baseSteps;
}

function stepTitle(step: OnboardingStep): string {
  switch (step) {
    case 'purpose':
      return 'What it does';
    case 'source':
      return 'Open source';
    case 'theme':
      return 'Theme';
    case 'language':
      return 'Language';
    case 'native-choice':
      return 'Native options';
    case 'native-permission':
      return 'Permission';
    case 'native-install':
      return 'Install';
    default:
      return 'Onboarding';
  }
}

function readinessPermissionCopy(readiness: NativeHelperDiagnostic['readiness']): string {
  switch (readiness) {
    case 'ready':
    case 'host-missing':
    case 'host-forbidden':
    case 'ffmpeg-missing':
      return 'Permission is available. Continue with local setup.';
    case 'permission-denied':
      return 'Chrome denied access. Allow native messaging, then check again.';
    case 'error':
      return 'The helper could not be checked. Try again after granting access.';
    case 'not-checked':
      return 'Permission has not been checked yet.';
    case 'permission-needed':
    default:
      return 'Permission is still needed before local FFmpeg features can run.';
  }
}

function installIntroCopy(installTarget: NativeHelperInstallTarget): string {
  if (installTarget.kind === 'powershell-setup') {
    return 'The PowerShell setup package walks through helper registration and checks FFmpeg plus FFprobe.';
  }
  return 'The setup page explains helper registration and how to install FFmpeg plus FFprobe on this machine.';
}

function installRows(readiness: NativeHelperDiagnostic['readiness']): Array<{ label: string; copy: string }> {
  switch (readiness) {
    case 'host-missing':
    case 'host-forbidden':
      return [
        {
          label: 'Native helper',
          copy: 'The helper is not registered yet. Run setup first, then return and recheck.',
        },
        {
          label: 'FFmpeg',
          copy: 'Install FFmpeg and FFprobe if the setup flow reports them missing.',
        },
      ];
    case 'ffmpeg-missing':
      return [
        {
          label: 'Native helper',
          copy: 'The helper is in place, but FFmpeg tools are still missing.',
        },
        {
          label: 'FFmpeg',
          copy: 'Install FFmpeg and FFprobe, then re-run the check from this screen.',
        },
      ];
    case 'ready':
      return [
        {
          label: 'Native helper',
          copy: 'Helper access is ready.',
        },
        {
          label: 'FFmpeg',
          copy: 'FFmpeg and FFprobe are available. Finish onboarding when you are done.',
        },
      ];
    case 'permission-denied':
      return [
        {
          label: 'Native helper',
          copy: 'Permission is still blocked. Re-enable access before setup can complete.',
        },
        {
          label: 'FFmpeg',
          copy: 'FFmpeg installation can wait until permission is granted.',
        },
      ];
    case 'error':
      return [
        {
          label: 'Native helper',
          copy: 'The helper check returned an error.',
        },
        {
          label: 'FFmpeg',
          copy: 'Run the setup flow, then check again from this screen.',
        },
      ];
    case 'not-checked':
    case 'permission-needed':
    default:
      return [
        {
          label: 'Native helper',
          copy: 'Grant native messaging permission before verifying the helper.',
        },
        {
          label: 'FFmpeg',
          copy: 'After permission is granted, open setup to install anything still missing.',
        },
      ];
  }
}
