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
uv run scripts/build_web_data.py --year 2026
uv run scripts/build_web_data.py --year 2025 --output-prefix 2025

echo "==> Validating data..."
uv run scripts/validate_data.py all --year 2026

echo "==> Rendering page images and chart images..."
uv run scripts/render_page_images.py
uv run scripts/extract_chart_images.py

echo "==> Building Astro site..."
cd web
npm run build

echo "==> Deploying to Netlify..."
npx netlify deploy --dir=dist --prod

echo "==> Done! Site deployed to https://pgh-budget-explorer.netlify.app"
