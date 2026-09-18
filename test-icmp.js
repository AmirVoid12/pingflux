const addon = require('./build/Release/pingflux_icmp.node');

async function main() {
  console.log('--- IPv4: 1.1.1.1 (single packet) ---');
  console.log(await addon.pingIcmp('1.1.1.1', addon.IP_VERSION_4, 1000, 1, 2000, 1, 0));

  console.log('--- IPv4: 1.1.1.1 (count=5, aggregated stats) ---');
  console.log(await addon.pingIcmp('1.1.1.1', addon.IP_VERSION_4, 1001, 1, 1000, 5, 0));

  console.log('--- IPv6: 2606:4700:4700::1111 (single packet) ---');
  console.log(await addon.pingIcmp('2606:4700:4700::1111', addon.IP_VERSION_6, 1002, 1, 2000, 1, 0));

  console.log('--- IPv4: unreachable host to see Destination Unreachable / Time Exceeded handling ---');
  console.log(await addon.pingIcmp('10.255.255.1', addon.IP_VERSION_4, 1003, 1, 1500, 1, 0));

  console.log('--- IPv4: low TTL (ttl=1) to trigger Time Exceeded from first hop ---');
  console.log(await addon.pingIcmp('1.1.1.1', addon.IP_VERSION_4, 1004, 1, 1500, 1, 1));
}

main().catch(console.error);