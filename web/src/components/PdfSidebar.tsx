/**Sticky sidebar showing the PDF page image alongside extracted content.*/

import { useState, useEffect } from 'preact/hooks';

interface Props {
  slug: string;
  totalPages: number;
  startPage: number;
}

export default function PdfSidebar({ slug, totalPages, startPage }: Props) {
  const [open, setOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  const absolutePage = startPage + currentPage;
  const src = `/pages/${slug}/P${currentPage}.png`;

  useEffect(() => {
    if (!open) return;

    // Watch for scroll position to auto-sync page
    const markers = document.querySelectorAll('[data-page-marker]');
    if (markers.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const page = parseInt((entry.target as HTMLElement).dataset.pageMarker || '0', 10);
            setCurrentPage(page);
          }
        }
      },
      { rootMargin: '-20% 0px -60% 0px' }
    );

    markers.forEach((m) => observer.observe(m));
    return () => observer.disconnect();
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        class={`fixed bottom-4 right-4 z-40 px-3 py-2 rounded-lg shadow-lg text-sm font-medium transition ${
          open
            ? 'bg-gray-800 text-white hover:bg-gray-700'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {open ? 'Hide PDF' : 'Show PDF'}
      </button>

      {open && (
        <div class="fixed top-0 right-0 w-[420px] h-full bg-white border-l shadow-2xl z-30 flex flex-col">
          <div class="flex items-center justify-between px-3 py-2 bg-gray-50 border-b text-sm">
            <span class="font-medium text-gray-700">
              Page {absolutePage}
            </span>
            <div class="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                disabled={currentPage <= 0}
                class="px-2 py-0.5 rounded hover:bg-gray-200 disabled:opacity-30"
              >
                &larr;
              </button>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                disabled={currentPage >= totalPages - 1}
                class="px-2 py-0.5 rounded hover:bg-gray-200 disabled:opacity-30"
              >
                &rarr;
              </button>
              <button
                onClick={() => setOpen(false)}
                class="ml-2 px-2 py-0.5 rounded hover:bg-gray-200 text-gray-500"
              >
                &times;
              </button>
            </div>
          </div>
          <div class="flex-1 overflow-auto p-2 bg-gray-100">
            <img
              src={src}
              alt={`PDF page ${absolutePage}`}
              class="w-full rounded shadow bg-white"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).parentElement!.innerHTML =
                  '<div class="flex items-center justify-center h-48 text-sm text-gray-400">Page image not available</div>';
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
