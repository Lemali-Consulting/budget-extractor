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
