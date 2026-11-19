#!/bin/sh
# Like scripts/e2e-server.sh, on its own port and state so it can run beside the tests.
set -e
STATE=.wrangler/guide
rm -rf "$STATE"
corepack pnpm exec wrangler d1 migrations apply mythings --local --persist-to "$STATE" >/dev/null
MYTHINGS_STATE="$STATE" corepack pnpm exec vite build >/dev/null
exec env MYTHINGS_STATE="$STATE" corepack pnpm exec vite preview --port 4175 --strictPort
