# Multi-Year Input/Output Reorganization

**Date:** 2026-03-15
**Status:** completed

## Goal

Reorganize the input and output directory structures to support multiple budget years (starting with 2025 + 2026), namespaced by year at the top level.

## Current State

Everything implicitly assumes "2026" as the only budget year:

```
input/
├── 2026-operating-budget.pdf
├── 2026-capital-budget.pdf
├── sections-operating.json        # no year namespace
├── sections-capital.json          # no year namespace
└── split-pdf/
    ├── operating/                 # no year namespace
    └── capital/

output/
├── regression/expected/
│   ├── operating/{pdf_stem}/      # no year namespace
│   └── capital/{pdf_stem}/
├── regression/debug/{pdf_stem}/
└── glossary/glossary.json
```

Scripts with hardcoded paths:
- `split_pdf.py` — `BUDGET_TYPES` dict maps to specific 2026 PDFs and unversioned section JSONs
- `test_regression.py` — `INPUT_DIRS` list points to unversioned `input/split-pdf/{type}`
- `build_web_data.py` — constants point to unversioned regression expected dirs and `2026-operating-budget.pdf`
- `render_page_images.py`, `extract_chart_images.py`, `batch_validate.py`, `llm_judge.py`, `judge_content.py`, `render_judge_images.py` — also reference these paths

## Proposed Approach

### Target structure

```
input/
├── 2026/
│   ├── operating-budget.pdf
│   ├── capital-budget.pdf
│   ├── sections-operating.json
│   ├── sections-capital.json
│   └── split-pdf/
│       ├── operating/
│       └── capital/
├── 2025/
│   ├── operating-budget.pdf
│   ├── capital-budget.pdf
│   ├── sections-operating.json
│   ├── sections-capital.json
│   └── split-pdf/
│       ├── operating/
│       └── capital/

output/
├── regression/
│   ├── expected/
│   │   ├── 2026/
│   │   │   ├── operating/{pdf_stem}/
│   │   │   └── capital/{pdf_stem}/
│   │   └── 2025/
│   │       ├── operating/{pdf_stem}/
│   │       └── capital/{pdf_stem}/
│   └── debug/
│       ├── 2026/{pdf_stem}/
│       └── 2025/{pdf_stem}/
└── glossary/glossary.json          # shared across years
```

### Implementation steps

1. **Create `utils/paths.py`** — centralized path config
   - Functions: `project_root()`, `input_dir(year)`, `pdf_path(year, budget_type)`, `sections_path(year, budget_type)`, `split_pdf_dir(year, budget_type)`, `expected_dir(year, budget_type)`, `debug_dir(year)`, `glossary_path()`
   - All scripts import from here instead of maintaining their own constants

2. **Move input files into `input/2026/`**
   - `2026-operating-budget.pdf` → `input/2026/operating-budget.pdf`
   - `2026-capital-budget.pdf` → `input/2026/capital-budget.pdf`
   - `sections-operating.json` → `input/2026/sections-operating.json`
   - `sections-capital.json` → `input/2026/sections-capital.json`
   - `split-pdf/` → `input/2026/split-pdf/` (gitignored, just update .gitignore)

3. **Move regression expected into `output/regression/expected/2026/`**
   - `output/regression/expected/operating/` → `output/regression/expected/2026/operating/`
   - `output/regression/expected/capital/` → `output/regression/expected/2026/capital/`

4. **Update `scripts/split_pdf.py`**
   - Add `--year` argument (default: 2026)
   - Use `utils/paths.py` for all path derivation

5. **Update `scripts/test_regression.py`**
   - Scan `output/regression/expected/{year}/{type}/` (add year loop)
   - Find PDFs via `utils/paths.py`

6. **Update `scripts/build_web_data.py`**
   - Add year parameter or multi-year awareness
   - Replace hardcoded constants with `utils/paths.py` calls

7. **Update remaining scripts**
   - `render_page_images.py`, `extract_chart_images.py`, `batch_validate.py` — use `utils/paths.py`, add `--year`
   - `llm_judge.py`, `judge_content.py`, `render_judge_images.py` — use `utils/paths.py`, add `--year`

8. **Update CLAUDE.md** with new paths and conventions

9. **Update `.gitignore`** for new split-pdf location

10. **Update `.claude/commands/add-regression-pdf.md`** with new paths

11. **Run regression tests** to verify nothing broke

## Files Affected

- `utils/paths.py` — **new**, centralized path config
- `input/` — restructured with year directories
- `output/regression/expected/` — add year level
- `output/regression/debug/` — add year level
- `scripts/split_pdf.py` — use `utils/paths.py`, add `--year` arg
- `scripts/test_regression.py` — use `utils/paths.py`, scan year subdirs
- `scripts/build_web_data.py` — use `utils/paths.py`, year-aware
- `scripts/render_page_images.py` — use `utils/paths.py`, add `--year` arg
- `scripts/extract_chart_images.py` — use `utils/paths.py`, add `--year` arg
- `scripts/batch_validate.py` — use `utils/paths.py`, add `--year` arg
- `scripts/llm_judge.py` — use `utils/paths.py`, add `--year` arg
- `scripts/judge_content.py` — use `utils/paths.py`, add `--year` arg
- `scripts/render_judge_images.py` — use `utils/paths.py`, add `--year` arg
- `CLAUDE.md` — update path references
- `.gitignore` — update split-pdf pattern
- `.claude/commands/add-regression-pdf.md` — update paths

## Open Questions

All resolved — see `docs/decisions/2026-03-15-multi-year-directory-structure.md`.

## Risks

- Large number of file moves in `output/regression/expected/` (111 PDF directories) — must be done carefully with `git mv` to preserve history
- Scripts may have paths we missed — run regression tests after each step
- `.gitignore` patterns may need adjustment for new structure
