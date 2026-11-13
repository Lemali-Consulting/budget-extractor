/**
 * The PDF's prose blocks, split into the subheadings, paragraphs and bullet
 * lists they run together ("Mission\nThe mission of the Office…").
 */

/** A piece of the PDF's prose: a subheading, a paragraph or a bulleted list. */
export type Segment =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] };

/** Split a raw prose block into subheadings, paragraphs and bullet lists. */
export function parseNarrative(raw: string): Segment[] {
  const lines = raw.split('\n');
  const segments: Segment[] = [];
  let pendingProse: string[] = [];
  let pendingBullets: string[] = [];

  function flushProse() {
    if (pendingProse.length > 0) {
      segments.push({ type: 'paragraph', text: pendingProse.join(' ') });
      pendingProse = [];
    }
  }
  function flushBullets() {
    if (pendingBullets.length > 0) {
      segments.push({ type: 'bullets', items: [...pendingBullets] });
      pendingBullets = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { flushProse(); flushBullets(); continue; }

    const isBullet = /^[•◦●▪–-]\s/.test(line) || /^\d+\.\s/.test(line);

    if (isBullet) {
      flushProse();
      pendingBullets.push(line);
    } else if (pendingBullets.length > 0) {
      // Non-bullet line after bullets = continuation of last bullet (wrapped text)
      pendingBullets[pendingBullets.length - 1] += ' ' + line;
    } else {
      // Is this a sub-heading? Heuristic: short line, not ending with comma/continuation,
      // and followed by a longer line or is the first line of the block
      const isShort = line.length < 50;
      const noTrailingContinuation = !/[,;:\-–]$/.test(line) && !/\b(and|or|the|of|in|to|a|for)$/i.test(line);
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
      const nextIsLonger = nextLine.length > line.length;
      const nextIsBullet = /^[•◦●▪–-]\s/.test(nextLine) || /^\d+\.\s/.test(nextLine);
      const prevLine = pendingProse.length > 0 ? pendingProse[pendingProse.length - 1] : '';
      const prevEndsSentence = /[.!?]$/.test(prevLine.trim());
      const proseEmpty = pendingProse.length === 0 || prevEndsSentence;
      const looksLikeHeading = isShort && noTrailingContinuation && (nextIsLonger || nextIsBullet) && proseEmpty;

      if (looksLikeHeading) {
        flushProse();
        flushBullets();
        segments.push({ type: 'heading', text: line });
      } else {
        flushBullets();
        // Start a new paragraph when the previous line ended a sentence
        // and the current line begins a new topic (e.g., "Foo Division - ...")
        if (prevEndsSentence && pendingProse.length > 0) {
          const startsNewTopic = /^[A-Z][A-Za-z &]+\s[-–—]\s/.test(line);
          if (startsNewTopic) {
            flushProse();
          }
        }
        pendingProse.push(line);
      }
    }
  }
  flushProse();
  flushBullets();
  return segments;
}
