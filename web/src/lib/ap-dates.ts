/**
 * Rewrite dates in AP style: with a day, Jan., Feb., Aug., Sept., Oct., Nov.
 * and Dec. are abbreviated and March through July are spelled out; ordinals
 * are dropped ("July 4th" → "July 4"); numeric dates are written out
 * ("11/25/26" → "Nov. 25, 2026").
 *
 * Max asked for every date on the site in AP style, the city's own text
 * reproduced from the PDF included (2026-11-12).
 */

/** AP form of each month when it appears with a day, January first. */
const AP_MONTH = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'] as const;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** Spellings the PDF uses for a month before a day, mapped to its index. */
const MONTH_INDEX = new Map<string, number>();
MONTH_NAMES.forEach((name, i) => {
  MONTH_INDEX.set(name, i);
  MONTH_INDEX.set(name.slice(0, 3), i);
});
MONTH_INDEX.set('Sept', 8);

const MONTH_ALTERNATION = [...MONTH_INDEX.keys()].sort((a, b) => b.length - a.length).join('|');

/** A month (full or abbreviated, with or without a period) and a day, with an optional ordinal suffix. */
const MONTH_DAY = new RegExp(`\\b(${MONTH_ALTERNATION})\\.? (\\d{1,2})(?:st|nd|rd|th)?\\b`, 'g');

/** US numeric dates: month/day/year, the year in two or four digits. */
const NUMERIC_DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/g;

/** Two-digit years in the budget documents are all this century. */
const CENTURY = 2000;
const MAX_DAY = 31;

function writtenDate(opts: { monthIndex: number; day: number }): string {
  return `${AP_MONTH[opts.monthIndex]} ${opts.day}`;
}

export function apDates(text: string): string {
  return text
    .replace(NUMERIC_DATE, (match, m: string, d: string, y: string) => {
      const month = Number(m);
      const day = Number(d);
      if (month < 1 || month > MONTH_NAMES.length || day < 1 || day > MAX_DAY) return match;
      const year = y.length === 2 ? CENTURY + Number(y) : Number(y);
      return `${writtenDate({ monthIndex: month - 1, day })}, ${year}`;
    })
    .replace(MONTH_DAY, (match, month: string, d: string) => {
      const day = Number(d);
      if (day < 1 || day > MAX_DAY) return match;
      return writtenDate({ monthIndex: MONTH_INDEX.get(month) as number, day });
    });
}

/** Every string inside a value, rewritten with `apDates`; other values are kept. */
export function withApDates<T>(value: T): T {
  if (typeof value === 'string') return apDates(value) as T;
  if (Array.isArray(value)) return value.map((v) => withApDates(v)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withApDates(v)])) as T;
  }
  return value;
}
