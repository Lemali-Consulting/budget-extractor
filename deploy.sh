#!/usr/bin/env bash
# Deploy the Budget Explorer static site to Netlify.
# Builds the 2027 proposed budget (site headline, unprefixed data) plus the 2026
# (amended) and 2025 archives, validates, renders per-year images, builds the
# Astro site, and deploys to production.
set -euo pipefail

cd "$(dirname "$0")"

# Auth comes from the Netlify CLI's local config (~/.config/netlify/config.json),
# populated by `netlify login`. Site is targeted via NETLIFY_SITE_ID.
export NETLIFY_SITE_ID="11c41143-d0e2-4a28-9dde-10e173bf230f"

echo "==> Building web data..."
# Headline: the 2027 proposed budget (unprefixed bundles).
uv run scripts/build_web_data.py --year 2027 --operating-variant proposed --capital-variant proposed
uv run scripts/build_capital_appendices.py --year 2027 --variant proposed
# 2026 archive: operating = amended ("as amended 4-20-26"), capital = adopted ("2026-" prefix).
uv run scripts/build_web_data.py --year 2026 --operating-variant amended --output-prefix 2026
# Adopted baseline (transient, gitignored) + adopted-vs-amended diff outputs.
uv run scripts/build_web_data.py --year 2026 --operating-variant adopted --operating-only --output-prefix adopted
uv run scripts/build_amendment_diff.py --year 2026
uv run scripts/build_capital_appendices.py --year 2026 --output-prefix 2026
uv run scripts/build_web_data.py --year 2025 --output-prefix 2025

echo "==> Validating data..."
uv run scripts/validate_data.py structural --year 2027 --operating-variant proposed --capital-variant proposed
uv run scripts/validate_data.py outliers --year 2027 --output-prefix ""
uv run scripts/validate_data.py structural --year 2026 --operating-variant amended
uv run scripts/validate_data.py outliers --year 2026 --output-prefix 2026
uv run scripts/validate_data.py cross-year --years 2026,2027 --output-prefix-a 2026 --output-prefix-b ""

echo "==> Rendering page images and chart images..."
# Images are namespaced by year: web/public/{pages,pages-adopted,charts}/{year}/{slug}/.
# Clear stale renders so a changed variant never leaves old pages behind.
rm -rf web/public/pages web/public/pages-adopted web/public/charts
uv run scripts/render_page_images.py --year 2027 --budget-type operating --variant proposed
uv run scripts/render_page_images.py --year 2027 --budget-type capital --variant proposed
uv run scripts/render_page_images.py --year 2026 --budget-type operating --variant amended
uv run scripts/render_page_images.py --year 2026 --budget-type capital
# Adopted source pages for the 2026 lightbox's amended/adopted toggle — only pages
# the amendment changed; writes views/2026-adopted-pages.json manifest.
uv run scripts/render_page_images.py --year 2026 --budget-type operating --variant adopted \
  --secondary-of amended --output-subdir pages-adopted \
  --manifest web/src/data/views/2026-adopted-pages.json
uv run scripts/extract_chart_images.py --year 2027 --operating-variant proposed --capital-variant proposed
uv run scripts/extract_chart_images.py --year 2026 --operating-variant amended --output-prefix 2026

echo "==> Building Astro site..."
cd web
npm run build

echo "==> Deploying to Netlify..."
npx netlify deploy --dir=dist --prod

echo "==> Done! Site deployed to https://pgh-budget-explorer.netlify.app"
