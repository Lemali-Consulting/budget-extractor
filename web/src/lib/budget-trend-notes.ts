/**
 * Notes under a department's budget trend chart, where the trend jumps for a
 * reason the PDF gives elsewhere. Each paraphrases the PDF and cites its page
 * (absolute, in the operating budget PDF), so Public Source can check it.
 */

export interface BudgetTrendNote {
  text: string;
  pdfPage: number;
}

export const BUDGET_TREND_NOTES: Readonly<Record<string, BudgetTrendNote>> = {
  // Row 42: the 2026 budget was $58,000, the 2027 budget $4.1M. The PDF, under the position summary:
  // "The Office of Community Health and Safety positions have moved from the Stop the Violence Trust Fund for 2027."
  'office-of-community-health-and-safety': {
    text: "The office's positions moved from the Stop the Violence Trust Fund into its own budget for 2027.",
    pdfPage: 191,
  },
};

/**
 * Departments whose page leaves out the line-item budget trend chart, because
 * their line items' history in the PDF doesn't compare like with like. The
 * total-budget trend above it, with its note, stays.
 */
export const LINE_ITEM_TREND_HIDDEN: ReadonlySet<string> = new Set([
  // Max, 2026-11-16: staff were paid from the Stop the Violence Trust Fund until 2027 (p. 191),
  // so salaries and benefits print as dashes in 2025 and 2026 and chart as an office with no staff.
  'office-of-community-health-and-safety',
]);
