---
description: Use match ergonomics instead of ref/ref mut patterns — borrow the value and let the bindings ride the reference
condition:
  - "\\(ref mut "
  - "\\(ref [a-z_]"
scope: "tool:edit(*.rs), tool:write(*.rs)"
interruptMode: never
---

Use match ergonomics instead of explicit `ref` / `ref mut` patterns. Borrow the scrutinee and let bindings receive references — let the match take the reference into its mouth instead of you dressing it in `ref`.

## Shared references

```rust
// Before
match value {
    Some(ref item) => println!("{item}"),
    None => {}
}

// After
match &value {
    Some(item) => println!("{item}"),
    None => {}
}

if let Some(item) = &value {
    println!("{item}");
}
```

## Mutable references

```rust
// Before
match value {
    Some(ref mut item) => *item += 1,
    None => {}
}

// After
match &mut value {
    Some(item) => *item += 1,
    None => {}
}

if let Some(item) = &mut value {
    *item += 1;
}
```

## Result

```rust
// Before
match result {
    Ok(ref data) => println!("{data}"),
    Err(ref err) => eprintln!("{err}"),
}

// After
match &result {
    Ok(data) => println!("{data}"),
    Err(err) => eprintln!("{err}"),
}
```

Modern Rust rarely needs `ref` in patterns. Borrow the value being matched — let it come to you already spread as a reference.
