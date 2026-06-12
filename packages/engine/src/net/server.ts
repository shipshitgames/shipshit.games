import type * as Party from 'partykit/server'

import { isReservedMessageType, parseMessage } from './protocol'
import type { GameMessage, RemotePlayerInfo, ServerMessage } from './protocol'

/**
 * Shareable PartyKit room server template.
 *
 * Authority split (wire-compatible with the original Scourge Survivors arena
 * room): each client owns its own transform, the server owns health / kills /
 * respawns so combat results cannot desync between peers. Game-specific
 * payloads ride the same `{ t }` envelope under non-reserved discriminators
 * and are routed to `onGameMessage` untouched.
 *
 * The engine is canon-free: avatar and weapon ids default to '' and names
 * default to a generic placeholder. Games supply their own ids, spawn logic,
 * and combat rules through {@link RoomServerOptions}.
 *
 * This module is imported by games' `party/` entries only — it has zero
 * runtime imports besides the shared protocol, and `partykit` is a types-only
 * dependency, so browser bundles never see it.
 */

/** Server-side record for one connection: replicated info plus room-only flags. */
export interface RoomPlayerState extends RemotePlayerInfo {
  alive: boolean
  joined: boolean
}

/** Handle passed to game hooks for talking back to the room. */
export interface RoomServerApi<TGameMessage extends GameMessage = GameMessage> {
  room: Party.Room
  players: Map<string, RoomPlayerState>
  /** JSON-encode and broadcast to every connection except `withoutIds`. */
  broadcast(msg: ServerMessage | TGameMessage, withoutIds?: string[]): void
  /** JSON-encode and send to a single connection; no-op for unknown ids. */
  send(connectionId: string, msg: ServerMessage | TGameMessage): void
}

export interface RoomServerOptions<TGameMessage extends GameMessage = GameMessage> {
  /**
   * Where to place a body on connect and (by default) on respawn. `player` is
   * null on the initial connect, before any state exists for the connection.
   * When `y` is omitted the player spawns at `spawnHeight`.
   */
  spawnPoint?: (player: RoomPlayerState | null, room: Party.Room) => { x: number; y?: number; z: number }
  /** Fallback y for spawns/respawns and for state updates that omit y. */
  spawnHeight?: number
  startingHealth?: number
  defaultName?: string
  maxNameLength?: number
  /** Game-defined held-item id used until the first state update; opaque to the engine. */
  defaultWeapon?: string
  /**
   * Map the client-supplied avatar value to a game-approved id. The default
   * stringifies and caps it at 32 characters; supply your own to whitelist.
   */
  sanitizeAvatar?: (value: unknown) => string
  /**
   * Whether a hit report may damage the target. Defaults to friendly-fire PvP
   * (any live attacker, anyone but yourself); return false for pure co-op or
   * add team rules.
   */
  allowHit?: (attacker: RoomPlayerState, target: RoomPlayerState) => boolean
  /**
   * Respawn policy applied when a hit drops a player to 0 health. The default
   * (option omitted) respawns the victim at `spawnPoint(victim, room)` with
   * `startingHealth` restored. Pass a function to choose the spot yourself, or
   * return null — or set the option itself to null — to leave the victim dead
   * (alive false, health 0, hit broadcast carries `respawn: null`).
   */
  respawn?:
    | ((
        victim: RoomPlayerState,
        killer: RoomPlayerState,
        api: RoomServerApi<TGameMessage>,
      ) => { x: number; y: number; z: number } | null)
    | null
  /** Receives every message whose `t` is not a reserved transport type. */
  onGameMessage?: (msg: TGameMessage, sender: RoomPlayerState, api: RoomServerApi<TGameMessage>) => void
  /** Fired once per connection, on its first join message. */
  onJoined?: (player: RoomPlayerState, api: RoomServerApi<TGameMessage>) => void
  /** Fired on disconnect, only for players that had joined. */
  onLeft?: (player: RoomPlayerState, api: RoomServerApi<TGameMessage>) => void
}

/** Instance shape of the class returned by {@link createRoomServer}. */
export interface RoomServerInstance extends Party.Server {
  readonly room: Party.Room
  players: Map<string, RoomPlayerState>
  onConnect(conn: Party.Connection): void
  onMessage(raw: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection): void
  onClose(conn: Party.Connection): void
}

export type RoomServerConstructor = new (room: Party.Room) => RoomServerInstance

/** Default cap on the client-supplied avatar id when no sanitizeAvatar is given. */
const DEFAULT_MAX_AVATAR_LENGTH = 32

const finiteOr = (value: unknown, fallback: number): number => {
  // null/undefined take the fallback (Number(null) is 0, a coercion wart we
  // must not inherit — NaN stringifies to null on the wire and means "absent").
  if (value == null) return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Build a PartyKit room server class from game-supplied policy. Use it as the
 * default export of a game's party entry:
 *
 * ```ts
 * export default createRoomServer({ spawnPoint: myArenaSpawns, sanitizeAvatar: mySkins })
 * ```
 */
export function createRoomServer<TGameMessage extends GameMessage = GameMessage>(
  options: RoomServerOptions<TGameMessage> = {},
): RoomServerConstructor {
  const spawnPoint: NonNullable<RoomServerOptions<TGameMessage>['spawnPoint']> =
    options.spawnPoint ?? (() => ({ x: 0, z: 0 }))
  const spawnHeight = options.spawnHeight ?? 0
  const startingHealth = options.startingHealth ?? 100
  const defaultName = options.defaultName ?? 'Player'
  const maxNameLength = options.maxNameLength ?? 16
  const defaultWeapon = options.defaultWeapon ?? ''
  const sanitizeAvatar =
    options.sanitizeAvatar ?? ((value: unknown) => String(value ?? '').slice(0, DEFAULT_MAX_AVATAR_LENGTH))
  const allowHit =
    options.allowHit ??
    ((attacker: RoomPlayerState, target: RoomPlayerState) => attacker.alive && attacker.id !== target.id)

  class RoomServer implements Party.Server {
    players = new Map<string, RoomPlayerState>()

    private readonly connections = new Map<string, Party.Connection>()
    private readonly api: RoomServerApi<TGameMessage>

    constructor(readonly room: Party.Room) {
      this.api = {
        room,
        players: this.players,
        broadcast: (msg, withoutIds) => {
          this.room.broadcast(JSON.stringify(msg), withoutIds)
        },
        send: (connectionId, msg) => {
          this.connections.get(connectionId)?.send(JSON.stringify(msg))
        },
      }
    }

    private nextSlot(): number {
      const used = new Set([...this.players.values()].map((p) => p.slot))
      let slot = 1
      while (used.has(slot)) slot += 1
      return slot
    }

    onConnect(conn: Party.Connection): void {
      const sp = spawnPoint(null, this.room)
      const player: RoomPlayerState = {
        id: conn.id,
        name: defaultName,
        avatar: sanitizeAvatar(undefined),
        slot: this.nextSlot(),
        x: sp.x,
        y: sp.y ?? spawnHeight,
        z: sp.z,
        yaw: 0,
        weapon: defaultWeapon,
        health: startingHealth,
        kills: 0,
        alive: true,
        joined: false,
      }
      this.players.set(conn.id, player)
      this.connections.set(conn.id, conn)
      const roster = [...this.players.values()].filter((p) => p.id === conn.id || p.joined)
      conn.send(JSON.stringify({ t: 'welcome', id: conn.id, players: roster }))
    }

    onMessage(raw: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection): void {
      const m = parseMessage(raw)
      if (!m) return
      const p = this.players.get(sender.id)
      if (!p) return

      if (m.t === 'join') {
        p.name = String(m.name ?? defaultName).slice(0, maxNameLength) || defaultName
        p.avatar = sanitizeAvatar(m.avatar)
        const wasJoined = p.joined
        p.joined = true
        if (!wasJoined) this.api.broadcast({ t: 'join', player: p }, [sender.id])
        this.api.broadcast({ t: 'name', id: p.id, name: p.name, avatar: p.avatar, slot: p.slot })
        if (!wasJoined) options.onJoined?.(p, this.api)
      } else if (m.t === 'state') {
        // Finite-only coercion: NaN/±Infinity from a hostile or buggy client
        // must never replicate to peers. A finite y (including 0) stands;
        // only a missing or non-finite y falls back to spawnHeight.
        p.x = finiteOr(m.x, 0)
        p.y = finiteOr(m.y, spawnHeight)
        p.z = finiteOr(m.z, 0)
        p.yaw = finiteOr(m.yaw, 0)
        if (typeof m.weapon === 'string') p.weapon = m.weapon
        // Health on the wire is server-authoritative: relay our value, never the client's.
        this.api.broadcast(
          { t: 'state', id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, weapon: p.weapon, health: p.health },
          [sender.id],
        )
      } else if (m.t === 'hit') {
        const target = this.players.get(String(m.target))
        const dmg = Number(m.dmg) || 0
        if (!target || !target.alive || dmg <= 0 || !allowHit(p, target)) return
        target.health = Math.max(0, target.health - dmg)
        let killed = false
        let respawn: { x: number; y: number; z: number } | null = null
        if (target.health <= 0) {
          killed = true
          p.kills += 1
          respawn = this.respawnVictim(target, p)
        }
        this.api.broadcast({
          t: 'hit',
          target: target.id,
          by: p.id,
          byName: p.name,
          health: target.health,
          killed,
          killerKills: p.kills,
          respawn,
        })
      } else if (!isReservedMessageType(m.t)) {
        options.onGameMessage?.(m as unknown as TGameMessage, p, this.api)
      }
    }

    private respawnVictim(victim: RoomPlayerState, killer: RoomPlayerState): { x: number; y: number; z: number } | null {
      let point: { x: number; y: number; z: number } | null
      if (options.respawn === null) {
        point = null
      } else if (options.respawn) {
        point = options.respawn(victim, killer, this.api)
      } else {
        const sp = spawnPoint(victim, this.room)
        point = { x: sp.x, y: sp.y ?? spawnHeight, z: sp.z }
      }
      if (!point) {
        victim.alive = false
        victim.health = 0
        return null
      }
      victim.x = point.x
      victim.y = point.y
      victim.z = point.z
      victim.health = startingHealth
      victim.alive = true
      return { x: victim.x, y: victim.y, z: victim.z }
    }

    onClose(conn: Party.Connection): void {
      const player = this.players.get(conn.id)
      this.players.delete(conn.id)
      this.connections.delete(conn.id)
      this.api.broadcast({ t: 'leave', id: conn.id })
      if (player?.joined) options.onLeft?.(player, this.api)
    }
  }

  return RoomServer
}
