"""Use Claude as a judge to evaluate extracted non-table content (text blocks, charts)
against source PDF pages.

Renders each page as an image and compares the content JSON against what's visible.
"""

import asyncio
import base64
import json
import sys
from pathlib import Path

import anthropic
import fitz  # PyMuPDF

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from utils.paths import available_years, split_pdf_dir

JUDGE_PROMPT = """\
You are evaluating the accuracy of non-table content extracted from a budget PDF page.

Below is a JSON representing the extracted text blocks and chart/image regions. Compare
it against the attached PDF page image.

Extracted content:
```json
{content_json}
```

Evaluate the following:

1. **Text completeness**: Is all visible non-table text on the page represented in the
   extracted text_blocks? Look for department descriptions, section titles, footnotes,
   bullet points, and any narrative paragraphs. Flag any text that appears on the page
   but is NOT in the extraction.

2. **Role accuracy**: Are the role labels reasonable?
   - "page_header" should be repeated header text (e.g., "City of Pittsburgh", "Fiscal Year 2026")
   - "section_title" should be standalone section/subsection headings
   - "leading_prose" / "trailing_prose" should be narrative paragraphs near tables
   - "footnote" should be small annotations or disclaimers
   - "page_number" should be the page number
   Note: on pages that are mostly prose with no tables, it is acceptable for body text
   to be labeled as "section_title" — this is a known limitation.

3. **Chart/image detection**: If there are any charts, graphs, logos, or significant
   images visible on the page, are they represented in chart_regions? Small decorative
   elements can be ignored.

4. **False positives**: Is any extracted text NOT actually on the page (hallucinated)?

Respond with EXACTLY this format:
VERDICT: PASS, MINOR, or FAIL
ISSUES: (list each issue on its own line prefixed with "- "; write "None" if PASS)

Use PASS if extraction is complete and accurate.
Use MINOR if there are small labeling issues but all text content is captured.
Use FAIL if significant text is missing, text is hallucinated, or charts are undetected.
"""


def find_pdf(stem: str) -> Path | None:
    """Find a PDF matching the stem across budget types and years."""
    for year in available_years():
        for budget_type in ("operating", "capital"):
            pdf_dir = split_pdf_dir(year, budget_type)
            if not pdf_dir.exists():
                continue
            candidates = list(pdf_dir.glob(f"*{stem}*.pdf"))
            if not candidates:
                candidates = list(pdf_dir.glob(f"*_{stem}.pdf"))
            for c in candidates:
                if stem in c.stem:
                    return c
    return None


def render_page_image(pdf_path: Path, page_idx: int, dpi: int = 150) -> bytes:
    """Render a single PDF page as a PNG image and return raw bytes."""
    doc = fitz.open(str(pdf_path))
    page = doc[page_idx]
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat)
    png_bytes = pix.tobytes("png")
    doc.close()
    return png_bytes


async def judge_page(
    client: anthropic.AsyncAnthropic,
    pdf_path: Path,
    content_path: Path,
    model: str,
) -> dict:
    """Send a page image + content JSON to Claude and get a verdict."""
    tag = content_path.stem.replace(".content", "")
    page_idx = int(tag.replace("P", ""))

    with open(content_path) as f:
        content_data = json.load(f)

    # Format content JSON compactly for the prompt
    content_json = json.dumps(content_data, indent=2)

    png_bytes = render_page_image(pdf_path, page_idx)
    b64_image = base64.standard_b64encode(png_bytes).decode("utf-8")

    response = await client.messages.create(
        model=model,
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": b64_image,
                        },
                    },
                    {
                        "type": "text",
                        "text": JUDGE_PROMPT.format(content_json=content_json),
                    },
                ],
            }
        ],
    )

    text = response.text
    verdict = "UNKNOWN"
    issues = ""

    for line in text.splitlines():
        if line.startswith("VERDICT:"):
            v = line.split(":", 1)[1].strip().upper()
            if "PASS" in v:
                verdict = "PASS"
            elif "MINOR" in v:
                verdict = "MINOR"
            elif "FAIL" in v:
                verdict = "FAIL"
    if "ISSUES:" in text:
        issues = text.split("ISSUES:", 1)[1].strip()

    return {"tag": tag, "verdict": verdict, "issues": issues}


async def judge_pdf(
    client: anthropic.AsyncAnthropic,
    stem: str,
    pdf_path: Path,
    debug_dir: Path,
    model: str,
    semaphore: asyncio.Semaphore,
) -> list[dict]:
    """Judge content extraction for all pages of a single PDF."""
    content_files = sorted(debug_dir.glob("P*.content.json"))
    if not content_files:
        return []

    async def _judge(content_path: Path) -> dict:
        async with semaphore:
            return await judge_page(client, pdf_path, content_path, model)

    tasks = [_judge(f) for f in content_files]
    return list(await asyncio.gather(*tasks))


async def run(
    stems: list[str] | None,
    project_root: Path,
    model: str,
    concurrency: int,
    sample: int | None = None,
) -> bool:
    """Run the content judge across all (or selected) PDFs."""
    debug_root = project_root / "output" / "regression" / "debug"

    if stems is None:
        stems = sorted(
            d.name for d in debug_root.iterdir()
            if d.is_dir() and any(d.glob("P*.content.json"))
        )

    import os
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ERROR: Set ANTHROPIC_API_KEY environment variable.")
        sys.exit(1)

    client = anthropic.AsyncAnthropic()
    semaphore = asyncio.Semaphore(concurrency)

    # Optionally sample a subset
    if sample and sample < len(stems):
        import random
        random.seed(42)
        stems = sorted(random.sample(stems, sample))
        print(f"Sampling {sample} PDFs: {', '.join(stems[:5])}{'...' if len(stems) > 5 else ''}")

    total_pass = 0
    total_minor = 0
    total_fail = 0
    failures: list[tuple[str, dict]] = []
    minors: list[tuple[str, dict]] = []

    for stem in stems:
        pdf_path = find_pdf(stem)
        if not pdf_path:
            print(f"  SKIP {stem} (PDF not found)")
            continue

        debug_dir = debug_root / stem
        results = await judge_pdf(client, stem, pdf_path, debug_dir, model, semaphore)
        if not results:
            continue

        n_pass = sum(1 for r in results if r["verdict"] == "PASS")
        n_minor = sum(1 for r in results if r["verdict"] == "MINOR")
        n_fail = sum(1 for r in results if r["verdict"] == "FAIL")

        status = "PASS" if n_fail == 0 and n_minor == 0 else "MINOR" if n_fail == 0 else "FAIL"
        print(f"  {status} {stem} ({n_pass} pass, {n_minor} minor, {n_fail} fail)")

        for r in results:
            if r["verdict"] == "FAIL":
                failures.append((stem, r))
            elif r["verdict"] == "MINOR":
                minors.append((stem, r))

        total_pass += n_pass
        total_minor += n_minor
        total_fail += n_fail

    print(f"\nResults: {total_pass} pass, {total_minor} minor, {total_fail} fail")

    if minors:
        print(f"\n--- Minor issues ({len(minors)}) ---")
        for stem, r in minors:
            print(f"\n{stem} / {r['tag']}:")
            print(f"  {r['issues'][:200]}")

    if failures:
        print(f"\n--- Failures ({len(failures)}) ---")
        for stem, r in failures:
            print(f"\n{stem} / {r['tag']}:")
            print(f"  {r['issues'][:200]}")

    return total_fail == 0


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="LLM judge for non-table content extraction (text blocks, charts)."
    )
    parser.add_argument("stems", nargs="*", default=None,
                        help="PDF stems to evaluate (default: all with content.json)")
    parser.add_argument("--model", default="claude-sonnet-4-6",
                        help="Claude model to use")
    parser.add_argument("--concurrency", type=int, default=5,
                        help="Max concurrent API calls")
    parser.add_argument("--sample", type=int, default=None,
                        help="Randomly sample N PDFs instead of running all")
    parser.add_argument("--dry-run", action="store_true",
                        help="List pages that would be evaluated")

    args = parser.parse_args()
    project_root = Path(__file__).resolve().parent.parent

    if args.dry_run:
        debug_root = project_root / "output" / "regression" / "debug"
        stems = args.stems or sorted(
            d.name for d in debug_root.iterdir()
            if d.is_dir() and any(d.glob("P*.content.json"))
        )
        total = 0
        for stem in stems:
            content_files = sorted((debug_root / stem).glob("P*.content.json"))
            if content_files:
                print(f"  {stem}: {len(content_files)} pages")
                total += len(content_files)
        print(f"\nWould evaluate {total} pages across {len(stems)} PDFs.")
        return

    stems = args.stems if args.stems else None
    passed = asyncio.run(run(stems, project_root, args.model, args.concurrency, args.sample))
    if not passed:
        sys.exit(1)


if __name__ == "__main__":
    main()
