#!/usr/bin/env bash
# Runs the Maestro flows for one app against a connected Android emulator/phone or an iOS simulator.
#   maestro/scripts/run.sh rider|driver [maestro test args, e.g. --include-tags=smoke or a single flow file]
# Install the development build of the app first (docs/testing.md).
set -euo pipefail

app="${1:-}"
shift || true

case "$app" in
  rider)  APP_ID="com.taxikosmos.rider.dev";  APP_NAME="TaxiKosmos (Dev)" ;;
  driver) APP_ID="com.taxikosmos.driver.dev"; APP_NAME="TaxiKosmos Driver (Dev)" ;;
  *) echo "usage: $0 rider|driver [maestro args]" >&2; exit 2 ;;
esac

root="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=env.sh
source "$(dirname "$0")/env.sh"

exec maestro test -e "APP_ID=$APP_ID" -e "APP_NAME=$APP_NAME" "$@" "$root/maestro/flows"
