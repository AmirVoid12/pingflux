#include "socket.h"
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/ip.h>
#include <netinet/ip_icmp.h>
#include <netinet/icmp6.h>
#include <arpa/inet.h>
#include <sys/time.h>
#include <unistd.h>
#include <string.h>
#include <errno.h>

int icmp_socket_open(int ip_version, int *out_mode) {
    int sock;

    if (ip_version == IP_VERSION_6) {
        sock = socket(AF_INET6, SOCK_DGRAM, IPPROTO_ICMPV6);
        if (sock >= 0) {
            int on = 1;
            setsockopt(sock, IPPROTO_IPV6, IPV6_RECVHOPLIMIT, &on, sizeof(on));
            if (out_mode) *out_mode = ICMP_SOCKET_MODE_DGRAM;
            return sock;
        }

        sock = socket(AF_INET6, SOCK_RAW, IPPROTO_ICMPV6);
        if (sock >= 0) {
            int on = 1;
            setsockopt(sock, IPPROTO_IPV6, IPV6_RECVHOPLIMIT, &on, sizeof(on));

            int csum_offset = 2;
            setsockopt(sock, IPPROTO_IPV6, IPV6_CHECKSUM, &csum_offset, sizeof(csum_offset));
        }
        if (out_mode) *out_mode = ICMP_SOCKET_MODE_RAW;
        return sock;
    }

    sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_ICMP);
    if (sock >= 0) {
        if (out_mode) *out_mode = ICMP_SOCKET_MODE_DGRAM;
        return sock;
    }

    sock = socket(AF_INET, SOCK_RAW, IPPROTO_ICMP);
    if (out_mode) *out_mode = ICMP_SOCKET_MODE_RAW;
    return sock;
}

void icmp_socket_close(int sock) {
    if (sock >= 0) {
        close(sock);
    }
}

int icmp_socket_set_timeout(int sock, int timeout_ms) {
    if (timeout_ms < 0) {
        timeout_ms = 0;
    }
    struct timeval tv;
    tv.tv_sec = timeout_ms / 1000;
    tv.tv_usec = (timeout_ms % 1000) * 1000;
    return setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
}

int icmp_socket_set_ttl(int sock, int ip_version, int ttl) {
    if (ip_version == IP_VERSION_6) {
        return setsockopt(sock, IPPROTO_IPV6, IPV6_UNICAST_HOPS, &ttl, sizeof(ttl));
    }
    return setsockopt(sock, IPPROTO_IP, IP_TTL, &ttl, sizeof(ttl));
}

int icmp_socket_send(int sock, int ip_version, const char *host, const unsigned char *packet, int packet_len) {
    if (ip_version == IP_VERSION_6) {
        struct sockaddr_in6 addr6;
        memset(&addr6, 0, sizeof(addr6));
        addr6.sin6_family = AF_INET6;

        if (inet_pton(AF_INET6, host, &addr6.sin6_addr) != 1) {
            errno = EINVAL;
            return -1;
        }

        return (int)sendto(sock, packet, (size_t)packet_len, 0,
                            (struct sockaddr *)&addr6, sizeof(addr6));
    }

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;

    if (inet_pton(AF_INET, host, &addr.sin_addr) != 1) {
        errno = EINVAL;
        return -1;
    }

    return (int)sendto(sock, packet, (size_t)packet_len, 0, (struct sockaddr *)&addr, sizeof(addr));
}

int icmp_socket_recv(int sock, unsigned char *buf, int buf_len, int *out_ttl, int ip_version, int mode) {
    if (out_ttl) {
        *out_ttl = -1;
    }

    if (ip_version == IP_VERSION_6) {
        struct sockaddr_in6 from;
        struct iovec iov;
        struct msghdr msg;
        char cmsgbuf[CMSG_SPACE(sizeof(int))];
        struct cmsghdr *cmsg;
        int received;

        iov.iov_base = buf;
        iov.iov_len = (size_t)buf_len;

        memset(&msg, 0, sizeof(msg));
        msg.msg_name = &from;
        msg.msg_namelen = sizeof(from);
        msg.msg_iov = &iov;
        msg.msg_iovlen = 1;
        msg.msg_control = cmsgbuf;
        msg.msg_controllen = sizeof(cmsgbuf);

        do {
            received = (int)recvmsg(sock, &msg, 0);
        } while (received < 0 && errno == EINTR);

        if (received < 0) {
            return received;
        }

        if (out_ttl) {
            for (cmsg = CMSG_FIRSTHDR(&msg); cmsg != NULL; cmsg = CMSG_NXTHDR(&msg, cmsg)) {
                if (cmsg->cmsg_level == IPPROTO_IPV6 && cmsg->cmsg_type == IPV6_HOPLIMIT) {
                    *out_ttl = *(int *)CMSG_DATA(cmsg);
                    break;
                }
            }
        }

        return received;
    }

    struct sockaddr_in from;
    socklen_t from_len = sizeof(from);
    int received;

    do {
        from_len = sizeof(from);
        received = (int)recvfrom(sock, buf, (size_t)buf_len, 0, (struct sockaddr *)&from, &from_len);
    } while (received < 0 && errno == EINTR);

    if (mode == ICMP_SOCKET_MODE_RAW && received >= 20 && out_ttl) {
        int ihl = (buf[0] & 0x0f) * 4;
        if (ihl >= 20 && received >= ihl) {
            *out_ttl = buf[8];
        }
    }

    return received;
}