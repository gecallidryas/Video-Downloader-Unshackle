import { describe, expect, test, vi } from 'vitest';
import { createAutoScanController } from '../auto-scan';
import { createTabVideoStatusStore } from '../../state/tab-video-status';

describe('createAutoScanController', () => {
  test('autoScanEnabled controls scan scheduling and icon updates', async () => {
    const statusStore = createTabVideoStatusStore();
    const scanTab = vi.fn(async () => [{ id: 'candidate-1' }]);
    const action = {
      setBadgeText: vi.fn(),
      setTitle: vi.fn(),
    };
    const controller = createAutoScanController({
      statusStore,
      scanTab,
      action,
      getSettings: () => ({ autoScanEnabled: true }),
    });

    await controller.handleTabActivated(7);

    expect(scanTab).toHaveBeenCalledWith(7);
    expect(statusStore.get(7)).toMatchObject({ candidateCount: 1 });
    expect(action.setBadgeText).toHaveBeenLastCalledWith({
      tabId: 7,
      text: '1',
    });
  });

  test('clears status on tab removal and navigation', async () => {
    const statusStore = createTabVideoStatusStore();
    const controller = createAutoScanController({
      statusStore,
      scanTab: vi.fn(async () => []),
      action: {
        setBadgeText: vi.fn(),
        setTitle: vi.fn(),
      },
      getSettings: () => ({ autoScanEnabled: false }),
    });

    statusStore.setCandidateCount(3, 2);
    controller.handleTabRemoved(3);
    expect(statusStore.get(3)).toBeUndefined();

    statusStore.setCandidateCount(4, 2);
    controller.handleTabNavigation(4);
    expect(statusStore.get(4)).toMatchObject({ candidateCount: 0 });
  });
});
