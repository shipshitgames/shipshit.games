export type StateListener<TState> = (snapshot: Readonly<TState>) => void
export type StateUpdater<TState> = (previous: Readonly<TState>) => TState

export interface SubscribeOptions {
  emitImmediately?: boolean
}

/**
 * Generic HUD snapshot shell. The engine owns listener fan-out; each game owns
 * the exact HUDState type and how React renders it.
 */
export class HudSystem<TState extends object> {
  private snapshot: TState
  private readonly listeners = new Set<StateListener<TState>>()

  constructor(initialState: TState) {
    this.snapshot = initialState
  }

  getSnapshot(): Readonly<TState> {
    return this.snapshot
  }

  subscribe(listener: StateListener<TState>, options: SubscribeOptions = {}): () => void {
    this.listeners.add(listener)
    if (options.emitImmediately ?? true) listener(this.snapshot)
    return () => {
      this.listeners.delete(listener)
    }
  }

  emit(nextState: TState): void {
    this.snapshot = nextState
    for (const listener of this.listeners) listener(this.snapshot)
  }

  patch(patch: Partial<TState> | StateUpdater<TState>): void {
    const nextState =
      typeof patch === 'function' ? patch(this.snapshot) : ({ ...this.snapshot, ...patch } as TState)
    this.emit(nextState)
  }

  clear(): void {
    this.listeners.clear()
  }
}
