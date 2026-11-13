/**Small button that shows an iframe embed snippet for a chart.*/

import { useState } from 'preact/hooks';
import { SITE_URL } from '../lib/site.mjs';

interface Props {
  embedPath: string;
  width?: number;
  height?: number;
}

export default function EmbedButton({ embedPath, width = 700, height = 450 }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const snippet = `<iframe src="${SITE_URL}${embedPath}" width="${width}" height="${height}" frameborder="0" style="border: 1px solid #e5e7eb; border-radius: 8px;" title="Pittsburgh Budget Explorer chart"></iframe>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div class="inline-block relative">
      <button
        onClick={() => setOpen(!open)}
        class="text-xs text-gray-400 hover:text-ps-blue-600 flex items-center gap-1 cursor-pointer"
        title="Get embed code"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        Embed
      </button>
      {open && (
        <div class="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-96">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-medium text-gray-700">Embed this chart</span>
            <button onClick={() => setOpen(false)} class="text-gray-400 hover:text-gray-600 text-sm cursor-pointer">&times;</button>
          </div>
          <textarea
            readonly
            class="w-full text-xs font-mono bg-gray-50 border rounded p-2 h-20 resize-none"
            value={snippet}
          />
          <button
            onClick={handleCopy}
            class="mt-2 w-full text-xs bg-ps-blue-600 text-white rounded py-1.5 hover:bg-ps-blue-700 cursor-pointer"
          >
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
        </div>
      )}
    </div>
  );
}
