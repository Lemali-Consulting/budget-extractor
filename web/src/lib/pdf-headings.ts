/**
 * Headings reproduced from the budget PDF, in Public Source's house style.
 *
 * The extractor marks table titles, chart titles and section names as
 * "section titles", printed the way the PDF prints them ("Position Summary",
 * "BUREAU OF FIRE / 2027 Expenditures by Subclass"). It also marks text that
 * isn't a heading at all: chart axis values, pie-slice labels, notes and the
 * odd sentence. This module sentence-cases the headings and sorts out the rest.
 */
import { phraseCase, properNameCase, sentenceCase, PROPER_NAME_PATTERN } from './text-case';

/** What a PDF "section title" block turns out to be, and the text to show for it. */
export type PdfHeading =
  | { kind: 'heading'; text: string }
  | { kind: 'note'; text: string }
  | { kind: 'prose'; text: string }
  | { kind: 'chart-scrap' };

/** The section the heading sits in: its name as printed and as the site shows it. */
export interface HeadingSection {
  pdfTitle: string;
  title: string;
}

/** A chart's axis tick printed on its own line under the title ("$800,000,000"); an account number ("2129400555") has no separators. */
const AXIS_TICK = /^\$?\d{1,3}(?:,\d{3})+$|^\$\d+$/;
/** A dollar amount or percentage, the values a chart labels its bars and slices with. */
const CHART_VALUE = /\$\d|\d%/;
/** A slice or bar label is a few words beside its value ("Earned Income Tax 20.7%"). */
const MAX_CHART_LABEL_WORDS = 3;
/** Footnote markers and the PDF's placeholder text. */
const NOTE = /^(?:\*|Note:|\[)/;
/** A subclass code before its name, with or without a dash: "51 - PERSONNEL-SALARIES & WAGES", "52 Personnel-Employee Benefits". */
const SUBCLASS_SEGMENT = /(\d{2})( - | )([A-Za-z].*?)(?=\s+\d{2}(?: - | )[A-Za-z]|$)/g;
const SUBCLASS_START = /^\d{2}(?: - | )[A-Za-z]/;
/** A subclass label as a department's pie chart prints it, in capitals: "53 - PROF. & TECHNICAL SERVICES". */
const SUBCLASS_CHART_LABEL = /\b\d{2} - [A-Z][A-Z.&-]*(?: [A-Z.&-]+)*/g;
/** That chart's title: the department's name, then "2027 Expenditures by Subclass". */
const SUBCLASS_CHART_TITLE = /^[^\d.]{3,80} \d{4} Expenditures by Subclass$/;
/** A division or program of a department is a named unit, written the way the PDF writes it. */
const NAMED_UNIT = /\b(?:Division|Program|Office|Team|Unit)\b|\([A-Z]{2,}\)/;
/** Capitals casing must not lower, put back where the source had them: a designator letter ("Series B") and a month before its day ("Nov. 1"). */
const KEPT_CAPITALS = /\b[B-Z]\b|\b(?:Jan|Feb|March|April|May|June|July|Aug|Sept|Oct|Nov|Dec|January|February|August|September|October|November|December)\b(?=\.? \d)/g;

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isAllCaps(text: string): boolean {
  return /[A-Z]/.test(text) && text === text.toUpperCase();
}

function wordCount(text: string): number {
  return (text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? []).length;
}

/** Casing changes no lengths, so kept capitals can be put back where the source had them. */
function withKeptCapitals(opts: { source: string; cased: string }): string {
  let out = opts.cased;
  for (const m of opts.source.matchAll(KEPT_CAPITALS)) {
    const at = m.index as number;
    out = out.slice(0, at) + m[0] + out.slice(at + m[0].length);
  }
  return out;
}

function sentenceCaseKeepingLetters(text: string): string {
  return withKeptCapitals({ source: text, cased: sentenceCase(text) });
}

/** A subclass with its code ("51 - PERSONNEL-SALARIES & WAGES"), in sentence case: "51 - Personnel-salaries & wages". */
export function subclassLabel(text: string): string {
  return text.replace(SUBCLASS_SEGMENT, (_m, code: string, sep: string, name: string) => `${code}${sep}${sentenceCase(name.trim())}`);
}

/** The display text for one heading, already joined onto one line. */
function headingCase(opts: { lines: string[]; section: HeadingSection }): string {
  const { lines, section } = opts;
  const text = collapse(lines.join(' '));
  const sectionName = collapse(section.pdfTitle);

  if (text === sectionName) return section.title;
  if (text.toUpperCase().startsWith(`${sectionName.toUpperCase()} `)) {
    return `${section.title} ${phraseCase(text.slice(sectionName.length + 1))}`;
  }
  if (isAllCaps(text) && PROPER_NAME_PATTERN.test(properNameCase(text))) return properNameCase(text);
  if (lines.length > 1 && isAllCaps(lines[0])) {
    return collapse(`${properNameCase(lines[0])} ${phraseCase(lines.slice(1).join(' '))}`);
  }
  if (PROPER_NAME_PATTERN.test(text)) return text;
  const colon = text.indexOf(': ');
  if (colon > 0) return `${sentenceCaseKeepingLetters(text.slice(0, colon))}: ${text.slice(colon + 2)}`;
  return sentenceCaseKeepingLetters(text);
}

/**
 * The title and labels of a department's subclass pie chart, in any mix: the
 * extractor files them as headings, prose or a table. The site doesn't show
 * the chart, so they have nothing to label.
 */
export function isSubclassChartLegend(text: string): boolean {
  const labels = text.match(SUBCLASS_CHART_LABEL) ?? [];
  const rest = collapse(text.replace(SUBCLASS_CHART_LABEL, ' '));
  if (rest === '') return labels.length > 0;
  return SUBCLASS_CHART_TITLE.test(rest);
}

/** A table whose cells hold only a subclass pie chart's title and labels. */
export function isSubclassChartLegendTable(table: { headers: string[]; rows: string[][] }): boolean {
  const cells = [...table.headers, ...table.rows.flat()].filter((cell) => cell && cell.trim());
  return isSubclassChartLegend(cells.join(' '));
}

/** Text from a chart (an axis value, a slice label, a chart title with no chart) rather than a heading. */
export function isPdfChartScrap(text: string): boolean {
  if (!/[A-Za-z]/.test(text)) return true;
  if (isSubclassChartLegend(text)) return true;
  // A subclass name on its own is a pie chart's label; tables carry subclasses in their rows.
  if (SUBCLASS_START.test(text)) return true;
  return CHART_VALUE.test(text) && wordCount(text) <= MAX_CHART_LABEL_WORDS;
}

/** Sort a PDF "section title" block into heading, note, prose or chart scrap. */
export function classifyPdfHeading(opts: { text: string; section: HeadingSection }): PdfHeading {
  const lines = opts.text.split('\n').map((l) => l.trim()).filter(Boolean);
  while (lines.length > 1 && AXIS_TICK.test(lines[lines.length - 1])) lines.pop();
  const text = collapse(lines.join(' '));

  if (isPdfChartScrap(text)) return { kind: 'chart-scrap' };
  if (NOTE.test(text)) return { kind: 'note', text };
  if (text.endsWith(':')) return { kind: 'prose', text };
  return { kind: 'heading', text: headingCase({ lines, section: opts.section }) };
}

/** A subheading found inside the PDF's prose ("Mission Statement"), in house style. */
export function pdfHeadingText(opts: { text: string; section: HeadingSection }): string {
  if (NAMED_UNIT.test(opts.text)) return opts.text;
  return headingCase({ lines: [opts.text], section: opts.section });
}

/** Generic row-group titles printed in title case; other mixed-case groups are named units. */
const GENERIC_GROUP_TITLES: ReadonlySet<string> = new Set(['Temporary, Part-Time, and Seasonal Allowances']);

/** A table-of-contents label taken from the row groups of a table. */
export function tableGroupLabel(label: string): string {
  if (SUBCLASS_START.test(label)) return subclassLabel(label);
  if (isAllCaps(label) || GENERIC_GROUP_TITLES.has(label)) return sentenceCase(label);
  return label;
}
