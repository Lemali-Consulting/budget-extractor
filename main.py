#!/usr/bin/env python3
"""
Budget PDF Extractor

Extracts line items, tables, summaries, and full text from budget PDF documents
and outputs structured JSON.
"""

import argparse
import json
import sys
from pathlib import Path

from workflows.extract_full_pdf.extractor import PDFReader, TableExtractor, TextExtractor, AmountParser
from models import BudgetDocument, BudgetSection, LineItem


def extract_budget(pdf_path: str, output_path: str | None = None, verbose: bool = False) -> dict:
    """
    Extract budget data from a PDF file.

    Args:
        pdf_path: Path to the PDF file
        output_path: Path for JSON output (optional)
        verbose: Print progress information

    Returns:
        Extracted budget data as dictionary
    """
    reader = PDFReader(pdf_path)
    table_extractor = TableExtractor()
    text_extractor = TextExtractor(table_extractor)

    with reader.open():
        if verbose:
            print(f"Processing: {pdf_path}")
            print(f"Total pages: {reader.total_pages}")

        # Initialize document
        doc = BudgetDocument(
            filename=Path(pdf_path).name,
            total_pages=reader.total_pages,
        )

        all_text_parts = []
        all_line_items = []
        current_section = None
        sections = []

        # Process each page
        for page_num, page in reader.iterate_pages():
            if verbose:
                print(f"  Processing page {page_num}/{reader.total_pages}...", end='\r')

            # Extract tables
            page_tables = table_extractor.extract_tables(page, page_num)
            doc.all_tables.extend(page_tables)

            # Extract text (excluding table areas)
            page_text = text_extractor.extract_text(page, exclude_tables=True)
            full_page_text = text_extractor.extract_full_text(page)
            all_text_parts.append(full_page_text)

            # Find section headers
            headers = text_extractor.find_section_headers(page_text)

            # Process headers to create sections
            for header_text, _ in headers:
                # Close previous section
                if current_section:
                    current_section.page_end = page_num - 1
                    sections.append(current_section)

                # Start new section
                current_section = BudgetSection(
                    name=header_text,
                    page_start=page_num,
                )

            # Add tables and text to current section
            if current_section:
                current_section.tables.extend(page_tables)
                current_section.text += page_text + "\n"

            # Extract line items from tables
            for table in page_tables:
                pairs = table_extractor.extract_amounts_from_table(table)
                for desc, amount in pairs:
                    item = LineItem(description=desc, amount=amount, page=page_num)
                    all_line_items.append(item)
                    if current_section:
                        current_section.line_items.append(item)

            # Extract line items from text
            amounts = AmountParser.find_all_amounts(page_text)
            for parsed in amounts:
                # Try to find context around the amount
                start = max(0, parsed.start_pos - 100)
                end = min(len(page_text), parsed.end_pos + 20)
                context = page_text[start:parsed.start_pos].strip()
                # Get last line of context as description
                lines = context.split('\n')
                desc = lines[-1].strip() if lines else ""
                if desc:
                    item = LineItem(description=desc, amount=parsed.value, page=page_num)
                    all_line_items.append(item)

        # Close final section
        if current_section:
            current_section.page_end = reader.total_pages
            sections.append(current_section)

        if verbose:
            print()  # New line after progress

        # Compile full text
        doc.full_text = text_extractor.clean_text('\n\n'.join(all_text_parts))
        doc.sections = sections

        # Calculate summary
        _calculate_summary(doc, all_line_items)

        if verbose:
            print(f"Extracted {len(doc.all_tables)} tables")
            print(f"Found {len(all_line_items)} line items")
            print(f"Identified {len(sections)} sections")

    # Write output
    result = doc.to_dict()

    if output_path:
        output_file = Path(output_path)
        output_file.parent.mkdir(parents=True, exist_ok=True)
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2)
        if verbose:
            print(f"Output written to: {output_path}")

    return result


def _calculate_summary(doc: BudgetDocument, line_items: list[LineItem]) -> None:
    """Calculate summary statistics for the document."""
    # Find unique categories from sections
    doc.major_categories = [s.name for s in doc.sections]

    # Try to find total budget (look for largest amounts or "total" labels)
    totals = []
    for item in line_items:
        if item.amount and item.description:
            desc_lower = item.description.lower()
            if 'total' in desc_lower or 'grand total' in desc_lower:
                totals.append(item.amount)

    if totals:
        # Use the largest total found
        doc.total_budget = max(totals)


def main():
    parser = argparse.ArgumentParser(
        description='Extract budget data from PDF to JSON',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s budget.pdf
  %(prog)s budget.pdf -o output/budget.json
  %(prog)s budget.pdf -o output/budget.json -v
        """
    )

    parser.add_argument(
        'pdf_path',
        help='Path to the PDF file to process'
    )

    parser.add_argument(
        '-o', '--output',
        help='Output JSON file path (default: output/<pdf_name>.json)'
    )

    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Print progress information'
    )

    args = parser.parse_args()

    # Default output path
    if not args.output:
        pdf_name = Path(args.pdf_path).stem
        args.output = f"output/{pdf_name}.json"

    try:
        result = extract_budget(args.pdf_path, args.output, args.verbose)
        print(f"Successfully extracted budget data to {args.output}")

        # Print summary
        summary = result.get('summary', {})
        if summary.get('total_budget'):
            print(f"Total budget found: ${summary['total_budget']:,.2f}")
        print(f"Pages processed: {result['document']['total_pages']}")
        print(f"Tables extracted: {len(result['all_tables'])}")

    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error processing PDF: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
