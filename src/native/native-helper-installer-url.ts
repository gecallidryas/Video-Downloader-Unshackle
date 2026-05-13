export const NATIVE_HELPER_INSTALLER_URL =
  'https://github.com/<OWNER>/<REPO>/releases/latest';

export const NATIVE_HELPER_INSTALL_COMMAND =
  'iwr https://github.com/<OWNER>/<REPO>/releases/latest/download/install-windows.ps1 -OutFile install.ps1; powershell -ExecutionPolicy Bypass -File install.ps1';
