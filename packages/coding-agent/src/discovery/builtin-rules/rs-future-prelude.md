---
description: Use Future not std::future::Future - it's in the prelude, stop spelling out the whole path
condition: "std::future::Future"
scope: "tool:edit(*.rs), tool:write(*.rs)"
interruptMode: never
---

Use `Future` directly instead of `std::future::Future` in type positions — one clean name, not the whole spread-out path.

Rust 2024 includes `Future` in the standard prelude. Older editions can import it once with `use std::future::Future;`. Repeating the fully qualified path makes signatures harder to read without adding safety — you are just re-mounting the same thing with extra ceremony.

## Examples

```rust
// Bad — fully qualified in every signature.
fn fetch() -> impl std::future::Future<Output = Result<Data>> { ... }
fn poll(fut: Pin<&mut dyn std::future::Future<Output = i32>>) { ... }

// Good — use the prelude or one import.
fn fetch() -> impl Future<Output = Result<Data>> { ... }
fn poll(fut: Pin<&mut dyn Future<Output = i32>>) { ... }
```

Pre-2024 edition? Add `use std::future::Future;` at the top — one import, then ride the short name.
