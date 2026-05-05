/**Sankey diagram for the Money Flow page and home-page teaser.
 * Renders SVG via d3-sankey; works statically (SSR, no client directive)
 * or interactively (client:visible) with hover-dim and tooltips. */

import { useMemo, useRef, useState, useEffect } from 'preact/hooks';
import {
  sankey as d3Sankey,
  sankeyLinkHorizontal,
  sankeyJustify,
} from 'd3-sankey';

// Comparator that pins year nodes to chronological order, leaves other
// columns to d3-sankey's default (minimize link crossings).
function nodeSort(a: any, b: any): number {
  if (a.category === 'year' && b.category === 'year') {
    return parseInt(a.label, 10) - parseInt(b.label, 10);
  }
  return (b.value ?? 0) - (a.value ?? 0);
}

export interface FlowNode {
  id: string;
  label: string;
  category: string;
  href?: string;
  /** Optional explicit color for the node and the links flowing from it. */
  color?: string;
}

export interface FlowLink {
  source: string;
  target: string;
  value: number;
  /** Optional per-link color override. Falls back to source node color. */
  color?: string;
}

interface FlowSankeyProps {
  nodes: FlowNode[];
  links: FlowLink[];
  width?: number;
  height?: number;
  interactive?: boolean;
  showLabels?: boolean;
  totalAmount?: number;
}

// Defaults: nodes whose color isn't set explicitly fall back to these.
// Destinations (trunk, department, project, year) are intentionally pale so
// that the colored flows from sources read as the visual foreground.
const CATEGORY_COLORS: Record<string, string> = {
  revenue: '#2563eb',
  trunk: '#cbd5e1',
  department: '#94a3b8',
  'department-other': '#cbd5e1',
  source: '#0891b2',
  project: '#94a3b8',
  'project-other': '#cbd5e1',
  year: '#94a3b8',
};

function colorFor(node: { color?: string; category: string }): string {
  return node.color ?? CATEGORY_COLORS[node.category] ?? '#6b7280';
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function FlowSankey({
  nodes,
  links,
  width = 960,
  height = 600,
  interactive = false,
  showLabels = true,
  totalAmount,
}: FlowSankeyProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState<number>(width);
  const [hovered, setHovered] = useState<{ kind: 'node' | 'link'; key: string } | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    if (!interactive || !containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        if (w > 0) setMeasuredWidth(w);
      }
    });
    observer.observe(containerRef.current);
    setMeasuredWidth(containerRef.current.clientWidth || width);
    return () => observer.disconnect();
  }, [interactive]);

  const renderWidth = interactive ? measuredWidth : width;

  const layout = useMemo(() => {
    const nodeMap = new Map(nodes.map((n) => [n.id, { ...n }]));
    const sankeyNodes = nodes.map((n) => ({ ...n }));
    const sankeyLinks = links
      .filter((l) => nodeMap.has(l.source) && nodeMap.has(l.target) && l.value > 0)
      .map((l) => ({ ...l }));

    const generator = d3Sankey<FlowNode, FlowLink>()
      .nodeId((d: any) => d.id)
      .nodeAlign(sankeyJustify)
      .nodeSort(nodeSort)
      .nodeWidth(14)
      .nodePadding(showLabels ? 8 : 4)
      .extent([
        [1, 1],
        [renderWidth - 1, height - 1],
      ]);

    return generator({
      nodes: sankeyNodes as any,
      links: sankeyLinks as any,
    });
  }, [nodes, links, renderWidth, height, showLabels]);

  // Build adjacency for hover dimming.
  const linkKey = (l: any) =>
    `${typeof l.source === 'object' ? l.source.id : l.source}->${typeof l.target === 'object' ? l.target.id : l.target}`;

  const isLit = (kind: 'node' | 'link', key: string): boolean => {
    if (!hovered) return true;
    if (hovered.kind === 'node') {
      if (kind === 'node') return key === hovered.key;
      // Link is lit if either endpoint is the hovered node.
      const [s, t] = key.split('->');
      return s === hovered.key || t === hovered.key;
    } else {
      if (kind === 'link') return key === hovered.key;
      const [s, t] = hovered.key.split('->');
      return key === s || key === t;
    }
  };

  const showTooltipAt = (e: any, text: string) => {
    if (!interactive) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, text });
  };

  return (
    <div ref={containerRef} class="relative w-full">
      <svg
        viewBox={`0 0 ${renderWidth} ${height}`}
        width="100%"
        height={height}
        style="max-width: 100%; height: auto;"
        role="img"
        aria-label="Sankey flow diagram"
      >
        <g>
          {(layout.links as any[]).map((l) => {
            const key = linkKey(l);
            const lit = isLit('link', key);
            const path = sankeyLinkHorizontal()(l);
            const sourceColor = (l as any).color ?? colorFor(l.source as any);
            return (
              <path
                key={key}
                d={path ?? ''}
                fill="none"
                stroke={sourceColor}
                stroke-width={Math.max(1, l.width ?? 1)}
                stroke-opacity={lit ? 0.55 : 0.08}
                style={interactive ? 'cursor: pointer; transition: stroke-opacity 120ms;' : undefined}
                onMouseEnter={
                  interactive
                    ? (e: any) => {
                        setHovered({ kind: 'link', key });
                        showTooltipAt(
                          e,
                          `${(l.source as any).label} → ${(l.target as any).label}: ${fmtMoney(l.value)}`,
                        );
                      }
                    : undefined
                }
                onMouseMove={interactive ? (e: any) => showTooltipAt(e, tooltip?.text ?? '') : undefined}
                onMouseLeave={
                  interactive
                    ? () => {
                        setHovered(null);
                        setTooltip(null);
                      }
                    : undefined
                }
              />
            );
          })}
        </g>
        <g>
          {(layout.nodes as any[]).map((n) => {
            const lit = isLit('node', n.id);
            const fill = colorFor(n);
            const nodeHeight = (n.y1 ?? 0) - (n.y0 ?? 0);
            const nodeRect = (
              <rect
                x={n.x0}
                y={n.y0}
                width={(n.x1 ?? 0) - (n.x0 ?? 0)}
                height={nodeHeight}
                fill={fill}
                fill-opacity={lit ? 0.95 : 0.25}
                style={
                  interactive
                    ? 'cursor: pointer; transition: fill-opacity 120ms;'
                    : undefined
                }
                onMouseEnter={
                  interactive
                    ? (e: any) => {
                        setHovered({ kind: 'node', key: n.id });
                        const share =
                          totalAmount && totalAmount > 0
                            ? ` (${((n.value / totalAmount) * 100).toFixed(1)}%)`
                            : '';
                        showTooltipAt(e, `${n.label}: ${fmtMoney(n.value)}${share}`);
                      }
                    : undefined
                }
                onMouseMove={interactive ? (e: any) => showTooltipAt(e, tooltip?.text ?? '') : undefined}
                onMouseLeave={
                  interactive
                    ? () => {
                        setHovered(null);
                        setTooltip(null);
                      }
                    : undefined
                }
              />
            );

            const isYearLabel = /^\d{4}$/.test(n.label);
            const isNarrow = renderWidth < 520;
            // Drop in-band labels below a height threshold to avoid collisions;
            // users can tap/hover for tooltips. Year labels are kept down to 8px
            // since they're short and on the diagram's edge. On narrow viewports
            // raise the non-year threshold so only the largest interior nodes
            // get labeled — adjacent-column labels otherwise run into each other.
            const minLabelHeight = isYearLabel ? 8 : isNarrow ? 28 : 14;
            // At narrow widths, truncate long interior labels so they don't
            // bleed into the neighboring column.
            const truncatedLabel =
              isNarrow && !isYearLabel && n.label.length > 16
                ? n.label.slice(0, 15) + '…'
                : n.label;
            const labelEl = showLabels && nodeHeight >= minLabelHeight ? (
              <text
                x={(n.x0 ?? 0) < renderWidth / 2 ? (n.x1 ?? 0) + 6 : (n.x0 ?? 0) - 6}
                y={((n.y0 ?? 0) + (n.y1 ?? 0)) / 2}
                dy="0.35em"
                text-anchor={(n.x0 ?? 0) < renderWidth / 2 ? 'start' : 'end'}
                font-size={isYearLabel ? 13 : isNarrow ? 10 : 11}
                font-weight={isYearLabel ? 600 : 400}
                fill="#1f2937"
                fill-opacity={lit ? 1 : 0.35}
                style="pointer-events: none; font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;"
              >
                {truncatedLabel}
              </text>
            ) : null;

            const content = (
              <g key={n.id}>
                {nodeRect}
                {labelEl}
              </g>
            );

            if (interactive && n.href) {
              return (
                <a key={n.id} href={n.href}>
                  {content}
                </a>
              );
            }
            return content;
          })}
        </g>
      </svg>
      {interactive && tooltip && (
        <div
          class="pointer-events-none absolute z-10 rounded bg-gray-900 px-2 py-1 text-xs text-white shadow"
          style={`left: ${tooltip.x + 12}px; top: ${tooltip.y + 12}px;`}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
