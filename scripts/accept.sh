#!/usr/bin/env bash
set -euo pipefail

BASE=${BASE:-http://localhost:3000}
TARGET=${1:-https://poolboysco.com.au}
MIN=${MIN_ACF_KEYS:-10}
MAX_PAGES=${MAX_PAGES:-5}
MAX_DEPTH=${MAX_DEPTH:-1}

jq_key() { jq -r "$1" 2>/dev/null || true; }

# Health check
if [ "$(curl -fsS "$BASE/api/health" | jq_key '.ok')" != "true" ]; then
  echo "Health check failed at $BASE" >&2
  exit 1
fi
printf "Health OK at %s\n" "$BASE"

QS="url=$(printf %s "$TARGET")&resolve=llm&push=0&debug=1&maxPages=$MAX_PAGES&maxDepth=$MAX_DEPTH"
RESP=$(curl -fsS "$BASE/api/build?$QS")

echo "intent_input: $(printf %s "$RESP" | jq -c '.debug.trace[]?|select(.stage=="intent_input")')"
echo "hint_extract: $(printf %s "$RESP" | jq -c '.debug.trace[]?|select(.stage=="hint_extract")')"
echo "llm_resolve: $(printf %s "$RESP" | jq -c '.debug.trace[]?|select(.stage=="llm_resolve")|{sent}')"
echo "intent_coverage: $(printf %s "$RESP" | jq -c '.debug.trace[]?|select(.stage=="intent_coverage")|{after}')"

if [ -n "${WP_BASE:-}" ] && [ -n "${WP_BEARER:-}" ]; then
  QS="url=$(printf %s "$TARGET")&resolve=llm&push=1&debug=1&maxPages=$MAX_PAGES&maxDepth=$MAX_DEPTH"
  HTTP=$(curl -sS -w '\n%{http_code}\n' "$BASE/api/build?$QS")
  BODY=$(printf %s "$HTTP" | head -n -1)
  CODE=$(printf %s "$HTTP" | tail -n1)
  if [ "$CODE" != "200" ]; then
    printf "%s\n" "$BODY" | jq '{trace:(.debug.trace//[]|map(select(.stage=="intent_input" or .stage=="hint_extract" or .stage=="llm_resolve" or .stage=="intent_coverage")))}' || true
    echo "Publish failed with $CODE" >&2
    exit 1
  fi
  SENT=$(printf %s "$BODY" | jq '(.wordpress.details.steps[]?|select(.step=="acf_sync").sent_keys|length) // 0')
  if [ "$SENT" -lt "$MIN" ]; then
    printf "%s\n" "$BODY" | jq '{acf_sync:(.wordpress.details.steps[]?|select(.step=="acf_sync"))}' || true
    echo "Publish sent $SENT < MIN($MIN)" >&2
    exit 1
  fi
  echo "Publish OK with $SENT keys (>= $MIN)"
else
  echo "WP creds missing → skipping push step"
fi
