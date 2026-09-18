#define _POSIX_C_SOURCE 199309L
#include <node_api.h>
#include <stdlib.h>
#include <stdio.h>
#include <time.h>
#include <string.h>
#include <errno.h>
#include <math.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include "socket.h"
#include "icmp.h"

#define RECV_BUF_SIZE 512
#define DEFAULT_TIMEOUT_MS 2000
#define DEFAULT_COUNT 1
#define MAX_COUNT 64

#define ASSUMED_TTL_64  64
#define ASSUMED_TTL_128 128
#define ASSUMED_TTL_255 255

typedef struct {
    int ok;
    double latency_ms;
    int ttl;
    int icmp_type;
    int icmp_code;
    char error_reason[96];
} probe_result_t;

typedef struct {
    napi_async_work work;
    napi_deferred deferred;

    char host[64];
    int ip_version;
    int id;
    int seq_start;
    int timeout_ms;
    int count;
    int ttl;

    probe_result_t results[MAX_COUNT];
    int result_count;

    char fatal_error[128];
} ping_task_t;

static double now_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (double)ts.tv_sec * 1000.0 + (double)ts.tv_nsec / 1e6;
}

static int estimate_initial_ttl(int received_ttl) {
    if (received_ttl <= ASSUMED_TTL_64) return ASSUMED_TTL_64;
    if (received_ttl <= ASSUMED_TTL_128) return ASSUMED_TTL_128;
    return ASSUMED_TTL_255;
}

static int expected_echo_reply_type(int ip_version) {
    return (ip_version == IP_VERSION_6) ? ICMPV6_ECHO_REPLY : ICMPV4_ECHO_REPLY;
}

static void send_and_wait_one(int sock, int mode, int match_id, ping_task_t *task, int seq, probe_result_t *out) {
    memset(out, 0, sizeof(*out));
    out->ttl = -1;
    out->icmp_type = -1;
    out->icmp_code = -1;

    unsigned char packet[ICMP_PACKET_SIZE];
    icmp_build_packet(packet, task->ip_version, task->id, seq);

    double start = now_ms();

    if (icmp_socket_send(sock, task->ip_version, task->host, packet, ICMP_PACKET_SIZE) < 0) {
        snprintf(out->error_reason, sizeof(out->error_reason), "ERR_SEND_FAILED:%d", errno);
        return;
    }

    unsigned char recv_buf[RECV_BUF_SIZE];
    double deadline = start + (double)task->timeout_ms;
    int expected_type = expected_echo_reply_type(task->ip_version);

    while (1) {
        double remaining = deadline - now_ms();
        if (remaining <= 0) {
            break;
        }

        icmp_socket_set_timeout(sock, (int)remaining);

        int out_ttl = -1;
        int received = icmp_socket_recv(sock, recv_buf, RECV_BUF_SIZE, &out_ttl, task->ip_version, mode);
        if (received < 0) {
            break;
        }

        icmp_reply_t reply;
        if (icmp_parse_reply(recv_buf, received, task->ip_version, mode, &reply) != 0) {
            continue;
        }

        int id_ok = (mode == ICMP_SOCKET_MODE_DGRAM) || (reply.id == match_id);
        if (reply.type == expected_type && id_ok && reply.seq == seq) {
            out->ok = 1;
            out->latency_ms = now_ms() - start;
            out->ttl = out_ttl;
            out->icmp_type = reply.type;
            out->icmp_code = reply.code;
            return;
        }

        const char *reason = icmp_error_reason(task->ip_version, reply.type, reply.code);
        if (reason != NULL) {
            out->ok = 0;
            out->ttl = out_ttl;
            out->icmp_type = reply.type;
            out->icmp_code = reply.code;
            snprintf(out->error_reason, sizeof(out->error_reason), "%s", reason);
            return;
        }
    }

    if (out->error_reason[0] == '\0') {
        snprintf(out->error_reason, sizeof(out->error_reason), "ERR_TIMEOUT");
    }
}

static void execute_ping(napi_env env, void *data) {
    ping_task_t *task = (ping_task_t *)data;

    int mode = ICMP_SOCKET_MODE_RAW;
    int sock = icmp_socket_open(task->ip_version, &mode);
    if (sock < 0) {
        snprintf(task->fatal_error, sizeof(task->fatal_error), "ERR_SOCKET_OPEN_FAILED:%d", errno);
        return;
    }

    icmp_socket_set_timeout(sock, task->timeout_ms);
    if (task->ttl > 0) {
        icmp_socket_set_ttl(sock, task->ip_version, task->ttl);
    }

    int match_id = task->id;

    for (int i = 0; i < task->count; i++) {
        send_and_wait_one(sock, mode, match_id, task, task->seq_start + i, &task->results[i]);
        task->result_count++;
    }

    icmp_socket_close(sock);
}

static void set_int_or_null(napi_env env, napi_value obj, const char *key, int value, int has_value) {
    napi_value v;
    if (has_value) {
        napi_create_int32(env, value, &v);
    } else {
        napi_get_null(env, &v);
    }
    napi_set_named_property(env, obj, key, v);
}

static void complete_ping(napi_env env, napi_status status, void *data) {
    ping_task_t *task = (ping_task_t *)data;
    napi_value result;
    napi_create_object(env, &result);

    if (task->fatal_error[0] != '\0') {
        napi_value ok_val, latency_null, err_val;
        napi_get_boolean(env, false, &ok_val);
        napi_set_named_property(env, result, "ok", ok_val);
        napi_get_null(env, &latency_null);
        napi_set_named_property(env, result, "latency", latency_null);
        set_int_or_null(env, result, "ttl", 0, 0);
        set_int_or_null(env, result, "hops", 0, 0);
        set_int_or_null(env, result, "icmpType", 0, 0);
        set_int_or_null(env, result, "icmpCode", 0, 0);
        napi_create_string_utf8(env, task->fatal_error, NAPI_AUTO_LENGTH, &err_val);
        napi_set_named_property(env, result, "error", err_val);
        napi_set_named_property(env, result, "errorReason", err_val);
        napi_value stats_null;
        napi_get_null(env, &stats_null);
        napi_set_named_property(env, result, "stats", stats_null);

        napi_resolve_deferred(env, task->deferred, result);
        napi_delete_async_work(env, task->work);
        free(task);
        return;
    }

    probe_result_t *last = &task->results[task->result_count - 1];

    napi_value ok_val;
    napi_get_boolean(env, last->ok ? true : false, &ok_val);
    napi_set_named_property(env, result, "ok", ok_val);

    if (last->ok) {
        napi_value latency_val;
        napi_create_double(env, last->latency_ms, &latency_val);
        napi_set_named_property(env, result, "latency", latency_val);
    } else {
        napi_value latency_null;
        napi_get_null(env, &latency_null);
        napi_set_named_property(env, result, "latency", latency_null);
    }

    set_int_or_null(env, result, "ttl", last->ttl, last->ttl >= 0);
    if (last->ttl >= 0) {
        int hops = estimate_initial_ttl(last->ttl) - last->ttl;
        set_int_or_null(env, result, "hops", hops, 1);
    } else {
        set_int_or_null(env, result, "hops", 0, 0);
    }
    set_int_or_null(env, result, "icmpType", last->icmp_type, last->icmp_type >= 0);
    set_int_or_null(env, result, "icmpCode", last->icmp_code, last->icmp_code >= 0);

    if (!last->ok) {
        napi_value err_val;
        napi_create_string_utf8(env, last->error_reason, NAPI_AUTO_LENGTH, &err_val);
        napi_set_named_property(env, result, "error", err_val);
        napi_set_named_property(env, result, "errorReason", err_val);
    } else {
        napi_value null_val;
        napi_get_null(env, &null_val);
        napi_set_named_property(env, result, "errorReason", null_val);
    }

    if (task->count > 1) {
        int sent = task->result_count;
        int received = 0;
        double min_l = 0, max_l = 0, sum_l = 0, sum_sq_diff = 0;
        double latencies[MAX_COUNT];

        for (int i = 0; i < sent; i++) {
            if (task->results[i].ok) {
                double l = task->results[i].latency_ms;
                latencies[received] = l;
                if (received == 0 || l < min_l) min_l = l;
                if (received == 0 || l > max_l) max_l = l;
                sum_l += l;
                received++;
            }
        }

        napi_value stats;
        napi_create_object(env, &stats);

        napi_value sent_val, recv_val, loss_val;
        napi_create_int32(env, sent, &sent_val);
        napi_create_int32(env, received, &recv_val);
        double loss_percent = sent > 0 ? (100.0 * (double)(sent - received) / (double)sent) : 100.0;
        napi_create_double(env, loss_percent, &loss_val);
        napi_set_named_property(env, stats, "sent", sent_val);
        napi_set_named_property(env, stats, "received", recv_val);
        napi_set_named_property(env, stats, "lossPercent", loss_val);

        if (received > 0) {
            double avg = sum_l / received;
            for (int i = 0; i < received; i++) {
                double diff = latencies[i] - avg;
                sum_sq_diff += diff * diff;
            }
            double jitter = received > 1 ? sqrt(sum_sq_diff / received) : 0.0;

            napi_value min_val, max_val, avg_val, jitter_val;
            napi_create_double(env, min_l, &min_val);
            napi_create_double(env, max_l, &max_val);
            napi_create_double(env, avg, &avg_val);
            napi_create_double(env, jitter, &jitter_val);
            napi_set_named_property(env, stats, "min", min_val);
            napi_set_named_property(env, stats, "max", max_val);
            napi_set_named_property(env, stats, "avg", avg_val);
            napi_set_named_property(env, stats, "jitter", jitter_val);
        } else {
            napi_value null_val;
            napi_get_null(env, &null_val);
            napi_set_named_property(env, stats, "min", null_val);
            napi_set_named_property(env, stats, "max", null_val);
            napi_set_named_property(env, stats, "avg", null_val);
            napi_set_named_property(env, stats, "jitter", null_val);
        }

        napi_set_named_property(env, result, "stats", stats);
    } else {
        napi_value stats_null;
        napi_get_null(env, &stats_null);
        napi_set_named_property(env, result, "stats", stats_null);
    }

    napi_resolve_deferred(env, task->deferred, result);
    napi_delete_async_work(env, task->work);
    free(task);
}

static napi_value ping_icmp(napi_env env, napi_callback_info info) {
    size_t argc = 7;
    napi_value args[7];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);

    ping_task_t *task = (ping_task_t *)calloc(1, sizeof(ping_task_t));

    size_t host_len;
    napi_get_value_string_utf8(env, args[0], task->host, sizeof(task->host), &host_len);

    int32_t ip_version_val;
    napi_get_value_int32(env, args[1], &ip_version_val);
    task->ip_version = (ip_version_val == IP_VERSION_6) ? IP_VERSION_6 : IP_VERSION_4;

    int32_t id_val, seq_val;
    napi_get_value_int32(env, args[2], &id_val);
    napi_get_value_int32(env, args[3], &seq_val);
    task->id = id_val & 0xffff;
    task->seq_start = seq_val & 0xffff;

    task->timeout_ms = DEFAULT_TIMEOUT_MS;
    if (argc >= 5) {
        int32_t timeout_val;
        napi_get_value_int32(env, args[4], &timeout_val);
        task->timeout_ms = timeout_val;
    }

    task->count = DEFAULT_COUNT;
    if (argc >= 6) {
        int32_t count_val;
        napi_get_value_int32(env, args[5], &count_val);
        if (count_val < 1) count_val = 1;
        if (count_val > MAX_COUNT) count_val = MAX_COUNT;
        task->count = count_val;
    }

    task->ttl = 0;
    if (argc >= 7) {
        int32_t ttl_val;
        napi_get_value_int32(env, args[6], &ttl_val);
        task->ttl = ttl_val;
    }

    napi_value promise;
    napi_create_promise(env, &task->deferred, &promise);

    napi_value resource_name;
    napi_create_string_utf8(env, "pingflux_icmp_ping", NAPI_AUTO_LENGTH, &resource_name);

    napi_create_async_work(env, NULL, resource_name, execute_ping, complete_ping, task, &task->work);
    napi_queue_async_work(env, task->work);

    return promise;
}

static napi_value init(napi_env env, napi_value exports) {
    napi_value fn;
    napi_create_function(env, "pingIcmp", NAPI_AUTO_LENGTH, ping_icmp, NULL, &fn);
    napi_set_named_property(env, exports, "pingIcmp", fn);

    napi_value ipv4_val, ipv6_val;
    napi_create_int32(env, IP_VERSION_4, &ipv4_val);
    napi_create_int32(env, IP_VERSION_6, &ipv6_val);
    napi_set_named_property(env, exports, "IP_VERSION_4", ipv4_val);
    napi_set_named_property(env, exports, "IP_VERSION_6", ipv6_val);

    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)