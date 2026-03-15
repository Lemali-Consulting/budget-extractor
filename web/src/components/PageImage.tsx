/**Lightbox component for viewing PDF page images alongside extracted tables.*/

import { useState, useEffect } from 'preact/hooks';

interface Props {
  slug: string;
  page: number;
  label?: string;
}

export default function PageImage({ slug, page, label }: Props) {
  const [open, setOpen] = useState(false);
  const src = `/pages/${slug}/P${page}.webp`;

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <>
      <button
        class="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
        onClick={() => setOpen(true)}
        title="View original PDF page"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        {label || 'View source page'}
      </button>

      {open && (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 cursor-zoom-out"
          onClick={() => setOpen(false)}
        >
          <div class="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button
              class="absolute -top-3 -right-3 w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-600 hover:text-gray-900 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              onClick={() => setOpen(false)}
              aria-label="Close image viewer"
            >
              &times;
            </button>
            <img
              src={src}
              alt={`PDF page ${page}`}
              class="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl bg-white cursor-zoom-out"
              onClick={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
