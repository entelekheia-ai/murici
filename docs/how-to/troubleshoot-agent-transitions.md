# Troubleshoot an agent that does not transition

Work down the list; each step rules out one layer.

1. **Is the tool in the request?** The request to `/api/chat/<provider>` must carry `trigger_intent` with a
   non-empty intent enum. If it does not, the channel's session has no valid intents — check that the agent
   loaded into this thread.
2. **Did the model call it?** The flow event cards (or the debug panel) show `send_intent`. A model that
   never calls it needs a clearer goal, guide or knowledge — or a stronger model (see the README's
   *Known limitations*).
3. **Was the intent rejected?** The channel controller rejects intents that are not valid in the current
   state; compare the call against the state's `allowed_intents` in the injected payload.
4. **Packaged app only?** A kernel that loads in development and not in the installed app means
   `asarUnpack` in `electron-builder.yml` lost its WASM entries.
