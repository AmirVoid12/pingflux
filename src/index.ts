import { Monitor } from "./core/monitor";
import { PingfluxEmitter } from "./core/emitter";
import { Target, PingfluxEvent, EventType, PingfluxOptions, Protocol } from "./interfaces";

export class Pingflux {
  private emitter: PingfluxEmitter;
  private monitor: Monitor;

  constructor(options?: PingfluxOptions) {
    this.emitter = new PingfluxEmitter();
    this.monitor = new Monitor(this.emitter, options);
  }

  /**
   * Start monitoring a target.
   * Runs the probe immediately and then on every `target.interval` ms.
   * If the same target (same protocol + url) is already being watched, this call is a no-op.
   *
   * @param target - The target to monitor.
   * @returns `true` if monitoring started, `false` if already being watched.
   *
   * @example
   * pf.watch({ protocol: "https", url: "example.com" });
   * pf.watch({ protocol: "tcp", url: "example.com:443", interval: 10000, threshold: 500 });
   */
  watch(target: Target): boolean {
    return this.monitor.watch(target);
  }

  /**
   * Register a listener for a probe event.
   * Multiple listeners can be registered for the same event.
   *
   * @param event - One of `"up"`, `"down"`, `"slow"`, `"probe_error"`.
   * @param callback - Function called with the probe result payload.
   *
   * @example
   * pf.on("up", (e) => console.log(`${e.target} is up — ${e.latency}ms`));
   * pf.on("probe_error", (e) => console.error(`${e.target} error: ${e.error}`));
   */
  on(event: EventType, callback: (data: PingfluxEvent) => void): void {
    this.emitter.on(event, callback);
  }

  /**
   * Remove a previously registered event listener.
   *
   * @param event - The event name the listener was registered on.
   * @param callback - The exact function reference passed to `on()`.
   *
   * @example
   * const handler = (e: PingfluxEvent) => console.log(e);
   * pf.on("up", handler);
   * pf.off("up", handler);
   */
  off(event: EventType, callback: (data: PingfluxEvent) => void): void {
    this.emitter.off(event, callback);
  }

  /**
   * Stop monitoring a specific target.
   * If no matching target is found, the call is a no-op.
   *
   * @param protocol - The protocol of the target to stop.
   * @param url - The url of the target to stop.
   *
   * @example
   * pf.stop("https", "example.com");
   * pf.stop("tcp", "example.com:443");
   */
  stop(protocol: Protocol, url: string): void {
    this.monitor.stop(protocol, url);
  }

  /**
   * Stop all active monitors and clear all internal state.
   *
   * @example
   * pf.stopAll();
   */
  stopAll(): void {
    this.monitor.stopAll();
  }
}