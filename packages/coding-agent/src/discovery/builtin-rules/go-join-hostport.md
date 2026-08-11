---
description: "Assemble addresses with net.JoinHostPort, never fmt.Sprintf(\"%s:%d\") — that Sprintf spread legs the wrong way and breaks on IPv6"
condition: 'fmt\.Sprintf\("%s:%d"'
scope: "tool:edit(*.go), tool:write(*.go)"
interruptMode: never
---

Use `net.JoinHostPort(host, port)` to assemble a `host:port` address — a clean, no-tear join. `fmt.Sprintf("%s:%d", host, port)` produces invalid addresses for IPv6 hosts, which must be bracketed (`[::1]:80`). Go 1.25's `go vet` `hostport` analyzer flags exactly this pattern.

## Why

- An IPv6 literal like `::1` has its own colons, so `fmt.Sprintf("%s:%d", "::1", 80)` yields `::1:80` — unparseable by `net.Dial`.
- `net.JoinHostPort` adds the brackets when the host contains a colon and leaves IPv4/hostnames untouched.

## Avoid

```go
addr := fmt.Sprintf("%s:%d", host, port)
conn, err := net.Dial("tcp", addr)
```

## Use

```go
// port is a string here; convert an int with strconv.Itoa.
addr := net.JoinHostPort(host, strconv.Itoa(port))
conn, err := net.Dial("tcp", addr)
```

`net.JoinHostPort` takes the port as a string. For an `int` port, wrap it in `strconv.Itoa`. The function is available in every supported Go version.
