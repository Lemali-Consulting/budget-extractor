/**Lightbox component for viewing PDF page images alongside extracted tables.
 * When an adopted version of the page exists (the amendment changed it), the
 * lightbox offers an Amended/Adopted toggle so readers can cross-reference both.*/

import { useState, useEffect } from 'preact/hooks';

interface Props {
  slug: string;
  page: number;
  label?: string;
  /** True when an adopted (pre-amendment) image exists for this page. */
  adoptedAvailable?: boolean;
}

type Version = 'amended' | 'adopted';

export default function PageImage({ slug, page, label, adoptedAvailable = false }: Props) {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState<Version>('amended');

  const amendedSrc = `/pages/${slug}/P${page}.webp`;
  const adoptedSrc = `/pages-adopted/${slug}/P${page}.webp`;
  const src = adoptedAvailable && version === 'adopted' ? adoptedSrc : amendedSrc;

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  // Always reopen on the canonical (amended) view.
  function openViewer() {
    setVersion('amended');
    setOpen(true);
  }

  return (
    <>
      <button
        class="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
        onClick={openViewer}
        title="View original PDF page"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        {label || 'View source page'}
        {adoptedAvailable && (
          <span class="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold uppercase tracking-wide">
            amended
          </span>
        )}
      </button>

      {open && (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 cursor-zoom-out"
          onClick={() => setOpen(false)}
        >
          <div class="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <button
              class="absolute -top-3 -right-3 w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-600 hover:text-gray-900 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              onClick={() => setOpen(false)}
              aria-label="Close image viewer"
            >
              &times;
            </button>

            {adoptedAvailable && (
              <div
                class="mb-2 inline-flex rounded-lg bg-white/90 p-1 shadow-lg"
                role="group"
                aria-label="Choose budget version"
              >
                <button
                  class={`flex flex-col items-center leading-tight px-3 py-1 text-sm font-medium rounded-md transition ${
                    version === 'amended' ? 'bg-amber-500 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  aria-pressed={version === 'amended'}
                  onClick={() => setVersion('amended')}
                >
                  <span>Amended</span>
                  <span class="text-[10px] font-normal opacity-80">Apr 2026</span>
                </button>
                <button
                  class={`flex flex-col items-center leading-tight px-3 py-1 text-sm font-medium rounded-md transition ${
                    version === 'adopted' ? 'bg-gray-700 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  aria-pressed={version === 'adopted'}
                  onClick={() => setVersion('adopted')}
                >
                  <span>Adopted</span>
                  <span class="text-[10px] font-normal opacity-80">Dec 2025</span>
                </button>
              </div>
            )}

            <img
              src={src}
              alt={`PDF page ${page} (${adoptedAvailable ? version : 'amended'})`}
              class="max-w-[90vw] max-h-[80vh] rounded-lg shadow-2xl bg-white cursor-zoom-out"
              onClick={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
