#!/usr/bin/env bash
# Runs a command and, if it fails, turns the important lines of its output into GitHub
# annotations, so failures are readable from the API and the PR page without the full log.
set -o pipefail
log="$(mktemp)"
"$@" 2>&1 | tee "$log"
status=${PIPESTATUS[0]}
if [ "$status" -ne 0 ]; then
  grep -E "error(\[|:)|Error:|fatal|failed|cannot find|not found|\*\* BUILD FAILED" "$log" | grep -v "^warning" | head -25 | while IFS= read -r line; do
    echo "::error title=$1::${line//%/%25}"
  done
  tail -n 40 "$log" | sed 's/%/%25/g' | awk 'BEGIN{ORS="%0A"} {print}' | { read -r -d '' body; echo "::error title=tail of output::${body}"; }
fi
exit "$status"
