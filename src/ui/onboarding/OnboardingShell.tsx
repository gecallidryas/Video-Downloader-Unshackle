import type { ReactNode } from 'react';

interface OnboardingShellProps {
  title: string;
  variant: 'first-run' | 'settings';
  statusLabel: string;
  onDismiss: () => void;
  children: ReactNode;
}

export function OnboardingShell({
  title,
  variant,
  statusLabel,
  onDismiss,
  children,
}: OnboardingShellProps) {
  return (
    <section
      className="native-helper-onboarding"
      data-variant={variant}
      aria-label={title}
    >
      <div className="native-helper-onboarding__header">
        <div>
          <h2 className="native-helper-onboarding__title">{title}</h2>
          <span className="native-helper-onboarding__status">{statusLabel}</span>
        </div>
        <button
          type="button"
          className="native-helper-onboarding__ghost"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>
      {children}
    </section>
  );
}
