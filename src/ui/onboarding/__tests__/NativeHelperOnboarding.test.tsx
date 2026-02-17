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
      onDismiss={vi.fn()}
      {...props}
    />,
  );
}

describe('NativeHelperOnboarding', () => {
  test('renders as a compact popup card, not a full-page landing view', () => {
    const { container } = renderOnboarding();

    expect(container.firstElementChild).toHaveClass('native-helper-onboarding');
    expect(container.firstElementChild).toHaveAttribute('data-variant', 'first-run');
    expect(container.firstElementChild).not.toHaveClass('landing-page');
  });

  test('first-run variant includes intro, feature summary, preferences, and native helper steps', () => {
    renderOnboarding();

    expect(screen.getByText(/welcome to unshackle/i)).toBeInTheDocument();
    expect(screen.getByText(/stream detection/i)).toBeInTheDocument();
    expect(screen.getByText(/choose theme/i)).toBeInTheDocument();
    expect(screen.getByText(/enable native helper/i)).toBeInTheDocument();
  });

  test('settings variant omits the capability summary', () => {
    renderOnboarding({ variant: 'settings' });

    expect(screen.getByText(/native ffmpeg helper/i)).toBeInTheDocument();
    expect(screen.queryByText(/stream detection/i)).not.toBeInTheDocument();
  });

  test('first-run variant says the project is open source', () => {
    renderOnboarding();

    expect(screen.getByText(/open source/i)).toBeInTheDocument();
  });

  test('first-run variant explains browser downloads work without native helper', () => {
    renderOnboarding();

    expect(
      screen.getByText(/detection and normal browser downloads work without native helper/i),
    ).toBeInTheDocument();
  });

  test('preferences render theme controls', () => {
    renderOnboarding();

    expect(screen.getByRole('radio', { name: /dark/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /light/i })).toBeInTheDocument();
  });

  test('preferences render English as the only language option', () => {
    renderOnboarding();

    const language = screen.getByRole('combobox', { name: /language/i });
    expect(language).toHaveValue('en');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: /english/i })).toBeInTheDocument();
  });

  test('renders permission step when readiness is permission-needed', () => {
    renderOnboarding({ diagnostic: diagnostic('permission-needed') });

    expect(screen.getByText(/permission needed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enable native helper/i })).toBeInTheDocument();
  });

  test('clicking Enable native helper calls permission request callback', async () => {
    const user = userEvent.setup();
    const onRequestPermission = vi.fn();
    renderOnboarding({ onRequestPermission });

    await user.click(screen.getByRole('button', { name: /enable native helper/i }));

    expect(onRequestPermission).toHaveBeenCalledTimes(1);
  });

  test('host-missing state mentions the PowerShell setup wrapper', () => {
    renderOnboarding({ diagnostic: diagnostic('host-missing') });

    expect(screen.getByText(/powershell setup wrapper/i)).toBeInTheDocument();
  });

  test('renders install step when readiness is host-missing', () => {
    renderOnboarding({ diagnostic: diagnostic('host-missing') });

    expect(screen.getByText(/helper not installed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open setup/i })).toBeInTheDocument();
  });

  test('renders FFmpeg missing step when readiness is ffmpeg-missing', () => {
    renderOnboarding({ diagnostic: diagnostic('ffmpeg-missing') });

    expect(screen.getByText(/ffmpeg not found/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check again/i })).toBeInTheDocument();
  });

  test('renders ready state when readiness is ready', () => {
    renderOnboarding({ diagnostic: diagnostic('ready') });

    expect(screen.getByText(/ready/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /complete/i })).toBeInTheDocument();
  });

  test('dismiss button calls onDismiss', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    renderOnboarding({ onDismiss });

    await user.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
