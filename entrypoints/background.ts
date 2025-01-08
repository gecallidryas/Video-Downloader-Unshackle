import { defineBackground } from 'wxt/utils/define-background';
import { createCandidateRegistry } from '@/src/background/candidates/candidate-registry';
import {
  createRuntimeRouter,
  registerRuntimeRouter,
} from '@/src/background/messaging/runtime-router';
import {
  createRequestJournal,
  registerPassiveRequestJournal,
} from '@/src/background/network/request-journal';
import { createTabSnapshotStore } from '@/src/background/state/tab-snapshots';
import { getSidePanelBehavior } from '@/src/lib/chrome/sidePanel';

export function initializeBackgroundShell() {
  const candidateRegistry = createCandidateRegistry();
  const requestJournal = createRequestJournal();
  const tabSnapshots = createTabSnapshotStore();
  const runtimeRouter = createRuntimeRouter({
    candidateRegistry,
    tabSnapshots,
  });

  chrome.sidePanel.setPanelBehavior(getSidePanelBehavior());
  registerPassiveRequestJournal(requestJournal);
  registerRuntimeRouter(runtimeRouter);

  return {
    candidateRegistry,
    requestJournal,
    tabSnapshots,
    runtimeRouter,
  };
}

export default defineBackground({
  type: 'module',
  main() {
    initializeBackgroundShell();
  },
});
