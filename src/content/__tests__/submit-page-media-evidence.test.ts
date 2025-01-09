import { submitPageMediaEvidence } from '@/entrypoints/content';

test('submits collected DOM evidence to the background runtime', async () => {
  document.body.innerHTML = `
    <video src="https://cdn.example.com/master.m3u8"></video>
  `;

  const runtime = {
    sendMessage: vi.fn(async () => undefined),
  };

  await submitPageMediaEvidence(runtime);

  expect(runtime.sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'INGEST_CONTENT_EVIDENCE',
      payload: expect.objectContaining({
        evidence: [
          expect.objectContaining({
            source: 'dom',
            url: 'https://cdn.example.com/master.m3u8',
          }),
        ],
      }),
    }),
  );
});
