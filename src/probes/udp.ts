import * as dgram from "dgram";
import { ProbeResult } from "../interfaces";
import { startTimer } from "../utils/timer";

/**
 * Probe a host via UDP by sending a small packet and waiting for any response.
 * Resolves `ok: true` only if a response packet is received within the timeout window.
 *
 * Note: UDP is connectionless — most servers do not reply to arbitrary packets.
 * A timeout (`ok: false`) does not necessarily mean the host is down; it may simply
 * mean the server ignored the probe. This probe is most useful for services that
 * explicitly echo UDP packets (e.g. custom health-check endpoints, DNS on port 53).
 * For DNS specifically, use the `dns` protocol instead.
 *
 * @param url - Target in `"host:port"` format (e.g. `"1.2.3.4:9000"`).
 *
 * @example
 * const result = await udpProbe("1.2.3.4:9000");
 * console.log(result.ok, result.latency);
 */
export function udpProbe(url: string): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const [host, portStr] = url.split(":");
    const port = parseInt(portStr, 10);

    if (!host || isNaN(port)) {
      resolve({
        ok: false,
        latency: null,
        error: "Invalid host:port format",
        protocol: "udp",
        target: url,
        timestamp: Date.now(),
      });
      return;
    }

    const client = dgram.createSocket("udp4");
    const stop = startTimer();
    const message = Buffer.from("ping");
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        client.close();
        resolve({
          ok: false,
          latency: null,
          error: "UDP timeout — no response received",
          protocol: "udp",
          target: url,
          timestamp: Date.now(),
        });
      }
    }, 5000);

    client.on("message", () => {
      if (!resolved) {
        const latency = stop();
        resolved = true;
        clearTimeout(timeout);
        client.close();
        resolve({
          ok: true,
          latency,
          protocol: "udp",
          target: url,
          timestamp: Date.now(),
        });
      }
    });

    client.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        client.close();
        resolve({
          ok: false,
          latency: null,
          error: err.message,
          protocol: "udp",
          target: url,
          timestamp: Date.now(),
        });
      }
    });

    client.send(message, 0, message.length, port, host, (err) => {
      if (err && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        client.close();
        resolve({
          ok: false,
          latency: null,
          error: err.message,
          protocol: "udp",
          target: url,
          timestamp: Date.now(),
        });
      }
    });
  });
}