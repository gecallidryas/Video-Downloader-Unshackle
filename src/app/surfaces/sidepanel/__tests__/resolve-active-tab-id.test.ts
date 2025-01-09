import {
  resolveActiveTabIdFromChrome,
  resolveActiveTabIdFromSearch,
} from '../resolve-active-tab-id';

test('resolves an active tab id from the side panel query string', () => {
  expect(resolveActiveTabIdFromSearch('?tabId=42')).toBe(42);
});

test('ignores missing or invalid active tab ids', () => {
  expect(resolveActiveTabIdFromSearch('')).toBeUndefined();
  expect(resolveActiveTabIdFromSearch('?tabId=abc')).toBeUndefined();
  expect(resolveActiveTabIdFromSearch('?tabId=0')).toBeUndefined();
});

test('resolves the active browser tab when search params are absent', async () => {
  const tabsApi = {
    query: vi.fn(async () => [{ id: 77, active: true }]),
  };

  await expect(resolveActiveTabIdFromChrome(tabsApi)).resolves.toBe(77);
  expect(tabsApi.query).toHaveBeenCalledWith({
    active: true,
    currentWindow: true,
  });
});
