import * as os from "os";
import * as path from "path";

/**
 * Shape of the object resolved by the native `pingIcmp` addon.
 * Mirrors what `complete_ping()` builds in `native/src/addon.c`.
 */
export interface NativePingResult {
  ok: boolean;
  latency: number | null;
  ttl: number | null;
  hops: number | null;
  icmpType: number | null;
  icmpCode: number | null;
  error?: string;
  errorReason: string | null;
  stats: {
    sent: number;
    received: number;
    lossPercent: number;
    min: number | null;
    max: number | null;
    avg: number | null;
    jitter: number | null;
  } | null;
}

interface NativeAddon {
  pingIcmp(
    host: string,
    ipVersion: number,
    id: number,
    seq: number,
    timeoutMs: number,
    count: number,
    ttl: number
  ): Promise<NativePingResult>;
  IP_VERSION_4: number;
  IP_VERSION_6: number;
}

export type PingResult = NativePingResult;

export interface RawPingOptions {
  /** Per-packet timeout in ms. Default: `2000` */
  timeout?: number;
  /** Number of packets to send (1-64). Default: `1` */
  count?: number;
  /** IP TTL / hop limit. `0` = system default. Default: `0` */
  ttl?: number;
}

let addon: NativeAddon | null = null;
let addonLoadError: string | null = null;

/**
 * Lazy-load the native addon. Throws (with a readable message) on unsupported
 * platforms or when the binary is missing, so importing `pingflux` never crashes
 * for users who don't use the `ping` protocol.
 */
function loadAddon(): NativeAddon {
  if (addon) return addon;
  if (addonLoadError) throw new Error(addonLoadError);

  if (os.platform() !== "linux") {
    addonLoadError = `ping (ICMP) is currently supported on Linux only (detected: ${os.platform()})`;
    throw new Error(addonLoadError);
  }

  try {
    // package root = dist/utils/probes -> ../../..
    const root = path.join(__dirname, "..", "..", "..");
    addon = require("node-gyp-build")(root) as NativeAddon;
    return addon;
  } catch (err: any) {
    addonLoadError = `Failed to load native ICMP addon: ${err.message}`;
    throw new Error(addonLoadError);
  }
}

/**
 * Detect IP family. Returns `4`, `6`, or `0` when `host` is not a literal IP.
 */
function detectIpVersion(host: string): 4 | 6 | 0 {
  const { isIP } = require("net") as typeof import("net");
  const v = isIP(host);
  return v === 4 ? 4 : v === 6 ? 6 : 0;
}

/**
 * Turn the raw native error code into something a human can act on.
 * `ERR_SOCKET_OPEN_FAILED:<errno>` is emitted by `execute_ping()` in addon.c.
 */
function humanizeError(code: string | undefined): string | undefined {
  if (!code) return code;
  const m = /^ERR_SOCKET_OPEN_FAILED:(\d+)$/.exec(code);
  if (!m) return code;
  const errno = Number(m[1]);
  // EPERM = 1, EACCES = 13
  if (errno === 1 || errno === 13) {
    return (
      "Cannot open ICMP socket — permission denied. Run as root, or allow unprivileged ping: " +
      "`sudo sysctl -w net.ipv4.ping_group_range=\"0 2147483647\"` " +
      "or `sudo setcap cap_net_raw+ep $(which node)`"
    );
  }
  return `Cannot open ICMP socket (errno ${errno})`;
}

/**
 * Send ICMP echo request(s) using the native C addon and wait for the reply.
 * Runs on the libuv threadpool (`napi_async_work`) — no Worker thread needed.
 *
 * Privileges (Linux):
 * - Works **without root** when `net.ipv4.ping_group_range` includes the user's GID
 *   (default on most modern distros) — the addon tries `SOCK_DGRAM` first.
 * - Falls back to `SOCK_RAW`, which needs root or `CAP_NET_RAW`.
 *
 * @param host - Target IPv4 or IPv6 literal. Hostname resolution is not performed.
 * @param id - ICMP echo identifier (0x0001–0xfffe).
 * @param seq - ICMP echo sequence number (0x0001–0xfffe).
 * @param options - Optional timeout / count / ttl.
 *
 * @example
 * const result = await rawPing("1.1.1.1", 1, 1);
 * console.log(result.ok, result.latency);
 */
export async function rawPing(
  host: string,
  id: number,
  seq: number,
  options: RawPingOptions = {}
): Promise<PingResult> {
  const fail = (error: string): PingResult => ({
    ok: false,
    latency: null,
    ttl: null,
    hops: null,
    icmpType: null,
    icmpCode: null,
    error,
    errorReason: error,
    stats: null,
  });

  let native: NativeAddon;
  try {
    native = loadAddon();
  } catch (err: any) {
    return fail(err.message);
  }

  const family = detectIpVersion(host);
  if (family === 0) {
    return fail("Invalid IP — hostname resolution not supported");
  }

  try {
    const result = await native.pingIcmp(
      host,
      family === 6 ? native.IP_VERSION_6 : native.IP_VERSION_4,
      id,
      seq,
      options.timeout ?? 2000,
      options.count ?? 1,
      options.ttl ?? 0
    );

    if (!result.ok && result.error) {
      const readable = humanizeError(result.error);
      result.error = readable;
      result.errorReason = readable ?? result.errorReason;
    }
    return result;
  } catch (err: any) {
    return fail(err.message);
  }
}