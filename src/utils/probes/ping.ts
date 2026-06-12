import koffi from "koffi";
import * as os from "os";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { startTimer } from "../timer";

const platform = os.platform();

const lib = platform === "win32"
  ? koffi.load("ws2_32.dll")
  : koffi.load(platform === "darwin" ? "libSystem.B.dylib" : "libc.so.6");

const _socket = lib.func("int socket(int domain, int type, int protocol)");
const _close = platform === "win32"
  ? lib.func("int closesocket(int s)")
  : lib.func("int close(int fd)");
const _sendto = lib.func(platform === "win32"
  ? "int sendto(int s, uint8* buf, int len, int flags, uint8* to, int tolen)"
  : "int sendto(int sockfd, uint8* buf, size_t len, int flags, uint8* dest_addr, uint32 addrlen)");
const _recvfrom = lib.func(platform === "win32"
  ? "int recvfrom(int s, uint8* buf, int len, int flags, uint8* from, int* fromlen)"
  : "int recvfrom(int sockfd, uint8* buf, size_t len, int flags, uint8* src_addr, uint32* addrlen)");
const _inet_addr = lib.func("uint32 inet_addr(str cp)");
const _setsockopt = lib.func(platform === "win32"
  ? "int setsockopt(int s, int level, int optname, uint8* optval, int optlen)"
  : "int setsockopt(int sockfd, int level, int optname, uint8* optval, uint32 optlen)");

if (platform === "win32") {
  const _WSAStartup = lib.func("int WSAStartup(uint16 wVersionRequired, uint8* lpWSAData)");
  _WSAStartup(0x0202, Buffer.alloc(408));
}

export type PingResult = { ok: boolean; latency: number | null; error?: string };

function icmpChecksum(buffer: Buffer): number {
  let sum = 0;
  for (let i = 0; i < buffer.length - 1; i += 2) {
    sum += (buffer[i] << 8) + buffer[i + 1];
  }
  if (buffer.length % 2 !== 0) {
    sum += buffer[buffer.length - 1] << 8;
  }
  while (sum >> 16) {
    sum = (sum & 0xffff) + (sum >> 16);
  }
  return (~sum) & 0xffff;
}

function buildICMPPacket(id: number, seq: number): Buffer {
  const payload = Buffer.from("pingflux-icmp-probe");
  const packet = Buffer.alloc(8 + payload.length);
  packet.writeUInt8(8, 0);
  packet.writeUInt8(0, 1);
  packet.writeUInt16BE(0, 2);
  packet.writeUInt16BE(id & 0xffff, 4);
  packet.writeUInt16BE(seq & 0xffff, 6);
  payload.copy(packet, 8);
  packet.writeUInt16BE(icmpChecksum(packet), 2);
  return packet;
}

function parseICMPReply(buffer: Buffer): { type: number; id: number; seq: number } {
  if (buffer.length < 28) return { type: -1, id: 0, seq: 0 };
  const ihl = (buffer[0] & 0x0f) * 4;
  if (buffer.length < ihl + 8) return { type: -1, id: 0, seq: 0 };
  return {
    type: buffer.readUInt8(ihl),
    id: buffer.readUInt16BE(ihl + 4),
    seq: buffer.readUInt16BE(ihl + 6),
  };
}

function buildSockAddr(host: string): Buffer | null {
  const ip = _inet_addr(host);
  if (ip === 0xffffffff) return null;
  const addr = Buffer.alloc(16);
  addr.writeUInt16LE(2, 0);
  addr.writeUInt32LE(ip, 4);
  return addr;
}

function applyTimeout(sock: number): void {
  if (platform === "win32") {
    const tv = Buffer.alloc(4);
    tv.writeUInt32LE(2000, 0);
    _setsockopt(sock, 0xffff, 0x1006, tv, 4);
  } else if (platform === "darwin") {
    const tv = Buffer.alloc(8);
    tv.writeInt32LE(2, 0);
    tv.writeInt32LE(0, 4);
    _setsockopt(sock, 0xffff, 0x1006, tv, 8);
  } else {
    const tv = Buffer.alloc(16);
    tv.writeBigInt64LE(BigInt(2), 0);
    tv.writeBigInt64LE(BigInt(0), 8);
    _setsockopt(sock, 1, 20, tv, 16);
  }
}

function receiveMatchingReply(sock: number, id: number, seq: number): boolean {
  for (let attempt = 0; attempt < 5; attempt++) {
    const recvBuf = Buffer.alloc(1024);
    const fromLen = Buffer.alloc(4);
    fromLen.writeUInt32LE(16, 0);
    const received = _recvfrom(sock, recvBuf, recvBuf.length, 0, Buffer.alloc(16), fromLen);
    if (received < 0) break;
    const reply = parseICMPReply(recvBuf.slice(0, received));
    if (reply.type === 0 && reply.id === id && reply.seq === seq) return true;
  }
  return false;
}

if (!isMainThread && workerData?.pingfluxWorker === true) {
  const { host, id, seq } = workerData as { host: string; id: number; seq: number };
  let sock = -1;
  try {
    sock = _socket(2, 3, 1);
    if (sock < 0) {
      parentPort!.postMessage({
        ok: false,
        latency: null,
        error: platform === "win32"
          ? "Failed to create raw socket — run as Administrator"
          : "Failed to create raw socket — run as root or set CAP_NET_RAW",
      });
    } else {
      applyTimeout(sock);
      const addr = buildSockAddr(host);
      if (!addr) {
        _close(sock);
        parentPort!.postMessage({ ok: false, latency: null, error: "Invalid IP — hostname resolution not supported" });
      } else {
        const packet = buildICMPPacket(id, seq);
        const stop = startTimer();
        if (_sendto(sock, packet, packet.length, 0, addr, 16) < 0) {
          _close(sock);
          parentPort!.postMessage({ ok: false, latency: null, error: "Failed to send ICMP packet" });
        } else {
          const matched = receiveMatchingReply(sock, id, seq);
          const latency = stop();
          _close(sock);
          parentPort!.postMessage(matched
            ? { ok: true, latency }
            : { ok: false, latency: null, error: "ICMP timeout — no matching reply received" }
          );
        }
      }
    }
  } catch (err: any) {
    try { _close(sock); } catch {}
    parentPort!.postMessage({ ok: false, latency: null, error: err.message });
  }
}

/**
 * Send a raw ICMP echo request to the given IP address and wait for a matching reply.
 * The blocking `recvfrom` syscall runs inside a Worker thread to avoid blocking the main event loop.
 *
 * Requires elevated privileges:
 * - Linux: root or `CAP_NET_RAW` capability
 * - macOS: root or process entitlement
 * - Windows: Administrator
 *
 * @param host - Target IPv4 address. Hostname resolution is not supported — resolve before calling.
 * @param id - ICMP echo identifier (0x0001–0xfffe).
 * @param seq - ICMP echo sequence number (0x0001–0xfffe).
 *
 * @example
 * const result = await rawPing("1.1.1.1", 1, 1);
 * console.log(result.ok, result.latency);
 */
export function rawPing(host: string, id: number, seq: number): Promise<PingResult> {
  return new Promise((resolve) => {
    const worker = new Worker(__filename, {
      workerData: { pingfluxWorker: true, host, id, seq },
    });
    worker.once("message", (result: PingResult) => resolve(result));
    worker.once("error", (err: Error) => resolve({ ok: false, latency: null, error: err.message }));
  });
}