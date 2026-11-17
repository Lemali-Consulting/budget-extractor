/**
 * Every node in the operating money flow carries its name. Labels used to be
 * dropped on any node under 14px tall, which left three revenue categories
 * (fines, interest, miscellaneous) and four departments (Facilities, Law,
 * Permits, Licenses and Inspections, Parks) unnamed, so the caption's counts
 * couldn't be checked by eye (Rich's factcheck sheet "1126", row 7, column D).
 * Small nodes sit closer together than a line of text is tall, so their labels
 * are spread apart just enough not to overlap.
 */
import { test, expect } from "./test-base";
import { spreadLabels } from "../src/lib/label-spread";

test("labels closer than the gap are pushed apart, keeping their order", () => {
  expect(spreadLabels({ positions: [662, 677, 686.6], minGap: 12, min: 0, max: 760 })).toEqual([662, 677, 689]);
});

test("labels already far enough apart stay where they are", () => {
  expect(spreadLabels({ positions: [100, 20, 50], minGap: 12, min: 0, max: 760 })).toEqual([100, 20, 50]);
});

test("labels pushed past the bottom are moved back up", () => {
  expect(spreadLabels({ positions: [90, 95, 100], minGap: 10, min: 0, max: 100 })).toEqual([80, 90, 100]);
});

test("the operating flow names every revenue category and department, with no labels overlapping", async ({ page }) => {
  await page.goto("/flow/");
  const svg = page.locator("main svg").first();
  await expect(svg.locator("text", { hasText: "Department of Parks and Recreation" })).toHaveCount(1);
  for (const name of [
    "Fines & forfeitures",
    "Interest earnings",
    "Miscellaneous revenues",
    "Bureau of Facilities",
    "Department of Law",
    "Department of Permits, Licenses, and Inspections",
  ]) {
    await expect(svg.locator("text", { hasText: name }), name).toHaveCount(1);
  }
  const overlaps = await svg.evaluate((el) => {
    const boxes = [...el.querySelectorAll("text")].map((t) => ({ name: t.textContent, box: t.getBoundingClientRect() }));
    const hits: string[] = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].box, b = boxes[j].box;
        if (a.left < b.right && b.left < a.right && a.top < b.bottom - 1 && b.top < a.bottom - 1) hits.push(`${boxes[i].name} / ${boxes[j].name}`);
      }
    return hits;
  });
  expect(overlaps).toEqual([]);
});

/**
 * Labels used to sit on top of the colored bands in small dark text, which
 * was hard to read over the darker bands and where many bands cross (Max,
 * 2026-11-16). On a wide screen the outermost columns' names now sit on the
 * white space beside the diagram, and every name has a white outline so it
 * reads cleanly over whatever color is under it.
 */
const FLOW_DIAGRAMS = ["operating", "capital"] as const;

async function outerLabelPlacement(page: import("@playwright/test").Page, index: number) {
  return page.locator("main svg[aria-label='Sankey flow diagram']").nth(index).evaluate((svg) => {
    const groups = [...svg.querySelectorAll("g > g, g > a > g")].filter((g) => g.querySelector(":scope > rect") && g.querySelector(":scope > text"));
    const rects = groups.map((g) => g.querySelector(":scope > rect")!.getBoundingClientRect());
    const leftEdge = Math.min(...rects.map((r) => r.left));
    const rightEdge = Math.max(...rects.map((r) => r.right));
    const frame = svg.getBoundingClientRect();
    const misplaced: string[] = [];
    for (const g of groups) {
      const rect = g.querySelector(":scope > rect")!.getBoundingClientRect();
      const text = g.querySelector(":scope > text")!;
      const box = text.getBoundingClientRect();
      const name = text.textContent ?? "";
      if (box.left < frame.left - 0.5 || box.right > frame.right + 0.5) misplaced.push(`${name}: clipped`);
      if (Math.abs(rect.left - leftEdge) < 1 && box.right > rect.left) misplaced.push(`${name}: not left of its column`);
      if (Math.abs(rect.right - rightEdge) < 1 && box.left < rect.right) misplaced.push(`${name}: not right of its column`);
    }
    return { labelled: groups.length, misplaced };
  });
}

for (const [index, name] of FLOW_DIAGRAMS.entries()) {
  test(`the ${name} flow's outer names sit beside the diagram, not over its bands`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/flow/");
    const { labelled, misplaced } = await outerLabelPlacement(page, index);
    expect(labelled).toBeGreaterThan(5);
    expect(misplaced).toEqual([]);
  });
}

test("every name in the flow diagrams has a white outline behind it", async ({ page }) => {
  await page.goto("/flow/");
  const unoutlined = await page.locator("main svg[aria-label='Sankey flow diagram'] text").evaluateAll((texts) =>
    texts
      .filter((t) => {
        const s = getComputedStyle(t);
        return s.paintOrder.split(" ")[0] !== "stroke" || s.stroke !== "rgb(255, 255, 255)" || parseFloat(s.strokeWidth) < 2;
      })
      .map((t) => t.textContent),
  );
  expect(unoutlined).toEqual([]);
});
