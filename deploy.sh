#!/usr/bin/env bash
# Deploy the Budget Explorer static site to Netlify.
# Builds the 2027 proposed budget (the only year the site publishes), validates,
# renders its page images, builds the Astro site, and deploys to production.
# The 2026 and 2025 archives are not published (docs/decisions/2026-11-12-publish-2027-only.md);
# their committed data views stay in the repo. To republish one, add it back to
# ARCHIVE_YEARS in web/src/lib/budget-year.ts and restore its build, validate and
# render steps from that decision record.
set -euo pipefail

cd "$(dirname "$0")"

# Auth comes from the Netlify CLI's local config (~/.config/netlify/config.json),
# populated by `netlify login`. Site is targeted via NETLIFY_SITE_ID.
export NETLIFY_SITE_ID="11c41143-d0e2-4a28-9dde-10e173bf230f"

echo "==> Building web data..."
# Headline: the 2027 proposed budget (unprefixed bundles).
uv run scripts/build_web_data.py --year 2027 --operating-variant proposed --capital-variant proposed
uv run scripts/build_capital_appendices.py --year 2027 --variant proposed
# Long-run headline figures across every baselined budget document (views/longitudinal.json).
# Reads the regression baselines directly, so it needs no 2026 or 2025 web data.
uv run scripts/build_longitudinal.py

echo "==> Validating data..."
uv run scripts/validate_data.py structural --year 2027 --operating-variant proposed --capital-variant proposed
uv run scripts/validate_data.py outliers --year 2027 --output-prefix ""

echo "==> Rendering page images and chart images..."
# Images are namespaced by year: web/public/{pages,pages-adopted,charts}/{year}/{slug}/.
# Clear stale renders so a changed variant never leaves old pages behind.
rm -rf web/public/pages web/public/pages-adopted web/public/charts
uv run scripts/render_page_images.py --year 2027 --budget-type operating --variant proposed
uv run scripts/render_page_images.py --year 2027 --budget-type capital --variant proposed
uv run scripts/extract_chart_images.py --year 2027 --operating-variant proposed --capital-variant proposed

echo "==> Building Astro site..."
cd web
npm run build

echo "==> Deploying to Netlify..."
npx netlify deploy --dir=dist --prod

echo "==> Done! Site deployed to https://pgh-budget-explorer.netlify.app"
