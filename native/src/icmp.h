#ifndef PINGFLUX_ICMP_H
#define PINGFLUX_ICMP_H

#include "socket.h"

#define ICMP_PACKET_SIZE 28

#define ICMPV4_ECHO_REQUEST 8
#define ICMPV4_ECHO_REPLY   0
#define ICMPV4_DEST_UNREACH 3
#define ICMPV4_TIME_EXCEEDED 11

#define ICMPV6_ECHO_REQUEST 128
#define ICMPV6_ECHO_REPLY   129
#define ICMPV6_DEST_UNREACH 1
#define ICMPV6_TIME_EXCEEDED 3

typedef struct {
    int type;
    int code;
    int id;
    int seq;
} icmp_reply_t;

void icmp_build_packet(unsigned char *out, int ip_version, int id, int seq);
int icmp_parse_reply(const unsigned char *buf, int len, int ip_version, int mode, icmp_reply_t *reply);

const char *icmp_error_reason(int ip_version, int type, int code);

#endif