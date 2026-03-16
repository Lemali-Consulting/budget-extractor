# Journalism-Friendly Features for PublicSource

**Date:** 2026-03-16
**Status:** completed

## Goal

Transform the budget explorer from a data-research tool into something that also serves journalism: embeddable charts for articles, a plain-language "Budget in Brief" overview, simplified department one-pagers, and curated story pages that highlight the most newsworthy findings. Motivated by feedback from Rich Lord (Managing Editor, PublicSource): "not sure I'm easily able to see how to get from your thorough-and-granular product to a layperson-friendly presentation."

## Current State

The app has ~120 pages of detailed budget data: department sections with full extracted tables, a changes analysis page, cross-year comparison, personnel explorer, and interactive dashboard. All charts use Observable Plot rendered client-side in Preact islands. The data layer is comprehensive (budget changes, personnel, revenue, capital funding, department budgets, forecasts). But every page assumes the reader wants to explore — there's no guided, narrative layer.

## Feature 1: Embeddable Charts

### What
Standalone chart pages that render a single chart with minimal chrome, suitable for `<iframe>` embedding in PublicSource articles. Each embed URL produces a self-contained, responsive chart with an optional source attribution link back to the full explorer.

### Approach

1. **New Astro layout: `Embed.astro`** — Minimal HTML shell: no header, no footer, no nav. Just a white background, the chart, and a small "Source: Pittsburgh Budget Explorer" footer link. Accepts a `title` prop for accessibility.

2. **Embed pages at `/embed/[chart-name]/`** — One Astro page per embeddable chart. Each page imports the relevant Preact chart component and wraps it in the Embed layout. Initial set:
   - `/embed/budget-increases/` — Top budget increases bar chart
   - `/embed/budget-decreases/` — Top budget decreases bar chart
   - `/embed/revenue-breakdown/` — Revenue waterfall
   - `/embed/department-comparison/` — Top departments by budget
   - `/embed/capital-funding/` — Capital funding sources by year
   - `/embed/personnel-changes/` — FTE changes by department (new chart)
   - `/embed/spending-pie/` — Where the money goes (new donut/treemap chart)

3. **Query parameter support** — `?height=400&width=600` to let newsrooms control iframe dimensions. The embed page reads these and passes to the chart container.

4. **Copy-embed snippet** — On the full site, each chart that has an embed version gets a small "Embed" button that shows an `<iframe>` code snippet ready to paste.

5. **Chart image export** — Add a "Download PNG" button to each embed page using `html2canvas` or Observable Plot's built-in SVG export. Newsrooms that can't use iframes can use static images.

### Files

- `web/src/layouts/Embed.astro` — new minimal layout
- `web/src/pages/embed/budget-increases.astro` — new (and similar for each chart)
- `web/src/components/EmbedWrapper.tsx` — new shared wrapper (attribution link, resize handling, PNG export button)
- `web/src/components/SpendingPieChart.tsx` — new chart: "where the money goes" treemap/donut
- `web/src/components/PersonnelChangesChart.tsx` — new chart: FTE changes by department
- Existing chart components (ChangesChart, WaterfallChart, BudgetChart, FundingSourceChart) — minor edits to accept an `embed` prop that hides internal padding/borders

## Feature 2: Budget in Brief

### What
A single narrative page (`/brief/`) that answers 5-6 questions a Pittsburgh resident would ask, each with one chart and 2-3 sentences of plain-language explanation. The goal is a page you could hand to someone who's never seen a budget document and they'd walk away informed.

### Sections

1. **How big is the budget?** — Total operating budget figure, comparison to prior year. Simple single-number hero with context ("That's about $X per resident" using Census population).
2. **Where does the money come from?** — Revenue waterfall chart. Key callout: tax revenue is X% of total.
3. **Where does the money go?** — Top 10 departments as horizontal bars or treemap. Key callout: Public Safety (Fire + Police + EMS) is X% of total.
4. **What changed this year?** — Top 3 increases and top 3 decreases, shown as a simple diverging bar chart. One sentence per major change explaining *why* (from narrative text in budget document).
5. **Who works for the city?** — Total FTE count, biggest departments by headcount. Key callout: X new positions, Y eliminated.
6. **What about big projects?** — Capital budget total, 2-3 highlighted projects with dollar amounts.

### Approach

1. **New data view: `brief-data.json`** — A Python build script computes the pre-digested data: per-resident figures, public safety rollup, top-N lists, etc. Narrative captions are stored in a companion `brief-captions.json` that's hand-edited (not auto-generated).

2. **New Astro page: `web/src/pages/brief.astro`** — Card-based layout, one section per question. Each section has:
   - A question as the heading ("Where does the money go?")
   - 2-3 sentences of plain-language explanation
   - One chart (reusing existing components where possible, new simplified ones where needed)
   - An optional "Explore further →" link to the detailed page

3. **Simplified chart variants** — Some existing charts are too detailed for this context. Create simplified wrappers:
   - `SimpleBars.tsx` — Horizontal bars with labels, no axes, no ticks. Just bars + values. Max 8 items.
   - Reuse `WaterfallChart` and `ChangesChart` as-is (they're already clean).

4. **Shareable** — Each section gets an anchor ID so you can link to `/brief/#where-money-goes`. Add Open Graph meta for social sharing.

### Files

- `scripts/build_brief_data.py` — new script to compute brief-specific aggregations
- `web/src/data/views/brief-data.json` — generated
- `web/src/data/views/brief-captions.json` — hand-edited narrative captions
- `web/src/pages/brief.astro` — new page
- `web/src/components/SimpleBars.tsx` — new simplified bar chart
- `web/src/components/HeroStat.tsx` — new large-number display component

## Feature 3: Department One-Pagers

### What
A simplified, print-friendly summary of a single department: total budget, headcount, top line items, year-over-year change. Designed for beat reporters covering specific departments or for sharing at community meetings.

### Approach

1. **New route: `/departments/[slug]/`** — One page per department, statically generated. Simpler and more focused than the existing `/sections/[slug]/` pages (which show every extracted table).

2. **Content per one-pager:**
   - Department name + one-sentence description (from budget narrative, first paragraph)
   - Hero stats: 2026 budget, YoY change, FTE count, YoY FTE change
   - Top 5 expenditure line items (from the financial summary table)
   - Trend mini-chart: 3-year budget trend (2024 Actual → 2025 Budget → 2026 Budget)
   - Position changes: new/eliminated positions in this department (if any)
   - "View full detail →" link to the existing section page

3. **New data view: `department-summaries.json`** — Build script that, for each department, pulls:
   - Budget totals from `department-budgets.json`
   - Personnel data from `personnel.json`
   - Top line items from the financial tables in `budget-data.json`
   - Narrative excerpt from the section's leading text
   - Position changes from `budget-changes.json`

4. **Print stylesheet** — Optimize for A4/letter printing: single page, no nav, larger fonts for stats. Use `@media print` rules (extending existing print styles in `global.css`).

5. **PDF export** — "Download PDF" button using `window.print()` (browser's built-in print-to-PDF with the print stylesheet).

### Files

- `scripts/build_department_summaries.py` — new script
- `web/src/data/views/department-summaries.json` — generated
- `web/src/pages/departments/[slug].astro` — new dynamic route
- `web/src/pages/departments/index.astro` — new index listing all departments
- `web/src/components/TrendMini.tsx` — new small sparkline-style trend chart
- `web/src/styles/global.css` — extend print styles for one-pager layout

## Feature 4: Curated Story Pages

### What
Pre-built narrative pages that tell a specific story, like "5 Biggest Changes in the 2026 Budget" or "Where Your Tax Dollar Goes." Each page pairs charts with editorial context. Unlike the Brief (which is a fixed overview), story pages are specific angles that a journalist might pitch as a standalone article.

### Approach

1. **Content collection for stories** — Use Astro's content collections to define story pages as Markdown files with frontmatter. This lets you (or a journalist) write the narrative in Markdown while the build system handles chart insertion.

2. **Story template with chart slots** — A custom Astro layout that renders Markdown narrative with embedded chart components at designated insertion points. Frontmatter specifies which charts to include and in what order.

3. **Initial story set:**
   - **"5 Biggest Budget Shifts"** — Top increases and decreases with context on why each changed
   - **"Where Your Tax Dollar Goes"** — $1 broken down across departments (computed: each dept's share of total as cents per dollar)
   - **"The City's Workforce"** — Staffing trends, new positions, what they reveal about priorities
   - **"Capital Plan: What's Getting Built"** — Highlighted capital projects with dollar amounts and timelines

4. **Each story page includes:**
   - Headline + subhead
   - Author/source attribution ("Data analysis by Pittsburgh Budget Explorer")
   - 3-5 sections, each with a chart and 1-2 paragraphs
   - "Methodology" collapsible at the bottom
   - Shareable Open Graph metadata with a custom description

5. **Story index page at `/stories/`** — Card layout showing available stories with thumbnails.

### Files

- `web/src/content/stories/` — Markdown files for each story (Astro content collection)
- `web/src/content/config.ts` — content collection schema definition
- `web/src/pages/stories/index.astro` — story index page
- `web/src/pages/stories/[...slug].astro` — dynamic story page renderer
- `web/src/layouts/Story.astro` — story-specific layout (minimal header, reading-friendly typography)
- `web/src/components/TaxDollarChart.tsx` — new: "your tax dollar" breakdown
- `scripts/build_tax_dollar.py` — compute per-dollar breakdown data
- `web/src/data/views/tax-dollar.json` — generated

## Implementation Order

```
Phase 1: Embeddable Charts                    [~2 sessions]
  ├── Embed.astro layout + EmbedWrapper component
  ├── Embed pages for existing charts (5 pages)
  ├── New charts (SpendingPie, PersonnelChanges)
  ├── "Embed" button + copy snippet on main site
  └── PNG download support

Phase 2: Budget in Brief                      [~2 sessions]
  ├── build_brief_data.py + brief-data.json
  ├── brief-captions.json (hand-written)
  ├── SimpleBars + HeroStat components
  ├── brief.astro page
  └── Open Graph / social sharing

Phase 3: Department One-Pagers                [~2 sessions]
  ├── build_department_summaries.py
  ├── TrendMini component
  ├── departments/[slug].astro + index
  └── Print stylesheet + PDF export

Phase 4: Curated Stories                      [~2 sessions]
  ├── Content collection setup
  ├── Story layout + chart slot system
  ├── build_tax_dollar.py + data
  ├── Write initial 4 stories
  └── Stories index page

Phase 5: Navigation + Polish                  [~1 session]
  ├── Add "For Journalists" section to nav or home page
  ├── Update About page with embed instructions
  ├── Smoke tests for new routes
  └── Deploy
```

Phases 1 and 2 are independent and could be parallelized. Phase 3 depends slightly on Phase 2 (shared components like HeroStat). Phase 4 depends on Phase 1 (stories embed the embeddable charts).

## Navigation Changes

Add a secondary nav grouping or a prominent "For Journalists" entry point:

```
Current nav:  What Changed | Proposed vs Adopted | Operating | Capital | ...
Proposed:     What Changed | Proposed vs Adopted | Operating | Capital | ...
              Budget in Brief | Stories | Departments     ← new "public-facing" group
```

Alternatively, the Brief and Stories could be promoted to top-level nav items, since they're likely the most useful pages for the general public. The existing nav is already getting crowded, so this may warrant a nav redesign (hamburger menu or two-tier nav).

## Open Questions

1. **Narrative captions** — Who writes the plain-language explanations for the Brief and Story pages? Auto-generating them is possible (LLM) but may produce generic text. Hand-written by someone who understands Pittsburgh politics would be better. Could start with LLM drafts and have Rich or the user edit.
2. **Which stories first?** — The initial 4 stories are a guess at what's newsworthy. Rich Lord's input on what angles PublicSource would actually run would be valuable.
3. **Embed hosting guarantees** — If PublicSource embeds our charts, they need the URLs to be stable. Currently the site deploys on Netlify from manual pushes. Need to ensure embed URLs don't break across deploys.
4. **Branding** — Should embed charts carry PublicSource branding, Pittsburgh Budget Explorer branding, or co-branding? The attribution link approach (small "Source: PGH Budget Explorer" at bottom) is the default proposal.
5. **Nav restructuring** — The nav already has 9+ items. Adding Brief, Stories, and Departments pushes it further. Need to decide: two-tier nav, dropdown menu, or separate "public" vs "expert" entry points?

## Risks

- **Scope creep** — Four features is a lot. The highest-value items for Rich Lord are probably embeds and the Brief. Consider shipping those first and getting feedback before investing in one-pagers and stories.
- **Narrative quality** — Charts without good captions are just more data. The Brief and Stories pages live or die on the quality of the plain-language writing, which is editorial work, not engineering.
- **Embed stability** — If chart component APIs change, embed URLs could break for sites that have already embedded them. Need to treat embed URLs as a public API with backward-compatibility guarantees.
- **Print layout fragility** — CSS print stylesheets are notoriously finicky across browsers. The one-pager print feature may need significant testing.
