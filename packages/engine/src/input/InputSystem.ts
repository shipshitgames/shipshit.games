import {
  type ActionId,
  type ActionMap,
  actionFor,
  applyMoveKey,
  type InputActionHandler,
  isJumpKey,
  type MoveIntent,
  type MovementConfig,
} from "./bindings";

/**
 * Hooks a game supplies to drive the genre-specific half of input. The engine
 * owns the DOM event lifecycle + movement; the game owns *policy* (when input is
 * live, what the verbs mean, how capture works).
 */
export interface InputHooks<A extends ActionId = ActionId> {
  /** Movement intent the binder writes WASD/arrow state into. */
  readonly move: MoveIntent;
  /** Optional movement/jump key overrides. Omit to use WASD/arrows + Space. */
  readonly movement?: MovementConfig;
  /** Optional physical-key → game-action map. */
  readonly actions?: ActionMap<A>;
  /** Game-owned action handler for mapped action verbs. */
  readonly actionHandler?: InputActionHandler<A>;
  /** Gate: gameplay keys/buttons are only processed when this returns true (e.g. status==='playing'). */
  isActive(): boolean;

  /** Space pressed while active (jump / primary contextual action). */
  onJump?(): void;
  /** A non-movement, non-jump, unmapped key pressed while active. */
  onActionKey?(code: string, e: KeyboardEvent): void;
  /** Escape pressed while NOT active — e.g. a resume-from-pause re-capture. */
  onResumeKey?(): void;

  /** Pointer pressed/released (0=left, 2=right). Game gates on capture/active itself. */
  onPointerDown?(button: number, e: MouseEvent): void;
  onPointerUp?(button: number, e: MouseEvent): void;

  /** Viewport resized — game reads its own container and re-aspects the rig/renderer. */
  onResize?(): void;
  /** Suppress the browser context menu right now? (e.g. right-click = melee). */
  suppressContextMenu?(): boolean;
}

/**
 * Genre-neutral DOM input binder. Registers keyboard/mouse/resize/contextmenu
 * listeners, resolves movement into the shared {@link MoveIntent}, and forwards
 * everything else to the game's {@link InputHooks}. Capture (pointer-lock vs free
 * cursor) is NOT handled here — that lives on the CameraRig + the game's capture
 * policy, so a free-cursor tower-defense reuses this binder unchanged.
 */
export class InputSystem<A extends ActionId = ActionId> {
  constructor(private readonly hooks: InputHooks<A>) {}

  bind(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("resize", this.onResize);
  }

  unbind(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("resize", this.onResize);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const h = this.hooks;
    if (!h.isActive()) {
      // Only Escape does anything while inactive: hand it to the resume policy.
      if (e.code === "Escape") {
        e.preventDefault();
        h.onResumeKey?.();
      }
      return;
    }
    if (applyMoveKey(h.move, e.code, true, h.movement)) return;
    if (isJumpKey(e.code, h.movement)) {
      e.preventDefault();
      h.onJump?.();
      return;
    }
    const action = h.actions ? actionFor(h.actions, e.code) : undefined;
    if (action !== undefined) {
      h.actionHandler?.handleAction(action, e);
      return;
    }
    h.onActionKey?.(e.code, e);
  };

  // Movement keys release regardless of active-state, so you never get stuck
  // gliding if the gate flips (pause/levelup) mid-press.
  private onKeyUp = (e: KeyboardEvent): void => {
    applyMoveKey(this.hooks.move, e.code, false, this.hooks.movement);
  };

  private onMouseDown = (e: MouseEvent): void => {
    this.hooks.onPointerDown?.(e.button, e);
  };

  private onMouseUp = (e: MouseEvent): void => {
    this.hooks.onPointerUp?.(e.button, e);
  };

  private onContextMenu = (e: Event): void => {
    if (this.hooks.suppressContextMenu?.()) e.preventDefault();
  };

  private onResize = (): void => {
    this.hooks.onResize?.();
  };
}
