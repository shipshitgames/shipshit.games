import type { Agent, PlanarVec } from './Agent'

/**
 * Per-frame steering context: where the steering target (usually the player /
 * the objective) sits relative to the agent. Genre-neutral — a chaser and a
 * lane-walker both read distance + direction-to-target.
 */
export interface SteerView {
  /** Planar distance to the steering target. */
  dist: number
  /** Normalised planar direction from the agent to the target (0 if coincident). */
  dirX: number
  dirZ: number
}

/**
 * Pluggable "where should this agent move this frame" policy. The kinematic
 * {@link Agent} integrates the result (added on top of separation); the strategy
 * only decides intent. FPS: a melee chaser / ranged kiter (`ChasePlayerStrategy`).
 * TD: a lane-to-core walker (`LaneToCoreStrategy`). Strategies are normally
 * stateless and shared across all agents of a kind.
 */
export interface SteeringStrategy<A extends Agent> {
  /** Add the desired planar velocity for `agent` (given `view`) into `out`. */
  desiredVelocity(agent: A, view: SteerView, out: PlanarVec): void
}
