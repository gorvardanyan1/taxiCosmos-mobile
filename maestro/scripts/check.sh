#!/usr/bin/env bash
# Validates the syntax of every Maestro flow. Needs Maestro (Java) but no device, so CI can run it.
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=env.sh
source "$(dirname "$0")/env.sh"
status=0

while IFS= read -r flow; do
  if maestro check-syntax "$flow" >/dev/null 2>&1; then
    echo "ok      ${flow#"$root"/}"
  else
    echo "INVALID ${flow#"$root"/}" >&2
    maestro check-syntax "$flow" >&2 || true
    status=1
  fi
done < <(find "$root/maestro/flows" -name '*.yaml' | sort)

exit "$status"
