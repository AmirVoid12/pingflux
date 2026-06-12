import * as dns from "dns";
import { ProbeResult } from "../interfaces";
import { startTimer } from "../utils/timer";

/**
 * Probe a host via DNS resolution.
 * Attempts A record lookup first, then AAAA, then CNAME as a final fallback.
 * Resolves `ok: true` if any record type is found.
 *
 * Note: only A, AAAA, and CNAME record types are checked.
 * Hosts with exclusively MX, TXT, or other record types will resolve as `ok: false`.
 *
 * @param url - Hostname to resolve, optionally with a port suffix (e.g. `"example.com"` or `"example.com:53"`).
 *
 * @example
 * const result = await dnsProbe("example.com");
 * console.log(result.ok, result.latency);
 */
export function dnsProbe(url: string): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const host = url.split(":")[0];
    const stop = startTimer();

    dns.resolve4(host, (err4, v4) => {
      if (!err4 && v4.length > 0) {
        resolve({ ok: true, latency: stop(), protocol: "dns", target: url, timestamp: Date.now() });
        return;
      }

      dns.resolve6(host, (err6, v6) => {
        if (!err6 && v6.length > 0) {
          resolve({ ok: true, latency: stop(), protocol: "dns", target: url, timestamp: Date.now() });
          return;
        }

        dns.resolveCname(host, (errCname, cnames) => {
          const latency = stop();
          if (!errCname && cnames.length > 0) {
            resolve({ ok: true, latency, protocol: "dns", target: url, timestamp: Date.now() });
            return;
          }
          resolve({
            ok: false,
            latency: null,
            error: err4?.message ?? err6?.message ?? errCname?.message ?? "No records found",
            protocol: "dns",
            target: url,
            timestamp: Date.now(),
          });
        });
      });
    });
  });
}