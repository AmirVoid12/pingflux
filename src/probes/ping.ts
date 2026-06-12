import { ProbeResult } from "../interfaces";
import { rawPing } from "../utils/probes/ping";

/**
 * Probe a host via raw ICMP echo request (ping).
 * Internally uses a Worker thread to avoid blocking the event loop.
 *
 * Requires elevated privileges:
 * - Linux: root or `CAP_NET_RAW` capability (`sudo setcap cap_net_raw+ep node`)
 * - macOS: root
 * - Windows: Administrator
 *
 * Note: `url` must be a plain IPv4 address — hostname resolution is not performed.
 *
 * @param url - Target IPv4 address, optionally with port suffix (port is ignored).
 *              IPv6 addresses in bracket notation are also parsed (e.g. `"[::1]"`).
 *
 * @example
 * const result = await pingProbe("1.1.1.1");
 * console.log(result.ok, result.latency);
 */
export async function pingProbe(url: string): Promise<ProbeResult> {
  const host = url.startsWith("[") ? url.slice(1, url.indexOf("]")) : url.split(":")[0];
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