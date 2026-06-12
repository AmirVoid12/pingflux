import * as net from "net";
import { ProbeResult } from "../interfaces";
import { startTimer } from "../utils/timer";

/**
 * Probe a host via TCP connection attempt.
 * Resolves `ok: true` if the connection is established successfully.
 * The socket is immediately destroyed after a successful connect — no data is sent.
 *
 * @param url - Target in `"host:port"` format (e.g. `"example.com:443"` or `"1.2.3.4:80"`).
 *
 * @example
 * const result = await tcpProbe("example.com:443");
 * console.log(result.ok, result.latency);
 */
export function tcpProbe(url: string): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const [host, portStr] = url.split(":");
    const port = parseInt(portStr, 10);

    if (!host || isNaN(port)) {
      resolve({
        ok: false,
        latency: null,
        error: "Invalid host:port format",
        protocol: "tcp",
        target: url,
        timestamp: Date.now(),
      });
      return;
    }

    const stop = startTimer();
    const socket = new net.Socket();
    let resolved = false;

    const cleanup = () => {
      if (!socket.destroyed) socket.destroy();
    };

    socket.setTimeout(10000);

    socket.connect(port, host, () => {
      const latency = stop();
      resolved = true;
      cleanup();
      resolve({
        ok: true,
        latency,
        protocol: "tcp",
        target: url,
        timestamp: Date.now(),
      });
    });

    socket.on("timeout", () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve({
          ok: false,
          latency: null,
          error: "TCP connection timeout",
          protocol: "tcp",
          target: url,
          timestamp: Date.now(),
        });
      }
    });

    socket.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve({
          ok: false,
          latency: null,
          error: err.message,
          protocol: "tcp",
          target: url,
          timestamp: Date.now(),
        });
      }
    });
  });
}