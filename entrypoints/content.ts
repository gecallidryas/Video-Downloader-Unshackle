import { defineContentScript } from 'wxt/utils/define-content-script';
import { scanMediaElements } from '@/src/content/dom/scan-media-elements';
import { scanPlayerSignals } from '@/src/content/dom/scan-player-signals';

export function collectPageMediaEvidence() {
  const domEvidence = scanMediaElements(document);

  return scanPlayerSignals(domEvidence);
}

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    collectPageMediaEvidence();
  },
});
