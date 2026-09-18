import { ProbeResult } from "../interfaces";
import { rawPing } from "../utils/probes/ping";

/**
 * Probe a host via ICMP echo request (ping) using the native C addon.
 * Runs on the libuv threadpool, so the event loop is never blocked.
 *
 * Platform support: **Linux only** (for now).
 *
 * Privileges:
 * - Runs **without root** when the kernel allows unprivileged ICMP sockets
 *   (`net.ipv4.ping_group_range` covers your GID — default on most modern distros).
 * - Otherwise needs root or `CAP_NET_RAW` (`sudo setcap cap_net_raw+ep $(which node)`).
 *
 * Note: `url` must be a plain IP address — hostname resolution is not performed.
 * Both IPv4 (`"1.1.1.1"`, `"1.1.1.1:80"`) and IPv6 (`"::1"`, `"[::1]"`, `"[::1]:80"`) are accepted;
 * any port suffix is ignored.
 *
 * @param url - Target IP address, optionally with port suffix (port is ignored).
 *
 * @example
 * const result = await pingProbe("1.1.1.1");
 * console.log(result.ok, result.latency);
 */
export async function pingProbe(url: string): Promise<ProbeResult> {
  const host = extractHost(url);
  const id = (Math.floor(Math.random() * 0xfffe) + 1) & 0xffff;
  const seq = (Math.floor(Math.random() * 0xfffe) + 1) & 0xffff;
  const result = await rawPing(host, id, seq);

  return {
    ok: result.ok,
    latency: result.latency,
    error: result.error,
    protocol: "ping",
    target: url,
    timestamp: Date.now(),
  };
}

/**
 * Extract the bare IP from `"1.1.1.1"`, `"1.1.1.1:80"`, `"[::1]"`, `"[::1]:80"` or `"::1"`.
 * A bare IPv6 literal (multiple colons, no brackets) is returned untouched.
 */
function extractHost(url: string): string {
  if (url.startsWith("[")) {
    return url.slice(1, url.indexOf("]"));
  }
  const colons = (url.match(/:/g) || []).length;
  return colons === 1 ? url.split(":")[0] : url;
}