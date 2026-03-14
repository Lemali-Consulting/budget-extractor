/**Client-side fuzzy search across budget sections and tables.*/

import { useState, useMemo, useRef } from 'preact/hooks';
import Fuse from 'fuse.js';

interface SearchItem {
  sectionTitle: string;
  slug: string;
  tableId: string;
  tableType: string;
  headers: string;
  narrative: string;
  page: number;
  tableIndex: number;
  budgetType?: string;
}

interface Props {
  items: SearchItem[];
}

export default function SearchBar({ items }: Props) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fuse = useMemo(() => {
    return new Fuse(items, {
      keys: [
        { name: 'sectionTitle', weight: 2 },
        { name: 'headers', weight: 1.5 },
        { name: 'narrative', weight: 1 },
      ],
      threshold: 0.3,
      includeMatches: true,
      minMatchCharLength: 2,
    });
  }, [items]);

  const results = query.length >= 2 ? fuse.search(query, { limit: 15 }) : [];

  return (
    <div class="relative w-full max-w-xl">
      <input
        ref={inputRef}
        type="text"
        placeholder="Search sections, tables, narrative content..."
        class="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        value={query}
        onInput={(e) => {
          setQuery((e.target as HTMLInputElement).value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
      />

      {isOpen && results.length > 0 && (
        <div class="absolute top-full mt-1 w-full bg-white border rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          {results.map(({ item, matches }) => {
            const narrativeMatch = matches?.find(m => m.key === 'narrative');
            const isCapital = item.budgetType === 'capital';
            const href = isCapital ? `/capital/${item.slug}/` : `/sections/${item.slug}/`;
            return (
              <a
                key={item.tableId || item.slug}
                href={href}
                class="block px-4 py-2 hover:bg-blue-50 border-b last:border-b-0"
              >
                <div class="font-medium text-sm">
                  {isCapital && <span class="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded mr-2">Capital</span>}
                  {item.sectionTitle}
                </div>
                {item.tableIndex >= 0 && (
                  <div class="text-xs text-gray-500">
                    Page {item.page}, Table {item.tableIndex}
                    <span class="ml-2 px-1.5 py-0.5 bg-gray-100 rounded">
                      {item.tableType}
                    </span>
                  </div>
                )}
                {narrativeMatch && item.narrative && (
                  <div class="text-xs text-gray-400 mt-0.5 line-clamp-1 italic">
                    {item.narrative.substring(0, 120)}...
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
