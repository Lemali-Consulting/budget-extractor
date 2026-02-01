# Extract Grants Output

Contains extracted grants data from the City of Pittsburgh 2026 Operating Budget.

## Files

- `csv/grants.csv` - All active grants with department, funder, and financial amounts (~140 rows)
- `csv/grant_positions.csv` - Grant-funded positions with salary and FTE data (~12 rows)
- `json/grants.json` - Complete structured data including narrative text

See `DATA_DICTIONARY.md` for column definitions.

## Data Quality

The financial data (JDE numbers, amounts) is accurately extracted. The funder and grant description text may have imperfect segmentation due to the complex PDF layout.
