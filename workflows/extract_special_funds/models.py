"""Data models for special fund extraction."""

from dataclasses import dataclass, field, asdict
from typing import Any


@dataclass
class BudgetLineItem:
    """A single revenue or expenditure line item."""

    subclass_code: str
    subclass_name: str
    account_code: str | None  # 5-digit code, None for section headers
    account_name: str | None  # Detail name, None for section headers
    budget_2025: float | None
    budget_2026: float | None
    change_amount: float | None
    change_percent: float | None
    line_type: str  # "section_header", "detail", "total"
    section: str  # "revenues" or "expenditures"


@dataclass
class PositionEntry:
    """A single position/staffing entry."""

    department: str | None
    division: str | None
    title: str
    fte_2025: float | None
    grade: str | None
    hours_months_2025: str | None
    budget_2025: float | None
    fte_2026: float | None
    hours_months_2026: str | None
    budget_2026: float | None
    position_type: str  # "permanent", "temporary", "seasonal"


@dataclass
class FundMetadata:
    """Metadata describing a special/trust fund."""

    fund_code: str
    fund_name: str
    department: str | None
    authorizing_legislation: str | None
    description: str | None
    revenues_description: str | None
    expenditures_description: str | None
    projected_beginning_balance: float | None
    projected_ending_balance: float | None
    revenues_total_2025: float | None
    revenues_total_2026: float | None
    expenditures_total_2025: float | None
    expenditures_total_2026: float | None
    net_total_2025: float | None
    net_total_2026: float | None


@dataclass
class SpecialFund:
    """Complete data for a special/trust fund."""

    metadata: FundMetadata
    budget_lines: list[BudgetLineItem] = field(default_factory=list)
    positions: list[PositionEntry] = field(default_factory=list)
    source_file: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "metadata": asdict(self.metadata),
            "budget_lines": [asdict(item) for item in self.budget_lines],
            "positions": [asdict(pos) for pos in self.positions],
            "source_file": self.source_file,
        }
