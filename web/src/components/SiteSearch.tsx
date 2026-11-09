/**Full-text search box for the headline budget, backed by the Pagefind index built at deploy time.*/

import { useState, useRef, useEffect } from 'preact/hooks';
import { PAGEFIND_PATH, PAGEFIND_BUDGET_TYPE } from '../lib/pagefind';

/** Shortest query that triggers a search. */
const MIN_QUERY_LENGTH = 2;
/** Number of results whose data (title, excerpt) is loaded and shown. */
const RESULT_LIMIT = 10;
/** Words of context in each result excerpt. */
const EXCERPT_LENGTH = 20;
const LISTBOX_ID = 'search-results-listbox';
const UNAVAILABLE_MESSAGE = 'Search is available on the built site.';

interface PagefindSubResult {
  url: string;
  excerpt: string;
}

interface PagefindResultData {
  url: string;
  excerpt: string;
  meta: { title?: string; budgetType?: string };
  sub_results?: PagefindSubResult[];
}

interface PagefindHit {
  data: () => Promise<PagefindResultData>;
}

interface PagefindApi {
  options: (opts: { excerptLength: number }) => Promise<void>;
  /** Resolves to null when a newer search superseded this one. */
  debouncedSearch: (query: string) => Promise<{ results: PagefindHit[] } | null>;
}

interface DisplayResult {
  href: string;
  title: string;
  budgetType: string;
  /** Pagefind excerpt: HTML-escaped text with <mark> around matches. */
  excerptHtml: string;
}

const BADGE_STYLES: Record<string, { bg: string; fg: string }> = {
  [PAGEFIND_BUDGET_TYPE.CAPITAL]: { bg: 'bg-ps-blue-100', fg: 'text-ps-blue-700' },
  [PAGEFIND_BUDGET_TYPE.OPERATING]: { bg: 'bg-gray-100', fg: 'text-gray-700' },
  [PAGEFIND_BUDGET_TYPE.GLOSSARY]: { bg: 'bg-purple-100', fg: 'text-purple-700' },
};
const DEFAULT_BADGE_STYLE = BADGE_STYLES[PAGEFIND_BUDGET_TYPE.OPERATING];

/** Prefer the first heading-anchored sub-result so the link lands on the matching part of the page. */
function toDisplayResult(data: PagefindResultData): DisplayResult {
  const anchored = data.sub_results?.find((sub) => sub.url.includes('#') && sub.url !== data.url);
  return {
    href: anchored?.url ?? data.url,
    title: data.meta.title ?? data.url,
    budgetType: data.meta.budgetType ?? PAGEFIND_BUDGET_TYPE.OPERATING,
    excerptHtml: anchored?.excerpt ?? data.excerpt,
  };
}

export default function SiteSearch() {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [results, setResults] = useState<DisplayResult[]>([]);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const pagefindRef = useRef<Promise<PagefindApi | null> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /** Load Pagefind once, on first interaction; resolves to null when no index is served. */
  function loadPagefind(): Promise<PagefindApi | null> {
    if (!pagefindRef.current) {
      pagefindRef.current = (async (): Promise<PagefindApi | null> => {
        try {
          const api = (await import(/* @vite-ignore */ PAGEFIND_PATH)) as PagefindApi;
          await api.options({ excerptLength: EXCERPT_LENGTH });
          return api;
        } catch {
          return null;
        }
      })();
    }
    return pagefindRef.current;
  }

  useEffect(() => {
    if (query.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const api = await loadPagefind();
      if (cancelled) return;
      if (!api) {
        setIsUnavailable(true);
        return;
      }
      const search = await api.debouncedSearch(query);
      if (cancelled || search === null) return;
      const found = await Promise.all(search.results.slice(0, RESULT_LIMIT).map((hit) => hit.data()));
      if (cancelled) return;
      setResults(found.map(toDisplayResult));
      setHasSearched(true);
      setActiveIndex(-1);
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

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
          window.location.href = results[activeIndex].href;
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
        break;
    }
  }

  // Scroll active option into view
  if (listRef.current && activeIndex >= 0) {
    const activeEl = listRef.current.children[activeIndex] as HTMLElement | undefined;
    activeEl?.scrollIntoView({ block: 'nearest' });
  }

  const hasQuery = query.length >= MIN_QUERY_LENGTH;
  const showResults = isOpen && hasQuery && results.length > 0;
  const showUnavailable = isOpen && hasQuery && isUnavailable;
  const showEmpty = isOpen && hasQuery && !isUnavailable && hasSearched && results.length === 0;

  return (
    <div class="relative w-full max-w-xl">
      <label for="budget-search" class="sr-only">Search the full text of the 2027 budget</label>
      <input
        id="budget-search"
        type="text"
        role="combobox"
        aria-expanded={showResults}
        aria-controls={LISTBOX_ID}
        aria-activedescendant={activeIndex >= 0 ? `search-option-${activeIndex}` : undefined}
        aria-autocomplete="list"
        placeholder="Search the 2027 budget…"
        class="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ps-blue-400"
        value={query}
        onInput={(e) => {
          setQuery((e.target as HTMLInputElement).value);
          setIsOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => {
          setIsOpen(true);
          void loadPagefind();
        }}
        onBlur={() => setTimeout(() => { setIsOpen(false); setActiveIndex(-1); }, 200)}
        onKeyDown={handleKeyDown}
      />

      {showResults && (
        <div
          ref={listRef}
          id={LISTBOX_ID}
          role="listbox"
          class="absolute top-full mt-1 w-full bg-white border rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto"
        >
          {results.map((result, index) => {
            const badge = BADGE_STYLES[result.budgetType] ?? DEFAULT_BADGE_STYLE;
            const isActive = index === activeIndex;
            return (
              <a
                key={`${result.href}-${index}`}
                id={`search-option-${index}`}
                role="option"
                aria-selected={isActive}
                href={result.href}
                class={`block px-4 py-2 border-b last:border-b-0 ${isActive ? 'bg-ps-blue-100' : 'hover:bg-ps-blue-50'}`}
              >
                <div class="font-medium text-sm">
                  <span class={`text-xs px-1.5 py-0.5 ${badge.bg} ${badge.fg} rounded mr-2`}>{result.budgetType}</span>
                  {result.title}
                </div>
                <div
                  class="text-xs text-gray-500 mt-0.5 line-clamp-2 [&_mark]:bg-yellow-300 [&_mark]:rounded-sm [&_mark]:px-0.5"
                  dangerouslySetInnerHTML={{ __html: result.excerptHtml }}
                />
              </a>
            );
          })}
        </div>
      )}

      {showEmpty && (
        <div class="absolute top-full mt-1 w-full bg-white border rounded-lg shadow-lg z-50 px-4 py-3 text-sm text-gray-500">
          No results found.
        </div>
      )}

      {showUnavailable && (
        <div class="absolute top-full mt-1 w-full bg-white border rounded-lg shadow-lg z-50 px-4 py-3 text-sm text-gray-500">
          {UNAVAILABLE_MESSAGE}
        </div>
      )}
    </div>
  );
}
