import * as http from "http";
import * as https from "https";
import { URL } from "url";
import { ProbeResult, Protocol } from "../interfaces";
import { startTimer } from "../utils/timer";

/**
 * Probe a host via HTTP or HTTPS GET request.
 * Resolves `ok: true` if the response status code is less than 400.
 * Automatically strips any existing protocol prefix from `url` before parsing
 * to avoid double-prefixing (e.g. passing `"https://example.com"` with protocol `"https"` is safe).
 *
 * @param url - Target URL or hostname, with or without protocol prefix
 *              (e.g. `"example.com"`, `"example.com/health"`, or `"https://example.com/health"`).
 * @param protocol - Must be `"http"` or `"https"`. Determines the transport and default port.
 *
 * @example
 * const result = await httpProbe("example.com/health", "https");
 * console.log(result.ok, result.latency);
 */
export function httpProbe(url: string, protocol: Protocol): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const stop = startTimer();
    const lib = protocol === "https" ? https : http;
    const stripped = url.replace(/^https?:\/\//i, "");

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(`${protocol}://${stripped}`);
    } catch {
      resolve({
        ok: false,
        latency: null,
        error: "Invalid URL format",
        protocol,
        target: url,
        timestamp: Date.now(),
      });
      return;
    }

    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (protocol === "https" ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: "GET",
      timeout: 10000,
    };

    const req = lib.request(options, (res) => {
      const latency = stop();
      res.resume();
      resolve({
        ok: res.statusCode !== undefined && res.statusCode < 400,
        latency,
        protocol,
        target: url,
        timestamp: Date.now(),
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({
        ok: false,
        latency: null,
        error: "Request timeout",
        protocol,
        target: url,
        timestamp: Date.now(),
      });
    });

    req.on("error", (err) => {
      resolve({
        ok: false,
        latency: null,
        error: err.message,
        protocol,
        target: url,
        timestamp: Date.now(),
      });
    });

    req.end();
  });
}