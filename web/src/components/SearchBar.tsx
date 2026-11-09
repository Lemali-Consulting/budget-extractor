/**Client-side fuzzy search across budget sections and tables.*/

import { useState, useMemo, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import Fuse from 'fuse.js';

interface SearchItem {
  sectionTitle: string;
  slug: string;
  tableId: string;
  tableType: string;
  headers: string;
  narrative: string;
  lineItems: string;
  page: number;
  label?: string;
  tableIndex: number;
  budgetType?: string;
  href?: string;
}

interface Props {
  items: SearchItem[];
  /** Route prefix of the budget year being searched ("" for the headline, "/2026" for the archive). */
  routePrefix?: string;
}

/** Highlight matched character ranges in text using Fuse.js match indices. */
function highlightMatches(
  text: string,
  indices: readonly [number, number][] | undefined,
  maxLen?: number,
): ComponentChildren {
  if (!indices || indices.length === 0) {
    return maxLen ? text.substring(0, maxLen) + (text.length > maxLen ? '...' : '') : text;
  }

  // If we have a maxLen, find the first match and center the snippet around it
  let start = 0;
  let display = text;
  let adjustedIndices = [...indices];

  if (maxLen && text.length > maxLen) {
    const firstMatch = indices[0];
    // Center the snippet around the first match
    start = Math.max(0, firstMatch[0] - Math.floor(maxLen / 4));
    const end = Math.min(text.length, start + maxLen);
    start = Math.max(0, end - maxLen);
    display = (start > 0 ? '...' : '') + text.substring(start, end) + (end < text.length ? '...' : '');
    const prefixLen = start > 0 ? 3 : 0; // length of '...'
    adjustedIndices = indices
      .map(([s, e]): [number, number] => [s - start + prefixLen, e - start + prefixLen])
      .filter(([s, e]) => e >= prefixLen && s < display.length);
  }

  // Build segments from the adjusted indices
  const parts: ComponentChildren[] = [];
  let pos = 0;
  for (const [s, e] of adjustedIndices) {
    if (s > pos) parts.push(display.substring(pos, s));
    if (s >= 0 && e < display.length) {
      parts.push(<mark class="bg-yellow-300 rounded-sm px-0.5">{display.substring(Math.max(s, 0), e + 1)}</mark>);
    }
    pos = e + 1;
  }
  if (pos < display.length) parts.push(display.substring(pos));
  return parts;
}

export default function SearchBar({ items, routePrefix = '' }: Props) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = 'search-results-listbox';

  const fuse = useMemo(() => {
    return new Fuse(items, {
      keys: [
        { name: 'sectionTitle', weight: 2 },
        { name: 'headers', weight: 1.5 },
        { name: 'narrative', weight: 1 },
        { name: 'lineItems', weight: 0.8 },
      ],
      threshold: 0.3,
      includeMatches: true,
      minMatchCharLength: 2,
    });
  }, [items]);

  const results = query.length >= 2 ? fuse.search(query, { limit: 15 }) : [];

  function handleKeyDown(e: KeyboardEvent) {
    if (!isOpen || results.length === 0) {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setActiveIndex(-1);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < results.length) {
          const item = results[activeIndex].item;
          window.location.href = getItemHref(item);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
        break;
    }
  }

  function getItemHref(item: SearchItem): string {
    if (item.href) return item.href;
    if (item.budgetType === 'capital') return `${routePrefix}/capital/${item.slug}/`;
    return `${routePrefix}/sections/${item.slug}/`;
  }

  const budgetTypeLabels: Record<string, { text: string; bg: string; fg: string }> = {
    capital: { text: 'Capital', bg: 'bg-ps-blue-100', fg: 'text-ps-blue-700' },
    glossary: { text: 'Glossary', bg: 'bg-purple-100', fg: 'text-purple-700' },
    changes: { text: 'Changes', bg: 'bg-ps-yellow-100', fg: 'text-ps-yellow-700' },
  };

  // Scroll active option into view
  if (listRef.current && activeIndex >= 0) {
    const activeEl = listRef.current.children[activeIndex] as HTMLElement | undefined;
    activeEl?.scrollIntoView({ block: 'nearest' });
  }

  return (
    <div class="relative w-full max-w-xl">
      <label for="budget-search" class="sr-only">Search sections, tables, and narrative content</label>
      <input
        id="budget-search"
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={isOpen && results.length > 0}
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? `search-option-${activeIndex}` : undefined}
        aria-autocomplete="list"
        placeholder="Search sections, tables, narrative content..."
        class="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ps-blue-400"
        value={query}
        onInput={(e) => {
          setQuery((e.target as HTMLInputElement).value);
          setIsOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => { setIsOpen(false); setActiveIndex(-1); }, 200)}
        onKeyDown={handleKeyDown}
      />

      {isOpen && results.length > 0 && (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          class="absolute top-full mt-1 w-full bg-white border rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto"
        >
          {results.map(({ item, matches }, index) => {
            const narrativeMatch = matches?.find(m => m.key === 'narrative');
            const lineItemsMatch = matches?.find(m => m.key === 'lineItems');
            const titleMatch = matches?.find(m => m.key === 'sectionTitle');
            const href = getItemHref(item);
            const badge = item.budgetType ? budgetTypeLabels[item.budgetType] : undefined;
            const isActive = index === activeIndex;
            // Show the best content match (narrative or line items)
            const contentMatch = narrativeMatch && item.narrative ? narrativeMatch : null;
            const lineMatch = lineItemsMatch && item.lineItems ? lineItemsMatch : null;
            return (
              <a
                key={`${item.tableId || item.slug}-${index}`}
                id={`search-option-${index}`}
                role="option"
                aria-selected={isActive}
                href={href}
                class={`block px-4 py-2 border-b last:border-b-0 ${isActive ? 'bg-ps-blue-100' : 'hover:bg-ps-blue-50'}`}
              >
                <div class="font-medium text-sm">
                  {badge && <span class={`text-xs px-1.5 py-0.5 ${badge.bg} ${badge.fg} rounded mr-2`}>{badge.text}</span>}
                  {highlightMatches(item.sectionTitle, titleMatch?.indices as [number, number][] | undefined)}
                </div>
                {item.tableIndex >= 0 && (
                  <div class="text-xs text-gray-500">
                    {item.label && <span class="font-medium text-gray-600 mr-2">{item.label}</span>}
                    <span class="px-1.5 py-0.5 bg-gray-100 rounded">
                      {item.tableType}
                    </span>
                  </div>
                )}
                {contentMatch && (
                  <div class="text-xs text-gray-400 mt-0.5 line-clamp-1 italic">
                    {highlightMatches(item.narrative, contentMatch.indices as [number, number][] | undefined, 120)}
                  </div>
                )}
                {!contentMatch && lineMatch && (
                  <div class="text-xs text-gray-400 mt-0.5 line-clamp-1">
                    {highlightMatches(item.lineItems, lineMatch.indices as [number, number][] | undefined, 120)}
                  </div>
                )}
              </a>
            );
          })}
        </div>
      )}

      {isOpen && query.length >= 2 && results.length === 0 && (
        <div class="absolute top-full mt-1 w-full bg-white border rounded-lg shadow-lg z-50 px-4 py-3 text-sm text-gray-500">
          No results found.
        </div>
      )}
    </div>
  );
}
