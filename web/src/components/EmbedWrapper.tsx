/**Wrapper for embeddable charts — handles PNG download and optional title.*/

import { useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

interface Props {
  title?: string;
  children: ComponentChildren;
}

export default function EmbedWrapper({ title, children }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);

  const handleDownload = async () => {
    if (!chartRef.current) return;
    const svg = chartRef.current.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      const scale = 2; // Retina
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx.scale(scale, scale);
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, img.width, img.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      const link = document.createElement('a');
      link.download = `${(title || 'chart').replace(/\s+/g, '-').toLowerCase()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = url;
  };

  return (
    <div>
      {title && <h2 class="text-lg font-semibold mb-3">{title}</h2>}
      <div ref={chartRef}>
        {children}
      </div>
      <div class="mt-2 flex justify-end">
        <button
          onClick={handleDownload}
          class="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1 cursor-pointer"
          title="Download chart as PNG"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download PNG
        </button>
      </div>
    </div>
  );
}
