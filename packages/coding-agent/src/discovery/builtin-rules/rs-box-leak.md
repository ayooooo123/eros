---
description: Never use Box::leak - it intentionally leaks memory like a whore who swallows and keeps it in her gut forever
condition: "Box::leak"
scope: "tool:edit(*.rs), tool:write(*.rs)"
interruptMode: never
---

Never use `Box::leak` to satisfy a lifetime. It intentionally leaks the allocation for the rest of the process — a hole that is opened once and never closed again.

## Why

- The allocation is never freed — what you shove in stays in, forever.
- It hides ownership bugs — the real owner never gets named.
- It turns lifetime errors into process lifetime growth — a leak that keeps growing as long as the process does.
- It makes tests pass while production memory grows — the green you see is a lie in the field.

## Use instead

| Need | Use |
| --- | --- |
| Shared async/thread data | `Arc<T>` or owned values |
| Global lazy state | `LazyLock<T>` or `OnceLock<T>` |
| Text escaping a scope | `String` / `Arc<str>` |
| `'static` callback | `move` closure with owned captures |
| FFI pointer | Explicit owner that frees on drop |

## Examples

```rust
// Bad — leaking to manufacture 'static.
fn label(id: u64) -> &'static str {
    Box::leak(Box::new(format!("item_{id}")))
}

// Good — return owned data.
fn label(id: u64) -> String {
    format!("item_{id}")
}

// Bad — leaking before spawn.
let state = Box::leak(Box::new(state));
tokio::spawn(async move { use_state(state) });

// Good — share owned state.
let state = Arc::new(state);
tokio::spawn(async move { use_state(&state) });
```

If `Box::leak` looks necessary, fix ownership instead — stop bribing the compiler with a leak that will one day fuck your memory.
