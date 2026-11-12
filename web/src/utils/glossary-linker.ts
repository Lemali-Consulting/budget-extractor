/**Build glossary term patterns and auto-link first occurrences in narrative text. */

interface GlossaryEntry {
  pattern: RegExp;
  tooltip: string;
  anchor: string;
}

/**
 * Build a sorted list of glossary term matchers from the glossary data.
 * Covers abbreviations, fiscal metrics, general terms and capital funding sources.
 */
// Terms too generic to auto-link without false positives.
// They're still defined on the glossary page, just not auto-linked in content.
const SKIP_AUTOLINK = new Set(['OTHER', 'BOND', 'INTEREST']);

export function buildGlossaryTerms(glossary: any): GlossaryEntry[] {
  const terms: GlossaryEntry[] = [];
  const seen = new Set<string>();

  function add(term: string, tooltip: string, anchor: string, flags = 'i') {
    const key = term.toUpperCase();
    if (seen.has(key)) return;
    if (SKIP_AUTOLINK.has(key)) return;
    seen.add(key);
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    terms.push({
      pattern: new RegExp(`\\b${escaped}\\b`, flags),
      tooltip: tooltip.length > 120 ? tooltip.slice(0, 117) + '...' : tooltip,
      anchor,
    });
  }

  // Fiscal metrics
  for (const item of glossary.fiscal_metrics || []) {
    add(item.term, item.description, 'fiscal_metrics');
  }

  // General terms
  for (const item of glossary.general_terms || []) {
    add(item.term, item.description, 'general_terms');
  }

  // Capital funding sources
  for (const item of glossary.capital_funding_sources || []) {
    add(item.source, `${item.source}: ${item.description}`, 'capital_funding_sources');
  }

  // Abbreviations (case-sensitive, skip if already covered above)
  for (const [abbr, meaning] of Object.entries(glossary.abbreviations || {})) {
    add(abbr, `${abbr}: ${meaning}`, 'abbreviations', '');
  }

  // Sort longer patterns first to avoid partial matches
  terms.sort((a, b) => b.pattern.source.length - a.pattern.source.length);
  return terms;
}

/**
 * Create a linker function that replaces the first occurrence of each glossary
 * term in text with a tooltip link. Tracks which terms have already been linked
 * across calls so each term is linked at most once per page.
 */
export function createGlossaryLinker(terms: GlossaryEntry[]) {
  const linked = new Set<string>();

  return function linkGlossaryTerms(text: string): string {
    let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const replacements: string[] = [];

    for (const entry of terms) {
      const key = entry.pattern.source;
      if (linked.has(key)) continue;
      const match = html.match(entry.pattern);
      if (match) {
        linked.add(key);
        const escapedTooltip = entry.tooltip.replace(/"/g, '&quot;');
        const link = `<a href="/glossary/#${entry.anchor}" class="glossary-term" tabindex="0" data-tooltip="${escapedTooltip}">${match[0]}</a>`;
        const token = `\x00GLO${replacements.length}\x00`;
        replacements.push(link);
        html = html.replace(entry.pattern, token);
      }
    }

    for (let i = 0; i < replacements.length; i++) {
      html = html.replace(`\x00GLO${i}\x00`, replacements[i]);
    }
    return html;
  };
}
