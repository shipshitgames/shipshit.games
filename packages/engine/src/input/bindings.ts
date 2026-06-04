/**
 * Input bindings — the genre-neutral half of the input seam.
 *
 * Every embodied game shares the same *movement* vocabulary (WASD / arrows →
 * planar intent) and the same DOM event plumbing; what differs is the genre
 * verbs (an FPS reloads + swaps weapons; a tower-defense places + sells towers)
 * and the capture model (FPS grabs pointer-lock; a TD keeps a free cursor).
 *
 * This file owns the shared movement binding; {@link ActionMap} lets a game map
 * physical keys to its own verbs without the engine knowing what they mean.
 */

/** Genre-neutral planar movement intent. Engine controllers read this each frame. */
export interface MoveIntent {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
}

export function makeMoveIntent(): MoveIntent {
  return { forward: false, back: false, left: false, right: false }
}

export function clearMoveIntent(m: MoveIntent): void {
  m.forward = m.back = m.left = m.right = false
}

/** Default WASD + arrow-key → movement binding, shared by every embodied title. */
const WASD_MOVE: Readonly<Record<string, keyof MoveIntent>> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
}

/**
 * Apply a key event to a {@link MoveIntent} if `code` is a movement key.
 * Returns true when the key was a movement key (so the caller can stop
 * dispatching it as a genre verb).
 */
export function applyMoveKey(intent: MoveIntent, code: string, pressed: boolean): boolean {
  const dir = WASD_MOVE[code]
  if (dir === undefined) return false
  intent[dir] = pressed
  return true
}

/**
 * Maps a physical `KeyboardEvent.code` to a game-defined action verb. The engine
 * never interprets the verb — it just hands the matched verb back to the game.
 * e.g. an FPS: `{ KeyR: 'reload', KeyF: 'melee', Digit1: 'weapon1' }`.
 */
export type ActionMap<A extends string> = Readonly<Record<string, A>>

/** Look up the verb a key is bound to, or `undefined` if unbound. */
export function actionFor<A extends string>(map: ActionMap<A>, code: string): A | undefined {
  return map[code]
}
