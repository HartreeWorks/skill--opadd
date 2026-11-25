#!/bin/bash
set -euo pipefail

TEST_DIR=$(mktemp -d)
NODE_BIN=$(command -v node)
trap 'trash "$TEST_DIR" >/dev/null 2>&1 || true' EXIT
mkdir -p "$TEST_DIR/bin" "$TEST_DIR/home/.cache/opadd"

cat > "$TEST_DIR/bin/op" <<'SH'
#!/bin/bash
payload=$(/bin/cat)
if [ "${OPADD_TEST_FAIL:-0}" = "1" ]; then
  printf '%s\n' "$payload" >&2
  exit 9
fi
printf '%s' "$payload" > "$OPADD_TEST_CAPTURE"
SH
chmod +x "$TEST_DIR/bin/op"

export HOME="$TEST_DIR/home"
export PATH="$TEST_DIR/bin:/opt/homebrew/bin:/usr/bin:/bin"
export OPADD_VAULT="Test vault"
export OPADD_TEST_CAPTURE="$TEST_DIR/item.json"

snapshot_id="0123456789abcdef0123456789abcdef"
snapshot="$HOME/.cache/opadd/snapshot-$snapshot_id"
printf 'sk-test-1234567890abcdef' > "$snapshot"
chmod 600 "$snapshot"

output=$(
  "$(dirname "$0")/opadd" "Test API key" \
    --hostname "api.example.com" \
    --notes "Scopes: read:widgets" \
    --snapshot-id "$snapshot_id"
)

[ ! -e "$snapshot" ]
case "$output" in *sk-test*|*1234*) echo "secret leaked in output" >&2; exit 1 ;; esac
printf '%s' "$output" | grep -q "Saved 'Test API key' to 1Password vault 'Test vault'"
jq -e '.title == "Test API key"' "$OPADD_TEST_CAPTURE" >/dev/null
jq -e '.fields[] | select(.id == "credential" and .value == "sk-test-1234567890abcdef")' "$OPADD_TEST_CAPTURE" >/dev/null
jq -e '.fields[] | select(.id == "hostname" and .value == "api.example.com")' "$OPADD_TEST_CAPTURE" >/dev/null
jq -e '.fields[] | select(.id == "notesPlain" and .value == "Scopes: read:widgets")' "$OPADD_TEST_CAPTURE" >/dev/null

project_dir="$TEST_DIR/project"
mkdir -p "$project_dir"
/usr/bin/git -C "$project_dir" init -q
printf '.env\n' > "$project_dir/.gitignore"
printf 'UNCHANGED=yes\nTEST_API_KEY=old-value\nTEST_API_KEY=duplicate-value\n' > "$project_dir/.env"
env_id="11112222333344445555666677778888"
printf "sk-env-12345'67890abcdef" > "$HOME/.cache/opadd/snapshot-$env_id"
env_output=$(
  "$(dirname "$0")/opadd" "Env API key" \
    --snapshot-id "$env_id" \
    --env-file "$project_dir/.env" \
    --env-var "TEST_API_KEY" 2>&1
)
printf '%s' "$env_output" | grep -q "Set TEST_API_KEY in '.*project/.env'."
printf '%s' "$env_output" | grep -q "removed 1 duplicate TEST_API_KEY= line"
grep -q '^UNCHANGED=yes$' "$project_dir/.env"
[ "$(grep -c '^TEST_API_KEY=' "$project_dir/.env")" -eq 1 ]
(
  unset TEST_API_KEY
  . "$project_dir/.env"
  [ "$TEST_API_KEY" = "sk-env-12345'67890abcdef" ]
)
[ "$(stat -f %Lp "$project_dir/.env")" = "600" ]

set +e
pair_output=$("$(dirname "$0")/opadd" "Incomplete env args" --env-file "$project_dir/.env" 2>&1)
pair_status=$?
set -e
[ "$pair_status" -eq 1 ]
printf '%s' "$pair_output" | grep -q -- "--env-file and --env-var must be passed together"

/bin/ln -s .env "$project_dir/env-link"
set +e
symlink_output=$("$(dirname "$0")/opadd" "Symlink key" --env-file "$project_dir/env-link" --env-var LINK_KEY 2>&1)
symlink_status=$?
set -e
[ "$symlink_status" -eq 1 ]
printf '%s' "$symlink_output" | grep -q "refusing to write through an env-file symlink"

printf 'TRACKED=unchanged\n' > "$project_dir/.env.tracked"
/usr/bin/git -C "$project_dir" add .env.tracked
set +e
tracked_output=$("$(dirname "$0")/opadd" "Tracked key" --env-file "$project_dir/.env.tracked" --env-var TRACKED 2>&1)
tracked_status=$?
set -e
[ "$tracked_status" -eq 1 ]
printf '%s' "$tracked_output" | grep -q "refusing to write a secret to tracked file"

printf 'VISIBLE=unchanged\n' > "$project_dir/visible.env"
set +e
visible_output=$("$(dirname "$0")/opadd" "Visible key" --env-file "$project_dir/visible.env" --env-var VISIBLE 2>&1)
visible_status=$?
set -e
[ "$visible_status" -eq 1 ]
printf '%s' "$visible_output" | grep -q "refusing to write a secret to a Git-visible file"

failure_id="abcdef0123456789abcdef0123456789"
failure_snapshot="$HOME/.cache/opadd/snapshot-$failure_id"
failure_secret="sk-failure-abcdef9876543210"
printf '%s' "$failure_secret" > "$failure_snapshot"
chmod 600 "$failure_snapshot"
export OPADD_TEST_FAIL=1
printf 'FAIL_KEY=old-value\n' > "$project_dir/.env"
failure_env_before=$(shasum "$project_dir/.env")
set +e
failure_output=$("$(dirname "$0")/opadd" "Failing API key" \
  --snapshot-id "$failure_id" \
  --env-file "$project_dir/.env" \
  --env-var FAIL_KEY 2>&1)
failure_status=$?
set -e
[ "$failure_status" -eq 3 ]
case "$failure_output" in *"$failure_secret"*) echo "secret leaked from op stderr" >&2; exit 1 ;; esac
printf '%s' "$failure_output" | grep -q "op item create failed"
printf '%s' "$failure_output" | grep -q "diagnostics withheld"
[ "$(shasum "$project_dir/.env")" = "$failure_env_before" ]

concurrent_id="fedcba9876543210fedcba9876543210"
concurrent_snapshot="$HOME/.cache/opadd/snapshot-$concurrent_id"
printf 'sk-concurrent-1234567890' > "$concurrent_snapshot"
chmod 600 "$concurrent_snapshot"
export OPADD_TEST_FAIL=0
set +e
"$(dirname "$0")/opadd" "Concurrent key one" --snapshot-id "$concurrent_id" >/dev/null 2>&1 &
first_pid=$!
"$(dirname "$0")/opadd" "Concurrent key two" --snapshot-id "$concurrent_id" >/dev/null 2>&1 &
second_pid=$!
wait "$first_pid"; first_status=$?
wait "$second_pid"; second_status=$?
set -e
[ "$(( (first_status == 0) + (second_status == 0) ))" -eq 1 ]
[ "$(( (first_status == 4) + (second_status == 4) ))" -eq 1 ]

expiry_id="00112233445566778899aabbccddeeff"
expiry_pending="$HOME/.cache/opadd/snapshot-$expiry_id"
expiry_claimed="$HOME/.cache/opadd/claimed-$expiry_id-12345"
printf 'pending-test-secret' > "$expiry_pending"
printf 'claimed-test-secret' > "$expiry_claimed"
OPADD_SNAPSHOT_MAX_AGE_MS=10 "$NODE_BIN" "$(dirname "$0")/../hooks/opadd-snapshot-on-prompt.mjs" --expire "$expiry_id"
[ ! -e "$expiry_pending" ]
[ ! -e "$expiry_claimed" ]

echo "opadd integration test passed"
