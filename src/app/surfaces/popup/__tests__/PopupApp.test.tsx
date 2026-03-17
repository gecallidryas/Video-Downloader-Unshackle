import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { NativeHelperDiagnostic } from '@/src/native/native-helper-diagnostics';
import { PopupApp, type PopupJob } from '../PopupApp';
import { useSettingsStore } from '@/src/state/useSettingsStore';
import type { RuntimeClient } from '@/src/lib/runtime/client';

const nativeMocks = vi.hoisted(() => ({
  requestNativeMessagingPermission: vi.fn(),
  checkNativeHelperReadiness: vi.fn(),
}));

vi.mock('@/src/native/native-permissions', () => ({
  requestNativeMessagingPermission: nativeMocks.requestNativeMessagingPermission,
}));

vi.mock('@/src/native/native-helper-diagnostics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/src/native/native-helper-diagnostics')>();
  return {
    ...actual,
    checkNativeHelperReadiness: nativeMocks.checkNativeHelperReadiness,
  };
});

function diagnostic(readiness: NativeHelperDiagnostic['readiness']): NativeHelperDiagnostic {
  return {
    readiness,
    permission: readiness === 'permission-needed' ? 'unknown' : 'granted',
    install: readiness === 'host-missing' ? 'missing' : 'registered',
    ffmpeg: readiness === 'ffmpeg-missing' ? 'missing' : 'available',
    hostName: 'com.unshackle.ffmpeg',
    checkedAt: 100,
  };
}

beforeEach(() => {
  vi.spyOn(window, 'open').mockImplementation(() => null);
  nativeMocks.requestNativeMessagingPermission.mockReset();
  nativeMocks.checkNativeHelperReadiness.mockReset();
  nativeMocks.checkNativeHelperReadiness.mockResolvedValue(diagnostic('permission-needed'));
  useSettingsStore.setState({
    theme: 'dark',
    autoDetectEnabled: true,
    autoScanEnabled: true,
    networkCaptureEnabled: true,
    downloadPath: 'Downloads',
    notificationsEnabled: true,
    showNotifications: true,
    preferredQuality: 'best',
    maxConcurrentDownloads: 3,
    maxConcurrentSegments: 5,
    preferredAudioLanguage: 'en',
    namingTemplate: '{title}_{quality}_{date}_{time}',
    previewMode: 'image',
    previewFormat: 'webm',
    captureRuleCustomExtensions: [],
    captureRuleCustomContentTypes: [],
    captureRuleUrlBlacklist: [],
    captureRuleMinSizeBytes: 0,
    captureRuleSizePredicate: '',
    captureRuleRegexRules: [],
    customCommandTemplate: '',
    autoDownloadEnabled: false,
    autoDownloadMinSize: 102_400,
    autoDownloadBlacklist: [],
    aria2Enabled: false,
    aria2RpcUrl: 'http://localhost:6800/jsonrpc',
    aria2Secret: '',
    webhookEnabled: false,
    webhookUrl: '',
    externalPlayerProfiles: [],
    advancedMode: false,
    enableNativeFeatures: true,
    enableBrowserFallbacks: true,
    browserTransmuxWithMuxJs: true,
    browserTransmuxMaxBytes: 150 * 1024 * 1024,
    useDirectToDisk: false,
    rememberOutputFolder: false,
    autoDeleteAfterSave: false,
    previousSessionLimit: 50,
    nativeHelperOnboardingDismissed: false,
    nativeHelperPermissionPrompted: false,
    nativeHelperLastReadiness: 'not-checked',
    onboardingCompleted: false,
    uiLanguage: 'en',
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('renders the popup header', () => {
  render(<PopupApp />);
  expect(screen.getByText(/settings/i)).toBeInTheDocument();
});

test('renders auto-detect toggle enabled by default', () => {
  render(<PopupApp />);
  const toggle = screen.getByRole('checkbox', { name: /auto-detect/i });
  expect(toggle).toBeChecked();
});

test('toggling auto-detect updates the store', async () => {
  const user = userEvent.setup();
  render(<PopupApp />);
  const toggle = screen.getByRole('checkbox', { name: /auto-detect/i });
  await user.click(toggle);
  expect(useSettingsStore.getState().autoDetectEnabled).toBe(false);
});

test('renders notifications toggle', () => {
  render(<PopupApp />);
  const toggle = screen.getByRole('checkbox', { name: /notifications/i });
  expect(toggle).toBeChecked();
});

test('renders preferred quality selector', () => {
  render(<PopupApp />);
  expect(screen.getByRole('combobox', { name: /preferred quality/i })).toBeInTheDocument();
});

test('renders extension version info', () => {
  render(<PopupApp />);
  expect(screen.getByText(/v0\.1\.0/)).toBeInTheDocument();
});

test('renders source-equivalent download settings in the sectioned settings surface', () => {
  render(<PopupApp />);

  expect(screen.getByRole('combobox', { name: /theme/i })).toHaveValue('dark');
  expect(screen.getByRole('option', { name: /light/i })).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: /network capture/i })).toBeChecked();
  expect(screen.getByRole('combobox', { name: /max concurrent downloads/i })).toHaveValue('3');
  expect(screen.getByRole('combobox', { name: /segments per download/i })).toHaveValue('5');
  expect(screen.getByLabelText(/preferred audio language/i)).toHaveValue('en');
  expect(screen.getByRole('textbox', { name: /filename template/i })).toHaveValue(
    '{title}_{quality}_{date}_{time}',
  );
  expect(screen.getByRole('combobox', { name: /preview mode/i })).toHaveValue('image');
  expect(screen.getByRole('combobox', { name: /preview format/i })).toHaveValue('webm');
  expect(screen.getByRole('checkbox', { name: /native ffmpeg features/i })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: /use direct-to-disk when available/i })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: /remember output folder/i })).not.toBeChecked();
  expect(screen.getByRole('button', { name: /choose output folder/i })).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: /auto-delete fragments after save/i })).not.toBeChecked();
  expect(screen.getByRole('button', { name: /clean extension storage/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /check helper/i })).toBeInTheDocument();
});

test('settings exposes language picker, regex rules, templates, auto-download, and integrations', async () => {
  useSettingsStore.setState({ advancedMode: true });
  const user = userEvent.setup();
  render(<PopupApp />);

  await user.selectOptions(screen.getByLabelText(/preferred audio language/i), '__other__');
  await user.type(screen.getByRole('textbox', { name: /custom language/i }), 'sv');
  fireEvent.change(screen.getByRole('textbox', { name: /regex classification rules/i }), {
    target: { value: JSON.stringify([{ pattern: '\\.m3u8$', category: 'hls_manifest' }]) },
  });
  fireEvent.change(screen.getByRole('textbox', { name: /custom command template/i }), {
    target: { value: 'yt-dlp "{url}" -o "{filename}"' },
  });
  await user.click(screen.getByRole('checkbox', { name: /auto-download safe direct media/i }));
  fireEvent.change(screen.getByRole('spinbutton', { name: /auto-download minimum size/i }), {
    target: { value: '4096' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: /auto-download blacklist/i }), {
    target: { value: '*ads*' },
  });
  await user.click(screen.getByRole('checkbox', { name: /enable aria2/i }));
  fireEvent.change(screen.getByRole('textbox', { name: /aria2 rpc url/i }), {
    target: { value: 'http://aria2.local/jsonrpc' },
  });
  fireEvent.change(screen.getByLabelText(/aria2 secret/i), {
    target: { value: 'token' },
  });
  await user.click(screen.getByRole('checkbox', { name: /enable webhook/i }));
  fireEvent.change(screen.getByRole('textbox', { name: /webhook url/i }), {
    target: { value: 'https://hook.example/notify' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: /external player profiles json/i }), {
    target: { value: JSON.stringify([{ id: 'vlc', name: 'VLC', path: 'vlc.exe' }]) },
  });

  expect(useSettingsStore.getState()).toMatchObject({
    preferredAudioLanguage: 'sv',
    captureRuleRegexRules: [{ pattern: '\\.m3u8$', category: 'hls_manifest' }],
    customCommandTemplate: 'yt-dlp "{url}" -o "{filename}"',
    autoDownloadEnabled: true,
    autoDownloadMinSize: 4096,
    autoDownloadBlacklist: ['*ads*'],
    aria2Enabled: true,
    aria2RpcUrl: 'http://aria2.local/jsonrpc',
    aria2Secret: 'token',
    webhookEnabled: true,
    webhookUrl: 'https://hook.example/notify',
    externalPlayerProfiles: [{ id: 'vlc', name: 'VLC', path: 'vlc.exe' }],
  });
});

test('preview format selection persists to the settings store', async () => {
  const user = userEvent.setup();
  render(<PopupApp />);

  await user.selectOptions(screen.getByRole('combobox', { name: /preview format/i }), 'gif');

  expect(useSettingsStore.getState().previewFormat).toBe('gif');
});

test('interface language selector only exposes supported UI languages', () => {
  render(<PopupApp />);

  const languageSelect = screen.getByRole('combobox', { name: /interface language/i });
  const options = within(languageSelect).getAllByRole('option');

  expect(languageSelect).toHaveValue('en');
  expect(options.map((option) => option.getAttribute('value'))).toEqual(['en']);
});

test('theme selection persists to the settings store and document token hook', async () => {
  const user = userEvent.setup();
  render(<PopupApp />);

  await user.selectOptions(screen.getByRole('combobox', { name: /theme/i }), 'light');

  expect(useSettingsStore.getState().theme).toBe('light');
  expect(document.documentElement).toHaveAttribute('data-theme', 'light');
});

test('popup shows first-run onboarding before settings rows when helper is not ready', async () => {
  const user = userEvent.setup();
  render(<PopupApp />);
  const onboarding = await screen.findByLabelText(/welcome to unshackle/i);

  expect(onboarding).toBeInTheDocument();
  expect(screen.getByText(/find downloadable video and audio/i)).toBeInTheDocument();
  await user.click(within(onboarding).getByRole('button', { name: /next/i }));
  expect(within(onboarding).getByRole('button', { name: /view on github/i })).toBeInTheDocument();
  await user.click(within(onboarding).getByRole('button', { name: /next/i }));
  expect(within(onboarding).getByRole('radio', { name: /dark/i })).toBeInTheDocument();
});

test('settings toggles native features and browser fallbacks independently', async () => {
  useSettingsStore.setState({ advancedMode: true });
  const user = userEvent.setup();
  render(<PopupApp />);

  await user.click(screen.getByRole('checkbox', { name: /native ffmpeg features/i }));
  await user.click(screen.getByRole('checkbox', { name: /browser fallbacks/i }));

  expect(useSettingsStore.getState().enableNativeFeatures).toBe(false);
  expect(useSettingsStore.getState().enableBrowserFallbacks).toBe(false);
});

test('settings exposes streaming write and cleanup controls', async () => {
  const user = userEvent.setup();
  render(<PopupApp />);

  await user.click(screen.getByRole('checkbox', { name: /use direct-to-disk when available/i }));
  await user.click(screen.getByRole('checkbox', { name: /remember output folder/i }));
  await user.click(screen.getByRole('checkbox', { name: /auto-delete fragments after save/i }));

  expect(useSettingsStore.getState().useDirectToDisk).toBe(true);
  expect(useSettingsStore.getState().rememberOutputFolder).toBe(true);
  expect(useSettingsStore.getState().autoDeleteAfterSave).toBe(true);
});

test('settings cleanup button clears browser extension media storage', async () => {
  const user = userEvent.setup();
  const runtimeClient = {
    clearExtensionStorage: vi.fn().mockResolvedValue({
      orphanedFragmentBuckets: 2,
      activeJobBuckets: 3,
      removedStorageKeys: [
        'unshackle:previousDetections',
        'unshackle:media-asset-store:v1',
      ],
    }),
  } as Partial<RuntimeClient> as RuntimeClient;

  render(<PopupApp runtimeClient={runtimeClient} />);

  await user.click(screen.getByRole('button', { name: /clean extension storage/i }));

  expect(runtimeClient.clearExtensionStorage).toHaveBeenCalledTimes(1);
  expect(await screen.findByText(/cleaned 2 orphaned fragment buckets and 2 cached detection records/i)).toBeInTheDocument();
});

test('popup onboarding lets the user choose theme', async () => {
  const user = userEvent.setup();
  render(<PopupApp />);

  await user.click(await screen.findByRole('button', { name: /next/i }));
  await user.click(await screen.findByRole('button', { name: /next/i }));
  await user.click(await screen.findByRole('radio', { name: /light/i }));

  expect(useSettingsStore.getState().theme).toBe('light');
});

test('completing onboarding stores onboardingCompleted', async () => {
  nativeMocks.checkNativeHelperReadiness.mockResolvedValue(diagnostic('ready'));
  const user = userEvent.setup();
  render(<PopupApp />);

  for (let index = 0; index < 6; index += 1) {
    await user.click(await screen.findByRole('button', { name: /next/i }));
  }
  await user.click(await screen.findByRole('button', { name: /finish/i }));

  expect(useSettingsStore.getState().onboardingCompleted).toBe(true);
});

test('Enable native helper requests optional permission and rechecks readiness after grant', async () => {
  nativeMocks.requestNativeMessagingPermission.mockResolvedValue(true);
  nativeMocks.checkNativeHelperReadiness
    .mockResolvedValueOnce(diagnostic('permission-needed'))
    .mockResolvedValueOnce(diagnostic('host-missing'));
  const user = userEvent.setup();
  render(<PopupApp />);
  const onboarding = await screen.findByLabelText(/welcome to unshackle/i);
  for (let index = 0; index < 5; index += 1) {
    await user.click(within(onboarding).getByRole('button', { name: /next/i }));
  }
  const enableButton = await within(onboarding).findByRole('button', {
    name: /allow native messaging/i,
  });

  await user.click(enableButton);

  expect(nativeMocks.requestNativeMessagingPermission).toHaveBeenCalledTimes(1);
  expect(nativeMocks.checkNativeHelperReadiness).toHaveBeenCalledTimes(2);
  expect(useSettingsStore.getState().nativeHelperPermissionPrompted).toBe(true);
});

test('host-missing state shows PowerShell setup action without implying silent install', async () => {
  nativeMocks.checkNativeHelperReadiness.mockResolvedValue(diagnostic('host-missing'));
  const user = userEvent.setup();
  render(<PopupApp />);
  const onboarding = await screen.findByLabelText(/welcome to unshackle/i);
  for (let index = 0; index < 6; index += 1) {
    await user.click(within(onboarding).getByRole('button', { name: /next/i }));
  }

  expect(await screen.findByText(/setup page explains helper registration/i)).toBeInTheDocument();
  expect(await within(onboarding).findByRole('button', { name: /open setup/i })).toBeInTheDocument();
  expect(screen.queryByText(/installed automatically/i)).not.toBeInTheDocument();
});

test('open-source screen uses the repository github url', async () => {
  const user = userEvent.setup();
  render(<PopupApp />);

  await user.click(await screen.findByRole('button', { name: /next/i }));
  await user.click(await screen.findByRole('button', { name: /view on github/i }));

  expect(window.open).toHaveBeenCalledWith(
    'https://github.com/gecallidryas/Video-Downloader-Unshackle',
    '_blank',
    'noopener,noreferrer',
  );
});

test('dismissed onboarding does not render on next popup open', async () => {
  const user = userEvent.setup();
  const { unmount } = render(<PopupApp />);

  await user.click(await screen.findByRole('button', { name: /close onboarding/i }));
  unmount();
  render(<PopupApp />);

  expect(screen.queryByText(/welcome to unshackle/i)).not.toBeInTheDocument();
});

test('edits, exports, imports, and resets capture rules', async () => {
  useSettingsStore.setState({ advancedMode: true });
  const user = userEvent.setup();
  render(<PopupApp />);

  fireEvent.change(screen.getByRole('textbox', { name: /custom extensions/i }), {
    target: { value: '.vob\n.flv' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: /custom content types/i }), {
    target: { value: 'application/octet-stream' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: /url blacklist/i }), {
    target: { value: '*analytics*' },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: /minimum size bytes/i }), {
    target: { value: '1024' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: /size predicate/i }), {
    target: { value: '1KB-5MB' },
  });

  expect(useSettingsStore.getState()).toMatchObject({
    captureRuleCustomExtensions: ['.vob', '.flv'],
    captureRuleCustomContentTypes: ['application/octet-stream'],
    captureRuleUrlBlacklist: ['*analytics*'],
    captureRuleMinSizeBytes: 1024,
    captureRuleSizePredicate: '1KB-5MB',
  });

  await user.click(screen.getByRole('button', { name: /export capture rules/i }));
  expect(screen.getByRole('textbox', { name: /capture rules json/i })).toHaveValue();
  expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: /capture rules json/i }).value).toContain('"customExtensions"');

  fireEvent.change(screen.getByRole('textbox', { name: /capture rules json/i }), {
    target: { value: JSON.stringify({ customExtensions: ['.avi'], minSizeBytes: 4096 }) },
  });
  await user.click(screen.getByRole('button', { name: /import capture rules/i }));
  expect(useSettingsStore.getState()).toMatchObject({
    captureRuleCustomExtensions: ['.avi'],
    captureRuleMinSizeBytes: 4096,
  });

  await user.click(screen.getByRole('button', { name: /reset capture rules/i }));
  expect(useSettingsStore.getState()).toMatchObject({
    captureRuleCustomExtensions: [],
    captureRuleCustomContentTypes: [],
    captureRuleUrlBlacklist: [],
    captureRuleMinSizeBytes: 0,
    captureRuleSizePredicate: '',
  });
});

test('shows validation errors for invalid capture rules', async () => {
  useSettingsStore.setState({ advancedMode: true });
  const user = userEvent.setup();
  render(<PopupApp />);

  await user.type(screen.getByRole('textbox', { name: /custom extensions/i }), 'webm');

  expect(screen.getByText(/invalid extension/i)).toBeInTheDocument();
});

test('advanced mode toggle updates the store', async () => {
  const user = userEvent.setup();
  render(<PopupApp />);

  const toggle = screen.getByRole('checkbox', { name: /advanced mode/i });
  expect(toggle).not.toBeChecked();
  await user.click(toggle);
  expect(useSettingsStore.getState().advancedMode).toBe(true);
});

test('renders keyboard shortcut hints in popup footer', () => {
  render(<PopupApp />);
  const list = screen.getByLabelText(/keyboard shortcuts/i);
  expect(list).toHaveTextContent(/ctrl\+shift\+p/i);
  expect(list).toHaveTextContent(/ctrl\+shift\+x/i);
  expect(list).toHaveTextContent(/ctrl\+shift\+d/i);
});

const jobsFixture: PopupJob[] = [
  {
    id: 'job-1',
    title: 'Clip A',
    status: 'running',
    progressPct: 42,
    segmentsDone: 12,
    segmentsFailed: 1,
    speedKBps: 320.5,
    elapsedSec: 18,
  },
];

test('jobs prop renders job list and detail view with back navigation', async () => {
  const user = userEvent.setup();
  render(<PopupApp jobs={jobsFixture} />);
  expect(screen.getByLabelText(/download jobs/i)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /clip a/i }));
  expect(screen.getByLabelText(/details for clip a/i)).toBeInTheDocument();
  expect(screen.getByText(/42%/)).toBeInTheDocument();
  expect(screen.getByText(/12/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /back to job list/i }));
  expect(screen.getByLabelText(/download jobs/i)).toBeInTheDocument();
});

test('empty jobs prop renders empty state and shortcut hints', () => {
  render(<PopupApp jobs={[]} />);
  expect(screen.getByText(/no active downloads/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/keyboard shortcuts/i)).toBeInTheDocument();
});

test('popup loads runtime jobs when opened without injected jobs', async () => {
  const downloadJobs = [
    {
      id: 'job-a',
      candidateId: 'candidate-a',
      tabId: 7,
      phase: 'running',
      createdAt: 1,
      updatedAt: 2,
      progressPct: 42,
      bytesDownloaded: 1_024,
      selection: { mode: 'best' },
      output: {
        fileName: 'Clip A',
        mimeType: 'video/mp4',
        outputUrl: 'blob:clip-a',
      },
      segmentStatuses: [
        { index: 0, status: 'done' },
        { index: 1, status: 'failed' },
      ],
    },
  ];
  const runtimeClient = {
    getJobs: vi.fn().mockResolvedValue(downloadJobs),
  } as Partial<RuntimeClient> as RuntimeClient;

  render(<PopupApp runtimeClient={runtimeClient} loadRuntimeJobs />);

  expect(await screen.findByText('Clip A')).toBeInTheDocument();
  expect(runtimeClient.getJobs).toHaveBeenCalledTimes(1);
});
