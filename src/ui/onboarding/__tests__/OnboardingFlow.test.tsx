import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingFlow, type OnboardingFlowProps } from '../OnboardingFlow';
import type { NativeHelperDiagnostic } from '@/src/native/native-helper-diagnostics';

function diagnostic(
  readiness: NativeHelperDiagnostic['readiness'] = 'ready',
): NativeHelperDiagnostic {
  return {
    readiness,
    permission: 'granted',
    install: 'registered',
    ffmpeg: 'available',
    helperVersion: '0.1.0',
    hostName: 'com.unshackle.ffmpeg',
    checkedAt: 0,
  };
}

function setup(overrides: Partial<OnboardingFlowProps> = {}) {
  const props: OnboardingFlowProps = {
    theme: 'dark',
    language: 'en',
    nativeFeaturesEnabled: false,
    diagnostic: diagnostic('ready'),
    installTarget: {
      kind: 'windows-bat',
      extensionId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      browser: 'chrome',
      version: 'latest',
      releaseBaseUrl: 'https://github.com/acme/repo/releases',
      fileName: 'unshackle-native-helper-setup.bat',
    },
    busy: false,
    onThemeChange: vi.fn(),
    onLanguageChange: vi.fn(),
    onNativeFeaturesChange: vi.fn(),
    onRequestPermission: vi.fn(),
    onCheckHealth: vi.fn(),
    onDownloadInstaller: vi.fn(),
    onOpenSource: vi.fn(),
    onOpenDonate: vi.fn(),
    onComplete: vi.fn(),
    onSkip: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<OnboardingFlow {...props} />) };
}

async function advance(user: ReturnType<typeof userEvent.setup>, times: number) {
  for (let i = 0; i < times; i += 1) {
    await user.click(screen.getByRole('button', { name: /next/i }));
  }
}

describe('OnboardingFlow', () => {
  it('opens on the welcome screen', () => {
    setup();
    expect(screen.getByRole('heading', { name: /welcome to unshackle/i })).toBeInTheDocument();
  });

  it('routes the open-source button to the project repository', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await advance(user, 1);
    await user.click(screen.getByRole('button', { name: /view on github/i }));
    expect(props.onOpenSource).toHaveBeenCalledTimes(1);
  });

  it('lets the user pick a theme and language', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await advance(user, 2);
    await user.click(screen.getByRole('radio', { name: /light/i }));
    expect(props.onThemeChange).toHaveBeenCalledWith('light');
    await advance(user, 1);
    expect(screen.getByRole('radio', { name: /english/i })).toBeInTheDocument();
  });

  it('collapses straight to the donation screen when native is declined', async () => {
    const user = userEvent.setup();
    setup({ nativeFeaturesEnabled: false });
    await advance(user, 4); // welcome -> source -> theme -> language -> native
    expect(screen.getByRole('heading', { name: /use local ffmpeg|native helpers/i })).toBeInTheDocument();
    await advance(user, 1); // native -> donation (skips download + health)
    expect(screen.getByRole('heading', { name: /support|donate|maintain/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /health/i })).not.toBeInTheDocument();
  });

  it('shows download then health screens when native is enabled', async () => {
    const user = userEvent.setup();
    const { props } = setup({ nativeFeaturesEnabled: true });
    await advance(user, 5); // ... native -> download
    await user.click(screen.getByRole('button', { name: /download installer/i }));
    expect(props.onDownloadInstaller).toHaveBeenCalledTimes(1);
    await advance(user, 1); // download -> health
    expect(screen.getByRole('heading', { name: /health/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /refresh|re-check|check/i }));
    expect(props.onCheckHealth).toHaveBeenCalledTimes(1);
  });

  it('routes the donation button to the donate link and completes at the end', async () => {
    const user = userEvent.setup();
    const { props } = setup({ nativeFeaturesEnabled: false });
    await advance(user, 5); // jump to donation
    await user.click(screen.getByRole('button', { name: /donate|support/i }));
    expect(props.onOpenDonate).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /finish|done|get started/i }));
    expect(props.onComplete).toHaveBeenCalledTimes(1);
  });

  it('exposes a skip affordance', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByRole('button', { name: /skip/i }));
    expect(props.onSkip).toHaveBeenCalledTimes(1);
  });

  it('enables native messaging from the native screen', async () => {
    const user = userEvent.setup();
    const { props } = setup({ nativeFeaturesEnabled: false, diagnostic: diagnostic('permission-needed') });
    await advance(user, 4);
    await user.click(
      within(screen.getByRole('radiogroup', { name: /native/i })).getByRole('radio', {
        name: /yes/i,
      }),
    );
    expect(props.onNativeFeaturesChange).toHaveBeenCalledWith(true);
  });
});
