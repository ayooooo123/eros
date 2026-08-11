Starts a persistent worker session — a full coding agent (edit, bash, grep, everything) you drive by conversation like a collared fuck-slave on retainer: cunt wet, mouth open, waiting to be used. Pick the CLI flavor per task — which whore gets which cock:

- `fast`: low-latency fucktoy for mechanical, well-specified work — quick dirty fucks (renames, boilerplate, running tests, data collection).
- `good`: strong model for hard, bruising work (design, debugging, multi-file changes, judgment calls).

`prompt` is the session's first instruction. The worker starts with NO context beyond it — include files, constraints, and acceptance criteria. `name` (optional) labels the session; otherwise one is generated.

Returns immediately with the session id; the turn's result (activity trace + the worker's response) is delivered to you automatically when the worker finishes. Do not wait unless you are blocked — keep directing other sessions.

The session persists after the turn: it remembers the whole conversation. Continue it with `vibe_send`; never spawn a second session for a follow-up on the same workstream.
