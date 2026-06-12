/**
 * Start a high-resolution timer using `process.hrtime.bigint()`.
 * Call the returned function to get the elapsed time in milliseconds.
 *
 * @returns A function that, when called, returns the elapsed time in milliseconds (floating-point).
 *
 * @example
 * const stop = startTimer();
 * await doSomething();
 * const ms = stop(); // e.g. 42.317
 */
export function startTimer(): () => number {
  const start = process.hrtime.bigint();
  return () => Number(process.hrtime.bigint() - start) / 1_000_000;
}