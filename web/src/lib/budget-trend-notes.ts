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
