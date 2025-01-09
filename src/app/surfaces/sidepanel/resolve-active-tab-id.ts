export function resolveActiveTabIdFromSearch(search: string): number | undefined {
  const parsed = Number(new URLSearchParams(search).get('tabId'));

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export interface ActiveTabsApi {
  query(queryInfo: chrome.tabs.QueryInfo): Promise<Array<Pick<chrome.tabs.Tab, 'id'>>>;
}

export async function resolveActiveTabIdFromChrome(
  tabsApi: ActiveTabsApi | undefined = typeof chrome !== 'undefined'
    ? chrome.tabs
    : undefined,
): Promise<number | undefined> {
  if (!tabsApi?.query) {
    return undefined;
  }

  const [activeTab] = await tabsApi.query({
    active: true,
    currentWindow: true,
  });
  const tabId = activeTab?.id;

  return typeof tabId === 'number' && Number.isInteger(tabId) && tabId > 0
    ? tabId
    : undefined;
}
