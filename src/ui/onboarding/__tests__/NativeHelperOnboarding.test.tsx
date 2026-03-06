import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import type { NativeHelperDiagnostic } from '@/src/native/native-helper-diagnostics';
import { NativeHelperOnboarding } from '../NativeHelperOnboarding';

function diagnostic(
  readiness: NativeHelperDiagnostic['readiness'],
): NativeHelperDiagnostic {
  return {
    readiness,
    permission: readiness === 'permission-needed' ? 'unknown' : 'granted',
    install: readiness === 'host-missing' ? 'missing' : 'registered',
    ffmpeg: readiness === 'ffmpeg-missing' ? 'missing' : 'unknown',
    hostName: 'com.unshackle.ffmpeg',
    checkedAt: 100,
  };
}

function renderOnboarding(
  props: Partial<React.ComponentProps<typeof NativeHelperOnboarding>> = {},
) {
  return render(
    <NativeHelperOnboarding
      diagnostic={diagnostic('permission-needed')}
      variant="first-run"
      theme="dark"
      language="en"
      onThemeChange={vi.fn()}
      onLanguageChange={vi.fn()}
      onRequestPermission={vi.fn()}
      onCheckAgain={vi.fn()}
      onOpenSetup={vi.fn()}
      onOpenSource={vi.fn()}
      onDismiss={vi.fn()}
      nativeFeaturesEnabled
      onNativeFeaturesChange={vi.fn()}
      {...props}
    />,
  );
}

describe('NativeHelperOnboarding', () => {
  test('renders as a dismissible modal wizard', () => {
    const { container } = renderOnboarding();

    expect(container.firstElementChild).toHaveClass('native-helper-onboarding-modal');
    expect(screen.getByRole('dialog', { name: /welcome to unshackle/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close onboarding/i })).toBeInTheDocument();
    expect(screen.getByText(/step 1 of 7/i)).toBeInTheDocument();
  });

  test('first-run variant moves through the requested minimal screen sequence', async () => {
    const user = userEvent.setup();
    renderOnboarding();

    expect(screen.getByRole('heading', { name: /find downloadable video and audio/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByRole('heading', { name: /the extension code is public/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByRole('heading', { name: /choose a theme/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByRole('heading', { name: /pick the interface language/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByRole('heading', { name: /use local ffmpeg features/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByRole('heading', { name: /allow chrome to talk to the native helper/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByRole('heading', { name: /set up the helper and ffmpeg/i })).toBeInTheDocument();
  });

  test('open-source screen exposes a github button', async () => {
    const user = userEvent.setup();
    const onOpenSource = vi.fn();
    renderOnboarding({ onOpenSource });

    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /view on github/i }));

    expect(onOpenSource).toHaveBeenCalledTimes(1);
  });

  test('theme screen renders selectable cards', async () => {
    const user = userEvent.setup();
    const onThemeChange = vi.fn();
    renderOnboarding({ onThemeChange });

    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('radio', { name: /light/i }));

    expect(onThemeChange).toHaveBeenCalledWith('light');
  });

  test('language screen renders card choice', async () => {
    const user = userEvent.setup();
    renderOnboarding();

    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByRole('radio', { name: /english/i })).toBeChecked();
    expect(screen.getByText(/more languages can slot into this flow later/i)).toBeInTheDocument();
  });

  test('native options screen shows pros and cons rows', async () => {
    const user = userEvent.setup();
    const onNativeFeaturesChange = vi.fn();
    renderOnboarding({ onNativeFeaturesChange });

    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText(/^pros$/i)).toBeInTheDocument();
    expect(screen.getByText(/^cons$/i)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /no, stay browser-only/i }));

    expect(onNativeFeaturesChange).toHaveBeenCalledWith(false);
  });

  test('disabling native options removes permission and install screens', async () => {
    const user = userEvent.setup();
    renderOnboarding({ nativeFeaturesEnabled: false });

    expect(screen.getByText(/step 1 of 5/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByRole('heading', { name: /use local ffmpeg features/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /finish/i })).toBeInTheDocument();
    expect(screen.queryByText(/allow chrome to talk to the native helper/i)).not.toBeInTheDocument();
  });

  test('settings variant starts at native options only', () => {
    renderOnboarding({ variant: 'settings' });

    expect(screen.getByRole('heading', { name: /use local ffmpeg features/i })).toBeInTheDocument();
    expect(screen.queryByText(/the extension code is public/i)).not.toBeInTheDocument();
  });

  test('permission screen calls native permission callback', async () => {
    const user = userEvent.setup();
    const onRequestPermission = vi.fn();
    renderOnboarding({ onRequestPermission, variant: 'settings' });

    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /allow native messaging/i }));

    expect(onRequestPermission).toHaveBeenCalledTimes(1);
  });

  test('install screen shows setup actions for missing helper', async () => {
    const user = userEvent.setup();
    renderOnboarding({ diagnostic: diagnostic('host-missing'), variant: 'settings' });

    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText(/helper is not registered yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open setup/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check again/i })).toBeInTheDocument();
  });

  test('finish button calls onComplete on the last step', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    renderOnboarding({ diagnostic: diagnostic('ready'), variant: 'settings', onComplete });

    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /finish/i }));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('close button calls onDismiss', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    renderOnboarding({ onDismiss });

    await user.click(screen.getByRole('button', { name: /close onboarding/i }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
