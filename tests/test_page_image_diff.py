"""Tests for the adopted-vs-amended page-change detection used when rendering
secondary (adopted) source-page images for the web explorer."""

from scripts.render_page_images import normalize_page_text, page_changed


def test_normalize_collapses_whitespace_and_trims() -> None:
    assert normalize_page_text("  Bureau   of\n\nPolice \t") == "Bureau of Police"


def test_identical_text_with_different_whitespace_is_not_changed() -> None:
    adopted = "Salaries 1,000,000\nWages 2,000,000"
    amended = "Salaries 1,000,000    Wages    2,000,000"
    assert page_changed(adopted, amended) is False


def test_different_numbers_count_as_changed() -> None:
    adopted = "Salaries 1,000,000"
    amended = "Salaries 1,250,000"
    assert page_changed(adopted, amended) is True


def test_leading_trailing_whitespace_only_is_not_changed() -> None:
    assert page_changed("\n  Personnel  \n", "Personnel") is False


def test_empty_vs_content_is_changed() -> None:
    assert page_changed("", "New line item added") is True


def test_image_output_dir_is_namespaced_by_year() -> None:
    from scripts.render_page_images import WEB_PUBLIC_ROOT, image_output_dir

    assert image_output_dir(output_subdir="pages", year=2027) == WEB_PUBLIC_ROOT / "pages" / "2027"
    assert image_output_dir(output_subdir="pages-adopted", year=2026) == WEB_PUBLIC_ROOT / "pages-adopted" / "2026"
