#!/usr/bin/env bash
# Renders the README images from the HTML sources in this folder.
#
#   bash docs/assets/src/render.sh
#
# Each source is rendered twice, light and dark, by switching the browser's
# colour scheme; brand.css carries both palettes. Output goes to docs/assets/.
# The light render keeps the historical file name (hero.png, flow.png) because
# README copies already published to npm point at those URLs.
#
# Needs Node and a Playwright Chromium (`npx playwright install chromium` once).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="$(cd "$here/.." && pwd)"
pw="npx -y playwright@1.62.1"

# name  width  height
images=(
  "hero 1280 520"
  "flow 1280 580"
  "engine 1280 540"
)

for spec in "${images[@]}"; do
  read -r name w h <<<"$spec"
  for scheme in light dark; do
    file="$out/$name.png"
    [ "$scheme" = dark ] && file="$out/$name-dark.png"
    $pw screenshot --device "Desktop Chrome HiDPI" --viewport-size "$w,$h" \
      --color-scheme "$scheme" --wait-for-timeout 400 \
      "file://$here/$name.html" "$file" >/dev/null
    echo "wrote ${file#"$out"/} (${w}x${h} @2x, $scheme)"
  done
done
