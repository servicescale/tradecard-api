#!/usr/bin/env bash
set -euo pipefail

BASE=${BASE:-http://localhost:3000}
TARGET=${1:-https://poolboysco.com.au}
MIN=${MIN_ACF_KEYS:-10}

summary=()

# Step 1: Health check
health_json=$(curl -fsS "$BASE/api/health")
if [[ $(echo "$health_json" | jq -r '.ok') != "true" ]]; then
  echo "Health check failed: $health_json"
  exit 1
fi
summary+=("health:ok")

# Step 2: Resolve-only build
build_json=$(curl -fsS "$BASE/api/build?url=$TARGET&resolve=llm&push=0&debug=1")
llm_sent=$(echo "$build_json" | jq '(.debug.trace[]?|select(.stage=="llm_resolve")|.sent) // 0')
cov_after=$(echo "$build_json" | jq '(.debug.trace[]?|select(.stage=="intent_coverage")|.after) // 0')
if (( llm_sent <= 0 )); then
  echo "llm_sent <= 0"
  exit 1
fi
if (( cov_after <= 3 )); then
  echo "cov_after <= 3"
  exit 1
fi
summary+=("resolve:sent=$llm_sent" "cov=$cov_after")

# Step 3: Push (guarded)
if [[ -n "${WP_BASE:-}" && -n "${WP_BEARER:-}" ]]; then
  push_json=$(curl -fsS -X POST "$BASE/api/build?url=$TARGET&resolve=llm&push=1&debug=1")
  sent_keys_len=$(echo "$push_json" | jq '(.wordpress.details.steps[]?|select(.step=="acf_sync").sent_keys|length) // 0')
  if (( sent_keys_len < MIN )); then
    echo "sent_keys_len $sent_keys_len < MIN $MIN"
    exit 1
  fi
  summary+=("push:sent=$sent_keys_len")
else
  echo "WP creds missing → skipping push step"
  summary+=("push:skipped")
fi

printf '%s ' "${summary[@]}"
echo
