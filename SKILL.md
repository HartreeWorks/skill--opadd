---
name: opadd
description: Save an API key from the user's clipboard to 1Password without the key reaching the conversation. Use when a prompt contains a line beginning `opadd`, starts with `1pw`, or is just "copied" after you asked the user to copy a credential; also use whenever you need the user to hand you a new key.
---

# opadd

Keep the credential out of model context, transcripts, argv, and shell history. A prompt-time hook (`hooks/opadd-snapshot-on-prompt.mjs`) snapshots the clipboard for `opadd <name>` lines, prompts starting `1pw <name>`, and a prompt that is just `copied`, and gives you only a one-time snapshot ID; `scripts/opadd` in this skill's folder sends the secret to 1Password.

## Asking the user for a key

When the user needs to give you a new credential (an API token they have just created, say), ask them to copy it and reply `copied`. Don't ask them to type an `opadd` command: the hook snapshots the clipboard on a `copied` reply too, and you already know the title from the conversation.

## Before starting: check for updates

If `scripts/check-update.sh` exists in this skill's folder, run
`bash <this skill's folder>/scripts/check-update.sh` from the user's project
folder. It checks at most once a day and prints nothing when the skill is
current.

- **It reports an update:** run it with `--diff` and read the code changes.
  Show the user the release notes and a short summary of the changes, flagging
  anything the notes do not explain. Ask whether to update now, update now and
  automatically from now on, or not now. For the first run it with `--apply`;
  for the second run it with `--enable-auto`, then `--apply`; for the third
  carry on.
- **It reports an automatic update:** run it with `--diff` and read the
  changes. If they match the release notes and do nothing risky, run it with
  `--apply` and tell the user in one line. Otherwise show the user your
  concerns and ask.
- **After `--apply` succeeds:** re-read this SKILL.md before continuing.
- **It reports a migration conflict:** show the user the conflicting files
  and wait for them to choose which version to keep.

## Steps

1. Derive a useful title and hostname from the prompt and conversation. If the conversation establishes the key's scopes or permissions, add them concisely to `--notes`; omit notes when the scopes are unknown. Metadata contains only non-secret labels and permissions—never a key, token, password, or secret-like string.
2. Run `<this skill's folder>/scripts/opadd "<title>"`, passing `--hostname` and `--notes` when known. For an `opadd`, `1pw` or `copied` prompt, pass only the `--snapshot-id` value attached to the current prompt; never reuse an earlier ID.
3. Pick the vault. `OPADD_VAULT` supplies the default, unless a line of the profiles file (`~/.config/opadd/profiles`, or `OPADD_PROFILES`) matches the working directory: then that line picks the 1Password command and vault, and `--shared` picks its shared vault. Pass `--shared` for a credential that colleagues' agents also use (an account or app of the organisation's, not one the user made for themselves). A credential that only people should read belongs in a vault no agent can reach: tell the user to store it there themselves. Use `--vault` only when the user names another vault.
4. When the conversation and project establish an exact env-file path and variable name, also pass `--env-file "<path>" --env-var "<name>"`. Inspect existing project conventions such as `.env.example` when needed, but omit these arguments rather than guess. Inside a Git working tree the script refuses tracked or non-ignored files; it returns only after both 1Password and the env file are ready. If it reports that 1Password succeeded but the env write failed, do not re-run it (that would create a duplicate item); tell the user the variable still needs setting.
5. Relay the confirmation. If the hook reported that no snapshot was taken, or the command says the snapshot is missing or expired, ask the user to copy the key again and reply `copied`; retry with the new snapshot ID, or without `--snapshot-id` so the command reads the live clipboard. On validation failure, report only the script's reason and ask them to recopy.

## Setup

macOS only (it reads the clipboard with `pbpaste`). Needs the 1Password CLI (`op`), `jq` and Node.js.

1. Register the hook to run on every prompt, before the model sees it. In Claude Code, add to `~/.claude/settings.json`:

   ```json
   {"hooks": {"UserPromptSubmit": [{"hooks": [{"type": "command", "command": "node <this skill's folder>/hooks/opadd-snapshot-on-prompt.mjs"}]}]}}
   ```

2. Tell the script where keys go: `export OPADD_VAULT='<vault name or ID>'` in your shell profile. For an agent, `op` should run as a 1Password service account scoped to that vault, so no Touch ID prompt is needed: set `OP_SERVICE_ACCOUNT_TOKEN`, or keep the token in `~/.config/1password/agent-token`, which the script reads when the variable is unset.
3. Optionally, write `~/.config/opadd/profiles` to send keys made in some folders elsewhere, such as an employer's 1Password. One line per folder: `<folder pattern> <command> <default vault> [<shared vault>]`, separated by whitespace; the pattern may start with `~` and use shell globs, and covers everything under it. The command is how to run `op` for that 1Password account, typically a wrapper that sets that account's service-account token.
