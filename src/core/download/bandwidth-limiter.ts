function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function createBandwidthLimiter(bytesPerSecond = 0): {
  throttle(bytes: number): Promise<void>;
} {
  const throughput = Math.max(0, Number(bytesPerSecond) || 0);
  let nextAvailableAt = 0;

  return {
    async throttle(bytes) {
      if (!throughput || bytes <= 0) {
        return;
      }

      const now = Date.now();
      const waitUntil = Math.max(now, nextAvailableAt);
      const delay = waitUntil - now;

      if (delay > 0) {
        await sleep(delay);
      }

      nextAvailableAt = Math.max(waitUntil, Date.now()) + (bytes / throughput) * 1000;
    },
  };
}
