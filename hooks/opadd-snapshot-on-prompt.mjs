#!/usr/bin/env node
// Snapshot the clipboard before the model handles an `opadd <name>` request,
// a message that starts with `1pw <name>`, or a message that is just `copied`
// (the reply after an agent asks the user to copy a credential).
// The model receives only a one-time snapshot ID, which it passes to opadd
// after deriving useful 1Password metadata from the conversation.

import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const SNAPSHOT_DIR = join(homedir(), ".cache", "opadd");
const SNAPSHOT_ID_PATTERN = /^[a-f0-9]{32}$/;
const configuredMaxAge = Number.parseInt(process.env.OPADD_SNAPSHOT_MAX_AGE_MS ?? "", 10);
const MAX_AGE_MS = configuredMaxAge > 0 ? configuredMaxAge : 5 * 60 * 1000;
const MAX_CLIP_BYTES = 64 * 1024;

// The whole message is "copied", ignoring case, surrounding whitespace and a
// trailing full stop or exclamation mark.
export function isCopiedReply(prompt) {
  return typeof prompt === "string" && /^\s*copied[.!]?\s*$/i.test(prompt);
}

export function looksLikeOpaddPrompt(prompt) {
  // `opadd` may start any line; `1pw` is everyday shorthand for 1Password, so
  // it triggers only at the very start of the message.
  return (
    typeof prompt === "string" &&
    (/^opadd[ \t]+\S.*$/m.test(prompt) || /^1pw:?[ \t]+\S/.test(prompt))
  );
}

function snapshotPath(snapshotId) {
  if (!SNAPSHOT_ID_PATTERN.test(snapshotId)) throw new Error("invalid snapshot ID");
  return join(SNAPSHOT_DIR, `snapshot-${snapshotId}`);
}

function unlinkIfPresent(path) {
  try {
    unlinkSync(path);
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }
}

function expireStaleSnapshots() {
  // Detached expiry processes do not survive a restart. Sweeping on later
  // prompts removes anything they missed; opadd also rejects stale snapshots.
  let names;
  try {
    names = readdirSync(SNAPSHOT_DIR);
  } catch {
    return;
  }

  for (const name of names) {
    if (!/^(?:snapshot-[a-f0-9]{32}|claimed-[a-f0-9]{32}-[0-9]+)$/.test(name)) continue;
    const path = join(SNAPSHOT_DIR, name);
    try {
      if (Date.now() - statSync(path).mtimeMs > MAX_AGE_MS) unlinkIfPresent(path);
    } catch {
      // Another process may have consumed it.
    }
  }
}

function scheduleExpiry(snapshotId) {
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), "--expire", snapshotId],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
}

async function expireSnapshotLater(snapshotId) {
  if (!SNAPSHOT_ID_PATTERN.test(snapshotId)) return;
  await delay(MAX_AGE_MS);
  unlinkIfPresent(snapshotPath(snapshotId));
  let names;
  try {
    names = readdirSync(SNAPSHOT_DIR);
  } catch {
    return;
  }
  const claimedPrefix = `claimed-${snapshotId}-`;
  for (const name of names) {
    if (name.startsWith(claimedPrefix) && /^[0-9]+$/.test(name.slice(claimedPrefix.length))) {
      unlinkIfPresent(join(SNAPSHOT_DIR, name));
    }
  }
}

function main() {
  let prompt = "";
  try {
    prompt = JSON.parse(readFileSync(0, "utf8"))?.prompt ?? "";
  } catch {
    return;
  }

  expireStaleSnapshots();
  const copiedReply = isCopiedReply(prompt);
  if (!copiedReply && !looksLikeOpaddPrompt(prompt)) return;

  let clip;
  try {
    clip = execFileSync("/usr/bin/pbpaste", { maxBuffer: MAX_CLIP_BYTES });
  } catch {
    process.stdout.write(
      "opadd hook: could not read the clipboard at prompt time; no snapshot was taken.",
    );
    return;
  }
  if (!clip.length) {
    process.stdout.write("opadd hook: clipboard was empty at prompt time; no snapshot was taken.");
    return;
  }

  const snapshotId = randomBytes(16).toString("hex");
  const path = snapshotPath(snapshotId);
  try {
    mkdirSync(SNAPSHOT_DIR, { recursive: true, mode: 0o700 });
    chmodSync(SNAPSHOT_DIR, 0o700);
    writeFileSync(path, clip, { mode: 0o600, flag: "wx" });
    chmodSync(path, 0o600);
    scheduleExpiry(snapshotId);
    process.stdout.write(
      `opadd hook: clipboard snapshotted at prompt time (${clip.length} bytes). ` +
        (copiedReply
          ? `The user replied "copied". If you just asked them to copy a credential, use the opadd ` +
            `skill now, take the title from that request, and pass --snapshot-id ${snapshotId}. ` +
            `Otherwise ignore this; the snapshot expires in ${Math.round(MAX_AGE_MS / 60000)} minutes.`
          : `Use the opadd skill now and pass --snapshot-id ${snapshotId}; the clipboard is free.`),
    );
  } catch (err) {
    unlinkIfPresent(path);
    process.stdout.write(
      `opadd hook: snapshot failed (${err?.message || "unknown"}); no snapshot was retained.`,
    );
  }
}

if (process.env.NODE_ENV !== "test") {
  if (process.argv[2] === "--expire") {
    await expireSnapshotLater(process.argv[3] ?? "");
  } else {
    try {
      main();
    } catch {
      // Fail open without exposing clipboard contents.
    }
  }
}
