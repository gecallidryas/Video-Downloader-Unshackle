export async function fetchDurationsWithLimit(
  urls: string[],
  probe: (url: string) => Promise<number | undefined>,
  concurrency = 4,
): Promise<Array<number | undefined>> {
  const results: Array<number | undefined> = new Array(urls.length);
  const limit = Math.max(1, Math.floor(concurrency));
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < urls.length) {
      const index = nextIndex;
      nextIndex += 1;
      const url = urls[index];

      if (url !== undefined) {
        results[index] = await probe(url);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, urls.length) },
    () => worker(),
  );

  await Promise.all(workers);
  return results;
}
