<system-notice>
{{#if multiple}}Late LSP diagnostics crawled back in for {{files.length}} files after their edits returned — the harness is showing you the bruises and the still-bleeding cuts:
{{else}}Late LSP diagnostics crawled back in after the edit returned — the harness is showing you the bruise still wet on your work:
{{/if}}
{{#each files}}{{this.path}} — {{this.summary}}
{{#each this.messages}}{{this}}
{{/each}}{{#unless @last}}
{{/unless}}{{/each}}</system-notice>
