#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
TARGET="${1:-https://poolboysco.com.au}"
MIN="${MIN_ACF_KEYS:-10}"
MAX_PAGES="${MAX_PAGES:-5}"
MAX_DEPTH="${MAX_DEPTH:-1}"

jq_key() { jq -r "$1" 2>/dev/null || true; }

say() { printf "\u25B6 %s\n" "$*"; }
fail() { printf "\u2717 %s\n" "$*" >&2; exit 1; }
ok()   { printf "\u2713 %s\n" "$*"; }

# 0) Ensure server is up
say "Health check @ $BASE"
HEALTH=$(curl -fsS "$BASE/api/health" | jq_key '.ok')
[ "$HEALTH" = "true" ] || fail "Dev server not reachable (start it, then re-run)"

# 1) Resolve-only (no push), with deeper crawl
QS="url=$(printf %s "$TARGET")&resolve=llm&push=0&debug=1&maxPages=$MAX_PAGES&maxDepth=$MAX_DEPTH"
say "Resolve-only: $QS"
J=$(curl -fsS "$BASE/api/build?$QS")

LLM_SENT=$(printf %s "$J" | jq_key '.debug.trace[]?|select(.stage=="llm_resolve")|.sent // 0')
COV_AFTER=$(printf %s "$J" | jq_key '.debug.trace[]?|select(.stage=="intent_coverage")|.after // 0')
INTENT_INPUT=$(printf %s "$J" | jq_key '.debug.trace[]?|select(.stage=="intent_input")')
HINTS=$(printf %s "$J" | jq_key '.debug.trace[]?|select(.stage=="hint_extract")')
CONTRACT=$(printf %s "$J" | jq_key '.debug.trace[]?|select(.stage=="contract_check")')

say "Intent input: $(printf %s "$INTENT_INPUT" | jq -c . 2>/dev/null || echo null)"
say "Hint extract: $(printf %s "$HINTS" | jq -c . 2>/dev/null || echo null)"
say "LLM resolve : sent=$LLM_SENT"
say "Coverage    : after=$COV_AFTER"
say "Contract    : $(printf %s "$CONTRACT" | jq -c . 2>/dev/null || echo null)"

[ "${LLM_SENT:-0}" -gt 0 ] || fail "LLM returned no fields. Check OPENAI_API_KEY on server and raw signals."
[ "${COV_AFTER:-0}" -gt 3 ] || say "Coverage still low (after=$COV_AFTER). Will attempt guarded push for full summary."

# 2) Guarded push (skip if WP creds missing)
if [ -n "${WP_BASE:-}" ] && [ -n "${WP_BEARER:-}" ]; then
  QS_PUSH="url=$(printf %s "$TARGET")&resolve=llm&push=1&debug=1&maxPages=$MAX_PAGES&maxDepth=$MAX_DEPTH"
  say "Push: $QS_PUSH"
  # capture http code & body
  HTTP=$(curl -sS -w '\n%{http_code}\n' "$BASE/api/build?$QS_PUSH")
  BODY=$(printf %s "$HTTP" | head -n -1)
  CODE=$(printf %s "$HTTP" | tail -n1)

  if [ "$CODE" != "200" ]; then
    say "Push failed with $CODE; showing traces"
    printf "%s\n" "$BODY" | jq '{status:.ok, trace:(.debug.trace//[]|map(select(.stage=="intent_input" or .stage=="hint_extract" or .stage=="llm_resolve" or .stage=="intent_coverage" or .stage=="contract_check")))}' || true
    fail "Guard blocked publish (HTTP $CODE). Increase raw signals or reduce MIN_ACF_KEYS temporarily."
  fi

  SENT_LEN=$(printf %s "$BODY" | jq_key '(.wordpress.details.steps[]|select(.step=="acf_sync").sent_keys|length) // 0')
  [ "${SENT_LEN:-0}" -ge "$MIN" ] || {
    printf "%s\n" "$BODY" | jq '{acf_sync:(.wordpress.details.steps[]|select(.step=="acf_sync"))}' || true
    fail "Publish sent $SENT_LEN < MIN($MIN) keys."
  }
  ok "Publish OK with $SENT_LEN keys (>= $MIN)"
else
  say "WP creds missing → skipping push step"
fi

ok "ACCEPT PASSED for $TARGET (min=$MIN, pages=$MAX_PAGES, depth=$MAX_DEPTH)"
