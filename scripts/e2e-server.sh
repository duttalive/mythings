#!/bin/sh
# Serves a production build for the end-to-end tests, against fresh local state
# (its own D1 database and Durable Objects), so dev data is never touched.
set -e
STATE=.wrangler/e2e
rm -rf "$STATE"
corepack pnpm exec wrangler d1 migrations apply mythings --local --persist-to "$STATE" >/dev/null
MYTHINGS_STATE="$STATE" corepack pnpm exec vite build >/dev/null
exec env MYTHINGS_STATE="$STATE" corepack pnpm exec vite preview --port 4174 --strictPort
