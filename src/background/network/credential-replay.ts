// Browser-side credential replay via declarativeNetRequest session rules.
//
// chrome.downloads requests cannot carry custom Cookie/Authorization headers set
// by the extension, and fetch() cannot set forbidden headers like Cookie either.
// To make downloads from logged-in sites "just work", we register short-lived DNR
// session rules that re-attach the captured credentials to outgoing requests for
// the target URL, then remove them when the job ends.
//
// Gated entirely by `downloadFromLoggedInSites` (see credentialReplayEnabled).
export interface DnrHeaderEdit {
  header: string;
  operation: 'set';
  value: string;
}

export interface DnrSessionRule {
  id: number;
  priority: number;
  action: {
    type: 'modifyHeaders';
    requestHeaders: DnrHeaderEdit[];
  };
  condition: {
    urlFilter: string;
    resourceTypes: string[];
  };
}

export interface DnrSessionApi {
  updateSessionRules(options: {
    addRules?: DnrSessionRule[];
    removeRuleIds?: number[];
  }): Promise<void>;
}

export interface ReplayHeaders {
  cookie?: string;
  authorization?: string;
}

export interface CredentialReplayManager {
  /** Register a replay rule for `url`; returns the rule id, or undefined if nothing to replay. */
  register(url: string, headers: ReplayHeaders): Promise<number | undefined>;
  /** Remove a previously registered rule. */
  release(ruleId: number | undefined): Promise<void>;
  /** Remove every rule this manager created (e.g. on settings disable). */
  clearAll(): Promise<void>;
}

// Resource types a managed download or manifest/segment fetch can surface as.
// chrome.downloads requests usually appear as 'other'; media/xhr cover engine fetches.
const REPLAY_RESOURCE_TYPES = [
  'xmlhttprequest',
  'media',
  'other',
  'sub_frame',
  'main_frame',
];

// DNR session-rule id space reserved for credential replay. Kept high to avoid
// colliding with any static rules.
const RULE_ID_BASE = 90_000;

function buildHeaderEdits(headers: ReplayHeaders): DnrHeaderEdit[] {
  const edits: DnrHeaderEdit[] = [];
  if (headers.cookie) {
    edits.push({ header: 'cookie', operation: 'set', value: headers.cookie });
  }
  if (headers.authorization) {
    edits.push({ header: 'authorization', operation: 'set', value: headers.authorization });
  }
  return edits;
}

// urlFilter treats * ^ | as special; strip wildcards so a captured URL is matched literally.
function toUrlFilter(url: string): string {
  return url.replace(/[*^|]/g, '');
}

export function createCredentialReplayManager(
  dnr: DnrSessionApi | undefined,
): CredentialReplayManager {
  let nextId = RULE_ID_BASE;
  const activeRuleIds = new Set<number>();

  return {
    async register(url, headers) {
      if (!dnr) return undefined;

      const requestHeaders = buildHeaderEdits(headers);
      if (requestHeaders.length === 0) return undefined;

      const id = nextId++;
      const rule: DnrSessionRule = {
        id,
        priority: 1,
        action: { type: 'modifyHeaders', requestHeaders },
        condition: {
          urlFilter: toUrlFilter(url),
          resourceTypes: [...REPLAY_RESOURCE_TYPES],
        },
      };

      await dnr.updateSessionRules({ addRules: [rule] });
      activeRuleIds.add(id);
      return id;
    },

    async release(ruleId) {
      if (!dnr || ruleId === undefined || !activeRuleIds.has(ruleId)) return;
      await dnr.updateSessionRules({ removeRuleIds: [ruleId] });
      activeRuleIds.delete(ruleId);
    },

    async clearAll() {
      if (!dnr || activeRuleIds.size === 0) return;
      await dnr.updateSessionRules({ removeRuleIds: [...activeRuleIds] });
      activeRuleIds.clear();
    },
  };
}
