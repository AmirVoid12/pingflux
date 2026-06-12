<p align="center">
  <img src="https://skillicons.dev/icons?i=nodejs" width="80" alt="pingflux" />
</p>

<h1 align="center">pingflux</h1>

<p align="center">
  network monitoring library for Node.js — probes hosts over HTTP, TCP, UDP, DNS, and ICMP, emits events, handles retries.
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/pingflux?style=flat-square" />
  <img src="https://img.shields.io/badge/runtime-Node.js-339933?style=flat-square" />
  <img src="https://img.shields.io/badge/language-TypeScript-3178c6?style=flat-square" />
</p>

---

## what it does

`pingflux` monitors network targets continuously. you point it at a host, pick a protocol, set an interval — it runs probes in the background and tells you when something is up, down, slow, or broken. no polling loops, no boilerplate. just events.

five protocols supported out of the box: `http`, `https`, `tcp`, `udp`, `dns`, and `ping` (raw ICMP). each probe returns latency, status, and an optional error message. slow responses get their own event so you can distinguish degraded service from total failure.

---

## install

```bash
npm install pingflux
```

---

## quick start

```typescript
import { Pingflux } from "pingflux";

const pf = new Pingflux({ threshold: 500, retry: 2 });

pf.watch({ protocol: "https", url: "amirvoid12.ir" });
pf.watch({ protocol: "tcp", url: "amirvoid12.ir:443", interval: 10000 });

pf.on("up", (e) => console.log(`up ${e.target} — ${e.latency}ms`));
pf.on("down", (e) => console.log(`down ${e.target}`));
pf.on("slow", (e) => console.log(`slow ${e.target} — ${e.latency}ms`));
pf.on("probe_error", (e) => console.error(`err ${e.target}: ${e.error}`));
```

---

## api

### `new Pingflux(options?)`

creates a new instance. options are applied globally to all targets unless overridden per-target.

| option | type | default | description |
|---|---|---|---|
| `threshold` | `number` | `1000` | latency in ms above which a `slow` event fires |
| `retry` | `number` | `1` | retries on failure before emitting `down` or `probe_error` |

---

### `.watch(target)`

starts monitoring a target. runs the first probe immediately, then repeats on the given interval. if the same target (same protocol + url) is already being watched, this is a no-op and returns `false`.

```typescript
pf.watch({
  protocol: "https",
  url: "amirvoid12.ir/",
  interval: 5000,
  threshold: 300,
  retry: 3,
});
```

| field | type | default | description |
|---|---|---|---|
| `protocol` | `Protocol` | required | one of `http`, `https`, `tcp`, `udp`, `dns`, `ping` |
| `url` | `string` | required | target address — format depends on protocol (see below) |
| `interval` | `number` | `5000` | ms between probes |
| `threshold` | `number` | global | overrides the global threshold for this target |
| `retry` | `number` | global | overrides the global retry count for this target |

returns `true` if monitoring started, `false` if already watching.

---

### `.on(event, callback)`

registers a listener for a probe event. multiple listeners can be registered for the same event.

```typescript
pf.on("up", (e: PingfluxEvent) => {
  console.log(e.target, e.protocol, e.latency, e.timestamp);
});
```

---

### `.off(event, callback)`

removes a previously registered listener. must be the exact same function reference passed to `.on()`.

---

### `.stop(protocol, url)`

stops monitoring a specific target. no-op if the target isn't being watched.

```typescript
pf.stop("https", "amirvoid12.ir");
pf.stop("tcp", "amirvoid12.ir:443");
```

---

### `.stopAll()`

stops all active monitors and clears all internal state.

---

## events

four event types are emitted:

| event | when |
|---|---|
| `up` | target responded within the latency threshold |
| `down` | target is unreachable, no specific error |
| `slow` | target responded but latency exceeded the threshold |
| `probe_error` | probe failed with a specific error message |

every callback receives a `PingfluxEvent` object:

```typescript
interface PingfluxEvent {
  target: string;
  protocol: Protocol;
  latency: number | null;  // null on failure
  error?: string;          // present on probe_error only
  timestamp: number;       // unix ms
}
```

---

## protocols

### `http` / `https`

sends a GET request. resolves `ok: true` if the status code is below 400. url can be a bare hostname, a path, or a full url — the protocol prefix is stripped automatically to avoid double-prefixing.

```typescript
pf.watch({ protocol: "https", url: "amirvoid12.ir/" });
pf.watch({ protocol: "http", url: "192.168.1.1:8080/status" });
```

---

### `tcp`

attempts a TCP socket connection. resolves `ok: true` on successful connect. the socket is immediately destroyed — no data is exchanged.

url must be in `host:port` format.

```typescript
pf.watch({ protocol: "tcp", url: "amirvoid12.ir:443" });
pf.watch({ protocol: "tcp", url: "10.0.0.1:22" });
```

---

### `udp`

sends a small packet and waits for any response. resolves `ok: true` only if a response is received within the timeout window.

⚠️ most servers do not reply to arbitrary UDP packets. a timeout here does not necessarily mean the host is down — the server may have simply ignored the probe. this is most useful for services that explicitly echo UDP packets. for DNS specifically, use the `dns` protocol.

url must be in `host:port` format.

```typescript
pf.watch({ protocol: "udp", url: "1.2.3.4:9000" });
```

---

### `dns`

performs a DNS lookup for the given hostname. tries A records first, then AAAA, then CNAME as a fallback. resolves `ok: true` if any record type is found.

⚠️ hosts with exclusively MX, TXT, or other record types will resolve as `ok: false`.

```typescript
pf.watch({ protocol: "dns", url: "google.com" });
```

---

### `ping`

sends a raw ICMP echo request and waits for a matching reply. the blocking `recvfrom` syscall runs inside a Worker thread to avoid blocking the event loop.

⚠️ **requires elevated privileges:**
- Linux: root or `CAP_NET_RAW` (`sudo setcap cap_net_raw+ep $(which node)`)
- macOS: root
- Windows: Administrator

⚠️ **url must be a plain IPv4 address.** hostname resolution is not performed — resolve the hostname before passing it in.

```typescript
pf.watch({ protocol: "ping", url: "1.1.1.1" });
pf.watch({ protocol: "ping", url: "8.8.8.8", interval: 3000 });
```

---

## url format by protocol

| protocol | format | example |
|---|---|---|
| `http` | hostname, path, or full url | `amirvoid12.ir/` |
| `https` | hostname, path, or full url | `amirvoid12.ir` |
| `tcp` | `host:port` | `amirvoid12.ir:443` |
| `udp` | `host:port` | `1.2.3.4:9000` |
| `dns` | hostname (port suffix ignored) | `google.com` |
| `ping` | plain IPv4 address | `1.1.1.1` |

---

## event listener management

```typescript
const handler = (e: PingfluxEvent) => console.log(e);

// register
pf.on("up", handler);

// remove — must pass exact same reference
pf.off("up", handler);
```

---

## duplicate watch protection

calling `.watch()` with the same protocol and url combination twice is a no-op. the return value tells you whether monitoring actually started:

```typescript
pf.watch({ protocol: "https", url: "amirvoid12.ir" }); // true — started
pf.watch({ protocol: "https", url: "amirvoid12.ir" }); // false — already running
```

---

## concurrent probe protection

if a probe takes longer than the interval, the next scheduled run is skipped. this prevents multiple concurrent probes from stacking up on slow or unreachable targets.

---

## built with

- **TypeScript** — fully typed, interfaces exported
- **Node.js built-ins** — `net`, `dgram`, `dns`, `http`, `https`, `worker_threads`
- **koffi** — FFI bindings for raw ICMP socket syscalls
- `process.hrtime.bigint()` for sub-millisecond latency measurement

---

built by [AmirVoid12 (AmirDavodinia)](https://amirvoid12.ir)