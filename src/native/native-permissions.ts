const nativeMessagingPermission: chrome.permissions.Permissions = {
  permissions: ['nativeMessaging'],
};

export async function hasNativeMessagingPermission(): Promise<boolean> {
  const permissions = getChromePermissions();
  if (!permissions?.contains) {
    return false;
  }

  return new Promise((resolve) => {
    try {
      permissions.contains(nativeMessagingPermission, (granted) => {
        resolve(Boolean(granted));
      });
    } catch {
      resolve(false);
    }
  });
}

export async function requestNativeMessagingPermission(): Promise<boolean> {
  const permissions = getChromePermissions();
  if (!permissions?.request) {
    return false;
  }

  return new Promise((resolve) => {
    try {
      permissions.request(nativeMessagingPermission, (granted) => {
        resolve(!getChromeRuntimeError() && Boolean(granted));
      });
    } catch {
      resolve(false);
    }
  });
}

function getChromePermissions(): typeof chrome.permissions | undefined {
  return typeof chrome === 'undefined' ? undefined : chrome.permissions;
}

function getChromeRuntimeError(): chrome.runtime.LastError | undefined {
  return typeof chrome === 'undefined' ? undefined : chrome.runtime?.lastError;
}
