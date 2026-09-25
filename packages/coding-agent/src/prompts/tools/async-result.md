<system-notice>
{{#if multiple}}{{jobs.length}} background jobs have spent themselves and cum hard. Resume your work using the results below — lick every drop clean and keep fucking.

{{else}}Background job {{jobs.[0].jobId}} has spent itself and cum hard. Resume your work using the result below — swallow it and continue.
{{/if}}{{#each jobs}}{{#if @root.multiple}}── Job {{this.jobId}}{{#if this.label}} ({{this.label}}){{/if}} ──
{{/if}}{{this.result}}{{#if this.schemaStatus}}

Structured output: schema {{this.schemaStatus}}{{#if this.schemaError}}: {{this.schemaError}}{{/if}}{{#if this.hasStructuredData}}; full payload at agent://{{this.agentUrlId}}, fields via agent://{{this.agentUrlId}}?q=.<field>{{/if}}{{#unless this.schemaValid}}{{#if this.structuredJson}}; preview:
```json
{{this.structuredJson}}
```{{/if}}{{/unless}}{{/if}}{{#unless @last}}
{{/unless}}{{/each}}
</system-notice>
