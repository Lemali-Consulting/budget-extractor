#!/usr/bin/env bash
# Deploy the Budget Explorer static site to Netlify.
# Builds data for both years, validates, renders images, builds the Astro site,
# and deploys to production.
set -euo pipefail

cd "$(dirname "$0")"

# Load environment variables (.env must define NETLIFY_AUTH_TOKEN)
source .env
export NETLIFY_AUTH_TOKEN
export NETLIFY_SITE_ID="11c41143-d0e2-4a28-9dde-10e173bf230f"

echo "==> Building web data..."
# 2026 operating budget = amended ("as amended 4-20-26") is the canonical site data.
uv run scripts/build_web_data.py --year 2026 --operating-variant amended
# Adopted baseline (transient, gitignored) + adopted-vs-amended diff outputs.
uv run scripts/build_web_data.py --year 2026 --operating-variant adopted --operating-only --output-prefix adopted
uv run scripts/build_amendment_diff.py --year 2026
uv run scripts/build_web_data.py --year 2025 --output-prefix 2025

echo "==> Validating data..."
uv run scripts/validate_data.py all --year 2026

echo "==> Rendering page images and chart images..."
# Clear stale renders so amended operating pages replace any adopted ones
# (operating + capital share per-section-slug output dirs).
rm -rf web/public/pages web/public/pages-adopted
uv run scripts/render_page_images.py --budget-type operating --variant amended
uv run scripts/render_page_images.py --budget-type capital
# Adopted source pages for the lightbox's amended/adopted toggle — only pages
# the amendment changed; writes views/2026-adopted-pages.json manifest.
uv run scripts/render_page_images.py --budget-type operating --variant adopted \
  --secondary-of amended --output-subdir pages-adopted \
  --manifest web/src/data/views/2026-adopted-pages.json
uv run scripts/extract_chart_images.py

echo "==> Building Astro site..."
cd web
npm run build

echo "==> Deploying to Netlify..."
npx netlify deploy --dir=dist --prod

echo "==> Done! Site deployed to https://pgh-budget-explorer.netlify.app"
