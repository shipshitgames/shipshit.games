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
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
}

export function makeMoveIntent(): MoveIntent {
  return { forward: false, back: false, left: false, right: false };
}

export function clearMoveIntent(m: MoveIntent): void {
  m.forward = m.back = m.left = m.right = false;
}

export type MovementKeyMap = Readonly<Record<string, keyof MoveIntent>>;

export interface MovementConfig {
  /** Physical keys that should update the shared planar movement intent. */
  readonly moveKeys?: MovementKeyMap;
  /** Physical key that should dispatch the jump/context action. Defaults to Space. */
  readonly jumpCode?: string;
}

/** Default WASD + arrow-key → movement binding, shared by every embodied title. */
export const DEFAULT_MOVE_KEYS: MovementKeyMap = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};

export const DEFAULT_MOVEMENT_CONFIG = Object.freeze({
  moveKeys: DEFAULT_MOVE_KEYS,
  jumpCode: "Space",
}) satisfies Required<MovementConfig>;

/**
 * Apply a key event to a {@link MoveIntent} if `code` is a movement key.
 * Returns true when the key was a movement key (so the caller can stop
 * dispatching it as a genre verb).
 */
export function applyMoveKey(
  intent: MoveIntent,
  code: string,
  pressed: boolean,
  config: MovementConfig = DEFAULT_MOVEMENT_CONFIG,
): boolean {
  const dir = (config.moveKeys ?? DEFAULT_MOVE_KEYS)[code];
  if (dir === undefined) return false;
  intent[dir] = pressed;
  return true;
}

export function isJumpKey(code: string, config: MovementConfig = DEFAULT_MOVEMENT_CONFIG): boolean {
  return code === (config.jumpCode ?? DEFAULT_MOVEMENT_CONFIG.jumpCode);
}

export type ActionId = string;

/**
 * Maps a physical `KeyboardEvent.code` to a game-defined action verb. The engine
 * never interprets the verb — it just hands the matched verb back to the game.
 * e.g. an FPS: `{ KeyR: 'reload', KeyF: 'melee', Digit1: 'weapon1' }`.
 */
export type ActionMap<A extends ActionId = ActionId> = Readonly<Record<string, A>>;

export interface InputActionHandler<A extends ActionId = ActionId> {
  handleAction(action: A, event: KeyboardEvent): void;
}

/** Look up the verb a key is bound to, or `undefined` if unbound. */
export function actionFor<A extends ActionId>(map: ActionMap<A>, code: string): A | undefined {
  return map[code];
}

/**
 * Capture policy is game-side: an FPS may use pointer lock while a tower-defense
 * keeps the cursor free. The engine only needs this structural contract.
 */
export interface CaptureRig {
  readonly captured: boolean;
  requestCapture(): void | Promise<void>;
  releaseCapture(silent?: boolean): void;
}
