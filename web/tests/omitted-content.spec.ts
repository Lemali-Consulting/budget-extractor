/**
 * Fragments the fact-check asked to cut are listed by hand, each with the
 * sheet row that asked. An entry that no longer matches anything must fail
 * the build: a re-extraction can move or fix the fragment, and a stale entry
 * would otherwise sit there silently while the fragment came back elsewhere.
 */
import { test, expect } from "./test-base";
import { OMISSION_KIND, withOmissions, type Omission } from "../src/lib/omitted-content";

const bundle = {
  sections: [
    {
      slug: "department-of-finance",
      tables: [{ id: "s16_p4_t1" }, { id: "s16_p4_t2" }],
      page_content: [
        {
          relative_page: 4,
          text_blocks: [
            { role: "section_title", text: "Position Summary" },
            { role: "narrative", text: "Department Three Taxing Bodies\n2027 Allocations" },
          ],
        },
        {
          relative_page: 6,
          text_blocks: [
            { role: "section_title", text: "Subclass Detail" },
            { role: "footnote", text: "to prior funding calculations." },
          ],
        },
      ],
    },
  ],
};

const FINANCE = "department-of-finance";

test("a listed table, opening text and page of notes are left out, and nothing else", () => {
  const omissions: Omission[] = [
    { kind: OMISSION_KIND.TABLE, sectionSlug: FINANCE, tableId: "s16_p4_t2", reason: "fragment" },
    { kind: OMISSION_KIND.TEXT, sectionSlug: FINANCE, page: 4, startsWith: "Department Three Taxing Bodies", reason: "caption" },
    { kind: OMISSION_KIND.NOTES, sectionSlug: FINANCE, page: 6, reason: "broken note" },
  ];
  const [finance] = withOmissions({ bundle, omissions }).sections;
  expect(finance.tables.map((t) => t.id)).toEqual(["s16_p4_t1"]);
  expect(finance.page_content?.map((p) => p.text_blocks?.map((b) => b.text))).toEqual([["Position Summary"], ["Subclass Detail"]]);
});

test("an omission that matches nothing stops the build", () => {
  const stale: Omission[] = [{ kind: OMISSION_KIND.TABLE, sectionSlug: FINANCE, tableId: "s16_p4_t9", reason: "moved" }];
  expect(() => withOmissions({ bundle, omissions: stale })).toThrow(/matched nothing/);
});
