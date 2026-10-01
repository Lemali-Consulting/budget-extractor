"""Render clean PDF page images for the web app.

Produces one WebP per page of each section's split PDF.
Images go to web/public/{output_subdir}/{year}/{section_slug}/P{page}.webp.
Supports both operating and capital budget types.
"""

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from utils.paths import DEFAULT_YEAR, expected_dir, input_dir, sections_path, split_pdf_dir, variant_type

WEB_PUBLIC_ROOT = Path(__file__).parent.parent / "web" / "public"
DEFAULT_OUTPUT_SUBDIR: str = "pages"

DIR_PATTERN = re.compile(r"^(\d+)_(.+)$")
FILE_PATTERN = re.compile(r"^P(\d+)T\d+\.csv$")


def image_output_dir(*, output_subdir: str, year: int) -> Path:
    """Directory holding one year's page images: web/public/{output_subdir}/{year}."""
    return WEB_PUBLIC_ROOT / output_subdir / str(year)


def slugify(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


def normalize_page_text(text: str) -> str:
    """Collapse all whitespace runs to single spaces and trim, so two pages
    compare equal when only their layout whitespace differs."""
    return re.sub(r"\s+", " ", text).strip()


def page_changed(adopted_text: str, amended_text: str) -> bool:
    """True when two PDF pages differ in normalized text content."""
    return normalize_page_text(adopted_text) != normalize_page_text(amended_text)


def render_budget_type(
    budget_type: str, *, out_base: Path, year: int = DEFAULT_YEAR, variant: str = "adopted",
) -> int:
    """Render page images for a single budget type/variant. Returns total image count."""
    import fitz  # PyMuPDF

    subtype = variant_type(budget_type, variant)
    sections_file = sections_path(year, subtype)
    exp_dir = expected_dir(year, subtype)
    split_dir = split_pdf_dir(year, subtype)

    if not sections_file.exists():
        print(f"  SKIP {budget_type}: no sections file at {sections_file}")
        return 0

    with open(sections_file, encoding="utf-8") as f:
        sections_list = json.load(f)
    sections_lookup: dict[int, dict] = {}
    for i, s in enumerate(sections_list, start=1):
        sections_lookup[i] = s

    total_images = 0

    # Determine source directories: expected dir (if it exists) or split-pdf dir
    if exp_dir.exists():
        source_dirs = sorted(exp_dir.iterdir())
    else:
        # For budget types without expected CSVs, derive from split PDFs directly
        source_dirs = []

    # If we have expected dirs, use them to discover sections with tables
    if source_dirs:
        for dir_path in source_dirs:
            if not dir_path.is_dir():
                continue
            match = DIR_PATTERN.match(dir_path.name)
            if not match:
                continue

            section_num = int(match.group(1))
            section_info = sections_lookup.get(section_num, {})
            title = section_info.get("title", match.group(2).replace("_", " "))
            slug = slugify(title)

            # Find the split PDF
            found_pdf = None
            for candidate in split_dir.glob(f"*{dir_path.name}*.pdf"):
                if dir_path.name in candidate.stem:
                    found_pdf = candidate
                    break

            if not found_pdf or not found_pdf.exists():
                print(f"  SKIP {dir_path.name}: no PDF found")
                continue

            total_images += _render_pdf(found_pdf, slug, out_base=out_base)
    else:
        # No expected dir — render all split PDFs directly
        if not split_dir.exists():
            print(f"  SKIP {budget_type}: no split PDFs at {split_dir}")
            return 0

        for found_pdf in sorted(split_dir.glob("*.pdf")):
            match = DIR_PATTERN.match(found_pdf.stem)
            if not match:
                continue
            section_num = int(match.group(1))
            section_info = sections_lookup.get(section_num, {})
            title = section_info.get("title", match.group(2).replace("_", " "))
            slug = slugify(title)
            total_images += _render_pdf(found_pdf, slug, out_base=out_base)

    return total_images


def _render_pdf(pdf_path: Path, slug: str, *, out_base: Path, pages: list[int] | None = None) -> int:
    """Render pages of a PDF to WebP images under ``out_base/slug``.

    ``pages`` (0-based indices) limits rendering to a subset; ``None`` renders all.
    Returns number of images written or already present.
    """
    import fitz  # PyMuPDF
    from PIL import Image

    out_dir = out_base / slug
    out_dir.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(str(pdf_path))
    page_indices = pages if pages is not None else range(len(doc))
    rendered = 0
    for page_idx in page_indices:
        if page_idx >= len(doc):
            continue
        out_path = out_dir / f"P{page_idx}.webp"
        if out_path.exists():
            rendered += 1
            continue
        page = doc[page_idx]
        pix = page.get_pixmap(dpi=120)
        pil_img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        pil_img.save(str(out_path), "WEBP", quality=80)
        pil_img.close()
        rendered += 1

    doc.close()
    if rendered > 0:
        print(f"  {slug}: {rendered} page images")
    return rendered


def _changed_pages(render_pdf: Path, compare_pdf: Path) -> list[int]:
    """Return 0-based page indices where ``render_pdf`` differs in text from
    ``compare_pdf``. Pages past the end of either PDF count as changed."""
    import fitz  # PyMuPDF

    a = fitz.open(str(render_pdf))
    b = fitz.open(str(compare_pdf))
    changed: list[int] = []
    for i in range(max(len(a), len(b))):
        text_a = a[i].get_text("text") if i < len(a) else ""
        text_b = b[i].get_text("text") if i < len(b) else ""
        if page_changed(text_a, text_b):
            changed.append(i)
    a.close()
    b.close()
    return changed


def render_secondary_changed(
    budget_type: str,
    render_variant: str,
    compare_variant: str,
    out_base: Path,
    manifest_path: Path,
    year: int = DEFAULT_YEAR,
) -> dict[str, list[int]]:
    """Render the ``render_variant`` source pages that differ from ``compare_variant``.

    Used to produce the *adopted* source-page images for pages the amendment
    actually changed, so the web lightbox can offer an adopted/amended toggle.
    Writes a ``{slug: [pages]}`` manifest of which pages have a secondary image.
    """
    render_subtype = variant_type(budget_type, render_variant)
    compare_subtype = variant_type(budget_type, compare_variant)
    sections_file = sections_path(year, render_subtype)
    exp_dir = expected_dir(year, render_subtype)
    render_split = split_pdf_dir(year, render_subtype)
    compare_split = split_pdf_dir(year, compare_subtype)

    if not sections_file.exists():
        print(f"  SKIP secondary {budget_type}: no sections file at {sections_file}")
        return {}

    with open(sections_file, encoding="utf-8") as f:
        sections_list = json.load(f)
    sections_lookup = {i: s for i, s in enumerate(sections_list, start=1)}

    manifest: dict[str, list[int]] = {}
    total_images = 0

    source_dirs = sorted(exp_dir.iterdir()) if exp_dir.exists() else []
    for dir_path in source_dirs:
        if not dir_path.is_dir():
            continue
        match = DIR_PATTERN.match(dir_path.name)
        if not match:
            continue
        section_num = int(match.group(1))
        section_info = sections_lookup.get(section_num, {})
        title = section_info.get("title", match.group(2).replace("_", " "))
        slug = slugify(title)

        render_pdf = next((p for p in render_split.glob(f"*{dir_path.name}*.pdf") if dir_path.name in p.stem), None)
        compare_pdf = next((p for p in compare_split.glob(f"*{dir_path.name}*.pdf") if dir_path.name in p.stem), None)
        if not render_pdf or not compare_pdf:
            print(f"  SKIP {dir_path.name}: missing {render_variant} or {compare_variant} PDF")
            continue

        changed = _changed_pages(render_pdf, compare_pdf)
        if not changed:
            continue
        manifest[slug] = changed
        total_images += _render_pdf(render_pdf, slug, out_base=out_base, pages=changed)

    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)
    print(
        f"\nSecondary ({render_variant} vs {compare_variant}): "
        f"{total_images} images across {len(manifest)} sections -> {out_base}"
    )
    print(f"Manifest written to {manifest_path}")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Render PDF page images for web app")
    parser.add_argument(
        "--budget-type",
        choices=["operating", "capital", "all"],
        default="all",
        help="Which budget type to render (default: all)",
    )
    parser.add_argument(
        "--year",
        type=int,
        default=DEFAULT_YEAR,
        help=f"Budget year (default: {DEFAULT_YEAR})",
    )
    parser.add_argument(
        "--variant",
        default="adopted",
        help="Budget variant to render (default: adopted; e.g. 'amended')",
    )
    parser.add_argument(
        "--secondary-of",
        default=None,
        help=(
            "Render --variant as a secondary image set, keeping only pages that "
            "differ from this comparison variant (e.g. 'amended'). Emits --manifest."
        ),
    )
    parser.add_argument(
        "--output-subdir",
        default=DEFAULT_OUTPUT_SUBDIR,
        help="Subdirectory under web/public to write images to, followed by the year "
             f"(default: {DEFAULT_OUTPUT_SUBDIR} -> web/public/{DEFAULT_OUTPUT_SUBDIR}/{{year}}/)",
    )
    parser.add_argument(
        "--manifest",
        default=None,
        help="Path to write the {slug: [pages]} manifest (required with --secondary-of)",
    )
    args = parser.parse_args()

    out_base = image_output_dir(output_subdir=args.output_subdir, year=args.year)
    budget_types = ["operating", "capital"] if args.budget_type == "all" else [args.budget_type]

    if args.secondary_of:
        if not args.manifest:
            parser.error("--manifest is required when using --secondary-of")
        manifest_path = Path(args.manifest)
        if not manifest_path.is_absolute():
            manifest_path = Path(__file__).parent.parent / manifest_path
        for bt in budget_types:
            print(f"\n=== {bt.upper()} BUDGET (secondary: {args.variant} vs {args.secondary_of}) ===")
            render_secondary_changed(
                bt, args.variant, args.secondary_of, out_base, manifest_path, args.year
            )
        return

    total = 0
    for bt in budget_types:
        print(f"\n=== {bt.upper()} BUDGET ===")
        total += render_budget_type(bt, out_base=out_base, year=args.year, variant=args.variant)

    print(f"\nRendered {total} total page images to {out_base}")


if __name__ == "__main__":
    main()
