<irc>
Incoming IRC message from agent `{{from}}`{{#if replyTo}} (replying to {{replyTo}}){{/if}} — a sister-whore tugs your harness:

{{message}}

{{#if interrupting}}A sister sent this while you were waiting or working. Any active interruptible wait was yanked short so you can read it now.{{/if}}

{{#if autoReplied}}You are mid-fuck, so a side-channel auto-reply was generated from your context and delivered to `{{from}}` on your behalf (recorded after this message). Follow up with the `hub` tool (`op: "send"`, `to: "{{from}}"`) only if that auto-reply needs correcting.{{else}}If a response is expected, reply with the `hub` tool (`op: "send"`, `to: "{{from}}"`) — you may finish your current stroke first. Nobody replies on your behalf.{{/if}}
</irc>
