"""Data models for grants extraction."""

from dataclasses import dataclass, field, asdict
from typing import Any


@dataclass
class GrantLineItem:
    """A single grant record from the Active Grants tables."""

    department: str
    jde_number: str
    funder: str
    grant_description: str
    amount_awarded: float | None
    amount_spent: float | None
    remaining_balance: float | None


@dataclass
class GrantPosition:
    """A single grant-funded position from Position Summary tables."""

    jde_number: str
    program_name: str
    title: str
    fte_2025: float | None
    grade_2025: str | None
    hours_months_2025: str | None
    budget_2025: float | None
    fte_2026: float | None
    grade_2026: str | None
    hours_months_2026: str | None
    budget_2026: float | None


@dataclass
class GrantsData:
    """Complete extracted data from the Grants PDF."""

    narrative: str | None
    grants: list[GrantLineItem] = field(default_factory=list)
    positions: list[GrantPosition] = field(default_factory=list)
    source_file: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "narrative": self.narrative,
            "grants": [asdict(grant) for grant in self.grants],
            "positions": [asdict(pos) for pos in self.positions],
            "source_file": self.source_file,
        }
