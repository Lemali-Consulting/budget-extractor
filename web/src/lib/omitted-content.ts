/**
 * Pieces of the budget PDF's extraction the site leaves out because Public
 * Source's fact-check found them unreadable: table fragments and broken text
 * that no general rule picks out (Rich's factcheck sheet "1126", 2026-11-13).
 *
 * Each entry names what it removes and the sheet row that asked. An entry
 * that matches nothing is an error, so a re-extraction that moves or fixes
 * the content fails the build instead of leaving a stale entry.
 */

export const OMISSION_KIND = {
  /** One table, by its id. */
  TABLE: 'table',
  /** Text blocks on a page whose text opens with the given words. */
  TEXT: 'text',
  /** Every note (small print) on a page. */
  NOTES: 'notes',
} as const;

/** The role the extractor gives a note printed under a table. */
const NOTE_ROLE = 'footnote';

interface OmissionBase {
  sectionSlug: string;
  /** What is removed and why, with the sheet row that asked. */
  reason: string;
}

export type Omission = OmissionBase &
  (
    | { kind: typeof OMISSION_KIND.TABLE; tableId: string }
    | { kind: typeof OMISSION_KIND.TEXT; page: number; startsWith: string }
    | { kind: typeof OMISSION_KIND.NOTES; page: number }
  );

/** The 2027 proposed budget's omissions. Pages are the section's own (relative) pages. */
export const OMISSIONS_2027: readonly Omission[] = [
  {
    kind: OMISSION_KIND.TABLE,
    sectionSlug: 'expenditure-summary',
    tableId: 's7_p1_t1',
    reason:
      "The department table's total row run together with the next table's header, read as a four-row table (row 19, item 1). The same totals close the subclass table below it.",
  },
  {
    kind: OMISSION_KIND.TABLE,
    sectionSlug: 'department-of-finance',
    tableId: 's16_p4_t2',
    reason:
      "Finance's and the Three Taxing Bodies Trust Fund's shares of three positions, split off from their headings (row 22, item 1). The trust fund's section prints the whole allocation table.",
  },
  {
    kind: OMISSION_KIND.TEXT,
    sectionSlug: 'department-of-finance',
    page: 4,
    startsWith: 'Department Three Taxing Bodies',
    reason: "The column headings of that allocation table, read as a sentence (row 22, item 2).",
  },
  {
    kind: OMISSION_KIND.NOTES,
    sectionSlug: 'department-of-finance',
    page: 6,
    reason:
      "The end of a note on pension funding; its opening lines and the notes before it were lost in extraction, so it reads as a broken sentence (row 22, item 3).",
  },
  {
    kind: OMISSION_KIND.NOTES,
    sectionSlug: 'office-of-management-and-budget',
    page: 6,
    reason: 'Small-print notes breaking down the General Fund transfer under the subclass detail (row 43, item 2).',
  },
];

interface Block {
  role: string;
  text: string;
}

interface Section {
  slug: string;
  tables: { id: string }[];
  page_content?: { relative_page: number; text_blocks?: Block[] }[];
}

function omitsTable(opts: { omission: Omission; sectionSlug: string; tableId: string }): boolean {
  const { omission } = opts;
  return omission.kind === OMISSION_KIND.TABLE && omission.sectionSlug === opts.sectionSlug && omission.tableId === opts.tableId;
}

function omitsBlock(opts: { omission: Omission; sectionSlug: string; page: number; block: Block }): boolean {
  const { omission, block } = opts;
  if (omission.kind === OMISSION_KIND.TABLE || omission.sectionSlug !== opts.sectionSlug || omission.page !== opts.page) return false;
  if (omission.kind === OMISSION_KIND.NOTES) return block.role === NOTE_ROLE;
  return block.text.startsWith(omission.startsWith);
}

/** The sections without the omitted tables and text. Throws if an omission matches nothing. */
export function withOmissions<T extends { sections: Section[] }>(opts: { bundle: T; omissions: readonly Omission[] }): T {
  const { bundle, omissions } = opts;
  const used = new Set<Omission>();
  const omitted = (match: (o: Omission) => boolean): boolean => {
    const hit = omissions.find(match);
    if (hit) used.add(hit);
    return hit !== undefined;
  };
  const sections = bundle.sections.map((section) => ({
    ...section,
    tables: section.tables.filter((t) => !omitted((omission) => omitsTable({ omission, sectionSlug: section.slug, tableId: t.id }))),
    page_content: section.page_content?.map((page) => ({
      ...page,
      text_blocks: page.text_blocks?.filter(
        (block) => !omitted((omission) => omitsBlock({ omission, sectionSlug: section.slug, page: page.relative_page, block })),
      ),
    })),
  }));
  const unused = omissions.filter((o) => !used.has(o));
  if (unused.length > 0) {
    throw new Error(`Omissions matched nothing (re-check them against the extraction): ${unused.map((o) => `${o.sectionSlug}: ${o.reason}`).join('; ')}`);
  }
  return { ...bundle, sections };
}
