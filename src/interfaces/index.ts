/**
 * Supported probe protocols.
 *
 * - `http` / `https` — HTTP GET request; resolves ok if status < 400
 * - `tcp` — TCP socket connect; resolves ok on successful connection
 * - `udp` — UDP packet send/receive; resolves ok if a response is received
 * - `dns` — DNS A/AAAA record lookup; resolves ok if at least one record found
 * - `ping` — Raw ICMP echo request; requires root or CAP_NET_RAW on Linux
 */
export type Protocol = "http" | "https" | "tcp" | "udp" | "dns" | "ping";

/**
 * Event types emitted by Pingflux.
 *
 * - `up` — target is reachable and within latency threshold
 * - `down` — target is unreachable with no specific error
 * - `slow` — target is reachable but latency exceeds threshold
 * - `probe_error` — probe failed with a specific error message
 */
export type EventType = "up" | "down" | "slow" | "probe_error";

/**
 * Internal result returned by each probe function.
 * Not exposed directly to end users — use `PingfluxEvent` for listener callbacks.
 */
export interface ProbeResult {
  ok: boolean;
  latency: number | null;
  error?: string;
  protocol: Protocol;
  target: string;
  timestamp: number;
}

/**
 * A monitoring target.
 *
 * @example
 * // HTTP target with custom interval and threshold
 * { protocol: "https", url: "example.com", interval: 10000, threshold: 500 }
 *
 * @example
 * // TCP target
 * { protocol: "tcp", url: "example.com:443" }
 *
 * @example
 * // ICMP ping — requires root or CAP_NET_RAW, url must be a plain IP address
 * { protocol: "ping", url: "1.1.1.1" }
 */
export interface Target {
  /**
   * For `http`/`https`: hostname or full URL (e.g. `"example.com"` or `"example.com/health"`).
   * For `tcp`/`udp`: `"host:port"` format (e.g. `"example.com:443"`).
   * For `dns`: hostname to resolve (e.g. `"example.com"`).
   * For `ping`: plain IP address only — hostname resolution is not supported (e.g. `"1.1.1.1"`).
   */
  url: string;
  protocol: Protocol;
  /** Probe interval in milliseconds. Default: `5000` */
  interval?: number;
  /** Latency threshold in milliseconds above which a `slow` event is emitted. Default: `1000` */
  threshold?: number;
  /** Number of retries on failure before emitting a `down` or `probe_error` event. Default: `1` */
  retry?: number;
}

/**
 * Event payload passed to all event listeners.
 *
 * @example
 * pingflux.on("up", (e: PingfluxEvent) => {
 *   console.log(`${e.protocol}://${e.target} — ${e.latency}ms`);
 * });
 */
export interface PingfluxEvent {
  target: string;
  protocol: Protocol;
  latency: number | null;
  /** Present only on `probe_error` events. */
  error?: string;
  timestamp: number;
}

/**
 * Global options passed to the `Pingflux` constructor.
 * These apply to all targets unless overridden per-target.
 *
 * @example
 * const pf = new Pingflux({ threshold: 500, retry: 2 });
 */
export interface PingfluxOptions {
  /** Default latency threshold in ms. Default: `1000` */
  threshold?: number;
  /** Default retry count on failure. Default: `1` */
  retry?: number;
}