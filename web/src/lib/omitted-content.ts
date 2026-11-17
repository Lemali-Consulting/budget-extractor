/**
 * Pieces of the budget PDF's extraction the site leaves out at Public
 * Source's fact-check (Rich's factcheck sheet "1126", 2026-11-13): table
 * fragments and broken text that no general rule picks out, and the parts of
 * a section Public Source asked to cut.
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
  /** The rest of the section from a line of its text onward: that line, everything below it on its page, and every later page. */
  CUT_FROM: 'cut-from',
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
    | { kind: typeof OMISSION_KIND.CUT_FROM; page: number; line: string }
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
    kind: OMISSION_KIND.TEXT,
    sectionSlug: 'expenditure-summary',
    page: 1,
    startsWith: 'Expenditures by Department',
    reason:
      'The department table\'s PDF title and column labels, read as one line of text above it (row 19, item 3).',
  },
  {
    kind: OMISSION_KIND.TEXT,
    sectionSlug: 'expenditure-summary',
    page: 1,
    startsWith: 'Budget',
    reason:
      'The lone "Budget" above each of the page\'s two tables: the last line of the "2026 Amended Budget" column label, read as small print (Max, 2026-11-16, after row 19, item 3).',
  },
  {
    kind: OMISSION_KIND.CUT_FROM,
    sectionSlug: 'revenue-summary',
    page: 3,
    line: '2027 Tax vs. Non-Tax Revenue',
    reason: "The pie charts and prose from \"2027 tax vs. non-tax revenue\" to the end of the section (row 18).",
  },
  {
    kind: OMISSION_KIND.CUT_FROM,
    sectionSlug: 'expenditure-summary',
    page: 3,
    line: 'Expenditures by Subclass',
    reason: 'Everything from the "Expenditures by subclass" subheading to the end of the section (row 19, item 2).',
  },
  {
    kind: OMISSION_KIND.TABLE,
    sectionSlug: 'bureau-of-administration-public-safety',
    tableId: 's23_p7_t1',
    reason:
      "A park ranger's split between this bureau and the Parks RAD Trust Fund (row 28, filed against the Public Works administration page).",
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
  bbox?: number[];
}

interface Section {
  slug: string;
  tables: { id: string; relative_page?: number }[];
  page_content?: { relative_page: number; text_blocks?: Block[]; chart_regions?: { bbox?: number[] }[] }[];
}

type CutFrom = Extract<Omission, { kind: typeof OMISSION_KIND.CUT_FROM }>;

/** How far down its page a block or chart starts. */
function topOf(item: { bbox?: number[] }): number {
  return item.bbox?.[1] ?? 0;
}

function omitsTable(opts: { omission: Omission; sectionSlug: string; tableId: string }): boolean {
  const { omission } = opts;
  return omission.kind === OMISSION_KIND.TABLE && omission.sectionSlug === opts.sectionSlug && omission.tableId === opts.tableId;
}

function omitsBlock(opts: { omission: Omission; sectionSlug: string; page: number; block: Block }): boolean {
  const { omission, block } = opts;
  if (omission.sectionSlug !== opts.sectionSlug) return false;
  if (omission.kind === OMISSION_KIND.TEXT) return omission.page === opts.page && block.text.startsWith(omission.startsWith);
  if (omission.kind === OMISSION_KIND.NOTES) return omission.page === opts.page && block.role === NOTE_ROLE;
  return false;
}

/** The index of the cut's line within a block's lines, or -1. */
function cutLineIndex(opts: { block: Block; cut: CutFrom }): number {
  return opts.block.text.split('\n').findIndex((l) => l.trim().startsWith(opts.cut.line));
}

/**
 * The section with everything from the cut's line onward removed, or null if the line isn't on its page.
 * The section page shows a page's tables after its text, so tables on the cut's page go with it.
 */
function cutSection<S extends Section>(opts: { section: S; cut: CutFrom }): S | null {
  const { section, cut } = opts;
  const page = section.page_content?.find((p) => p.relative_page === cut.page);
  const blocks = page?.text_blocks ?? [];
  const at = blocks.findIndex((block) => cutLineIndex({ block, cut }) >= 0);
  if (!page || at < 0) return null;
  const cutTop = topOf(blocks[at]);
  const before = blocks[at].text.split('\n').slice(0, cutLineIndex({ block: blocks[at], cut })).join('\n').trim();
  const keptBlocks = blocks.flatMap((b, i) => {
    if (i === at) return before ? [{ ...b, text: before }] : [];
    return topOf(b) < cutTop ? [b] : [];
  });
  const cutPage = {
    ...page,
    text_blocks: keptBlocks,
    chart_regions: (page.chart_regions ?? []).filter((c) => topOf(c) < cutTop),
  };
  return {
    ...section,
    tables: section.tables.filter((t) => (t.relative_page ?? 0) < cut.page),
    page_content: (section.page_content ?? [])
      .filter((p) => p.relative_page <= cut.page)
      .map((p) => (p === page ? cutPage : p)),
  };
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
  const withCut = <S extends Section>(section: S): S => {
    const cut = omissions.find((o): o is CutFrom => o.kind === OMISSION_KIND.CUT_FROM && o.sectionSlug === section.slug);
    const cutDown = cut && cutSection({ section, cut });
    if (!cut || !cutDown) return section;
    used.add(cut);
    return cutDown;
  };
  const sections = bundle.sections.map(withCut).map((section) => ({
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
