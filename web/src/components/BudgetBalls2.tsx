/**Budget Balls 2 — each department is a single proportional ball; click to explode into categories.*/

import { useEffect, useRef, useState, useCallback } from 'preact/hooks';
import { useContainerWidth } from '../lib/hooks';
import { assignColor, OTHER_COLOR } from '../lib/ball-colors';
import {
  forceSimulation,
  forceCollide,
  forceX,
  forceY,
  forceManyBody,
  type Simulation,
  type SimulationNodeDatum,
} from 'd3-force';

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

interface FloatingBall extends SimulationNodeDatum {
  id: number;
  slug: string;
  label: string;
  amount: number;
  color: string;
  radius: number;
  /** Whether this is a drilldown sub-ball */
  isSub: boolean;
  /** Parent slug for sub-balls */
  parentSlug?: string;
}

/** A force-positioned external label for a small ball. */
interface LabelNode extends SimulationNodeDatum {
  ballId: number;
  text: string;
  amount: string;
  textWidth: number;
  anchorX: number;
  anchorY: number;
}

/** Scale info for the size legend. */
interface ScaleInfo {
  maxAmount: number;
  maxRadius: number;
  minRadius: number;
}

/** Pick 3 nice round legend tick values spanning the data range. */
function legendTicks(maxAmount: number): number[] {
  // Find a nice base: largest power of 10 ≤ maxAmount
  const mag = Math.pow(10, Math.floor(Math.log10(maxAmount)));
  const candidates = [
    mag * 0.1, mag * 0.25, mag * 0.5, mag, mag * 2, mag * 5, mag * 10,
  ].filter((v) => v > 0 && v <= maxAmount);

  // Pick top, mid, and small
  const top = candidates[candidates.length - 1];
  const mid = candidates[Math.floor(candidates.length / 2)] || top / 2;
  const small = candidates[Math.max(0, Math.floor(candidates.length / 4))] || top / 5;

  // Deduplicate and sort descending
  const unique = [...new Set([top, mid, small])].sort((a, b) => b - a);
  return unique.slice(0, 3);
}

/** Slug suffix for trust fund departments. */
const TRUST_FUND_MARKER = 'trust-fund';

/** Format a dollar amount for display. */
function fmtAmount(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/** Compute ball radius from amount, proportional to sqrt. */
function amountToRadius(amount: number, maxAmount: number, maxRadius: number, minRadius: number): number {
  const ratio = amount / maxAmount;
  return minRadius + (maxRadius - minRadius) * Math.sqrt(ratio);
}

/** Canvas height based on width. */
function canvasHeight(width: number): number {
  return Math.min(width * 0.75, 700);
}

export default function BudgetBalls2({ departmentBudgets, expenditureDetails }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerWidth = useContainerWidth(containerRef);

  /** Navigation stack for drill-down levels. */
  interface DrillLevel {
    type: 'dept' | 'category';
    deptSlug: string;
    categoryCode?: string;
    label: string;
  }

  const [drillStack, setDrillStack] = useState<DrillLevel[]>([]);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    label: string;
    amount: string;
    hint: string;
  } | null>(null);

  const nodesRef = useRef<FloatingBall[]>([]);
  const simulationRef = useRef<Simulation<FloatingBall, undefined> | null>(null);
  const animFrameRef = useRef<number>(0);
  const transitionRef = useRef<{
    /** Non-clicked old balls — fade out during transition */
    others: { x: number; y: number; radius: number; color: string }[];
    /** The clicked ball (ghost that fades through) */
    clicked: { x: number; y: number; radius: number; color: string } | null;
    /** Origin point where new balls burst from */
    originX: number;
    originY: number;
    /** 0→1 animation progress */
    progress: number;
    direction: 'drill' | 'back';
    /** Per-node trail history for comet tails */
    trails: { x: number; y: number }[][];
  } | null>(null);
  const renderRef = useRef<() => void>(() => {});
  const drillStackRef = useRef<DrillLevel[]>([]);
  const scaleRef = useRef<ScaleInfo>({ maxAmount: 1, maxRadius: 60, minRadius: 12 });
  const prevScaleRef = useRef<ScaleInfo | null>(null);
  const prevTicksRef = useRef<number[] | null>(null);
  const labelNodesRef = useRef<LabelNode[]>([]);
  const labelSimRef = useRef<Simulation<LabelNode, undefined> | null>(null);
  /** Persistent grid warp state — survives transitions so the grid feels continuous. */
  const gridWarpRef = useRef<{
    ox: number; oy: number; strength: number; gridSize: number;
    /** Previous state to interpolate from during transitions */
    prev: { ox: number; oy: number; strength: number; gridSize: number } | null;
  }>({ ox: 0, oy: 0, strength: 0, gridSize: 40, prev: null });

  const canvasWidth = containerWidth;

  // Build department-level balls
  const buildDeptBalls = useCallback((): FloatingBall[] => {
    const width = canvasWidth;
    const height = canvasHeight(width);
    const maxRadius = Math.min(width, height) * 0.12;
    const minRadius = 12;

    // Aggregate trust funds
    const deptMap = new Map<string, { dept: string; slug: string; amount: number }>();
    let trustTotal = 0;
    let trustCount = 0;

    for (const row of departmentBudgets) {
      if (row.year !== '2026 Budget') continue;
      if (row.slug.endsWith(TRUST_FUND_MARKER)) {
        trustTotal += row.amount;
        trustCount++;
      } else {
        deptMap.set(row.slug, { dept: row.department, slug: row.slug, amount: row.amount });
      }
    }

    const depts = [...deptMap.values()].sort((a, b) => b.amount - a.amount);
    if (trustTotal > 0) {
      depts.push({ dept: `Trust Funds (${trustCount})`, slug: '__trust-funds__', amount: trustTotal });
    }

    const maxAmount = Math.max(...depts.map((d) => d.amount));
    scaleRef.current = { maxAmount, maxRadius, minRadius };

    const balls: FloatingBall[] = depts.map((d, i) => ({
      id: i,
      slug: d.slug,
      label: d.dept,
      amount: d.amount,
      color: d.slug === '__trust-funds__' ? OTHER_COLOR : assignColor(i, false),
      radius: amountToRadius(d.amount, maxAmount, maxRadius, minRadius),
      isSub: false,
      x: width / 2 + (Math.random() - 0.5) * width * 0.4,
      y: height / 2 + (Math.random() - 0.5) * height * 0.4,
    }));

    return balls;
  }, [departmentBudgets, canvasWidth]);

  // Build sub-category balls for a department
  const buildCategoryBalls = useCallback(
    (slug: string, originX: number, originY: number): FloatingBall[] => {
      const width = canvasWidth;
      const height = canvasHeight(width);
      const maxRadius = Math.min(width, height) * 0.10;
      const minRadius = 10;

      const detail = expenditureDetails.find((d) => d.slug === slug);
      if (!detail) return [];

      const cats = detail.categories.filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);
      const maxAmount = Math.max(...cats.map((c) => c.amount));
      scaleRef.current = { maxAmount, maxRadius, minRadius };

      return cats.map((cat, i) => ({
        id: i,
        slug: `${slug}__${cat.code}`,
        label: cat.name.replace(/^PERSONNEL-/, '').replace(/^SUPPLIES-/, ''),
        amount: cat.amount,
        color: assignColor(i, false),
        radius: amountToRadius(cat.amount, maxAmount, maxRadius, minRadius),
        isSub: true,
        parentSlug: slug,
        // Start from origin (the clicked ball's position)
        x: originX + (Math.random() - 0.5) * 20,
        y: originY + (Math.random() - 0.5) * 20,
      }));
    },
    [expenditureDetails, canvasWidth],
  );

  // Build subcategory/line-item balls for a category within a department
  const buildSubcategoryBalls = useCallback(
    (deptSlug: string, categoryCode: string, originX: number, originY: number): FloatingBall[] => {
      const width = canvasWidth;
      const height = canvasHeight(width);
      const maxRadius = Math.min(width, height) * 0.10;
      const minRadius = 10;

      const detail = expenditureDetails.find((d) => d.slug === deptSlug);
      if (!detail) return [];

      const category = detail.categories.find((c) => c.code === categoryCode);
      if (!category) return [];

      const subs = category.subcategories.filter((s) => s.amount > 0).sort((a, b) => b.amount - a.amount);
      if (subs.length <= 1) return [];

      const maxAmount = Math.max(...subs.map((s) => s.amount));
      scaleRef.current = { maxAmount, maxRadius, minRadius };

      return subs.map((sub, i) => ({
        id: i,
        slug: `${deptSlug}__${categoryCode}__${sub.code}`,
        label: sub.name,
        amount: sub.amount,
        color: assignColor(i, false),
        radius: amountToRadius(sub.amount, maxAmount, maxRadius, minRadius),
        isSub: true,
        parentSlug: deptSlug,
        x: originX + (Math.random() - 0.5) * 20,
        y: originY + (Math.random() - 0.5) * 20,
      }));
    },
    [expenditureDetails, canvasWidth],
  );

  /** Check if a category has >1 subcategory with positive amounts. */
  const categoryIsDrillable = useCallback(
    (deptSlug: string, categoryCode: string): boolean => {
      const detail = expenditureDetails.find((d) => d.slug === deptSlug);
      if (!detail) return false;
      const category = detail.categories.find((c) => c.code === categoryCode);
      if (!category) return false;
      return category.subcategories.filter((s) => s.amount > 0).length > 1;
    },
    [expenditureDetails],
  );

  // Create simulation for floating balls
  const createSim = useCallback(
    (balls: FloatingBall[]): Simulation<FloatingBall, undefined> => {
      const width = canvasWidth;
      const height = canvasHeight(width);

      const sim = forceSimulation(balls)
        .force('charge', forceManyBody<FloatingBall>().strength((d) => -d.radius * 0.8))
        .force('x', forceX<FloatingBall>(width / 2).strength(0.04))
        .force('y', forceY<FloatingBall>(height / 2).strength(0.04))
        .force(
          'collide',
          forceCollide<FloatingBall>()
            .radius((d) => d.radius + 2)
            .iterations(3),
        )
        .alphaDecay(0.01)
        .velocityDecay(0.3)
        .stop();

      return sim;
    },
    [canvasWidth],
  );

  /** Build label nodes for balls with radius < 20. */
  const buildLabelNodes = useCallback(
    (balls: FloatingBall[]): LabelNode[] => {
      const canvas = canvasRef.current;
      if (!canvas) return [];
      const ctx = canvas.getContext('2d');
      if (!ctx) return [];

      const w = canvasWidth;
      const h = canvasHeight(w);
      const cx = w / 2;
      const cy = h / 2;
      const FONT = '10px system-ui, sans-serif';
      ctx.font = FONT;

      const labels: LabelNode[] = [];
      for (const ball of balls) {
        if (ball.radius >= 20) continue;

        let text = ball.label;
        if (text.length > 22) text = text.slice(0, 21) + '…';
        const amountStr = fmtAmount(ball.amount);
        const textWidth = Math.max(ctx.measureText(text).width, ctx.measureText(amountStr).width);

        // Initial position: offset outward from canvas center
        const bx = ball.x ?? cx;
        const by = ball.y ?? cy;
        const angle = Math.atan2(by - cy, bx - cx);
        const offset = ball.radius + 40 + Math.random() * 30;

        labels.push({
          ballId: ball.id,
          text,
          amount: amountStr,
          textWidth,
          anchorX: bx,
          anchorY: by,
          x: bx + Math.cos(angle) * offset,
          y: by + Math.sin(angle) * offset,
        });
      }
      return labels;
    },
    [canvasWidth],
  );

  /** Create a force simulation for label positioning. */
  const createLabelSim = useCallback(
    (labels: LabelNode[], balls: FloatingBall[]): Simulation<LabelNode, undefined> => {
      const w = canvasWidth;
      const h = canvasHeight(w);
      const LABEL_H = 24; // approximate height of a two-line label
      const PAD = 4;

      const sim = forceSimulation(labels)
        // Pull each label toward its ball
        .force('anchor', () => {
          for (const label of labels) {
            const dx = label.anchorX - label.x!;
            const dy = label.anchorY - label.y!;
            label.vx! += dx * 0.08;
            label.vy! += dy * 0.08;
          }
        })
        // Labels repel each other
        .force(
          'collide',
          forceCollide<LabelNode>()
            .radius((d) => d.textWidth / 2 + PAD + 8)
            .iterations(2),
        )
        // Labels avoid overlapping balls
        .force('avoidBalls', () => {
          for (const label of labels) {
            const lx = label.x!;
            const ly = label.y!;
            const halfW = label.textWidth / 2 + PAD;
            for (const ball of balls) {
              const dx = lx - ball.x!;
              const dy = ly - ball.y!;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const minDist = ball.radius + halfW;
              if (dist < minDist && dist > 0) {
                const push = (minDist - dist) * 0.5;
                label.vx! += (dx / dist) * push;
                label.vy! += (dy / dist) * push;
              }
            }
          }
        })
        // Clamp to canvas bounds
        .on('tick', () => {
          for (const label of labels) {
            const halfW = label.textWidth / 2 + PAD;
            label.x = Math.max(halfW, Math.min(w - halfW, label.x!));
            label.y = Math.max(LABEL_H / 2, Math.min(h - LABEL_H / 2, label.y!));
          }
        })
        .alphaDecay(0.02)
        .velocityDecay(0.4)
        .stop();

      return sim;
    },
    [canvasWidth],
  );

  /** Build and start label simulation for current balls. */
  const rebuildLabels = useCallback(
    (balls: FloatingBall[]) => {
      labelSimRef.current?.stop();
      const labels = buildLabelNodes(balls);
      labelNodesRef.current = labels;
      if (labels.length > 0) {
        labelSimRef.current = createLabelSim(labels, balls);
      } else {
        labelSimRef.current = null;
      }
    },
    [buildLabelNodes, createLabelSim],
  );

  /** Clear labels (used during transitions). */
  const clearLabels = useCallback(() => {
    labelSimRef.current?.stop();
    labelNodesRef.current = [];
    labelSimRef.current = null;
  }, []);

  // Render
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvasWidth;
    const h = canvasHeight(w);

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const trans = transitionRef.current;
    const nodes = nodesRef.current;

    // --- Background grid: always visible, warps continuously across transitions ---
    {
      const gw = gridWarpRef.current;
      let ox: number, oy: number, strength: number, gridSize: number;

      if (trans && gw.prev) {
        // Interpolate from previous warp state to current target
        const t = trans.progress;
        const ease = 1 - Math.pow(1 - t, 3);
        ox = gw.prev.ox + (gw.ox - gw.prev.ox) * ease;
        oy = gw.prev.oy + (gw.oy - gw.prev.oy) * ease;
        strength = gw.prev.strength + (gw.strength - gw.prev.strength) * ease;
        gridSize = gw.prev.gridSize + (gw.gridSize - gw.prev.gridSize) * ease;
      } else {
        // Settled state
        ox = gw.ox;
        oy = gw.oy;
        strength = gw.strength;
        gridSize = gw.gridSize;
      }
      // Clamp to reasonable range
      gridSize = Math.max(20, Math.min(80, gridSize));

      const alpha = 0.42;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 0.5;
      const maxDist = Math.sqrt(w * w + h * h);
      for (let gx = 0; gx <= w; gx += gridSize) {
        ctx.beginPath();
        for (let gy = 0; gy <= h; gy += 4) {
          const dx = gx - ox, dy = gy - oy;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const warp = strength * (1 - dist / maxDist);
          const wx = gx + dx * warp * 0.5;
          const wy = gy + dy * warp * 0.5;
          if (gy === 0) ctx.moveTo(wx, wy);
          else ctx.lineTo(wx, wy);
        }
        ctx.stroke();
      }
      for (let gy = 0; gy <= h; gy += gridSize) {
        ctx.beginPath();
        for (let gx = 0; gx <= w; gx += 4) {
          const dx = gx - ox, dy = gy - oy;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const warp = strength * (1 - dist / maxDist);
          const wx = gx + dx * warp * 0.5;
          const wy = gy + dy * warp * 0.5;
          if (gx === 0) ctx.moveTo(wx, wy);
          else ctx.lineTo(wx, wy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    if (trans) {
      const t = trans.progress;
      // Ease-in-out for the ghost fade
      const fadeT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      if (trans.direction === 'back') {
        // --- Converge & Grow: old sub-balls shrink inward, new parent balls grow ---

        // Old sub-balls converge toward origin, shrinking
        const convergeT = Math.min(1, t / 0.65);
        const cEase = convergeT * convergeT * convergeT; // easeInCubic — accelerates inward
        for (const ball of trans.others) {
          const bx = ball.x + (trans.originX - ball.x) * cEase;
          const by = ball.y + (trans.originY - ball.y) * cEase;
          const bScale = Math.max(0.05, 1 - cEase * 0.95);
          const bAlpha = Math.max(0, 1 - cEase * 1.1);
          if (bAlpha > 0.01) {
            const r = ball.radius * bScale;
            ctx.globalAlpha = bAlpha;
            ctx.beginPath();
            ctx.arc(bx, by, r, 0, Math.PI * 2);
            ctx.fillStyle = ball.color;
            ctx.fill();
            const grad = ctx.createRadialGradient(
              bx - r * 0.3, by - r * 0.3, 0,
              bx, by, r,
            );
            grad.addColorStop(0, 'rgba(255,255,255,0.25)');
            grad.addColorStop(1, 'rgba(0,0,0,0.1)');
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        }

        // New parent balls grow in (delayed start so convergence is visible first)
        if (t > 0.3) {
          const growT = Math.min(1, (t - 0.3) / 0.7);
          const gEase = 1 - Math.pow(1 - growT, 3); // easeOutCubic
          for (const ball of nodes) {
            ctx.globalAlpha = gEase;
            drawBall(ctx, ball, false, false, gEase);
            ctx.globalAlpha = 1;
          }
        }
      } else {
        // --- Drill down: burst from center with comet tails ---

        // Non-clicked old balls: simple fade out
        const othersAlpha = Math.max(0, 1 - fadeT * 1.2);
        if (othersAlpha > 0) {
          ctx.globalAlpha = othersAlpha;
          for (const ball of trans.others) {
            const r = ball.radius;
            if (r < 0.5) continue;
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
            ctx.fillStyle = ball.color;
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }

        // Expanding new balls: burst from center with comet tails
        const expandT = Math.min(1, t / 0.85);
        const expandEase = 1 - Math.pow(1 - expandT, 3);
        const ballScale = Math.min(1, 0.15 + expandEase * 0.85);

        if (expandEase > 0) {
          // Draw comet tails first (behind balls)
          for (let ni = 0; ni < nodes.length; ni++) {
            const trail = trans.trails[ni];
            if (!trail || trail.length < 2) continue;
            const ball = nodes[ni];
            const r = ball.radius * ballScale;
            for (let ti = 1; ti < trail.length; ti++) {
              const tFrac = ti / trail.length; // 0=oldest, 1=newest
              const prev = trail[ti - 1];
              const cur = trail[ti];
              ctx.globalAlpha = tFrac * 0.5;
              ctx.beginPath();
              ctx.moveTo(prev.x, prev.y);
              ctx.lineTo(cur.x, cur.y);
              ctx.strokeStyle = ball.color;
              ctx.lineWidth = r * 2 * tFrac * 0.8;
              ctx.lineCap = 'round';
              ctx.stroke();
            }
          }
          ctx.globalAlpha = 1;

          // Draw new balls
          for (const ball of nodes) {
            const r = ball.radius * ballScale;
            if (r < 0.5) continue;
            ctx.globalAlpha = Math.min(1, expandT * 3);
            drawBall(ctx, ball, false, false, ballScale);
            ctx.globalAlpha = 1;
          }
        }

        // Ghost of clicked ball: fades through (drawn on top so sub-balls emerge "through" it)
        if (trans.clicked) {
          const ghostAlpha = Math.max(0, 1 - fadeT * 1.2);
          if (ghostAlpha > 0) {
            const cb = trans.clicked;
            // Filled ghost
            ctx.globalAlpha = ghostAlpha;
            ctx.beginPath();
            ctx.arc(cb.x, cb.y, cb.radius, 0, Math.PI * 2);
            ctx.fillStyle = cb.color;
            ctx.fill();
            const grad = ctx.createRadialGradient(
              cb.x - cb.radius * 0.3, cb.y - cb.radius * 0.3, 0,
              cb.x, cb.y, cb.radius,
            );
            grad.addColorStop(0, 'rgba(255,255,255,0.25)');
            grad.addColorStop(1, 'rgba(0,0,0,0.1)');
            ctx.fillStyle = grad;
            ctx.fill();
            // Lingering outline
            ctx.globalAlpha = ghostAlpha * 0.5;
            ctx.beginPath();
            ctx.arc(cb.x, cb.y, cb.radius, 0, Math.PI * 2);
            ctx.strokeStyle = cb.color;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }
    } else {
      // Normal rendering — no transition
      const depth = drillStackRef.current.length;
      for (const ball of nodes) {
        const canDrill = depth < 2 && (depth === 0 || isDrillableBall(ball));
        drawBall(ctx, ball, ball.id === hoveredId, canDrill);
      }

      // Draw labels on balls large enough
      for (const ball of nodes) {
        if (ball.radius < 20) continue;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';

        const maxChars = Math.floor(ball.radius / 4);
        let label = ball.label;
        if (label.length > maxChars) label = label.slice(0, maxChars - 1) + '…';

        const fontSize = Math.max(9, Math.min(13, ball.radius * 0.28));
        ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
        ctx.fillText(label, ball.x!, ball.y! - fontSize * 0.4);

        ctx.font = `${fontSize * 0.85}px system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(fmtAmount(ball.amount), ball.x!, ball.y! + fontSize * 0.6);
      }

      // Draw external labels for small balls
      for (const label of labelNodesRef.current) {
        const ball = nodes[label.ballId];
        if (!ball) continue;
        const lx = label.x!;
        const ly = label.y!;
        const bx = ball.x!;
        const by = ball.y!;

        const isHov = ball.id === hoveredId;

        // Underline position (bottom of text block)
        const underlineY = ly + 8;
        const halfW = label.textWidth / 2 + 4;
        const lineColor = isHov ? '#475569' : '#94a3b8';
        const lineW = isHov ? 1.5 : 0.75;

        // Leader line from ball edge to the underline
        const angle = Math.atan2(underlineY - by, lx - bx);
        const startX = bx + Math.cos(angle) * ball.radius;
        const startY = by + Math.sin(angle) * ball.radius;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(lx, underlineY);
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = lineW;
        ctx.stroke();

        // Small dot at the ball end of the leader
        ctx.beginPath();
        ctx.arc(startX, startY, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = lineColor;
        ctx.fill();

        // Underline extends under the text, connected to the leader
        ctx.beginPath();
        ctx.moveTo(lx - halfW, underlineY);
        ctx.lineTo(lx + halfW, underlineY);
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = lineW;
        ctx.stroke();

        // Label text (above the underline)
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.font = isHov ? 'bold 10px system-ui, sans-serif' : '10px system-ui, sans-serif';
        ctx.fillStyle = isHov ? '#1e293b' : '#475569';
        ctx.fillText(label.text, lx, underlineY - 9);
        ctx.font = '9px system-ui, sans-serif';
        ctx.fillStyle = isHov ? '#334155' : '#64748b';
        ctx.fillText(label.amount, lx, underlineY - 0.5);
      }
    }

    // --- Draw size legend (bottom-left) ---
    drawLegend(ctx, h, trans);
  }, [canvasWidth, hoveredId, drillStack]);

  // Keep refs in sync so animation loop always uses latest versions
  renderRef.current = render;
  drillStackRef.current = drillStack;

  /** Check if a ball at depth 1 (category) is drillable to subcategories. */
  function isDrillableBall(ball: FloatingBall): boolean {
    const stack = drillStackRef.current;
    if (stack.length !== 1) return false;
    // slug format: "dept-slug__categoryCode"
    const parts = ball.slug.split('__');
    if (parts.length < 2) return false;
    return categoryIsDrillable(parts[0], parts[1]);
  }

  /** Draw a single ball. */
  function drawBall(
    ctx: CanvasRenderingContext2D,
    ball: FloatingBall,
    isHovered: boolean,
    showClickHint: boolean,
    scale: number = 1,
  ) {
    const r = ball.radius * scale;
    ctx.beginPath();
    ctx.arc(ball.x!, ball.y!, r, 0, Math.PI * 2);
    ctx.fillStyle = ball.color;
    ctx.fill();

    // Subtle gradient highlight
    const grad = ctx.createRadialGradient(
      ball.x! - r * 0.3,
      ball.y! - r * 0.3,
      0,
      ball.x!,
      ball.y!,
      r,
    );
    grad.addColorStop(0, 'rgba(255,255,255,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0.1)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Hover outline
    if (isHovered) {
      ctx.beginPath();
      ctx.arc(ball.x!, ball.y!, r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }

  /** Draw the size legend in the bottom-left corner of the canvas.
   *  Uses staggered cascade: each circle transitions independently
   *  (largest first, then mid, then smallest) with smoothly counting labels. */
  function drawLegend(
    ctx: CanvasRenderingContext2D,
    canvasH: number,
    trans: typeof transitionRef.current,
  ) {
    const nextTicks = legendTicks(scaleRef.current.maxAmount);
    const prevTicks = prevTicksRef.current;
    const prev = prevScaleRef.current;
    const next = scaleRef.current;

    // Stagger delays per circle: [largest, mid, smallest]
    const delays = [0, 0.2, 0.4];
    const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

    // Compute per-circle interpolated values
    const circles = nextTicks.map((targetAmount, i) => {
      let amount = targetAmount;
      let scale = next;

      if (trans && prev && prevTicks) {
        const t = trans.progress;
        // Each circle has its own eased progress with staggered delay
        const localT = Math.max(0, Math.min(1, (t - delays[i]) / 0.6));
        const ease = easeOutCubic(localT);
        amount = prevTicks[i] + (targetAmount - prevTicks[i]) * ease;
        scale = {
          maxAmount: prev.maxAmount + (next.maxAmount - prev.maxAmount) * ease,
          maxRadius: prev.maxRadius + (next.maxRadius - prev.maxRadius) * ease,
          minRadius: prev.minRadius + (next.minRadius - prev.minRadius) * ease,
        };
      }

      return {
        amount,
        radius: amountToRadius(amount, scale.maxAmount, scale.maxRadius, scale.minRadius),
        label: fmtAmount(amount),
        localEase: trans && prev ? easeOutCubic(Math.max(0, Math.min(1, (trans.progress - delays[i]) / 0.6))) : 1,
      };
    });

    const largest = circles[0];
    const padding = 20;
    const baselineY = canvasH - padding;
    const cx = padding + largest.radius + 4;

    ctx.save();

    // Semi-transparent backdrop so legend is readable over balls
    const backdropX = cx - largest.radius - 8;
    const backdropY = baselineY - largest.radius * 2 - 10;
    const backdropW = largest.radius * 2 + 85;
    const backdropH = largest.radius * 2 + 16;
    ctx.fillStyle = 'rgba(248, 250, 252, 0.8)';
    ctx.fillRect(backdropX, backdropY, backdropW, backdropH);

    // Draw circles from smallest (on top) to largest (behind)
    for (let i = circles.length - 1; i >= 0; i--) {
      const c = circles[i];
      const cy = baselineY - c.radius;
      const isOutermost = i === 0;
      const alpha = 0.3 + c.localEase * 0.7;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Dashed circle
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(c.radius, 1), 0, Math.PI * 2);
      ctx.setLineDash(isOutermost ? [5, 3] : [4, 3]);
      ctx.strokeStyle = isOutermost ? '#475569' : '#64748b';
      ctx.lineWidth = isOutermost ? 2 : 1.5;
      ctx.stroke();
      ctx.setLineDash([]);

      // Leader line from top of circle to label — starts at the actual topmost point
      const topY = cy - c.radius;
      const lineEndX = cx + largest.radius + 10;
      ctx.beginPath();
      ctx.moveTo(cx, topY);
      ctx.lineTo(lineEndX, topY);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 0.75;
      ctx.stroke();

      // Label
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillStyle = '#475569';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.label, lineEndX + 3, topY);

      ctx.restore();
    }

    ctx.restore();
  }

  // Animation loop — uses renderRef to avoid stale closure issues
  const startLoop = useCallback(() => {
    const sim = simulationRef.current;
    if (!sim) return;

    let settling = 0;

    const tick = () => {
      sim.tick();

      // Clamp nodes to canvas bounds
      const w = canvasWidth;
      const h = canvasHeight(w);
      for (const node of nodesRef.current) {
        node.x = Math.max(node.radius, Math.min(w - node.radius, node.x!));
        node.y = Math.max(node.radius, Math.min(h - node.radius, node.y!));
      }

      // Handle transition animation — advance progress + record comet trails
      const trans = transitionRef.current;
      if (trans) {
        trans.progress = Math.min(1, trans.progress + 0.025);

        // Record trail positions for comet tails (drill-down only)
        if (trans.direction === 'drill') {
          const nodes = nodesRef.current;
          const TRAIL_LEN = 18;
          for (let ni = 0; ni < nodes.length; ni++) {
            if (!trans.trails[ni]) trans.trails[ni] = [];
            trans.trails[ni].push({ x: nodes[ni].x!, y: nodes[ni].y! });
            if (trans.trails[ni].length > TRAIL_LEN) trans.trails[ni].shift();
          }
        }

        if (trans.progress >= 1) {
          transitionRef.current = null;
          // Rebuild labels now that transition is done
          const currentBalls = nodesRef.current;
          const labels = buildLabelNodes(currentBalls);
          labelNodesRef.current = labels;
          if (labels.length > 0) {
            labelSimRef.current = createLabelSim(labels, currentBalls);
          }
        }
      }

      // Update label anchors to follow balls and tick label sim
      const labelNodes = labelNodesRef.current;
      const ballNodes = nodesRef.current;
      for (const label of labelNodes) {
        const ball = ballNodes[label.ballId];
        if (ball) {
          label.anchorX = ball.x!;
          label.anchorY = ball.y!;
        }
      }
      if (labelSimRef.current && labelNodes.length > 0) {
        labelSimRef.current.alpha(Math.max(labelSimRef.current.alpha(), 0.05));
        labelSimRef.current.tick();
      }

      renderRef.current();

      const labelActive = labelSimRef.current && labelSimRef.current.alpha() > 0.01;
      if (sim.alpha() > 0.001 || trans || labelActive) {
        settling = 0;
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        settling++;
        // Keep ticking a bit for gentle floating
        if (settling < 60) {
          sim.alpha(0.01);
          animFrameRef.current = requestAnimationFrame(tick);
        } else {
          renderRef.current();
        }
      }
    };

    sim.alpha(1).restart().stop();
    animFrameRef.current = requestAnimationFrame(tick);
  }, [canvasWidth, buildLabelNodes, createLabelSim]);

  useEffect(() => {
    if (canvasWidth < 100) return;

    cancelAnimationFrame(animFrameRef.current);
    simulationRef.current?.stop();
    transitionRef.current = null;
    drillStackRef.current = [];
    setDrillStack([]);

    const balls = buildDeptBalls();
    gridWarpRef.current = { ox: 0, oy: 0, strength: 0, gridSize: scaleRef.current.maxRadius * 2, prev: null };
    nodesRef.current = balls;
    simulationRef.current = createSim(balls);
    rebuildLabels(balls);
    startLoop();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      simulationRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasWidth]);

  /** Build balls for a given stack depth, used by doBack to rebuild a level. */
  const buildBallsForStack = useCallback(
    (stack: DrillLevel[], originX: number, originY: number): FloatingBall[] => {
      if (stack.length === 0) return buildDeptBalls();
      if (stack.length === 1) return buildCategoryBalls(stack[0].deptSlug, originX, originY);
      if (stack.length === 2) {
        return buildSubcategoryBalls(stack[0].deptSlug, stack[1].categoryCode!, originX, originY);
      }
      return [];
    },
    [buildDeptBalls, buildCategoryBalls, buildSubcategoryBalls],
  );

  // Drill down — works for depth 0→1 (dept→categories) and 1→2 (category→subcategories)
  const doDrill = useCallback(
    (slug: string) => {
      const oldNodes = nodesRef.current;
      const clicked = oldNodes.find((n) => n.slug === slug);
      if (!clicked) return;

      const ox = clicked.x!;
      const oy = clicked.y!;
      const stack = drillStackRef.current;

      // Snapshot current scale/ticks BEFORE building new balls (which overwrite scaleRef)
      const savedScale = { ...scaleRef.current };
      const savedTicks = legendTicks(scaleRef.current.maxAmount);

      let newBalls: FloatingBall[];
      let newLevel: DrillLevel;

      if (stack.length === 0) {
        // Dept → categories
        newBalls = buildCategoryBalls(slug, ox, oy);
        if (newBalls.length === 0) return;
        const detail = expenditureDetails.find((d) => d.slug === slug);
        newLevel = {
          type: 'dept',
          deptSlug: slug,
          label: detail?.department || slug,
        };
      } else if (stack.length === 1) {
        // Category → subcategories
        const parts = slug.split('__');
        const deptSlug = parts[0];
        const catCode = parts[1];
        if (!categoryIsDrillable(deptSlug, catCode)) return;
        newBalls = buildSubcategoryBalls(deptSlug, catCode, ox, oy);
        if (newBalls.length === 0) return;
        newLevel = {
          type: 'category',
          deptSlug,
          categoryCode: catCode,
          label: clicked.label,
        };
      } else {
        return; // Already at leaf level
      }

      cancelAnimationFrame(animFrameRef.current);
      simulationRef.current?.stop();

      const others = oldNodes
        .filter((n) => n.slug !== slug)
        .map((n) => ({ x: n.x!, y: n.y!, radius: n.radius, color: n.color }));
      const clickedSnapshot = { x: ox, y: oy, radius: clicked.radius, color: clicked.color };
      prevScaleRef.current = savedScale;
      prevTicksRef.current = savedTicks;

      // New balls start at dead center of clicked ball, burst outward
      for (const ball of newBalls) {
        ball.x = ox;
        ball.y = oy;
        const angle = Math.random() * Math.PI * 2;
        const speed = 6 + Math.random() * 6;
        ball.vx = Math.cos(angle) * speed;
        ball.vy = Math.sin(angle) * speed;
      }

      // Snapshot current grid warp as "prev" and set new target
      // Deeper levels get stronger warp: depth 1 = 0.6, depth 2 = 1.4
      const newDepth = stack.length + 1;
      const gw = gridWarpRef.current;
      gw.prev = { ox: gw.ox, oy: gw.oy, strength: gw.strength, gridSize: gw.gridSize };
      gw.ox = ox;
      gw.oy = oy;
      gw.strength = 0.4 + newDepth * 0.5;
      gw.gridSize = scaleRef.current.maxRadius * 2;

      transitionRef.current = {
        others,
        clicked: clickedSnapshot,
        originX: ox,
        originY: oy,
        progress: 0,
        direction: 'drill',
        trails: newBalls.map(() => [{ x: ox, y: oy }]),
      };

      const newStack = [...stack, newLevel];
      nodesRef.current = newBalls;
      simulationRef.current = createSim(newBalls);
      clearLabels();
      setDrillStack(newStack);
      setTooltip(null);
      setHoveredId(null);
      startLoop();
    },
    [buildCategoryBalls, buildSubcategoryBalls, categoryIsDrillable, expenditureDetails, createSim, startLoop],
  );

  // Go back one level (or jump to a specific depth via doBackTo)
  const doBackTo = useCallback(
    (targetDepth: number) => {
      cancelAnimationFrame(animFrameRef.current);
      simulationRef.current?.stop();

      const oldNodes = nodesRef.current;

      let cx = 0, cy = 0;
      for (const n of oldNodes) { cx += n.x!; cy += n.y!; }
      cx /= oldNodes.length || 1;
      cy /= oldNodes.length || 1;

      const others = oldNodes.map((n) => ({
        x: n.x!, y: n.y!, radius: n.radius, color: n.color,
      }));
      prevScaleRef.current = { ...scaleRef.current };
      prevTicksRef.current = legendTicks(scaleRef.current.maxAmount);

      const newStack = drillStackRef.current.slice(0, targetDepth);
      const balls = buildBallsForStack(newStack, cx, cy);

      // Keep initial positions from buildBallsForStack (already canvas-centered); clear velocities
      for (const ball of balls) {
        ball.vx = 0;
        ball.vy = 0;
      }

      // Snapshot current grid warp as "prev" and set target for back navigation
      const gw = gridWarpRef.current;
      gw.prev = { ox: gw.ox, oy: gw.oy, strength: gw.strength, gridSize: gw.gridSize };
      gw.ox = cx;
      gw.oy = cy;
      gw.strength = targetDepth > 0 ? 0.4 + targetDepth * 0.5 : 0;
      gw.gridSize = scaleRef.current.maxRadius * 2;

      transitionRef.current = {
        others,
        clicked: null,
        originX: cx,
        originY: cy,
        progress: 0,
        direction: 'back',
        trails: balls.map(() => [{ x: cx, y: cy }]),
      };

      nodesRef.current = balls;
      simulationRef.current = createSim(balls);
      clearLabels();
      setDrillStack(newStack);
      setTooltip(null);
      setHoveredId(null);
      startLoop();
    },
    [buildBallsForStack, createSim, startLoop],
  );

  const doBack = useCallback(() => {
    const depth = drillStackRef.current.length;
    if (depth === 0) return;
    doBackTo(depth - 1);
  }, [doBackTo]);

  // Mouse interaction
  const findBallAt = useCallback(
    (mx: number, my: number): FloatingBall | null => {
      let closest: FloatingBall | null = null;
      let closestDist = Infinity;

      for (const ball of nodesRef.current) {
        const dx = ball.x! - mx;
        const dy = ball.y! - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < ball.radius + 4 && dist < closestDist) {
          closest = ball;
          closestDist = dist;
        }
      }
      return closest;
    },
    [],
  );

  /** Check if a ball can be drilled into at the current depth. */
  const canDrillBall = useCallback(
    (ball: FloatingBall): boolean => {
      const depth = drillStackRef.current.length;
      if (depth >= 2) return false; // leaf level
      if (depth === 0) return true; // can always drill into departments
      // depth 1: check if category has subcategories
      const parts = ball.slug.split('__');
      return parts.length >= 2 && categoryIsDrillable(parts[0], parts[1]);
    },
    [categoryIsDrillable],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Check balls first, then external labels
      let ball = findBallAt(mx, my);

      // If no ball hit, check external label bounding rects
      if (!ball) {
        for (const label of labelNodesRef.current) {
          const lx = label.x!;
          const ly = label.y!;
          const halfW = label.textWidth / 2 + 6;
          const halfH = 13;
          if (mx >= lx - halfW && mx <= lx + halfW && my >= ly - halfH && my <= ly + halfH) {
            ball = nodesRef.current[label.ballId] ?? null;
            break;
          }
        }
      }

      if (ball) {
        const drillable = canDrillBall(ball);
        canvas.style.cursor = drillable ? 'pointer' : 'default';
        setHoveredId(ball.id);
        setTooltip({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top - 50,
          label: ball.label,
          amount: fmtAmount(ball.amount),
          hint: drillable ? 'Click to break down' : '',
        });

        render();
      } else {
        canvas.style.cursor = 'default';
        if (hoveredId !== null) {
          setHoveredId(null);
          setTooltip(null);
          render();
        }
      }
    },
    [findBallAt, canDrillBall, render, hoveredId],
  );

  const handleClick = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      let ball = findBallAt(mx, my);

      // Also check label clicks
      if (!ball) {
        for (const label of labelNodesRef.current) {
          const lx = label.x!;
          const ly = label.y!;
          const halfW = label.textWidth / 2 + 6;
          const halfH = 13;
          if (mx >= lx - halfW && mx <= lx + halfW && my >= ly - halfH && my <= ly + halfH) {
            ball = nodesRef.current[label.ballId] ?? null;
            break;
          }
        }
      }

      if (ball && canDrillBall(ball)) {
        doDrill(ball.slug);
      }
    },
    [findBallAt, canDrillBall, doDrill],
  );

  const depth = drillStack.length;

  // Build breadcrumb segments
  const breadcrumbs: { label: string; depth: number }[] = [
    { label: 'All Departments', depth: 0 },
  ];
  for (let i = 0; i < drillStack.length; i++) {
    breadcrumbs.push({ label: drillStack[i].label, depth: i + 1 });
  }

  const height = canvasHeight(canvasWidth);

  // Subtitle text for current level
  const subtitle = depth === 0
    ? 'Each ball = one department, sized by budget'
    : depth === 1
      ? `${drillStack[0].label} — expenditure categories`
      : `${drillStack[0].label} — ${drillStack[1].label} — line items`;

  return (
    <div ref={containerRef} class="relative">
      {/* Breadcrumb navigation */}
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div class="flex items-center gap-3">
          {depth > 0 && (
            <nav class="text-sm flex items-center gap-1 flex-wrap">
              {breadcrumbs.map((crumb, i) => {
                const isLast = i === breadcrumbs.length - 1;
                if (isLast) {
                  return (
                    <span key={i} class="text-gray-700 font-medium">{crumb.label}</span>
                  );
                }
                return (
                  <span key={i} class="flex items-center gap-1">
                    {i === 0 && <span>←</span>}
                    <button
                      onClick={() => doBackTo(crumb.depth)}
                      class="text-blue-600 hover:text-blue-800"
                    >
                      {crumb.label}
                    </button>
                    <span class="text-gray-400">/</span>
                  </span>
                );
              })}
            </nav>
          )}
          <span class="text-xs text-gray-500">
            {subtitle}
          </span>
        </div>
      </div>

      {depth > 0 && (
        <h2 class="text-lg font-semibold mb-2">
          {breadcrumbs[breadcrumbs.length - 1].label}
        </h2>
      )}

      <div class="relative">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          onMouseLeave={() => {
            setTooltip(null);
            setHoveredId(null);
            render();
          }}
          class="w-full border border-gray-200 rounded-lg bg-slate-50"
          style={{ height: `${height}px` }}
          aria-label={
            depth === 0
              ? `City of Pittsburgh 2026 operating budget: departments shown as proportional floating balls`
              : depth === 1
                ? `Budget breakdown for ${drillStack[0].label}: expenditure categories shown as proportional balls`
                : `Line items for ${drillStack[1]?.label} in ${drillStack[0].label}: shown as proportional balls`
          }
          role="img"
        />
        {tooltip && (
          <div
            class="absolute pointer-events-none bg-gray-900 text-white text-xs rounded px-2.5 py-1.5 shadow-lg z-10"
            style={{
              left: `${Math.min(tooltip.x, canvasWidth - 140)}px`,
              top: `${Math.max(tooltip.y, 0)}px`,
            }}
          >
            <div class="font-medium">{tooltip.label}</div>
            <div class="text-gray-300">{tooltip.amount}</div>
            {tooltip.hint && (
              <div class="text-blue-300 text-[10px] mt-0.5">{tooltip.hint}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

