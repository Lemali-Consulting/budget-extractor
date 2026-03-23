/**Interactive budget balls visualization — each ball = a unit of spending, one bowl per department.*/

import { useEffect, useRef, useState, useCallback } from 'preact/hooks';
import { useContainerWidth } from '../lib/hooks';
import { assignColor, OTHER_COLOR } from '../lib/ball-colors';
import {
  type BallNode,
  type ClusterInfo,
  type BowlParams,
  type BowlGridResult,
  createSimulation,
  computeBowlGrid,
  getBallConfig,
  decomposeBalls,
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
  grid: BowlGridResult;
  unit: number;
  unitLabel: string;
}

/** Minimum ball count for a department to be shown individually (not grouped into "Other"). */
const MIN_BALLS_THRESHOLD = 5;

/** Slug suffix used to identify trust fund departments. */
const TRUST_FUND_MARKER = 'trust-fund';

/** Synthetic slug for the consolidated trust funds bowl. */
const TRUST_FUNDS_SLUG = '__trust-funds__';

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
  const bowlsRef = useRef<BowlParams[]>([]);
  const gridRef = useRef<BowlGridResult | null>(null);
  const animFrameRef = useRef<number>(0);
  const simulationRef = useRef<ReturnType<typeof createSimulation> | null>(null);
  const spawnTimerRef = useRef<number>(0);
  const canvasHeightRef = useRef(500);

  // Build department-level data
  const buildDepartmentView = useCallback((): ViewData => {
    const { tiers, label: unitLabel } = getBallConfig(containerWidth, false);
    const smallestUnit = tiers[tiers.length - 1].amount;
    const width = containerWidth;

    // Get 2026 Budget amounts per department
    const deptMap = new Map<string, { dept: string; slug: string; amount: number }>();
    for (const row of departmentBudgets) {
      if (row.year !== '2026 Budget') continue;
      deptMap.set(row.slug, { dept: row.department, slug: row.slug, amount: row.amount });
    }

    // Separate trust funds from regular departments
    const trustFundDepts: { dept: string; slug: string; amount: number }[] = [];
    const regularDepts: { dept: string; slug: string; amount: number }[] = [];
    for (const d of deptMap.values()) {
      if (d.slug.endsWith(TRUST_FUND_MARKER)) {
        trustFundDepts.push(d);
      } else {
        regularDepts.push(d);
      }
    }

    const depts = regularDepts.sort((a, b) => b.amount - a.amount);

    // First pass: decompose all departments to determine ball counts
    const deptBalls = depts.map((d) => ({
      ...d,
      balls: decomposeBalls(d.amount, tiers),
    }));

    const clusters: ClusterInfo[] = [];
    const otherDepts: typeof deptBalls = [];
    let colorIdx = 0;

    for (const d of deptBalls) {
      if (d.balls.length >= MIN_BALLS_THRESHOLD) {
        clusters.push({
          id: clusters.length,
          name: d.dept,
          slug: d.slug,
          color: assignColor(colorIdx++, false),
          total: d.amount,
          ballCount: d.balls.length,
          cx: 0,
          cy: 0,
        });
      } else {
        otherDepts.push(d);
      }
    }

    // Consolidated trust funds bowl
    const trustTotal = trustFundDepts.reduce((s, d) => s + d.amount, 0);
    const trustBalls = trustTotal > 0 ? decomposeBalls(trustTotal, tiers) : [];

    if (trustFundDepts.length > 0) {
      clusters.push({
        id: clusters.length,
        name: `Trust Funds (${trustFundDepts.length})`,
        slug: TRUST_FUNDS_SLUG,
        color: assignColor(colorIdx++, false),
        total: trustTotal,
        ballCount: trustBalls.length,
        cx: 0,
        cy: 0,
      });
    }

    // Pre-compute "Other" balls
    const otherTotal = otherDepts.reduce((s, d) => s + d.amount, 0);
    const otherBalls = otherTotal > 0 ? decomposeBalls(otherTotal, tiers) : [];

    if (otherDepts.length > 0) {
      clusters.push({
        id: clusters.length,
        name: `Other (${otherDepts.length} depts)`,
        slug: undefined,
        color: OTHER_COLOR,
        total: otherTotal,
        ballCount: otherBalls.length,
        cx: 0,
        cy: 0,
      });
    }

    // Build a map from cluster id to its decomposed balls
    const clusterBallsMap = new Map<number, { amount: number; radius: number }[]>();
    for (const cluster of clusters) {
      if (cluster.slug === TRUST_FUNDS_SLUG) {
        clusterBallsMap.set(cluster.id, trustBalls);
      } else if (cluster.slug) {
        const d = deptBalls.find((db) => db.slug === cluster.slug);
        clusterBallsMap.set(cluster.id, d ? d.balls : []);
      } else {
        clusterBallsMap.set(cluster.id, otherBalls);
      }
    }

    // Compute bowl grid — this also sets cluster.cx/cy
    const grid = computeBowlGrid(clusters, width);

    // Build nodes using decomposed balls per cluster
    const nodes: BallNode[] = [];
    for (const cluster of clusters) {
      const balls = clusterBallsMap.get(cluster.id) || [];

      for (const ball of balls) {
        nodes.push({
          id: nodes.length,
          cluster: cluster.id,
          clusterName: cluster.name,
          color: cluster.color,
          radius: ball.radius,
          cx: cluster.cx,
          cy: cluster.cy,
          amount: ball.amount,
          // Spawn above this cluster's bowl
          x: cluster.cx + (Math.random() - 0.5) * 4,
          y: -10 - Math.random() * 20,
          spawned: false,
        });
      }
    }

    return { nodes, clusters, grid, unit: smallestUnit, unitLabel };
  }, [departmentBudgets, containerWidth]);

  // Build trust fund drill-down: each trust fund becomes its own bowl
  const buildTrustFundView = useCallback((): ViewData | null => {
    const { tiers, label: unitLabel } = getBallConfig(containerWidth, true);
    const smallestUnit = tiers[tiers.length - 1].amount;
    const width = containerWidth;

    // Get all trust fund departments for 2026
    const trusts = departmentBudgets
      .filter((r) => r.year === '2026 Budget' && r.slug.endsWith(TRUST_FUND_MARKER))
      .sort((a, b) => b.amount - a.amount);

    if (trusts.length === 0) return null;

    const trustBalls = trusts.map((t) => ({
      trust: t,
      balls: decomposeBalls(t.amount, tiers),
    }));

    const clusters: ClusterInfo[] = [];
    let colorIdx = 0;

    for (const { trust, balls } of trustBalls) {
      // Strip " Trust Fund" suffix for shorter labels
      const shortName = trust.department.replace(/\s+Trust Fund$/i, '');
      clusters.push({
        id: clusters.length,
        name: shortName,
        slug: trust.slug,
        color: assignColor(colorIdx++, false),
        total: trust.amount,
        ballCount: balls.length,
        cx: 0,
        cy: 0,
      });
    }

    const grid = computeBowlGrid(clusters, width);

    const nodes: BallNode[] = [];
    for (let ci = 0; ci < clusters.length; ci++) {
      const cluster = clusters[ci];
      const balls = trustBalls[ci].balls;

      for (const ball of balls) {
        nodes.push({
          id: nodes.length,
          cluster: cluster.id,
          clusterName: cluster.name,
          color: cluster.color,
          radius: ball.radius,
          cx: cluster.cx,
          cy: cluster.cy,
          amount: ball.amount,
          x: cluster.cx + (Math.random() - 0.5) * 4,
          y: -10 - Math.random() * 20,
          spawned: false,
        });
      }
    }

    return { nodes, clusters, grid, unit: smallestUnit, unitLabel };
  }, [departmentBudgets, containerWidth]);

  // Build category drill-down data
  const buildCategoryView = useCallback(
    (slug: string): ViewData | null => {
      const { tiers, label: unitLabel } = getBallConfig(containerWidth, true);
      const smallestUnit = tiers[tiers.length - 1].amount;
      const width = containerWidth;

      const detail = expenditureDetails.find((d) => d.slug === slug);
      if (!detail) return null;

      // Decompose each category into mixed-size balls
      const catBalls = detail.categories.map((cat) => ({
        cat,
        balls: decomposeBalls(cat.amount, tiers),
      }));

      const clusters: ClusterInfo[] = [];
      let colorIdx = 0;

      for (const { cat, balls } of catBalls) {
        clusters.push({
          id: clusters.length,
          name: cat.name.replace(/^PERSONNEL-/, '').replace(/^SUPPLIES-/, ''),
          color: assignColor(colorIdx++, false),
          total: cat.amount,
          ballCount: balls.length,
          cx: 0,
          cy: 0,
        });
      }

      // Compute bowl grid — sets cluster.cx/cy
      const grid = computeBowlGrid(clusters, width);

      const nodes: BallNode[] = [];
      for (let ci = 0; ci < clusters.length; ci++) {
        const cluster = clusters[ci];
        const balls = catBalls[ci].balls;

        for (const ball of balls) {
          nodes.push({
            id: nodes.length,
            cluster: cluster.id,
            clusterName: cluster.name,
            color: cluster.color,
            radius: ball.radius,
            cx: cluster.cx,
            cy: cluster.cy,
            amount: ball.amount,
            x: cluster.cx + (Math.random() - 0.5) * 4,
            y: -10 - Math.random() * 20,
            spawned: false,
          });
        }
      }

      return { nodes, clusters, grid, unit: smallestUnit, unitLabel };
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

    const grid = gridRef.current;
    const clusters = clustersRef.current;
    const bowls = bowlsRef.current;

    // Draw each bowl arc and label
    for (let i = 0; i < bowls.length; i++) {
      const bowl = bowls[i];
      const cluster = clusters[i];
      if (!cluster) continue;

      // Bowl arc (semicircle opening upward)
      ctx.beginPath();
      ctx.arc(bowl.cx, bowl.cy, bowl.radius, 0, Math.PI);
      ctx.strokeStyle = '#cbd5e1'; // slate-300
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Subtle fill
      ctx.beginPath();
      ctx.arc(bowl.cx, bowl.cy, bowl.radius, 0, Math.PI);
      ctx.fillStyle = 'rgba(241, 245, 249, 0.5)'; // slate-100 translucent
      ctx.fill();

      // Label below bowl
      const labelY = bowl.cy + bowl.radius + 8;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      // Cluster name
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillStyle = '#374151';
      let label = cluster.name;
      // Truncate based on cell width
      const maxChars = grid ? Math.floor(grid.cellWidth / 7) : 20;
      if (label.length > maxChars) label = label.slice(0, maxChars - 1) + '…';
      ctx.fillText(label, bowl.cx, labelY);

      // Total amount
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillStyle = '#6b7280';
      ctx.fillText(fmtAmount(cluster.total), bowl.cx, labelY + 14);
    }

    // Draw balls
    const nodes = nodesRef.current;
    for (const node of nodes) {
      if (!node.spawned) continue;
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();
    }
  }, [containerWidth]);

  // Animation loop
  const startAnimation = useCallback(() => {
    const simulation = simulationRef.current;
    if (!simulation) return;

    const nodes = nodesRef.current;
    const bowls = bowlsRef.current;

    // Build a map from cluster id to bowl for spawn positions
    const bowlMap = new Map<number, BowlParams>();
    for (const bowl of bowls) {
      bowlMap.set(bowl.clusterId, bowl);
    }

    // Build round-robin spawn order so all bowls fill simultaneously
    const nodesByCluster = new Map<number, BallNode[]>();
    for (const node of nodes) {
      let list = nodesByCluster.get(node.cluster);
      if (!list) {
        list = [];
        nodesByCluster.set(node.cluster, list);
      }
      list.push(node);
    }
    const clusterQueues = [...nodesByCluster.values()];
    const spawnOrder: BallNode[] = [];
    let remaining = true;
    while (remaining) {
      remaining = false;
      for (const queue of clusterQueues) {
        if (queue.length > 0) {
          spawnOrder.push(queue.shift()!);
          if (queue.length > 0) remaining = true;
        }
      }
    }

    let spawnIdx = 0;
    let frameCount = 0;
    const framesPerBall = 2;

    const spawnBatch = () => {
      frameCount++;
      if (frameCount % framesPerBall === 0 && spawnIdx < spawnOrder.length) {
        const node = spawnOrder[spawnIdx];
        const bowl = bowlMap.get(node.cluster);
        // Spawn just above this node's bowl rim
        node.x = (bowl?.cx ?? containerWidth / 2) + (Math.random() - 0.5) * 4;
        node.y = (bowl?.cy ?? 0) - (bowl?.radius ?? 50) - 15;
        node.vx = 0;
        node.vy = 0;
        node.spawned = true;
        spawnIdx++;
      }

      if (spawnIdx < spawnOrder.length) {
        spawnTimerRef.current = requestAnimationFrame(spawnBatch);
      }
    };

    simulation.alpha(1).restart();

    const tick = () => {
      // Keep simulation warm while balls are still spawning
      if (spawnIdx < spawnOrder.length && simulation.alpha() < 0.3) {
        simulation.alpha(0.3);
      }

      render();

      if (spawnIdx < spawnOrder.length || simulation.alpha() > 0.001) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        render();
      }
    };

    spawnBatch();
    animFrameRef.current = requestAnimationFrame(tick);
  }, [render, containerWidth]);

  // Initialize / reset simulation
  useEffect(() => {
    if (containerWidth < 100) return;

    cancelAnimationFrame(animFrameRef.current);
    cancelAnimationFrame(spawnTimerRef.current);
    simulationRef.current?.stop();

    let data: ViewData | null;
    if (drillDept === TRUST_FUNDS_SLUG) {
      data = buildTrustFundView();
      if (!data) {
        setDrillDept(null);
        return;
      }
    } else if (drillDept) {
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
    bowlsRef.current = data.grid.bowls;
    gridRef.current = data.grid;
    canvasHeightRef.current = data.grid.totalHeight;
    setViewInfo({
      ballCount: data.nodes.length,
      unitLabel: data.unitLabel,
      height: data.grid.totalHeight,
    });

    simulationRef.current = createSimulation(
      data.nodes,
      data.grid.bowls,
    );

    startAnimation();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      cancelAnimationFrame(spawnTimerRef.current);
      simulationRef.current?.stop();
    };
  }, [containerWidth, drillDept, buildDepartmentView, buildCategoryView, buildTrustFundView, startAnimation]);

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

  const activeDept = drillDept === TRUST_FUNDS_SLUG
    ? 'Trust Funds'
    : drillDept
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
            Each ball = {viewInfo.unitLabel || '$100K–$1M'} · {viewInfo.ballCount.toLocaleString()} balls
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
                ? `Budget breakdown for ${activeDept}: expenditure categories shown as balls in separate bowls`
                : `City of Pittsburgh 2026 operating budget: ${viewInfo.ballCount.toLocaleString()} balls in department bowls`
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
