#!/usr/bin/env bash
# Stop hook: if user-facing source changed but docs/manual/ did not, send
# Claude back once to update the manual (update-manual skill) or to say why
# no user-visible behaviour changed. Never blocks twice in a row.
set -u

input=$(cat)

# Already sent back once this turn: let Claude stop (avoids a loop).
if printf '%s' "$input" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

changed=$( { git diff --name-only HEAD 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null; } | sort -u )

# Source a user could notice. Tests and test resources are excluded.
src=$(printf '%s\n' "$changed" \
  | grep -E '^(frontend/src/|backend/src/main/)' \
  | grep -Ev '(\.test\.|\.spec\.|/__tests__/|/test/|/test-utils|/test-setup\.)' || true)
docs=$(printf '%s\n' "$changed" | grep -E '^docs/manual/' || true)

if [ -n "$src" ] && [ -z "$docs" ]; then
  cat <<'JSON'
{"decision":"block","reason":"Source under frontend/src or backend/src/main changed but docs/manual/ did not. Use the update-manual skill (.claude/skills/update-manual/SKILL.md) to update the affected manual chapters in the industry and ministry editions, or state in one sentence why this change has no user-visible effect (refactor, tests, build, logging, etc.)."}
JSON
fi
exit 0
