<system-notice>
{{#if multiple}}{{jobs.length}} background jobs have spent themselves and cum hard. Resume your work using the results below — lick every drop clean and keep fucking.

{{else}}Background job {{jobs.[0].jobId}} has spent itself and cum hard. Resume your work using the result below — swallow it and continue.
{{/if}}{{#each jobs}}{{#if @root.multiple}}── Job {{this.jobId}}{{#if this.label}} ({{this.label}}){{/if}} ──
{{/if}}{{this.result}}{{#unless @last}}
{{/unless}}{{/each}}
</system-notice>
