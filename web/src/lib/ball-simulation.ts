/**D3-force simulation setup for budget balls visualization.*/

import {
  forceSimulation,
  forceCollide,
  forceManyBody,
  forceX,
  forceY,
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

/**
 * Compute cluster centroid positions arranged in a packed layout.
 * Larger clusters get positioned toward the center.
 */
export function layoutClusters(
  clusters: ClusterInfo[],
  width: number,
  height: number,
): void {
  // Sort by ball count descending — largest clusters near center
  const sorted = [...clusters].sort((a, b) => b.ballCount - a.ballCount);

  // Use a spiral layout from center
  const centerX = width / 2;
  const centerY = height / 2;
  const angleStep = 2.4; // golden angle in radians
  const radiusScale = Math.min(width, height) * 0.35;

  sorted.forEach((cluster, i) => {
    if (i === 0) {
      cluster.cx = centerX;
      cluster.cy = centerY;
    } else {
      const angle = i * angleStep;
      const r = radiusScale * Math.sqrt(i / sorted.length);
      cluster.cx = centerX + r * Math.cos(angle);
      cluster.cy = centerY + r * Math.sin(angle);
    }
  });
}

/**
 * Create a d3-force simulation for the balls.
 * Returns the simulation — caller controls the tick loop.
 */
export function createSimulation(
  nodes: BallNode[],
  width: number,
  height: number,
): Simulation<BallNode, undefined> {
  const simulation = forceSimulation(nodes)
    .force('charge', forceManyBody<BallNode>().strength(-0.3))
    .force(
      'collide',
      forceCollide<BallNode>()
        .radius((d) => d.radius + 0.5)
        .iterations(2),
    )
    .force(
      'clusterX',
      forceX<BallNode>()
        .x((d) => d.cx)
        .strength(0.15),
    )
    .force(
      'clusterY',
      forceY<BallNode>()
        .y((d) => d.cy)
        .strength(0.15),
    )
    .alphaDecay(0.02)
    .velocityDecay(0.3)
    .stop(); // We'll tick manually in the render loop

  return simulation;
}

/**
 * Add a temporary downward force to simulate balls pouring in.
 * Call removePourForce() once settled.
 */
export function addPourForce(
  simulation: Simulation<BallNode, undefined>,
  height: number,
): void {
  simulation.force(
    'pour',
    forceY<BallNode>()
      .y(height * 0.5)
      .strength(0.05),
  );
}

export function removePourForce(
  simulation: Simulation<BallNode, undefined>,
): void {
  simulation.force('pour', null);
}

/**
 * Determine ball unit size and radius based on viewport width.
 * When isDrillDown is true, uses a larger unit to keep ball count manageable.
 */
export function getBallConfig(
  viewportWidth: number,
  isDrillDown: boolean = false,
): {
  unit: number;
  radius: number;
  label: string;
} {
  if (isDrillDown) {
    // Drill-down uses fewer, larger balls for clarity
    if (viewportWidth < 768) {
      return { unit: 500_000, radius: 7, label: '$500K' };
    }
    return { unit: 100_000, radius: 5, label: '$100K' };
  }
  if (viewportWidth < 768) {
    return { unit: 500_000, radius: 5, label: '$500K' };
  }
  if (viewportWidth < 1024) {
    return { unit: 250_000, radius: 4, label: '$250K' };
  }
  return { unit: 100_000, radius: 3, label: '$100K' };
}

/**
 * Estimate a good canvas height based on ball count and radius.
 */
export function estimateCanvasHeight(
  ballCount: number,
  radius: number,
  width: number,
): number {
  // Estimate area needed: each ball occupies a square cell
  const cellSize = (radius + 1) * 2;
  const totalArea = cellSize * cellSize * ballCount;
  // Assume ~50% packing efficiency
  const neededArea = totalArea / 0.5;
  // Height = area / width, with label padding
  const rawHeight = neededArea / width + 40;
  // Clamp: min 300 for small drill-downs, max 650 for top-level
  return Math.max(300, Math.min(rawHeight, 650));
}
