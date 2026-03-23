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
    /** Balls shrinking to nothing (old view) — frozen positions/radii at transition start */
    shrinking: { x: number; y: number; radius: number; color: string }[];
    /** Origin point where new balls burst from */
    originX: number;
    originY: number;
    /** 0→1 animation progress */
    progress: number;
    direction: 'drill' | 'back';
  } | null>(null);
  const renderRef = useRef<() => void>(() => {});
  const drillStackRef = useRef<DrillLevel[]>([]);
  const scaleRef = useRef<ScaleInfo>({ maxAmount: 1, maxRadius: 60, minRadius: 12 });
  const prevScaleRef = useRef<ScaleInfo | null>(null);

  // Build department-level balls
  const buildDeptBalls = useCallback((): FloatingBall[] => {
    const width = containerWidth;
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
  }, [departmentBudgets, containerWidth]);

  // Build sub-category balls for a department
  const buildCategoryBalls = useCallback(
    (slug: string, originX: number, originY: number): FloatingBall[] => {
      const width = containerWidth;
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
    [expenditureDetails, containerWidth],
  );

  // Build subcategory/line-item balls for a category within a department
  const buildSubcategoryBalls = useCallback(
    (deptSlug: string, categoryCode: string, originX: number, originY: number): FloatingBall[] => {
      const width = containerWidth;
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
    [expenditureDetails, containerWidth],
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
      const width = containerWidth;
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
    [containerWidth],
  );

  // Render
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = containerWidth;
    const h = canvasHeight(w);

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const trans = transitionRef.current;
    const nodes = nodesRef.current;

    if (trans) {
      const t = trans.progress;
      // Ease function for smooth animation (ease-out cubic)
      const ease = 1 - Math.pow(1 - t, 3);

      // --- Shrinking old balls: scale from full → 0 ---
      const shrinkScale = Math.max(0, 1 - ease * 1.5); // shrink faster than expand
      if (shrinkScale > 0) {
        ctx.globalAlpha = shrinkScale;
        for (const ball of trans.shrinking) {
          const r = ball.radius * shrinkScale;
          if (r < 0.5) continue;
          ctx.beginPath();
          ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
          ctx.fillStyle = ball.color;
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // --- Expanding new balls: burst from origin, scale from 0 → full ---
      const expandT = Math.max(0, (t - 0.1) / 0.9); // start slightly after shrink begins
      const expandEase = 1 - Math.pow(1 - expandT, 2);
      if (expandEase > 0) {
        for (const ball of nodes) {
          // Interpolate position from origin to current simulation position
          const bx = trans.originX + (ball.x! - trans.originX) * expandEase;
          const by = trans.originY + (ball.y! - trans.originY) * expandEase;
          const r = ball.radius * expandEase;
          if (r < 0.5) continue;

          ctx.globalAlpha = Math.min(1, expandEase * 2);
          drawBall(ctx, { ...ball, x: bx, y: by } as FloatingBall, false, false, expandEase);
          ctx.globalAlpha = 1;
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
    }

    // --- Draw size legend (bottom-left) ---
    drawLegend(ctx, h, trans);
  }, [containerWidth, hoveredId, drillStack]);

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

  /** Draw the size legend in the bottom-left corner of the canvas. */
  function drawLegend(
    ctx: CanvasRenderingContext2D,
    canvasH: number,
    trans: typeof transitionRef.current,
  ) {
    // Interpolate between old and new scale during transitions
    let scale = scaleRef.current;
    if (trans && prevScaleRef.current) {
      const t = trans.progress;
      const ease = 1 - Math.pow(1 - t, 3);
      const prev = prevScaleRef.current;
      const next = scaleRef.current;
      scale = {
        maxAmount: prev.maxAmount + (next.maxAmount - prev.maxAmount) * ease,
        maxRadius: prev.maxRadius + (next.maxRadius - prev.maxRadius) * ease,
        minRadius: prev.minRadius + (next.minRadius - prev.minRadius) * ease,
      };
    }

    // Use the target scale's ticks (so labels don't flicker)
    const ticks = legendTicks(scaleRef.current.maxAmount);
    const circles = ticks.map((amount) => ({
      amount,
      radius: amountToRadius(amount, scale.maxAmount, scale.maxRadius, scale.minRadius),
      label: fmtAmount(amount),
    }));

    const largest = circles[0];
    const padding = 20;
    const baselineY = canvasH - padding;
    const cx = padding + largest.radius + 4;

    ctx.save();
    ctx.globalAlpha = trans ? Math.min(1, 0.4 + trans.progress * 0.6) : 1;

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
      const w = containerWidth;
      const h = canvasHeight(w);
      for (const node of nodesRef.current) {
        node.x = Math.max(node.radius, Math.min(w - node.radius, node.x!));
        node.y = Math.max(node.radius, Math.min(h - node.radius, node.y!));
      }

      // Handle transition animation
      const trans = transitionRef.current;
      if (trans) {
        trans.progress = Math.min(1, trans.progress + 0.03);
        if (trans.progress >= 1) {
          transitionRef.current = null;
        }
      }

      renderRef.current();

      if (sim.alpha() > 0.001 || trans) {
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
  }, [containerWidth]);

  // Track the last width we initialized at to avoid re-running on callback identity changes
  // Initialize on mount and when container width changes — only fires on resize
  useEffect(() => {
    if (containerWidth < 100) return;

    cancelAnimationFrame(animFrameRef.current);
    simulationRef.current?.stop();
    transitionRef.current = null;
    drillStackRef.current = [];
    setDrillStack([]);

    const balls = buildDeptBalls();
    nodesRef.current = balls;
    simulationRef.current = createSim(balls);
    startLoop();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      simulationRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerWidth]);

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

      const shrinking = oldNodes.map((n) => ({
        x: n.x!, y: n.y!, radius: n.radius, color: n.color,
      }));
      prevScaleRef.current = { ...scaleRef.current };

      for (const ball of newBalls) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 8 + Math.random() * 12;
        ball.vx = Math.cos(angle) * speed;
        ball.vy = Math.sin(angle) * speed;
      }

      transitionRef.current = {
        shrinking,
        originX: ox,
        originY: oy,
        progress: 0,
        direction: 'drill',
      };

      const newStack = [...stack, newLevel];
      nodesRef.current = newBalls;
      simulationRef.current = createSim(newBalls);
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

      const shrinking = oldNodes.map((n) => ({
        x: n.x!, y: n.y!, radius: n.radius, color: n.color,
      }));
      prevScaleRef.current = { ...scaleRef.current };

      const newStack = drillStackRef.current.slice(0, targetDepth);
      const balls = buildBallsForStack(newStack, cx, cy);

      // For dept-level balls built without origin, position at centroid
      for (const ball of balls) {
        if (!ball.isSub) {
          ball.x = cx + (Math.random() - 0.5) * 20;
          ball.y = cy + (Math.random() - 0.5) * 20;
        }
        const angle = Math.random() * Math.PI * 2;
        const speed = 6 + Math.random() * 10;
        ball.vx = Math.cos(angle) * speed;
        ball.vy = Math.sin(angle) * speed;
      }

      transitionRef.current = {
        shrinking,
        originX: cx,
        originY: cy,
        progress: 0,
        direction: 'back',
      };

      nodesRef.current = balls;
      simulationRef.current = createSim(balls);
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

      const ball = findBallAt(mx, my);
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

      const ball = findBallAt(mx, my);
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

  const height = canvasHeight(containerWidth);

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
              left: `${Math.min(tooltip.x, containerWidth - 140)}px`,
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

