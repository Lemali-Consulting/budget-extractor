/**Interactive budget balls visualization — each ball = a unit of spending, clustered by department.*/

import { useEffect, useRef, useState, useCallback } from 'preact/hooks';
import { useContainerWidth } from '../lib/hooks';
import { assignColor, OTHER_COLOR } from '../lib/ball-colors';
import {
  type BallNode,
  type ClusterInfo,
  createSimulation,
  layoutClusters,
  addPourForce,
  removePourForce,
  getBallConfig,
  estimateCanvasHeight,
} from '../lib/ball-simulation';

interface DepartmentBudget {
  department: string;
  slug: string;
  year: string;
  amount: number;
}

interface ExpenditureCategory {
  code: string;
  name: string;
  amount: number;
  subcategories: { code: string; name: string; amount: number }[];
}

interface ExpenditureDetail {
  department: string;
  slug: string;
  total: number;
  categories: ExpenditureCategory[];
}

interface Props {
  departmentBudgets: DepartmentBudget[];
  expenditureDetails: ExpenditureDetail[];
}

interface ViewData {
  nodes: BallNode[];
  clusters: ClusterInfo[];
  height: number;
  unit: number;
  unitLabel: string;
}

/** Minimum ball count for a department to be shown individually (not grouped into "Other"). */
const MIN_BALLS_THRESHOLD = 5;

/** Format a dollar amount for display. */
function fmtAmount(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function BudgetBalls({ departmentBudgets, expenditureDetails }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerWidth = useContainerWidth(containerRef);

  // State
  const [drillDept, setDrillDept] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    text: string;
    subtext: string;
  } | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [viewInfo, setViewInfo] = useState({ ballCount: 0, unitLabel: '', height: 500 });

  // Refs for animation state (avoid re-renders during simulation)
  const nodesRef = useRef<BallNode[]>([]);
  const clustersRef = useRef<ClusterInfo[]>([]);
  const animFrameRef = useRef<number>(0);
  const simulationRef = useRef<ReturnType<typeof createSimulation> | null>(null);
  const spawnTimerRef = useRef<number>(0);
  const pourRemovedRef = useRef(false);
  const canvasHeightRef = useRef(500);

  // Build department-level data
  const buildDepartmentView = useCallback((): ViewData => {
    const { unit, radius, label: unitLabel } = getBallConfig(containerWidth, false);
    const width = containerWidth;

    // Get 2026 Budget amounts per department
    const deptMap = new Map<string, { dept: string; slug: string; amount: number }>();
    for (const row of departmentBudgets) {
      if (row.year !== '2026 Budget') continue;
      deptMap.set(row.slug, { dept: row.department, slug: row.slug, amount: row.amount });
    }

    const depts = [...deptMap.values()].sort((a, b) => b.amount - a.amount);

    const clusters: ClusterInfo[] = [];
    const otherDepts: typeof depts = [];
    let colorIdx = 0;

    for (const d of depts) {
      const ballCount = Math.max(1, Math.ceil(d.amount / unit));
      if (ballCount >= MIN_BALLS_THRESHOLD) {
        clusters.push({
          id: clusters.length,
          name: d.dept,
          slug: d.slug,
          color: assignColor(colorIdx++, false),
          total: d.amount,
          ballCount,
          cx: 0,
          cy: 0,
        });
      } else {
        otherDepts.push(d);
      }
    }

    if (otherDepts.length > 0) {
      const otherTotal = otherDepts.reduce((s, d) => s + d.amount, 0);
      clusters.push({
        id: clusters.length,
        name: `Other (${otherDepts.length} depts)`,
        slug: undefined,
        color: OTHER_COLOR,
        total: otherTotal,
        ballCount: Math.max(1, Math.ceil(otherTotal / unit)),
        cx: 0,
        cy: 0,
      });
    }

    const totalBalls = clusters.reduce((s, c) => s + c.ballCount, 0);
    const height = estimateCanvasHeight(totalBalls, radius, width);

    layoutClusters(clusters, width, height);

    const nodes: BallNode[] = [];
    for (const cluster of clusters) {
      for (let i = 0; i < cluster.ballCount; i++) {
        nodes.push({
          id: nodes.length,
          cluster: cluster.id,
          clusterName: cluster.name,
          color: cluster.color,
          radius,
          cx: cluster.cx,
          cy: cluster.cy,
          amount: unit,
          x: cluster.cx + (Math.random() - 0.5) * 20,
          y: -20 - Math.random() * 100,
          spawned: false,
        });
      }
    }

    return { nodes, clusters, height, unit, unitLabel };
  }, [departmentBudgets, containerWidth]);

  // Build category drill-down data
  const buildCategoryView = useCallback(
    (slug: string): ViewData | null => {
      const { unit, radius, label: unitLabel } = getBallConfig(containerWidth, true);
      const width = containerWidth;

      const detail = expenditureDetails.find((d) => d.slug === slug);
      if (!detail) return null;

      const clusters: ClusterInfo[] = [];
      let colorIdx = 0;

      for (const cat of detail.categories) {
        const ballCount = Math.max(1, Math.ceil(cat.amount / unit));
        clusters.push({
          id: clusters.length,
          name: cat.name.replace(/^PERSONNEL-/, '').replace(/^SUPPLIES-/, ''),
          color: assignColor(colorIdx++, false),
          total: cat.amount,
          ballCount,
          cx: 0,
          cy: 0,
        });
      }

      const totalBalls = clusters.reduce((s, c) => s + c.ballCount, 0);
      const height = estimateCanvasHeight(totalBalls, radius, width);

      layoutClusters(clusters, width, height);

      const nodes: BallNode[] = [];
      for (const cluster of clusters) {
        for (let i = 0; i < cluster.ballCount; i++) {
          nodes.push({
            id: nodes.length,
            cluster: cluster.id,
            clusterName: cluster.name,
            color: cluster.color,
            radius,
            cx: cluster.cx,
            cy: cluster.cy,
            amount: unit,
            x: cluster.cx + (Math.random() - 0.5) * 20,
            y: -20 - Math.random() * 100,
            spawned: false,
          });
        }
      }

      return { nodes, clusters, height, unit, unitLabel };
    },
    [expenditureDetails, containerWidth],
  );

  // Render canvas
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = containerWidth;
    const h = canvasHeightRef.current;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    // Draw balls
    const nodes = nodesRef.current;
    for (const node of nodes) {
      if (!node.spawned) continue;
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();
    }

    // Draw cluster labels — collect positions first, then skip overlapping ones
    const clusters = clustersRef.current;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const labelPositions: { x: number; y: number; w: number; cluster: ClusterInfo }[] = [];

    for (const cluster of [...clusters].sort((a, b) => b.ballCount - a.ballCount)) {
      if (cluster.ballCount < 8) continue;

      const clusterNodes = nodes.filter(
        (n) => n.cluster === cluster.id && n.spawned,
      );
      if (clusterNodes.length === 0) continue;

      const avgX =
        clusterNodes.reduce((s, n) => s + n.x!, 0) / clusterNodes.length;
      const maxY = Math.max(...clusterNodes.map((n) => n.y! + n.radius));

      let label = cluster.name;
      if (label.length > 22) label = label.slice(0, 20) + '…';

      // Estimate label width (~6px per char)
      const labelWidth = label.length * 6;

      // Check for overlap with already-placed labels
      const overlaps = labelPositions.some(
        (p) =>
          Math.abs(p.x - avgX) < (p.w + labelWidth) / 2 + 8 &&
          Math.abs(p.y - maxY) < 28,
      );
      if (overlaps) continue;

      labelPositions.push({ x: avgX, y: maxY, w: labelWidth, cluster });

      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillStyle = '#374151';
      ctx.fillText(label, avgX, maxY + 5);
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillStyle = '#6b7280';
      ctx.fillText(fmtAmount(cluster.total), avgX, maxY + 19);
    }
  }, [containerWidth]);

  // Animation loop
  const startAnimation = useCallback((height: number) => {
    const simulation = simulationRef.current;
    if (!simulation) return;

    const nodes = nodesRef.current;
    let spawnIdx = 0;
    const batchSize = Math.max(10, Math.floor(nodes.length / 60));
    pourRemovedRef.current = false;

    const spawnBatch = () => {
      const end = Math.min(spawnIdx + batchSize, nodes.length);
      for (let i = spawnIdx; i < end; i++) {
        nodes[i].spawned = true;
      }
      spawnIdx = end;

      if (spawnIdx < nodes.length) {
        spawnTimerRef.current = requestAnimationFrame(spawnBatch);
      }
    };

    addPourForce(simulation, height);
    simulation.alpha(1).restart();

    const tick = () => {
      if (!pourRemovedRef.current && simulation.alpha() < 0.3) {
        removePourForce(simulation);
        pourRemovedRef.current = true;
      }

      render();

      if (simulation.alpha() > 0.001) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        render();
      }
    };

    spawnBatch();
    animFrameRef.current = requestAnimationFrame(tick);
  }, [render]);

  // Initialize / reset simulation
  useEffect(() => {
    if (containerWidth < 100) return;

    cancelAnimationFrame(animFrameRef.current);
    cancelAnimationFrame(spawnTimerRef.current);
    simulationRef.current?.stop();

    let data: ViewData | null;
    if (drillDept) {
      data = buildCategoryView(drillDept);
      if (!data) {
        setDrillDept(null);
        return;
      }
    } else {
      data = buildDepartmentView();
    }

    nodesRef.current = data.nodes;
    clustersRef.current = data.clusters;
    canvasHeightRef.current = data.height;
    setViewInfo({
      ballCount: data.nodes.length,
      unitLabel: data.unitLabel,
      height: data.height,
    });

    simulationRef.current = createSimulation(
      data.nodes,
      containerWidth,
      data.height,
    );

    startAnimation(data.height);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      cancelAnimationFrame(spawnTimerRef.current);
      simulationRef.current?.stop();
    };
  }, [containerWidth, drillDept, buildDepartmentView, buildCategoryView, startAnimation]);

  // Hit detection on mouse move
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const nodes = nodesRef.current;
      let closest: BallNode | null = null;
      let closestDist = Infinity;

      for (const node of nodes) {
        if (!node.spawned) continue;
        const dx = node.x! - mx;
        const dy = node.y! - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < node.radius + 4 && dist < closestDist) {
          closest = node;
          closestDist = dist;
        }
      }

      if (closest) {
        const cluster = clustersRef.current[closest.cluster];
        canvas.style.cursor = cluster?.slug || drillDept ? 'pointer' : 'default';
        setTooltip({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top - 40,
          text: cluster?.name || '',
          subtext: fmtAmount(cluster?.total || 0),
        });
      } else {
        canvas.style.cursor = 'default';
        setTooltip(null);
      }
    },
    [drillDept],
  );

  // Click to drill down
  const handleClick = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const nodes = nodesRef.current;
      let closest: BallNode | null = null;
      let closestDist = Infinity;

      for (const node of nodes) {
        if (!node.spawned) continue;
        const dx = node.x! - mx;
        const dy = node.y! - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < node.radius + 4 && dist < closestDist) {
          closest = node;
          closestDist = dist;
        }
      }

      if (!closest) return;

      const cluster = clustersRef.current[closest.cluster];
      if (!drillDept && cluster?.slug) {
        setTooltip(null);
        setDrillDept(cluster.slug);
      }
    },
    [drillDept],
  );

  const handleBack = useCallback(() => {
    setDrillDept(null);
    setTooltip(null);
  }, []);

  const activeDept = drillDept
    ? expenditureDetails.find((d) => d.slug === drillDept)?.department
    : null;

  return (
    <div ref={containerRef} class="relative">
      {/* Header */}
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div class="flex items-center gap-3">
          {drillDept && (
            <button
              onClick={handleBack}
              class="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              ← All Departments
            </button>
          )}
          <span class="text-xs text-gray-500">
            Each ball = {viewInfo.unitLabel || '$100K'} · {viewInfo.ballCount.toLocaleString()} balls
          </span>
        </div>
        <button
          onClick={() => setShowTable(!showTable)}
          class="text-xs text-gray-500 hover:text-gray-700 underline"
        >
          {showTable ? 'View visualization' : 'View as table'}
        </button>
      </div>

      {drillDept && activeDept && (
        <h2 class="text-lg font-semibold mb-2">{activeDept}</h2>
      )}

      {showTable ? (
        <TableView
          clusters={clustersRef.current}
          drillDept={drillDept}
          activeDept={activeDept}
        />
      ) : (
        <div class="relative">
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onClick={handleClick}
            onMouseLeave={() => setTooltip(null)}
            class="w-full border border-gray-200 rounded-lg bg-gray-50"
            style={{ height: `${viewInfo.height}px` }}
            aria-label={
              drillDept
                ? `Budget breakdown for ${activeDept}: expenditure categories shown as clusters of balls`
                : `City of Pittsburgh 2026 operating budget: ${viewInfo.ballCount.toLocaleString()} balls representing departments`
            }
            role="img"
          />
          {tooltip && (
            <div
              class="absolute pointer-events-none bg-gray-900 text-white text-xs rounded px-2 py-1 shadow-lg z-10"
              style={{
                left: `${Math.min(tooltip.x, containerWidth - 120)}px`,
                top: `${Math.max(tooltip.y, 0)}px`,
              }}
            >
              <div class="font-medium">{tooltip.text}</div>
              <div class="text-gray-300">{tooltip.subtext}</div>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {clustersRef.current.map((cluster) => (
          <div key={cluster.id} class="flex items-center gap-1 text-xs text-gray-600">
            <span
              class="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: cluster.color }}
            />
            <span class="truncate max-w-[150px]">{cluster.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Accessible table fallback showing the same data. */
function TableView({
  clusters,
  drillDept,
  activeDept,
}: {
  clusters: ClusterInfo[];
  drillDept: string | null;
  activeDept: string | null;
}) {
  const sorted = [...clusters].sort((a, b) => b.total - a.total);
  return (
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b">
            <th class="text-left py-2 pr-4">
              {drillDept ? 'Category' : 'Department'}
            </th>
            <th class="text-right py-2 pr-4">Amount</th>
            <th class="text-right py-2">Balls</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.id} class="border-b border-gray-100">
              <td class="py-1.5 pr-4 flex items-center gap-2">
                <span
                  class="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: c.color }}
                />
                {c.name}
              </td>
              <td class="text-right py-1.5 pr-4 tabular-nums">
                {fmtAmount(c.total)}
              </td>
              <td class="text-right py-1.5 tabular-nums">
                {c.ballCount.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
