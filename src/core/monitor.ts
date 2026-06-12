import { PingfluxEmitter } from "./emitter";
import { Target, ProbeResult, Protocol, PingfluxOptions } from "../interfaces";
import { httpProbe } from "../probes/http";
import { tcpProbe } from "../probes/tcp";
import { udpProbe } from "../probes/udp";
import { dnsProbe } from "../probes/dns";
import { pingProbe } from "../probes/ping";
import { isSlowLatency } from "../utils/latency";

export class Monitor {
  private emitter: PingfluxEmitter;
  private timers: Map<string, NodeJS.Timeout>;
  private running: Map<string, boolean>;
  private globalOptions: PingfluxOptions;

  constructor(emitter: PingfluxEmitter, options?: PingfluxOptions) {
    this.emitter = emitter;
    this.timers = new Map();
    this.running = new Map();
    this.globalOptions = options ?? {};
  }

  private targetKey(target: Target): string {
    return `${target.protocol}::${target.url}`;
  }

  private async runProbe(target: Target): Promise<ProbeResult> {
    switch (target.protocol) {
      case "http":
      case "https":
        return httpProbe(target.url, target.protocol);
      case "tcp":
        return tcpProbe(target.url);
      case "udp":
        return udpProbe(target.url);
      case "dns":
        return dnsProbe(target.url);
      case "ping":
        return pingProbe(target.url);
      default:
        return {
          ok: false,
          latency: null,
          error: "Unknown protocol",
          protocol: target.protocol as Protocol,
          target: target.url,
          timestamp: Date.now(),
        };
    }
  }

  private async runWithRetry(target: Target, retries: number): Promise<ProbeResult> {
    let lastResult: ProbeResult | null = null;
    for (let i = 0; i <= retries; i++) {
      const result = await this.runProbe(target);
      if (result.ok) return result;
      lastResult = result;
      if (i < retries) await new Promise((r) => setTimeout(r, 500));
    }
    return lastResult!;
  }

  private handle(result: ProbeResult, threshold: number): void {
    const event = {
      target: result.target,
      protocol: result.protocol,
      latency: result.latency,
      error: result.error,
      timestamp: result.timestamp,
    };

    if (!result.ok) {
      if (result.error) {
        this.emitter.emitError(event);
      } else {
        this.emitter.emitDown(event);
      }
      return;
    }

    if (result.latency !== null && isSlowLatency(result.latency, threshold)) {
      this.emitter.emitSlow(event);
      return;
    }

    this.emitter.emitUp(event);
  }

  /**
   * Start monitoring a target.
   * Runs the appropriate probe immediately and then on every `interval` ms.
   * If the same target (same protocol + url) is already being watched, this call is a no-op.
   *
   * @param target - The target to monitor.
   * @returns `true` if monitoring started, `false` if the target was already being watched.
   *
   * @example
   * const added = monitor.watch({ protocol: "https", url: "example.com" });
   * console.log(added); // true
   * const duplicate = monitor.watch({ protocol: "https", url: "example.com" });
   * console.log(duplicate); // false
   */
  watch(target: Target): boolean {
    const key = this.targetKey(target);
    if (this.timers.has(key)) return false;

    const interval = target.interval ?? 5000;
    const threshold = target.threshold ?? this.globalOptions.threshold ?? 1000;
    const retry = target.retry ?? this.globalOptions.retry ?? 1;

    const run = async () => {
      if (this.running.get(key)) return;
      this.running.set(key, true);
      try {
        const result = await this.runWithRetry(target, retry);
        this.handle(result, threshold);
      } finally {
        this.running.set(key, false);
      }
    };

    run();
    const timer = setInterval(run, interval);
    this.timers.set(key, timer);
    this.running.set(key, false);
    return true;
  }

  /**
   * Stop monitoring a specific target by its exact protocol and url.
   * If no matching target is found, the call is a no-op.
   *
   * @param protocol - The protocol of the target to stop.
   * @param url - The url of the target to stop.
   *
   * @example
   * monitor.stop("https", "example.com");
   */
  stop(protocol: Protocol, url: string): void {
    const key = `${protocol}::${url}`;
    const timer = this.timers.get(key);
    if (timer !== undefined) {
      clearInterval(timer);
      this.timers.delete(key);
      this.running.delete(key);
    }
  }

  /**
   * Stop all active monitors and clear all internal state.
   *
   * @example
   * monitor.stopAll();
   */
  stopAll(): void {
    const keys = Array.from(this.timers.keys());
    for (const key of keys) {
      const timer = this.timers.get(key);
      if (timer !== undefined) {
        clearInterval(timer);
        this.timers.delete(key);
        this.running.delete(key);
      }
    }
  }
}