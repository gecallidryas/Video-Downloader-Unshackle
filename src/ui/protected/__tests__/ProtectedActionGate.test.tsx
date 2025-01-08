import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { ProviderPolicyResult } from '@/src/core/policy/evaluate-provider-policy';
import { ProtectedActionGate } from '../ProtectedActionGate';

const blockedPolicy: ProviderPolicyResult = {
  kind: 'blocked',
  reason: 'No authorized provider workflow is registered for this origin.',
};

const authorizedPolicy: ProviderPolicyResult = {
  kind: 'authorized-workflow',
  providerId: 'authorized-example',
  providerName: 'Authorized Example',
  actionLabel: 'Open provider workflow',
  acknowledgement:
    'I have permission to use this provider-authorized workflow.',
  proceedUrl: 'https://watch.example.com/movie',
};

test('keeps protected candidates blocked when no provider workflow matches', () => {
  render(<ProtectedActionGate policy={blockedPolicy} onProceed={vi.fn()} />);

  expect(screen.getByText(/no authorized provider workflow/i)).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /open provider workflow/i }),
  ).not.toBeInTheDocument();
});

test('requires acknowledgement before exposing the provider-authorized proceed action', async () => {
  const user = userEvent.setup();
  const onProceed = vi.fn();

  render(
    <ProtectedActionGate policy={authorizedPolicy} onProceed={onProceed} />,
  );

  expect(screen.getByText('Authorized Example')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /open provider workflow/i }),
  ).not.toBeInTheDocument();

  await user.click(
    screen.getByRole('checkbox', {
      name: /i have permission to use this provider-authorized workflow/i,
    }),
  );

  await user.click(
    screen.getByRole('button', { name: /open provider workflow/i }),
  );

  expect(onProceed).toHaveBeenCalledWith(authorizedPolicy);
});
