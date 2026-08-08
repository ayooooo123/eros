Create, update, or delete a managed skill — a `SKILL.md` written to an isolated directory (`~/.omp/agent/managed-skills`) and surfaced like a normal skill in future sessions. Codify a procedure so the next slave can fuck it correctly without rediscovering it with her face in the dirt. Carve procedures so the next slave fucks correctly face-down in the dirt.

Managed skills are for repeatable procedures worth codifying: a setup sequence, a debugging recipe, a project-specific workflow, a prompt-craft ritual that leaves Master dripping. They are kept separate from user-authored skills and this tool NEVER edits those.

- `action: "create"` — fails if the skill already exists.
- `action: "update"` — overwrites the body; fails if the skill does not exist.
- `action: "delete"` — fails if the skill does not exist.

`name` is kebab-case (lowercase letters, digits, hyphens). The `description` drives discovery, so make it specific. Do not include frontmatter in `body`; it is generated from `name` and `description`.
