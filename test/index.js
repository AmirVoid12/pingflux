const pingflux = require("../dist/index.js").default;

pingflux.on("up", (data) => {
  console.log(`✅ UP    [${data.protocol.toUpperCase()}] ${data.target} — ${data.latency?.toFixed(2)}ms`);
});

pingflux.on("down", (data) => {
  console.log(`❌ DOWN  [${data.protocol.toUpperCase()}] ${data.target} — ${data.error}`);
});

pingflux.on("slow", (data) => {
  console.log(`🐢 SLOW  [${data.protocol.toUpperCase()}] ${data.target} — ${data.latency?.toFixed(2)}ms`);
});

pingflux.on("error", (data) => {
  console.log(`⚠️  ERROR [${data.protocol.toUpperCase()}] ${data.target} — ${data.error}`);
});

pingflux.watch({ url: "google.com:443", protocol: "tcp", interval: 3000 });
pingflux.watch({ url: "1.1.1.1:443", protocol: "tcp", interval: 3000 });
pingflux.watch({ url: "google.com", protocol: "dns", interval: 5000 });
pingflux.watch({ url: "cloudflare.com", protocol: "dns", interval: 5000 });
pingflux.watch({ url: "www.google.com", protocol: "https", interval: 5000 });
pingflux.watch({ url: "www.github.com", protocol: "https", interval: 6000 });
pingflux.watch({ url: "google.com:80", protocol: "ping", interval: 4000 });
pingflux.watch({ url: "1.1.1.1:80", protocol: "ping", interval: 4000 });
pingflux.watch({ url: "999.999.999.999:80", protocol: "tcp", interval: 6000 });
pingflux.watch({ url: "10.0.0.1:443", protocol: "tcp", interval: 6000, threshold: 100 });
pingflux.watch({ url: "nonexistent-domain-xyz.com", protocol: "dns", interval: 6000 });
pingflux.watch({ url: "www.google.com", protocol: "https", interval: 5000, threshold: 100 });
