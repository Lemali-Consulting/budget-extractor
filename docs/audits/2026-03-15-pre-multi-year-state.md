# Current State Audit

**Date:** 2026-03-15
**Purpose:** Assess project organization before adding multi-year budget support.

## Workflows: 5 exist, 0 feed the web app

| Workflow | What it does | Status |
|----------|-------------|--------|
| `extract_expenditure_tables` | Extracts 9 expenditure CSVs from `11_Expenditures_Detail.pdf` | **Unused** — output not consumed downstream |
| `extract_revenue_tables` | Extracts 7 revenue CSVs from `08_Revenue_Detail.pdf` | **Unused** — output not consumed downstream |
| `extract_financial_forecast` | Extracts 5-year forecast into 5 CSVs | **Unused** — output not consumed downstream |
| `extract_grants` | Extracts grants + grant-funded positions | **Unused** — output not consumed downstream |
| `extract_special_funds` | Extracts 19 special/trust fund PDFs | **Unused** — output not consumed downstream |
| `extract_full_pdf` | Wrapper around spatial table extractor | Used indirectly — produces regression baselines |

### How data actually flows

The web app's pipeline is entirely:

```
regression expected CSVs + glossary.json
  → scripts/build_web_data.py
    → web/public/data/*.json
      → Astro site
```

The 5 dedicated workflows were early explorations. The spatial table extractor replaced them by extracting *all* tables from the full budget PDF. Their outputs sit in `output/` but nothing reads them.

### Decision needed

**Archive or delete the unused workflows?** They represent significant work but are functionally dead code. Options:
1. Delete them (git history preserves the work)
2. Move to an `archive/` directory
3. Keep but clearly mark as unused

## Scripts

| Script | Status | Purpose |
|--------|--------|---------|
| `build_web_data.py` | **Active** | Main pipeline: regression CSVs → web JSON bundles |
| `test_regression.py` | **Active** | Compares extractor output against expected baselines |
| `split_pdf.py` | **Active** | Splits full budget PDFs by section definitions |
| `render_page_images.py` | **Active** | Generates PNG page images for web app |
| `extract_chart_images.py` | **Active** | Crops chart regions from PDFs |
| `batch_validate.py` | **Support** | Batch-runs extractor, flags tables needing review |
| `llm_judge.py` | **Support** | Claude-based extraction accuracy evaluation |
| `judge_content.py` | **Support** | Claude-based non-table content evaluation |
| `render_judge_images.py` | **Support** | Renders images for LLM judging |
| `derive_sections.py` | **Support** | Detects section boundaries in full PDF |
| `detect_sections.py` | **Support** | Detects section headers in regression CSVs |

## Output directory

```
output/
├── extract_expenditure_tables/   # Unused
├── extract_revenue_tables/       # Unused
├── extract_financial_forecast/   # Unused
├── extract_grants/               # Unused
├── extract_special_funds/        # Unused
├── extract_full_pdf/             # 2026-operating-budget.json (used?)
├── regression/
│   ├── expected/{operating,capital}/  # Active — web app source data
│   ├── debug/                         # Active — regenerated during dev
│   └── judge_images/                  # Support — LLM evaluation
├── glossary/                     # Active — glossary.json for web app
└── table-descriptions.json       # Status unclear
```

## Multi-year concerns

### 1. Input organization
Currently all inputs assume a single budget year:
- `input/2026-operating-budget.pdf`, `input/2026-capital-budget.pdf`
- `input/sections-operating.json`, `input/sections-capital.json`
- `input/split-pdf/{operating,capital}/`

For multi-year, inputs need year namespacing: `input/{year}/` or `input/2025-operating-budget.pdf` with `input/sections-operating-2025.json`.

### 2. Output organization
Regression baselines are currently `output/regression/expected/{operating,capital}/{pdf_stem}/`. Adding 2025 means either:
- `output/regression/expected/{year}/{budget_type}/{pdf_stem}/`
- `output/regression/expected/{budget_type}/{year}/{pdf_stem}/`

This ripples through `test_regression.py` and `build_web_data.py`.

### 3. Column alignment
The 2026 document contains: `2024 Actual | 2025 Budget | 2026 Proposed`
The 2025 document likely contains: `2023 Actual | 2024 Budget | 2025 Proposed`

Overlapping data points (e.g., 2024 values appear in both) can validate extraction accuracy but also surface real differences (proposed vs. adopted figures).

### 4. Web app
`build_web_data.py` is 64KB and assumes a single year. The Astro site's components, routes, and data shapes all assume one budget year. Multi-year adds:
- Year selector UI
- Cross-year comparison views
- Larger data bundles (or split by year)

## Documentation state

### Root-level ad-hoc files
| File | Content | Recommendation |
|------|---------|----------------|
| `PLAN.md` | Extractor issues analysis (3 resolved, 3 remaining) | Move to `docs/decisions/` or `docs/notes/` |
| `TODO.md` | QA efficiency improvements | Move to `docs/plans/` or delete if stale |
| `NOTES.md` | Historical data challenges | Move to `docs/notes/` |
| `BLOG-NOTES.md` | Blog post ideas | Move to `docs/notes/` |
| `TABLES.md` | Overview of 164 extracted tables | Move to `docs/` |

### docs/ structure
Currently:
- `docs/plans/` — 5 design documents (good)
- `docs/notes/` — 1 research note (underused)
- No decisions record, no ADRs, no changelog
