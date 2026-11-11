/**
 * Sentence case for names taken from the budget PDFs, following Public
 * Source's house style: capitalize the first word and proper nouns only.
 * Mirrors `utils/text_case.py`, which applies the same rule to labels the data
 * build derives; keep the two name lists in step.
 */

/** Names that keep their capitals wherever they appear. */
const PROPER_PHRASES: readonly string[] = [
  'City of Pittsburgh',
  'Pittsburgh',
  'General Fund',
  'Five-Year Forecast',
  'Five-Year',
  'City Council',
];

/** Acronyms printed in labels; an ALL CAPS label can't otherwise be told apart from words. */
const ACRONYMS: ReadonlySet<string> = new Set([
  'CDBG', 'CIP', 'CPFC', 'EMS', 'FTE', 'HSIP', 'HUD', 'PILOT', 'PWSA', 'RAD', 'TIF', 'TIP', 'URA', 'URD',
]);

/** A department, bureau, office, commission or fund name: a proper noun, left as printed. */
const PROPER_NAME_PATTERN = /^(Department|Bureau|Office|Commission|Board)\s+of\b|\bFund\b|\bCouncil\b/;

const WORD_PATTERN = /[A-Za-z][A-Za-z'’]*/g;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Lowercase everything except proper nouns and acronyms. */
export function phraseCase(text: string): string {
  const sourceIsAllCaps = text.toUpperCase() === text;
  let out = text.replace(WORD_PATTERN, (word) => {
    if (ACRONYMS.has(word.toUpperCase())) return word.toUpperCase();
    if (!sourceIsAllCaps && word.length > 1 && word === word.toUpperCase()) return word;
    return word.toLowerCase();
  });
  for (const phrase of PROPER_PHRASES) {
    out = out.replace(new RegExp(escapeRegExp(phrase), 'gi'), phrase);
  }
  return out;
}

/** Capitalize only the first letter, proper nouns and acronyms. */
export function sentenceCase(text: string): string {
  const out = phraseCase(text);
  // Only a label that opens with a word gets a capital; "2027 budget" opens with the number.
  const i = out.search(/\S/);
  if (i < 0 || !/[A-Za-z]/.test(out[i])) return out;
  return out.slice(0, i) + out[i].toUpperCase() + out.slice(i + 1);
}

/**
 * Display title for a budget-document section. Department and fund sections
 * are named entities and keep the PDF's capitals; generic sections such as
 * "Expenditure Summary" become "Expenditure summary".
 */
export function sectionDisplayTitle(opts: { title: string; isDepartment: boolean }): string {
  const { title, isDepartment } = opts;
  if (isDepartment || PROPER_NAME_PATTERN.test(title)) return title;
  return sentenceCase(title);
}
