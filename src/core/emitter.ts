import { EventEmitter } from "events";
import { PingfluxEvent } from "../interfaces";

export class PingfluxEmitter extends EventEmitter {
  constructor() {
    super();
    this.on("error", () => {});
  }

  /**
   * Emit an "up" event — target is reachable and within the latency threshold.
   *
   * @param data - The probe result event payload.
   *
   * @example
   * emitter.on("up", (e) => console.log(`${e.target} is up (${e.latency}ms)`));
   */
  emitUp(data: PingfluxEvent): void {
    this.emit("up", data);
  }

  /**
   * Emit a "down" event — target is unreachable with no specific error.
   *
   * @param data - The probe result event payload.
   *
   * @example
   * emitter.on("down", (e) => console.log(`${e.target} is down`));
   */
  emitDown(data: PingfluxEvent): void {
    this.emit("down", data);
  }

  /**
   * Emit a "slow" event — target is reachable but latency exceeds the threshold.
   *
   * @param data - The probe result event payload.
   *
   * @example
   * emitter.on("slow", (e) => console.log(`${e.target} is slow (${e.latency}ms)`));
   */
  emitSlow(data: PingfluxEvent): void {
    this.emit("slow", data);
  }

  /**
   * Emit a "probe_error" event — probe failed with a specific error message.
   * Uses a dedicated "probe_error" channel instead of Node's built-in "error"
   * event to avoid conflicts with EventEmitter's crash-on-unhandled-error behavior.
   *
   * @param data - The probe result event payload. `data.error` contains the error message.
   *
   * @example
   * emitter.on("probe_error", (e) => console.error(`${e.target} error: ${e.error}`));
   */
  emitError(data: PingfluxEvent): void {
    this.emit("probe_error", data);
  }
}