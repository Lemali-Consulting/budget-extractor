/**Lightbox component for viewing chart/figure images at full size.*/

import { useState, useEffect } from 'preact/hooks';

interface Props {
  src: string;
  alt: string;
  label: string;
}

export default function ChartImage({ src, alt, label }: Props) {
  const [open, setOpen] = useState(false);

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
      <div class="my-4 rounded-lg border overflow-hidden bg-white">
        <div class="px-4 py-2 bg-blue-50 border-b text-xs text-blue-700 font-medium">
          {label}
        </div>
        <div class="p-4 flex justify-center">
          <img
            src={src}
            alt={alt}
            class="max-w-full max-h-[500px] object-contain cursor-zoom-in"
            loading="lazy"
            onClick={() => setOpen(true)}
            title="Click to enlarge"
          />
        </div>
      </div>

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
              alt={alt}
              class="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl bg-white cursor-zoom-out"
              onClick={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
