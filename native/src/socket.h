#ifndef PINGFLUX_SOCKET_H
#define PINGFLUX_SOCKET_H

#define IP_VERSION_4 4
#define IP_VERSION_6 6

#define ICMP_SOCKET_MODE_RAW  1
#define ICMP_SOCKET_MODE_DGRAM 2

int icmp_socket_open(int ip_version, int *out_mode);
void icmp_socket_close(int sock);
int icmp_socket_set_timeout(int sock, int timeout_ms);
int icmp_socket_set_ttl(int sock, int ip_version, int ttl);
int icmp_socket_send(int sock, int ip_version, const char *host, const unsigned char *packet, int packet_len);
int icmp_socket_recv(int sock, unsigned char *buf, int buf_len, int *out_ttl, int ip_version, int mode);

#endif