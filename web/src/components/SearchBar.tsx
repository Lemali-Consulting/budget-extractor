/**Client-side fuzzy search across all budget tables and sections.*/

import { useState, useMemo, useRef } from 'preact/hooks';
import Fuse from 'fuse.js';

interface Table {
  id: string;
  relative_page: number;
  table_index: number;
  table_type: string;
  headers: string[];
  rows: string[][];
}

interface Section {
  section_number: number;
  title: string;
  slug: string;
  tables: Table[];
}

interface SearchItem {
  sectionTitle: string;
  slug: string;
  tableId: string;
  tableType: string;
  headers: string;
  content: string;
  page: number;
  tableIndex: number;
}

interface Props {
  sections: Section[];
}

function buildSearchIndex(sections: Section[]): SearchItem[] {
  const items: SearchItem[] = [];
  for (const section of sections) {
    // Add section itself as searchable
    items.push({
      sectionTitle: section.title,
      slug: section.slug,
      tableId: '',
      tableType: '',
      headers: '',
      content: section.title,
      page: 0,
      tableIndex: -1,
    });
    for (const table of section.tables) {
      const content = table.rows.map((r) => r.join(' ')).join(' ');
      items.push({
        sectionTitle: section.title,
        slug: section.slug,
        tableId: table.id,
        tableType: table.table_type,
        headers: table.headers.join(' '),
        content,
        page: table.relative_page,
        tableIndex: table.table_index,
      });
    }
  }
  return items;
}

export default function SearchBar({ sections }: Props) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fuse = useMemo(() => {
    const items = buildSearchIndex(sections);
    return new Fuse(items, {
      keys: [
        { name: 'sectionTitle', weight: 2 },
        { name: 'headers', weight: 1.5 },
        { name: 'content', weight: 1 },
      ],
      threshold: 0.3,
      includeMatches: true,
      minMatchCharLength: 2,
    });
  }, [sections]);

  const results = query.length >= 2 ? fuse.search(query, { limit: 15 }) : [];

  return (
    <div class="relative w-full max-w-xl">
      <input
        ref={inputRef}
        type="text"
        placeholder="Search sections, tables, positions..."
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
          {results.map(({ item }) => (
            <a
              key={item.tableId || item.slug}
              href={`/sections/${item.slug}/`}
              class="block px-4 py-2 hover:bg-blue-50 border-b last:border-b-0"
            >
              <div class="font-medium text-sm">{item.sectionTitle}</div>
              {item.tableIndex >= 0 && (
                <div class="text-xs text-gray-500">
                  Page {item.page}, Table {item.tableIndex}
                  <span class="ml-2 px-1.5 py-0.5 bg-gray-100 rounded">
                    {item.tableType}
                  </span>
                </div>
              )}
            </a>
          ))}
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
