#!/usr/bin/env bash
set -euo pipefail
: "${BASE:?Set BASE, e.g. http://localhost:3000}"
: "${TARGET:?Set TARGET, e.g. https://poolboysco.com.au}"
ACCEPT_MIN_COVERAGE="${ACCEPT_MIN_COVERAGE:-10}"
TARGET_ENC=$(node -e "process.stdout.write(encodeURIComponent(process.env.TARGET))")
echo "== Resolve-only must be 200 =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/build?url=$TARGET_ENC&push=0&debug=1") || true
echo "resolve_code=$CODE"; test "$CODE" -eq 200
echo "== Coverage floor = $ACCEPT_MIN_COVERAGE =="
# Use node to parse coverage instead of relying on jq. This avoids
# quoting issues and ensures the script works even when jq is missing
# or the expression fails to compile.
COV=$(curl -s "$BASE/api/build?url=$TARGET_ENC&push=0&debug=1" \
  | node -e '
      const fs = require("fs");
      let out = 0;
      try {
        const data = fs.readFileSync(0, "utf8");
        const json = JSON.parse(data || "{}");
        const trace = json.debug && Array.isArray(json.debug.trace)
          ? json.debug.trace
          : [];
        const cov = trace.find((t) => t.stage === "intent_coverage");
        if (cov && typeof cov.after === "number") out = cov.after;
      } catch {}
      process.stdout.write(String(out));
    ')
echo "coverage_after=$COV"; test "${COV:-0}" -ge "$ACCEPT_MIN_COVERAGE"
echo "== Push-only guard sanity (200 or 422) =="
PCODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/build?url=$TARGET_ENC&push=1&debug=1") || true
echo "push_code=$PCODE"; [[ "$PCODE" =~ ^(200|422)$ ]]
echo "ACCEPTANCE OK"
