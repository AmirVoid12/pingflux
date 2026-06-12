/**
 * Determine whether a measured latency exceeds the given threshold.
 *
 * @param latency - Measured latency in milliseconds.
 * @param threshold - Maximum acceptable latency in milliseconds. Default: `1000`.
 * @returns `true` if `latency` is strictly greater than `threshold`.
 *
 * @example
 * isSlowLatency(1200, 1000); // true
 * isSlowLatency(800, 1000);  // false
 * isSlowLatency(1000, 1000); // false — equal is not slow
 */
export function isSlowLatency(latency: number, threshold: number = 1000): boolean {
  return latency > threshold;
}