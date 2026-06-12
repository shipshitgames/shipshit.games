import {
  isReservedMessageType,
  parseMessage,
  type GameMessage,
  type HitMessage,
  type RemotePlayerInfo,
} from './protocol'

/**
 * Minimal structural socket contract the transport needs. Both `PartySocket`
 * and the standard `WebSocket` satisfy it without adapters, and tests can
 * supply an in-memory fake.
 */
export interface NetSocketLike {
  readonly readyState: number
  addEventListener(type: 'open' | 'close' | 'message', listener: (event: { data?: unknown }) => void): void
  send(data: string): void
  close(): void
}

/** Builds the socket for one connection attempt; may be async (lazy imports). */
export type NetSocketFactory = (opts: {
  host: string
  room: string
  party: string
}) => NetSocketLike | Promise<NetSocketLike>

/**
 * Transport callbacks. All optional — games subscribe only to what they need.
 * Reserved base-protocol messages dispatch to the typed handlers; every other
 * `{ t }` envelope routes verbatim to `onGameMessage`.
 */
export interface NetEvents<TGameMessage extends GameMessage = GameMessage> {
  onWelcome?: (selfId: string, players: RemotePlayerInfo[]) => void
  onJoin?: (p: RemotePlayerInfo) => void
  onLeave?: (id: string) => void
  onState?: (id: string, x: number, y: number, z: number, yaw: number, weapon: string, health: number) => void
  onName?: (id: string, name: string, avatar: string, slot: number) => void
  onHit?: (msg: HitMessage) => void
  onStatus?: (connected: boolean) => void
  /** Non-reserved `{ t }` payloads, delivered as parsed by `parseMessage`. */
  onGameMessage?: (msg: TGameMessage) => void
}

export interface NetClientOptions {
  /** Fallback host when `connect` is not given one (see `resolvePartyKitHost`). Defaults to ''. */
  host?: string
  /** PartyKit party name. Defaults to 'main'. */
  party?: string
  /** Max outbound `state` rate in messages per second. Defaults to 22 (45ms apart). */
  stateHz?: number
  /** Socket builder; defaults to lazily importing the optional `partysocket` dependency. */
  createSocket?: NetSocketFactory
  /** Clock used only for `sendState` throttling — inject a fake one in tests. */
  now?: () => number
}

const DEFAULT_PARTY = 'main'
const DEFAULT_STATE_HZ = 22

/** Mirrors the original game client's throttle clock: performance.now() when available, else Date.now(). */
const defaultNow = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

const defaultCreateSocket: NetSocketFactory = async ({ host, room, party }) => {
  let mod: typeof import('partysocket')
  try {
    mod = await import('partysocket')
  } catch (cause) {
    throw new Error(
      "NetClient's default transport needs the optional 'partysocket' dependency. " +
        'Install partysocket, or pass options.createSocket to supply your own socket.',
      { cause },
    )
  }
  return new mod.default({ host, room, party })
}

/**
 * Game-agnostic PartyKit room client: connection lifecycle, the reserved
 * presence/combat messages, and a verbatim pass-through for game payloads.
 *
 * Canon-free by design — `avatar` and `weapon` are opaque game-defined ids
 * and fall back to '' when a peer omits them; games supply their own values
 * and decide what '' means (typically "use my default skin/item").
 */
export class NetClient<TGameMessage extends GameMessage = GameMessage> {
  socket: NetSocketLike | null = null
  selfId = ''

  private readonly events: NetEvents<TGameMessage>
  private readonly fallbackHost: string
  private readonly party: string
  private readonly minStateIntervalMs: number
  private readonly createSocket: NetSocketFactory
  private readonly now: () => number
  private lastStateSentAt = Number.NEGATIVE_INFINITY
  private session = 0
  private connected = false

  constructor(events: NetEvents<TGameMessage>, options: NetClientOptions = {}) {
    this.events = events
    this.fallbackHost = options.host ?? ''
    this.party = options.party ?? DEFAULT_PARTY
    // Floored to whole ms so the default 22Hz throttles at exactly 45ms,
    // matching the original game client's hardcoded interval.
    this.minStateIntervalMs = Math.floor(1000 / (options.stateHz ?? DEFAULT_STATE_HZ))
    this.createSocket = options.createSocket ?? defaultCreateSocket
    this.now = options.now ?? defaultNow
  }

  /**
   * Open a socket to `room` and announce ourselves once it connects. `host`
   * falls back to `options.host`, then ''. Unlike the original game client,
   * calling connect while already connected closes the previous socket first
   * so one NetClient never holds two live connections.
   */
  async connect(room: string, name: string, avatar: string, host?: string): Promise<void> {
    this.dropSocket()
    const session = ++this.session
    const socket = await this.createSocket({ host: host ?? this.fallbackHost, room, party: this.party })
    if (session !== this.session) {
      // disconnect() or a newer connect() won the race — discard the late socket.
      socket.close()
      return
    }
    this.socket = socket
    // Every listener is gated on the session so a replaced or disconnected
    // socket's late open/close/message events can never leak into the
    // connection that superseded it.
    socket.addEventListener('open', () => {
      if (session !== this.session) return
      this.connected = true
      this.events.onStatus?.(true)
      this.rawSend({ t: 'join', name, avatar })
    })
    socket.addEventListener('close', () => {
      if (session !== this.session) return
      this.connected = false
      this.events.onStatus?.(false)
    })
    socket.addEventListener('message', (event) => {
      if (session !== this.session) return
      this.onMessage(event.data)
    })
  }

  private onMessage(data: unknown): void {
    const m = parseMessage(data)
    if (!m) return
    switch (m.t) {
      case 'welcome':
        this.selfId = String(m.id)
        this.events.onWelcome?.(this.selfId, (m.players as RemotePlayerInfo[] | undefined) ?? [])
        break
      case 'join':
        this.events.onJoin?.(m.player as RemotePlayerInfo)
        break
      case 'leave':
        this.events.onLeave?.(String(m.id))
        break
      case 'state':
        this.events.onState?.(
          String(m.id),
          Number(m.x),
          Number(m.y),
          Number(m.z),
          Number(m.yaw),
          String(m.weapon ?? ''),
          Number(m.health ?? 100),
        )
        break
      case 'name':
        this.events.onName?.(String(m.id), String(m.name), String(m.avatar ?? ''), Number(m.slot ?? 0))
        break
      case 'hit':
        this.events.onHit?.(m as unknown as HitMessage)
        break
      default:
        this.events.onGameMessage?.(m as TGameMessage)
    }
  }

  /** Throttled to `stateHz`; safe to call every frame. The first call always sends. */
  sendState(x: number, y: number, z: number, yaw: number, weapon: string, health: number): void {
    const now = this.now()
    if (now - this.lastStateSentAt < this.minStateIntervalMs) return
    this.lastStateSentAt = now
    this.rawSend({ t: 'state', x, y, z, yaw, weapon, health })
  }

  sendHit(target: string, dmg: number): void {
    this.rawSend({ t: 'hit', target, dmg })
  }

  /** Send a game payload verbatim. Throws TypeError when `msg.t` is a reserved transport type. */
  sendGameMessage(msg: TGameMessage): void {
    if (isReservedMessageType(msg.t)) {
      throw new TypeError(
        `'${msg.t}' is reserved by the base transport — game messages must use a non-reserved t`,
      )
    }
    this.rawSend(msg)
  }

  private rawSend(obj: unknown): void {
    if (this.socket && this.socket.readyState === 1) this.socket.send(JSON.stringify(obj))
  }

  /**
   * Close and drop the socket. When the connection was open this reports
   * onStatus(false) synchronously — the socket's own close event arrives
   * after the session has moved on, so it is deliberately ignored.
   */
  disconnect(): void {
    this.session++
    this.dropSocket()
  }

  /** Close the current socket (if any) and report the lost connection once. */
  private dropSocket(): void {
    const socket = this.socket
    if (socket) {
      this.socket = null
      socket.close()
    }
    if (this.connected) {
      this.connected = false
      this.events.onStatus?.(false)
    }
  }
}
