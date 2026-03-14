"""Use Claude as a judge to evaluate extracted table accuracy against source PDF pages.

Reads status.json to skip verified/known_issue tables. Only evaluates 'unverified' tables.
Use --mark to update table statuses after review.
"""

import argparse
import asyncio
import base64
import csv
import io
import json
import sys
from pathlib import Path

import anthropic
import fitz  # PyMuPDF

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

INPUT_DIRS = ["input/split-pdf"]

JUDGE_PROMPT = """\
You are evaluating the accuracy of a table extracted from a budget PDF page.

Below is a CSV representing the extracted table data. Compare it against the table
visible in the attached PDF page image.

CSV content:
```
{csv_content}
```

Evaluate the following:
1. **Completeness**: Are all rows from the source table present in the CSV? Any missing?
2. **Values**: Do the numbers and text match exactly? Flag any mismatches.
3. **Structure**: Are columns aligned correctly? Are any values shifted to the wrong column?
4. **Headers**: Does the CSV header row match the table headers in the PDF?

Respond with EXACTLY this format:
VERDICT: PASS or FAIL
ISSUES: (if FAIL, list each issue on its own line prefixed with "- "; if PASS, write "None")
"""


def find_pdf(stem: str, project_root: Path) -> Path | None:
    """Find a PDF matching the stem across input directories."""
    for input_dir in INPUT_DIRS:
        candidates = list((project_root / input_dir).glob(f"*{stem}*.pdf"))
        if not candidates:
            candidates = list((project_root / input_dir).glob(f"*_{stem}.pdf"))
        for c in candidates:
            if stem in c.stem:
                return c
    return None


def load_status(project_root: Path) -> dict:
    """Load the status manifest."""
    path = project_root / "output" / "regression" / "status.json"
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return {}


def save_status(project_root: Path, status: dict) -> None:
    """Save the status manifest."""
    path = project_root / "output" / "regression" / "status.json"
    with open(path, "w") as f:
        json.dump(status, f, indent=2)
    print(f"Updated {path}")


def render_page_image(pdf_path: Path, page_idx: int, dpi: int = 150) -> bytes:
    """Render a single PDF page as a PNG image and return raw bytes."""
    doc = fitz.open(str(pdf_path))
    page = doc[page_idx]
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat)
    png_bytes = pix.tobytes("png")
    doc.close()
    return png_bytes


def load_csv_content(path: Path) -> str:
    """Load CSV file as string, skipping the first metadata header row."""
    with open(path) as f:
        rows = list(csv.reader(f))
    if not rows:
        return ""
    # Skip first row (column metadata like "C0 (l, x:57-238)")
    data_rows = rows[1:] if rows[0] and rows[0][0].startswith("C") else rows
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerows(data_rows)
    return buf.getvalue().strip()


def parse_table_tag(tag: str) -> tuple[int, int]:
    """Parse 'P2T1' into (page_index=2, table_index=1)."""
    parts = tag.replace("P", "").split("T")
    return int(parts[0]), int(parts[1])


async def judge_table(
    client: anthropic.AsyncAnthropic,
    pdf_path: Path,
    csv_path: Path,
    model: str,
) -> dict:
    """Send a page image + CSV to Claude and get a verdict."""
    tag = csv_path.stem
    page_idx, _table_idx = parse_table_tag(tag)

    png_bytes = render_page_image(pdf_path, page_idx)
    b64_image = base64.standard_b64encode(png_bytes).decode("utf-8")

    csv_content = load_csv_content(csv_path)
    if not csv_content.strip():
        return {"tag": tag, "verdict": "SKIP", "issues": "Empty CSV"}

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
                        "text": JUDGE_PROMPT.format(csv_content=csv_content),
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
            verdict = "PASS" if "PASS" in v else "FAIL"
        elif line.startswith("ISSUES:"):
            issues = line.split(":", 1)[1].strip()
    # Capture multi-line issues
    if "ISSUES:" in text:
        issues_block = text.split("ISSUES:", 1)[1].strip()
        if issues_block and issues_block != "None":
            issues = issues_block

    return {"tag": tag, "verdict": verdict, "issues": issues}


async def judge_pdf(
    client: anthropic.AsyncAnthropic,
    stem: str,
    pdf_path: Path,
    expected_dir: Path,
    model: str,
    status: dict,
) -> list[dict]:
    """Judge unverified tables for a single PDF concurrently."""
    csv_files = sorted(expected_dir.glob("P*T*.csv"))
    if not csv_files:
        return []

    tasks = []
    skipped: list[dict] = []
    for csv_path in csv_files:
        key = f"{stem}/{csv_path.stem}"
        entry = status.get(key, {})
        table_status = entry.get("status", "unverified")

        if table_status in ("verified", "known_issue"):
            skipped.append({
                "tag": csv_path.stem,
                "verdict": f"SKIP ({table_status})",
                "issues": entry.get("note", ""),
            })
        else:
            tasks.append(judge_table(client, pdf_path, csv_path, model))

    judged = await asyncio.gather(*tasks) if tasks else []
    return list(judged) + skipped


async def run(
    stems: list[str] | None,
    project_root: Path,
    model: str,
    concurrency: int,
) -> bool:
    """Run the LLM judge across all (or selected) PDFs."""
    expected_root = project_root / "output" / "regression" / "expected"
    status = load_status(project_root)

    if stems is None:
        stems = sorted(
            d.name for d in expected_root.iterdir()
            if d.is_dir() and any(d.glob("P*T*.csv"))
        )

    import os
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ERROR: Set ANTHROPIC_API_KEY environment variable to use the LLM judge.")
        print("  export ANTHROPIC_API_KEY=sk-ant-...")
        sys.exit(1)

    client = anthropic.AsyncAnthropic()
    semaphore = asyncio.Semaphore(concurrency)

    all_results: list[tuple[str, list[dict]]] = []

    async def judge_with_limit(stem: str) -> tuple[str, list[dict]]:
        async with semaphore:
            pdf_path = find_pdf(stem, project_root)
            if not pdf_path:
                print(f"WARNING: PDF not found for {stem}")
                return stem, []
            return stem, await judge_pdf(client, stem, pdf_path, expected_root / stem, model, status)

    tasks = [judge_with_limit(s) for s in stems]
    all_results = await asyncio.gather(*tasks)

    # Report
    total_pass = 0
    total_fail = 0
    total_skip = 0
    failures: list[tuple[str, dict]] = []

    for stem, results in all_results:
        if not results:
            continue

        judged = [r for r in results if not r["verdict"].startswith("SKIP")]
        skipped = [r for r in results if r["verdict"].startswith("SKIP")]

        stem_pass = sum(1 for r in judged if r["verdict"] == "PASS")
        stem_fail = sum(1 for r in judged if r["verdict"] == "FAIL")

        if judged:
            status_str = "PASS" if stem_fail == 0 else "FAIL"
            print(f"  {status_str} {stem} ({stem_pass} pass, {stem_fail} fail, {len(skipped)} skipped)")
        elif skipped:
            print(f"  SKIP {stem} (all {len(skipped)} tables already verified/known)")

        for r in judged:
            if r["verdict"] == "FAIL":
                failures.append((stem, r))
        total_pass += stem_pass
        total_fail += stem_fail
        total_skip += len(skipped)

    print(f"\nJudged: {total_pass} pass, {total_fail} fail | Skipped: {total_skip} (verified/known)")

    if failures:
        print("\n--- Failures ---")
        for stem, r in failures:
            print(f"\n{stem} / {r['tag']}:")
            print(f"  {r['issues']}")

    return total_fail == 0


def cmd_mark(args: argparse.Namespace) -> None:
    """Mark tables with a status in the manifest."""
    project_root = Path(__file__).resolve().parent.parent
    status = load_status(project_root)
    expected_root = project_root / "output" / "regression" / "expected"

    targets: list[str] = []
    for spec in args.tables:
        if "/" in spec:
            # Specific table: "stem/PxTy"
            targets.append(spec)
        else:
            # Whole PDF stem: mark all tables
            stem_dir = expected_root / spec
            if stem_dir.is_dir():
                for csv_file in sorted(stem_dir.glob("P*T*.csv")):
                    targets.append(f"{spec}/{csv_file.stem}")
            else:
                print(f"WARNING: No expected dir for {spec}")

    if not targets:
        print("No matching tables found.")
        return

    for key in targets:
        old = status.get(key, {}).get("status", "unverified")
        status[key] = {"status": args.status, "note": args.note or ""}
        print(f"  {key}: {old} -> {args.status}")

    save_status(project_root, status)
    print(f"Marked {len(targets)} table(s) as '{args.status}'.")


def cmd_status(args: argparse.Namespace) -> None:
    """Show current status summary."""
    project_root = Path(__file__).resolve().parent.parent
    status = load_status(project_root)
    expected_root = project_root / "output" / "regression" / "expected"

    # Count all tables
    all_tables = sorted(
        f"{p.parent.name}/{p.stem}"
        for p in expected_root.rglob("P*T*.csv")
    )

    counts: dict[str, int] = {"verified": 0, "unverified": 0, "known_issue": 0}
    for key in all_tables:
        s = status.get(key, {}).get("status", "unverified")
        counts[s] = counts.get(s, 0) + 1

    print(f"Total tables: {len(all_tables)}")
    for s, n in sorted(counts.items()):
        print(f"  {s}: {n}")

    # Show known issues
    known = [(k, v) for k, v in status.items() if v.get("status") == "known_issue"]
    if known:
        print(f"\nKnown issues ({len(known)}):")
        for k, v in sorted(known):
            print(f"  {k}: {v.get('note', '')}")

    # Show unverified
    unverified = [k for k in all_tables if status.get(k, {}).get("status", "unverified") == "unverified"]
    if unverified:
        print(f"\nUnverified ({len(unverified)}):")
        for k in unverified:
            print(f"  {k}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="LLM-as-judge evaluation of extracted tables with confidence tracking."
    )
    subparsers = parser.add_subparsers(dest="command")

    # Default: judge
    judge_parser = subparsers.add_parser("judge", help="Run LLM judge on unverified tables")
    judge_parser.add_argument("stems", nargs="*", default=None, help="PDF stems to evaluate (default: all)")
    judge_parser.add_argument("--model", default="claude-sonnet-4-6", help="Claude model to use")
    judge_parser.add_argument("--concurrency", type=int, default=5, help="Max concurrent API calls")
    judge_parser.add_argument("--all", action="store_true", dest="judge_all",
                              help="Judge all tables, ignoring status (re-audit)")
    judge_parser.add_argument("--dry-run", action="store_true",
                              help="List tables that would be evaluated without calling the API")

    # mark
    mark_parser = subparsers.add_parser("mark", help="Update table status in manifest")
    mark_parser.add_argument("tables", nargs="+", help="Table keys (stem/PxTy) or stems to mark all")
    mark_parser.add_argument("--status", required=True,
                             choices=["verified", "unverified", "known_issue"],
                             help="Status to set")
    mark_parser.add_argument("--note", default="", help="Note (required for known_issue)")

    # status
    subparsers.add_parser("status", help="Show status summary")

    args = parser.parse_args()

    if args.command == "mark":
        cmd_mark(args)
        return

    if args.command == "status":
        cmd_status(args)
        return

    # Default to judge (also handles no subcommand for backward compat)
    project_root = Path(__file__).resolve().parent.parent

    # Handle backward compat: no subcommand
    if args.command is None:
        # Re-parse with judge defaults
        args.stems = None
        args.model = "claude-sonnet-4-6"
        args.concurrency = 5
        args.judge_all = False
        args.dry_run = False

    stems = args.stems if args.stems else None

    if args.dry_run:
        expected_root = project_root / "output" / "regression" / "expected"
        status = load_status(project_root)
        if stems is None:
            stems = sorted(
                d.name for d in expected_root.iterdir()
                if d.is_dir() and any(d.glob("P*T*.csv"))
            )
        total = 0
        total_skip = 0
        for stem in stems:
            csv_files = sorted((expected_root / stem).glob("P*T*.csv"))
            pdf_path = find_pdf(stem, project_root)
            pdf_label = f"({pdf_path.name})" if pdf_path else "(PDF NOT FOUND)"

            if args.judge_all:
                to_judge = len(csv_files)
                to_skip = 0
            else:
                to_judge = sum(
                    1 for f in csv_files
                    if status.get(f"{stem}/{f.stem}", {}).get("status", "unverified") == "unverified"
                )
                to_skip = len(csv_files) - to_judge

            if to_judge > 0:
                print(f"  {stem} {pdf_label}: {to_judge} to judge, {to_skip} skipped")
                total += to_judge
            total_skip += to_skip
        print(f"\nWould evaluate {total} tables ({total_skip} skipped as verified/known).")
        return

    passed = asyncio.run(run(stems, project_root, args.model, args.concurrency))
    if not passed:
        sys.exit(1)


if __name__ == "__main__":
    main()
