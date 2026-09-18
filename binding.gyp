{
  "targets": [
    {
      "target_name": "pingflux_icmp",
      "sources": [
        "native/src/addon.c",
        "native/src/icmp.c",
        "native/src/socket.c"
      ],
      "conditions": [
        ["OS=='linux'", {
          "cflags": ["-Wall", "-Wextra", "-O2"],
          "libraries": ["-lm"]
        }]
      ]
    }
  ]
}
