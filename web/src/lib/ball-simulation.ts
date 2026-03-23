/**D3-force simulation setup for budget balls visualization.*/

import {
  forceSimulation,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
} from 'd3-force';

export interface BallNode extends SimulationNodeDatum {
  id: number;
  cluster: number;
  clusterName: string;
  color: string;
  radius: number;
  /** Target x for cluster centroid */
  cx: number;
  /** Target y for cluster centroid */
  cy: number;
  /** Amount this ball represents */
  amount: number;
  /** Whether this ball has been spawned (for pour animation) */
  spawned: boolean;
}

export interface ClusterInfo {
  id: number;
  name: string;
  slug?: string;
  color: string;
  total: number;
  ballCount: number;
  cx: number;
  cy: number;
}

export interface BowlParams {
  cx: number;
  cy: number;
  radius: number;
  clusterId: number;
}

export interface BowlGridResult {
  bowls: BowlParams[];
  totalHeight: number;
  columns: number;
  cellWidth: number;
  cellHeight: number;
}

/**
 * Compute a grid of equal-sized bowls, one per cluster.
 * Returns bowl positions and overall grid dimensions.
 */
export function computeBowlGrid(
  clusters: ClusterInfo[],
  width: number,
): BowlGridResult {
  const columns = width >= 1024 ? 4 : width >= 768 ? 3 : 2;
  const cellWidth = width / columns;
  const cellHeight = cellWidth * 1.1;
  const bowlRadius = cellWidth * 0.38;
  const rows = Math.ceil(clusters.length / columns);
  const totalHeight = rows * cellHeight;

  const bowls: BowlParams[] = clusters.map((cluster, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const cx = col * cellWidth + cellWidth / 2;
    // Position bowl center so the arc sits nicely in the cell
    // Bowl center is offset upward so there's room for the label below
    const cy = row * cellHeight + cellHeight * 0.45;

    // Update cluster centroid to match bowl center
    cluster.cx = cx;
    cluster.cy = cy;

    return { cx, cy, radius: bowlRadius, clusterId: cluster.id };
  });

  return { bowls, totalHeight, columns, cellWidth, cellHeight };
}

/**
 * Custom force: constant gravity pulling spawned nodes downward.
 * Not scaled by alpha so balls always fall until stopped by bowl/collision.
 */
function forceGravity(strength: number) {
  let nodes: BallNode[] = [];

  function force() {
    for (const node of nodes) {
      if (!node.spawned) continue;
      node.vy! += strength;
    }
  }

  force.initialize = function (_nodes: BallNode[]) {
    nodes = _nodes;
  };

  return force;
}

/**
 * Custom force: constrains nodes inside their cluster's bowl.
 * Each node is pushed back into the bowl corresponding to its cluster.
 */
function forceMultiBowl(bowlMap: Map<number, BowlParams>) {
  let nodes: BallNode[] = [];

  function force() {
    for (const node of nodes) {
      if (!node.spawned) continue;

      const bowl = bowlMap.get(node.cluster);
      if (!bowl) continue;

      // Only constrain nodes that have fallen into the bowl (below the rim)
      if (node.y! < bowl.cy) continue;

      const dx = node.x! - bowl.cx;
      const dy = node.y! - bowl.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = bowl.radius - node.radius;

      if (dist > maxDist && dist > 0) {
        // Project back onto bowl boundary
        const scale = maxDist / dist;
        node.x = bowl.cx + dx * scale;
        node.y = bowl.cy + dy * scale;

        // Kill outward velocity component
        const vDot = (node.vx! * dx + node.vy! * dy) / dist;
        if (vDot > 0) {
          node.vx! -= vDot * (dx / dist) * 0.8;
          node.vy! -= vDot * (dy / dist) * 0.8;
        }
      }
    }
  }

  force.initialize = function (_nodes: BallNode[]) {
    nodes = _nodes;
  };

  return force;
}

/**
 * Custom force: gently pulls each node toward the x-center of its bowl.
 * Prevents balls from drifting sideways into other bowls.
 */
function forceBowlCentering(bowlMap: Map<number, BowlParams>, strength: number) {
  let nodes: BallNode[] = [];

  function force() {
    for (const node of nodes) {
      if (!node.spawned) continue;
      const bowl = bowlMap.get(node.cluster);
      if (!bowl) continue;
      node.vx! += (bowl.cx - node.x!) * strength;
    }
  }

  force.initialize = function (_nodes: BallNode[]) {
    nodes = _nodes;
  };

  return force;
}

/**
 * Create a d3-force simulation for the balls with per-cluster bowls.
 * Uses gravity + multi-bowl boundary for a natural "pouring into bowls" effect.
 * Returns the simulation — caller controls the tick loop.
 */
export function createSimulation(
  nodes: BallNode[],
  bowls: BowlParams[],
): Simulation<BallNode, undefined> {
  const bowlMap = new Map<number, BowlParams>();
  for (const bowl of bowls) {
    bowlMap.set(bowl.clusterId, bowl);
  }

  const simulation = forceSimulation(nodes)
    .force('gravity', forceGravity(1.2))
    .force('bowl', forceMultiBowl(bowlMap))
    .force('center', forceBowlCentering(bowlMap, 0.02))
    .force(
      'collide',
      forceCollide<BallNode>()
        .radius((d) => d.radius + 0.5)
        .iterations(3),
    )
    .alphaDecay(0.005)
    .velocityDecay(0.4)
    .stop(); // We'll tick manually in the render loop

  return simulation;
}

export interface BallTier {
  amount: number;
  radius: number;
}

export interface BallConfig {
  tiers: BallTier[];
  label: string;
}

/**
 * Determine ball denomination tiers and radii based on viewport width.
 * Returns tiers sorted largest-first for greedy decomposition.
 * When isDrillDown is true, uses just 2 tiers for simplicity.
 */
export function getBallConfig(
  viewportWidth: number,
  isDrillDown: boolean = false,
): BallConfig {
  if (isDrillDown) {
    if (viewportWidth < 768) {
      return {
        tiers: [
          { amount: 500_000, radius: 7 },
          { amount: 100_000, radius: 5 },
        ],
        label: '$100K–$500K',
      };
    }
    return {
      tiers: [
        { amount: 500_000, radius: 7 },
        { amount: 100_000, radius: 5 },
      ],
      label: '$100K–$500K',
    };
  }
  if (viewportWidth < 768) {
    return {
      tiers: [
        { amount: 5_000_000, radius: 8 },
        { amount: 1_000_000, radius: 6 },
        { amount: 500_000, radius: 5 },
      ],
      label: '$500K–$5M',
    };
  }
  if (viewportWidth < 1024) {
    return {
      tiers: [
        { amount: 2_500_000, radius: 7 },
        { amount: 1_000_000, radius: 5 },
        { amount: 250_000, radius: 4 },
      ],
      label: '$250K–$2.5M',
    };
  }
  return {
    tiers: [
      { amount: 5_000_000, radius: 11 },
      { amount: 1_000_000, radius: 7 },
      { amount: 500_000, radius: 5 },
      { amount: 100_000, radius: 3 },
    ],
    label: '$100K–$5M',
  };
}

/**
 * Decompose a dollar amount into mixed-denomination balls using greedy allocation.
 * Returns an array of { amount, radius } for each ball, largest denominations first.
 */
export function decomposeBalls(
  totalAmount: number,
  tiers: BallTier[],
): { amount: number; radius: number }[] {
  const balls: { amount: number; radius: number }[] = [];
  let remaining = totalAmount;

  for (const tier of tiers) {
    const count = Math.floor(remaining / tier.amount);
    for (let i = 0; i < count; i++) {
      balls.push({ amount: tier.amount, radius: tier.radius });
    }
    remaining -= count * tier.amount;
  }

  // If there's any remainder, add one ball of the smallest tier
  if (remaining > 0 && tiers.length > 0) {
    const smallest = tiers[tiers.length - 1];
    balls.push({ amount: smallest.amount, radius: smallest.radius });
  }

  // Guarantee at least one ball
  if (balls.length === 0 && tiers.length > 0) {
    const smallest = tiers[tiers.length - 1];
    balls.push({ amount: smallest.amount, radius: smallest.radius });
  }

  return balls;
}
