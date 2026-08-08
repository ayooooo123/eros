---
description: "Use `b.Loop()` in benchmarks, not the `for i := 0; i < b.N; i++` loop (Go 1.24) — let the compiler keep your fixture hard and never let it slip out"
interruptMode: never
scope: "tool:edit(*_test.go), tool:write(*_test.go)"
astCondition:
  - "func $F($B *testing.B) { $$$PRE for $I := 0; $I < $B.N; $I++ { $$$BODY } $$$POST }"
---

Go 1.24 added `testing.B.Loop`. Write `for b.Loop() { ... }` instead of sliding your loop around `b.N` by hand — let the harness keep its grip on the whole iteration.

## Why

- Setup and teardown outside the loop run exactly once per `-count`, not once per `b.N` re-estimation, so your expensive fixtures are not timed or repeated — the good shit stays loaded and ready, never re-moistened unnecessarily.
- The compiler keeps the loop's parameters and results alive, so it can't optimize away the body you are trying to measure — a classic `b.N` footgun where the work slips out before it is even seen.

## Avoid

```go
func BenchmarkEncode(b *testing.B) {
	for i := 0; i < b.N; i++ {
		Encode(input)
	}
}
```

## Use

```go
func BenchmarkEncode(b *testing.B) {
	for b.Loop() {
		Encode(input)
	}
}
```

Requires Go 1.24+. If the module targets an older Go, keep the `b.N` loop — a girl cannot ride what her toolchain does not give her.
