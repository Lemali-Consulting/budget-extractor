from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Any
import json


@dataclass
class LineItem:
    """A single budget line item with description and amount."""
    description: str
    amount: float | None = None
    page: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class TableRow:
    """A single row in a budget table."""
    cells: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {"cells": self.cells}


@dataclass
class BudgetTable:
    """A table extracted from the budget document."""
    headers: list[str]
    rows: list[TableRow]
    page: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "headers": self.headers,
            "rows": [row.to_dict() for row in self.rows],
            "page": self.page,
        }


@dataclass
class BudgetSection:
    """A section of the budget document."""
    name: str
    page_start: int
    page_end: int | None = None
    tables: list[BudgetTable] = field(default_factory=list)
    line_items: list[LineItem] = field(default_factory=list)
    text: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "page_start": self.page_start,
            "page_end": self.page_end,
            "tables": [t.to_dict() for t in self.tables],
            "line_items": [li.to_dict() for li in self.line_items],
            "text": self.text,
        }


@dataclass
class BudgetDocument:
    """Top-level container for extracted budget data."""
    filename: str
    total_pages: int
    extracted_at: str = field(default_factory=lambda: datetime.now().isoformat())
    total_budget: float | None = None
    major_categories: list[str] = field(default_factory=list)
    sections: list[BudgetSection] = field(default_factory=list)
    all_tables: list[BudgetTable] = field(default_factory=list)
    full_text: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "document": {
                "filename": self.filename,
                "total_pages": self.total_pages,
                "extracted_at": self.extracted_at,
            },
            "summary": {
                "total_budget": self.total_budget,
                "major_categories": self.major_categories,
            },
            "sections": [s.to_dict() for s in self.sections],
            "all_tables": [t.to_dict() for t in self.all_tables],
            "full_text": self.full_text,
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent)
