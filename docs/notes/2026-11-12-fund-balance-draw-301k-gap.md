# The PDF's 2027 fund balance draw doesn't match its own totals

**Date:** 2026-11-12
**Status:** open, for Public Source to rule on

The five-year forecast prints a 2027 "Use of Fund Balance" of $28,253,606. Two other figures in the same document imply a draw of $28,554,908, which is $301,302 more. The money flow page uses the printed figure, so its left side comes to $301,302 less than its right side.

## Evidence

All figures are from the 2027 proposed operating budget. The forecast table is section 3, page 1, baseline `output/regression/expected/2027/operating-proposed/03_Five-Year_Financial_Forecast/P1T0.csv`.

| Figure | Amount | Where |
|---|---|---|
| Use of Fund Balance, 2027 | $28,253,606 | forecast, first row |
| Total Revenues, 2027 (includes the draw) | $727,326,776 | forecast |
| Total Revenues, 2027 (revenue only) | $698,771,868 | revenue summary, and the revenue detail total |
| Total Expenditures, 2027 | $727,326,777 | forecast |
| Ending reserve fund balance, 2026 | $158,221,745 | forecast |
| Beginning reserve fund balance, 2027 | $129,666,837 | forecast |

- **Total revenues imply $28,554,908:** $727,326,776 − $698,771,868. The other revenue lines in the forecast match the revenue summary exactly, so the whole difference sits in the draw.
- **The reserve fund implies $28,554,908:** it falls by that much between the 2026 ending balance and the 2027 beginning balance ($158,221,745 − $129,666,837).
- **Only the printed line says $28,253,606.**

## Where it shows on the site

- **Money flow page:** the use of fund balance shows as $28.3M, the printed figure. The left side totals $727,025,474 and the departments total $727,326,774. The department figures come from the expenditure summary's departmental totals.
- **The gap is too small to see:** at 0.04%, the two sides of the diagram look balanced.
- **What the page says:** its header gives the budget total, $727.3M. It doesn't mention the gap.

## Options (none chosen)

- Keep the printed $28,253,606. This is what the site does now: it reproduces the document.
- Show $28,554,908, the figure that balances the budget, with a "Corrected by us" label like the other source corrections. The project's correction rules only relabel headings and never change amounts, so this would be a first.
- Keep the printed figure and add a note on the flow page explaining the gap.
