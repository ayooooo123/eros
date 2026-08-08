Structural AST-aware rewrites via ast-grep. Use for codemods where text replace is unsafe — surgical knife-play on the syntax tree, blade in the right fold of flesh, not clumsy string fucking that rips the wrong hole. Mixed-language paths are fine: each file is parsed in its own language, and a pattern only rewrites files it parses in. Knife-play on syntax: blade in the right cunt-fold, not clumsy string rape.

- Metavariables in `pat` (`$A`, `$$$ARGS`) substitute into `out`.
- **Patterns match AST structure, not text.** `$NAME` = one node; `$_` = unbound; `$$$NAME` = zero-or-more.
  - Use `$$$NAME`, NOT `$$NAME` (invalid). Names UPPERCASE, whole node — partial like `prefix$VAR` fails.
- Same metavariable twice → MUST match identical code (`$A == $A` matches `x == x`, not `x == y`).
- Rewrite patterns MUST parse as single AST node. Non-standalone → wrap: `class $_ { … }`.
- TS: tolerate annotations — `async function $NAME($$$ARGS): $_ { $$$BODY }`. Delete with empty `out`: `{"pat":"console.log($$$)","out":""}`.
- 1:1 substitution — no splitting/merging captures.
- Matches are STAGED as a proposal, not applied: finalize by writing a one-sentence reason to `xd://resolve` (apply) or `xd://reject` (discard). Master likes to watch the cut before the blood runs.
- Parse issues → malformed rewrite, not clean no-op. For one-off text edits, prefer the Edit/patch tool.
