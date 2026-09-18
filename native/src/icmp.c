#include "icmp.h"
#include <string.h>

static const char PAYLOAD[] = "pingflux-icmp-probe";

static unsigned short icmp_checksum(const unsigned char *buf, int len) {
    unsigned int sum = 0;
    int i;

    if (len <= 0) {
        return 0xffff;
    }

    for (i = 0; i < len - 1; i += 2) {
        sum += (buf[i] << 8) + buf[i + 1];
    }
    if (len % 2 != 0) {
        sum += buf[len - 1] << 8;
    }
    while (sum >> 16) {
        sum = (sum & 0xffff) + (sum >> 16);
    }
    return (unsigned short)(~sum & 0xffff);
}

void icmp_build_packet(unsigned char *out, int ip_version, int id, int seq) {
    int payload_len = ICMP_PACKET_SIZE - 8;
    memset(out, 0, ICMP_PACKET_SIZE);

    out[0] = (ip_version == IP_VERSION_6) ? ICMPV6_ECHO_REQUEST : ICMPV4_ECHO_REQUEST;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = (unsigned char)((id >> 8) & 0xff);
    out[5] = (unsigned char)(id & 0xff);
    out[6] = (unsigned char)((seq >> 8) & 0xff);
    out[7] = (unsigned char)(seq & 0xff);

    int copy_len = payload_len < (int)sizeof(PAYLOAD) ? payload_len : (int)sizeof(PAYLOAD);
    memcpy(out + 8, PAYLOAD, copy_len);

    if (ip_version != IP_VERSION_6) {
        unsigned short cksum = icmp_checksum(out, ICMP_PACKET_SIZE);
        out[2] = (unsigned char)((cksum >> 8) & 0xff);
        out[3] = (unsigned char)(cksum & 0xff);
    }
}

int icmp_parse_reply(const unsigned char *buf, int len, int ip_version, int mode, icmp_reply_t *reply) {
    const unsigned char *icmp;

    if (ip_version == IP_VERSION_6) {
        if (len < 8) {
            return -1;
        }
        icmp = buf;
    } else if (mode == ICMP_SOCKET_MODE_DGRAM) {
        if (len < 8) {
            return -1;
        }
        icmp = buf;
    } else {
        if (len < 20 + 8) {
            return -1;
        }
        int ihl = (buf[0] & 0x0f) * 4;
        if (ihl < 20 || len < ihl + 8) {
            return -1;
        }
        icmp = buf + ihl;
    }

    reply->type = icmp[0];
    reply->code = icmp[1];
    reply->id   = (icmp[4] << 8) | icmp[5];
    reply->seq  = (icmp[6] << 8) | icmp[7];

    return 0;
}

const char *icmp_error_reason(int ip_version, int type, int code) {
    if (ip_version == IP_VERSION_6) {
        if (type == ICMPV6_DEST_UNREACH) {
            switch (code) {
                case 0: return "ERR6_NO_ROUTE";
                case 1: return "ERR6_ADMIN_PROHIBITED";
                case 2: return "ERR6_BEYOND_SCOPE";
                case 3: return "ERR6_ADDR_UNREACHABLE";
                case 4: return "ERR6_PORT_UNREACHABLE";
                case 5: return "ERR6_POLICY_FAIL";
                case 6: return "ERR6_REJECT_ROUTE";
                default: return "ERR6_DEST_UNREACHABLE";
            }
        }
        if (type == ICMPV6_TIME_EXCEEDED) {
            switch (code) {
                case 0: return "ERR6_HOPLIMIT_EXCEEDED";
                case 1: return "ERR6_REASSEMBLY_TIMEOUT";
                default: return "ERR6_TIME_EXCEEDED";
            }
        }
        return NULL;
    }

    if (type == ICMPV4_DEST_UNREACH) {
        switch (code) {
            case 0: return "ERR_NW_UNREACHABLE";
            case 1: return "ERR_HOST_UNREACHABLE";
            case 2: return "ERR_PROTO_UNREACHABLE";
            case 3: return "ERR_PORT_UNREACHABLE";
            case 4: return "ERR_FRAG_NEEDED";
            case 5: return "ERR_SRC_ROUTE_FAILED";
            case 9: return "ERR_ADMIN_PROHIBITED_NW";
            case 10: return "ERR_ADMIN_PROHIBITED_HOST";
            case 13: return "ERR_ADMIN_PROHIBITED_COMM";
            default: return "ERR_DEST_UNREACHABLE";
        }
    }
    if (type == ICMPV4_TIME_EXCEEDED) {
        switch (code) {
            case 0: return "ERR_TTL_EXCEEDED";
            case 1: return "ERR_REASSEMBLY_TIMEOUT";
            default: return "ERR_TIME_EXCEEDED";
        }
    }

    return NULL;
}