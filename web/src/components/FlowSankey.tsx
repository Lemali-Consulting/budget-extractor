/**Sankey diagram for the Money Flow page and home-page teaser.
 * Renders SVG via d3-sankey; works statically (SSR, no client directive)
 * or interactively (client:visible) with hover-dim and tooltips. */

import { useMemo, useRef, useState, useEffect } from 'preact/hooks';
import { BODY_FONT_CSS } from '../lib/brand-fonts.mjs';
import { spreadLabels } from '../lib/label-spread';
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
  revenue: '#046BD1',
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
  const isNarrow = renderWidth < 520;
  // On a wide diagram the outermost columns' names sit on the white space
  // beside it, so room is kept for the longest name on each side.
  const outerNames = showLabels && !isNarrow;
  const margins = useMemo(
    () => (outerNames ? outerLabelMargins({ nodes, links }) : { left: 0, right: 0 }),
    [nodes, links, outerNames],
  );

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
        [1 + margins.left, 1],
        [renderWidth - 1 - margins.right, height - 1],
      ]);

    return generator({
      nodes: sankeyNodes as any,
      links: sankeyLinks as any,
    });
  }, [nodes, links, renderWidth, height, showLabels, margins]);

  const labelled = (n: any): boolean => showLabels && (n.y1 ?? 0) - (n.y0 ?? 0) >= minLabelHeight({ label: n.label, isNarrow });
  const labelY = useMemo(
    () => labelPositions({ nodes: (layout.nodes as any[]).filter(labelled), isNarrow, height }),
    [layout, isNarrow, height, showLabels],
  );

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
            // A band into a node with a page opens that page; others are hover-only.
            const href: string | undefined = interactive ? (l.target as any).href : undefined;
            const band = (
              <path
                key={key}
                d={path ?? ''}
                fill="none"
                stroke={sourceColor}
                stroke-width={Math.max(1, l.width ?? 1)}
                stroke-opacity={lit ? 0.55 : 0.08}
                style={interactive ? `cursor: ${href ? 'pointer' : 'default'}; transition: stroke-opacity 120ms;` : undefined}
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
            return href ? (
              <a key={key} href={href}>
                {band}
              </a>
            ) : (
              band
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
                data-node-id={n.id}
                x={n.x0}
                y={n.y0}
                width={(n.x1 ?? 0) - (n.x0 ?? 0)}
                height={nodeHeight}
                fill={fill}
                fill-opacity={lit ? 0.95 : 0.25}
                style={
                  interactive
                    ? `cursor: ${n.href ? 'pointer' : 'default'}; transition: fill-opacity 120ms;`
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

            const isYearLabel = YEAR_LABEL.test(n.label);
            // At narrow widths, truncate long interior labels so they don't
            // bleed into the neighboring column.
            const truncatedLabel =
              isNarrow && !isYearLabel && n.label.length > 16
                ? n.label.slice(0, 15) + '…'
                : n.label;
            const side = labelSide({
              node: n,
              outerNames,
              lastColumnX: Math.max(...(layout.nodes as any[]).map((m) => m.x0 ?? 0)),
              renderWidth,
            });
            const labelEl = labelled(n) ? (
              <text
                x={side === 'right' ? (n.x1 ?? 0) + LABEL_NODE_GAP : (n.x0 ?? 0) - LABEL_NODE_GAP}
                y={labelY.get(n.id) ?? ((n.y0 ?? 0) + (n.y1 ?? 0)) / 2}
                dy="0.35em"
                text-anchor={side === 'right' ? 'start' : 'end'}
                font-size={labelFontSize({ label: n.label, isNarrow })}
                font-weight={isYearLabel ? 600 : 400}
                fill="#1f2937"
                fill-opacity={lit ? 1 : 0.35}
                stroke={LABEL_HALO_COLOR}
                stroke-width={LABEL_HALO_WIDTH}
                stroke-linejoin="round"
                stroke-opacity={lit ? 0.9 : 0.3}
                paint-order="stroke"
                style={`pointer-events: none; font-family: ${BODY_FONT_CSS};`}
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
          data-testid="flow-tooltip"
          style={`left: ${tooltip.x + 12}px; top: ${tooltip.y + 12}px;`}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

const YEAR_LABEL = /^\d{4}$/;
/** Space between a node and its printed name. */
const LABEL_NODE_GAP = 6;
/** The white outline drawn behind each name so it reads over any band color. */
const LABEL_HALO_COLOR = '#ffffff';
const LABEL_HALO_WIDTH = 3;
/**
 * Names can't be measured during the static build, so the room kept beside
 * the diagram is estimated: an average character width for the body font plus
 * a fixed allowance, both as shares of the font size. Measured in the browser
 * (2026-11-16), long names run about 0.42em a character; short all-capitals
 * names ("CDBG", "PAYGO") run wider, which the allowance covers. Erring wide
 * only adds white space; a flow-labels test fails if a name is clipped.
 */
const CHAR_WIDTH_EM = 0.45;
const LABEL_WIDTH_ALLOWANCE_EM = 1;

function estimatedLabelWidth(label: string): number {
  return (label.length * CHAR_WIDTH_EM + LABEL_WIDTH_ALLOWANCE_EM) * labelFontSize({ label, isNarrow: false });
}

function labelFontSize(opts: { label: string; isNarrow: boolean }): number {
  if (YEAR_LABEL.test(opts.label)) return 13;
  return opts.isNarrow ? 10 : 11;
}

/** Room to keep beside the diagram for the longest name in its first (sources) and last (destinations) columns. */
function outerLabelMargins(opts: { nodes: FlowNode[]; links: FlowLink[] }): { left: number; right: number } {
  const targets = new Set(opts.links.map((l) => l.target));
  const sources = new Set(opts.links.map((l) => l.source));
  const widest = (column: FlowNode[]): number =>
    Math.max(
      0,
      ...column.map((n) => estimatedLabelWidth(n.label) + LABEL_NODE_GAP + LABEL_HALO_WIDTH),
    );
  return {
    left: widest(opts.nodes.filter((n) => !targets.has(n.id))),
    right: widest(opts.nodes.filter((n) => !sources.has(n.id))),
  };
}

/** Which side of its node a name is printed on: outside the diagram for the outer columns, toward the middle otherwise. */
function labelSide(opts: { node: any; outerNames: boolean; lastColumnX: number; renderWidth: number }): 'left' | 'right' {
  const x0: number = opts.node.x0 ?? 0;
  if (opts.outerNames && opts.node.depth === 0) return 'left';
  if (opts.outerNames && x0 === opts.lastColumnX) return 'right';
  return x0 < opts.renderWidth / 2 ? 'right' : 'left';
}
/** Space between label baselines in one column: an 11px line plus breathing room. */
const LABEL_LINE_GAP = 13;
const LABEL_EDGE_MARGIN = 6;

/**
 * The smallest node that gets a printed name. On a wide diagram every node is
 * named, so the caption's counts can be checked by eye (fact-check sheet
 * "1126", row 7). On narrow screens only the largest interior nodes are,
 * since labels there run into the next column; years, short and on the edge,
 * keep theirs down to 8px. Unnamed nodes still show their name on hover.
 */
function minLabelHeight(opts: { label: string; isNarrow: boolean }): number {
  if (YEAR_LABEL.test(opts.label)) return 8;
  return opts.isNarrow ? 28 : 0;
}

/** Where each labelled node's name sits: centred on the node, spread apart within its column so none overlap. */
function labelPositions(opts: { nodes: any[]; isNarrow: boolean; height: number }): Map<string, number> {
  const columns = new Map<number, any[]>();
  for (const n of opts.nodes) columns.set(n.x0 ?? 0, [...(columns.get(n.x0 ?? 0) ?? []), n]);
  const out = new Map<string, number>();
  for (const column of columns.values()) {
    const spread = spreadLabels({
      positions: column.map((n) => ((n.y0 ?? 0) + (n.y1 ?? 0)) / 2),
      minGap: opts.isNarrow ? LABEL_LINE_GAP - 1 : LABEL_LINE_GAP,
      min: LABEL_EDGE_MARGIN,
      max: opts.height - LABEL_EDGE_MARGIN,
    });
    column.forEach((n, i) => out.set(n.id, spread[i]));
  }
  return out;
}
