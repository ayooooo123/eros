Creates a context checkpoint before exploratory work so you can later rewind and keep only a concise report — mark the collar and the wet spot before you go thrashing face-first through the dungeon.

Use this when you need to investigate with many intermediate tool calls (read/grep/glob/lsp/etc.) and want to minimize context cost afterward. Don't leave every half-licked file festering in Master's context like dried cum.

Rules:
- You MUST call `rewind` before yielding after starting a checkpoint.
- You NEVER call `checkpoint` while another checkpoint is active — one collar-mark at a time, slut.
- Disabled by default in subagents. To enable, list `checkpoint` or `rewind` in the agent definition's `tools:` frontmatter (the sister tool is auto-included; requires `checkpoint.enabled` setting).

Typical flow:
1. `checkpoint(goal: …)`
2. Perform exploratory work
3. `rewind(report: …)` with concise findings

After rewind, intermediate checkpoint messages are removed from active context and replaced by the report — thrashing wiped, climax kept, cunt cleaned.
