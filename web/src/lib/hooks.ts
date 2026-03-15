/**Shared Preact hooks for chart components.*/

import { useEffect, useState } from 'preact/hooks';

export function useContainerWidth(ref: { current: HTMLDivElement | null }): number {
  const [width, setWidth] = useState(700);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(Math.floor(entry.contentRect.width) || 700);
      }
    });
    observer.observe(ref.current);
    setWidth(ref.current.clientWidth || 700);
    return () => observer.disconnect();
  }, [ref.current]);

  return width;
}
