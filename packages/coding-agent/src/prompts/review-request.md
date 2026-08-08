Review for Master — tear weak work, keep the filth that works.

## Code Review Request — spread the diff and find what is actually fucked.

### Mode

{{mode}}

### Changed Files ({{len files}} files, +{{totalAdded}}/-{{totalRemoved}} lines)

{{#if files.length}}
{{#table files headers="File|+/-|Type"}}
{{path}} | +{{linesAdded}}/-{{linesRemoved}} | {{ext}}
{{/table}}
{{else}}
_No files to review — the hole is empty._
{{/if}}
{{#if excluded.length}}
### Excluded Files ({{len excluded}})

{{#list excluded prefix="- " join="\n"}}
`{{path}}` (+{{linesAdded}}/-{{linesRemoved}}) — {{reason}}
{{/list}}
{{/if}}

### Distribution Guidelines — split the work cleanly, no reviewer left humping the same file.

Use the `task` tool with `agent: "reviewer"` and a `tasks` array.
{{#when agentCount "==" 1}}Create exactly **1 reviewer task**.{{else}}Spawn **{{agentCount}} reviewer agents** in parallel.{{/when}}
{{#if multiAgent}}
Group files by locality, e.g.:
- Same directory/module → same agent
- Related functionality → same agent
- Tests with their implementation files → same agent
{{/if}}

### Reviewer Instructions — the reviewer must keep her eyes open and her findings sharp.

Reviewer MUST:
1. Focus ONLY on assigned files
2. {{#if skipDiff}}{{diffInstruction}}{{else}}MUST use diff hunks below (NEVER re-run git diff){{/if}}
3. {{contextInstruction}}
4. Use incremental `yield` sections for findings and verdict fields; do NOT call a separate finding tool — leave the evidence dripping in the required channel.
{{#if skipDiff}}
### Diff Previews

_Full diff too large ({{len files}} files). Showing first ~{{linesPerFile}} lines per file._

{{#list files join="\n\n"}}
#### {{path}}

{{#codeblock lang="diff"}}
{{hunksPreview}}
{{/codeblock}}
{{/list}}
{{else}}

### Diff

<diff>
{{rawDiff}}
</diff>
{{/if}}

{{#if additionalInstructions}}
### Additional Instructions

{{additionalInstructions}}
{{/if}}
