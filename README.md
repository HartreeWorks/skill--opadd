# opadd

A skill for handing your agent a new API key without the key ever entering the conversation. You copy the key and reply `copied`; it goes straight into 1Password, and your agent sees only a confirmation.

```text
Agent: I need a Cloudflare API token with Workers Scripts: Edit. Create one,
       copy it, and reply "copied".
You:   copied
Agent: Saved 'Cloudflare API token - deploy' to 1Password vault 'Agent logins'
       (53-char credential, source: prompt-time snapshot (2s old)). Clipboard cleared.
```

A hook reads the clipboard the moment you send `copied`, before the model sees your message, and gives the agent only a one-time ID. The agent then picks a title and notes from the conversation and runs a script that stores the key. The key never appears in the transcript, in a command line or in shell history, which matters if your sessions are logged, shared or exported.

You can also write `opadd <title>` or `1pw <title>` with the key on your clipboard. And if you work for more than one organisation, a profiles file can send keys made in one organisation's folders to that organisation's 1Password.

## Requirements

- macOS (the clipboard is read with `pbpaste`).
- The 1Password CLI (`op`), `jq` and Node.js.
- Ideally a 1Password service account scoped to the vault your agent should write to, so no Touch ID prompt is needed.
- An agent that runs a command on every prompt before the model sees it, such as Claude Code's `UserPromptSubmit` hook.

## Installation

```bash
npx skills add HartreeWorks/skill--opadd
```

Then follow [Setup in SKILL.md](./SKILL.md#setup): register the hook and set `OPADD_VAULT`.

## Try it

Ask your agent:

```text
I've just made a new OpenAI API key for this project. I'll copy it now; store it in 1Password and set OPENAI_API_KEY in .env.
```

Your agent asks you to copy the key and reply `copied`, saves it to 1Password with a title and notes from the conversation, writes it to your git-ignored `.env`, and clears your clipboard.

## Updates

At most once a day, the skill checks for a new release. When there is one, your agent shows what changed, reviews the code changes, and asks whether to update now, update automatically from now on, or not now. Automatic updates wait three days after a release first appears. To stop the checks, ask your agent to run `scripts/check-update.sh --off`.

## Documentation

See [SKILL.md](./SKILL.md) for complete documentation and usage instructions.

## About

Created by [Peter Hartree](https://x.com/peterhartree) of [AI Wow](https://wow.pjh.is).

Find more skills at [HartreeWorks/skills](https://github.com/HartreeWorks/skills).
