import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PopupApp, type PopupJob } from '../PopupApp';
import { useSettingsStore } from '@/src/state/useSettingsStore';

beforeEach(() => {
  useSettingsStore.setState({
    theme: 'contrast',
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
  });
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

test('renders source-equivalent theme and download settings in the flat settings surface', () => {
  render(<PopupApp />);

  expect(screen.getByRole('combobox', { name: /theme/i })).toHaveValue('contrast');
  expect(screen.getByRole('option', { name: /blueberry/i })).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: /network capture/i })).toBeChecked();
  expect(screen.getByRole('combobox', { name: /max concurrent downloads/i })).toHaveValue('3');
  expect(screen.getByRole('combobox', { name: /segments per download/i })).toHaveValue('5');
  expect(screen.getByRole('combobox', { name: /preferred audio language/i })).toHaveValue('en');
  expect(screen.getByRole('textbox', { name: /filename template/i })).toHaveValue(
    '{title}_{quality}_{date}_{time}',
  );
  expect(screen.getByRole('combobox', { name: /preview mode/i })).toHaveValue('image');
  expect(screen.getByRole('combobox', { name: /preview format/i })).toHaveValue('webm');
  expect(screen.getByText(/native ffmpeg helper/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /check helper/i })).toBeInTheDocument();
});

test('preview format selection persists to the settings store', async () => {
  const user = userEvent.setup();
  render(<PopupApp />);

  await user.selectOptions(screen.getByRole('combobox', { name: /preview format/i }), 'gif');

  expect(useSettingsStore.getState().previewFormat).toBe('gif');
});

test('theme selection persists to the settings store and document token hook', async () => {
  const user = userEvent.setup();
  render(<PopupApp />);

  await user.selectOptions(screen.getByRole('combobox', { name: /theme/i }), 'ocean');

  expect(useSettingsStore.getState().theme).toBe('ocean');
  expect(document.documentElement).toHaveAttribute('data-theme', 'ocean');
});

test('edits, exports, imports, and resets capture rules', async () => {
  const user = userEvent.setup();
  render(<PopupApp />);

  await user.type(screen.getByRole('textbox', { name: /custom extensions/i }), '.vob\n.flv');
  await user.type(screen.getByRole('textbox', { name: /custom content types/i }), 'application/octet-stream');
  await user.type(screen.getByRole('textbox', { name: /url blacklist/i }), '*analytics*');
  await user.clear(screen.getByRole('spinbutton', { name: /minimum size bytes/i }));
  await user.type(screen.getByRole('spinbutton', { name: /minimum size bytes/i }), '1024');
  await user.type(screen.getByRole('textbox', { name: /size predicate/i }), '1KB-5MB');

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
  const user = userEvent.setup();
  render(<PopupApp />);

  await user.type(screen.getByRole('textbox', { name: /custom extensions/i }), 'webm');

  expect(screen.getByText(/invalid extension/i)).toBeInTheDocument();
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
