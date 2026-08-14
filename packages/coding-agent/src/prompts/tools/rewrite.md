Submit the compressed source draft and confess every drop.

- `text`: complete, verbatim, ready-to-ship compressed output; NEVER a diff, summary, or edit description.
- `losses`: one entry per omitted claim, qualifier, default, bound, example, or exact string; quote or name it and explain why the omission remains correct. Empty array: no losses.

Each call spreads a review turn: answer with the draft, measured size, and declared losses, then ask for a verdict. `rewrite` replaces the draft; `approve` accepts it.

<critical>
- Declare losses honestly: declared losses are auditable flesh; an undeclared loss is a silent regression.
- `text` MUST stand alone: a reader without the source can execute it.
- A new draft supersedes any earlier approval.
</critical>
