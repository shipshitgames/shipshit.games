/**
 * Wire protocol for the PartyKit net seam.
 *
 * Base messages carry replicated presence: who is in the room, where each
 * body is (transform owned by its client), and authoritative combat results
 * (health/kills owned by the server). Game-specific payloads ride the same
 * `{ t: string }` envelope under non-reserved discriminators — see
 * `GameMessage` and `isReservedMessageType`.
 */

/** Replicated presence snapshot for one player in the room. */
export interface RemotePlayerInfo {
  id: string
  name: string
  /** Game-defined skin/loadout id; the engine treats it as opaque. */
  avatar: string
  /** 1-based join slot, stable for team color / "P2" style labels. */
  slot: number
  x: number
  y: number
  z: number
  yaw: number
  /** Game-defined held-item id; the engine treats it as opaque. */
  weapon: string
  health: number
  kills: number
}

/** Server-authoritative combat result broadcast to the whole room. */
export interface HitMessage {
  target: string
  by: string
  byName: string
  /** Target health after the hit was applied. */
  health: number
  killed: boolean
  /** Attacker kill count after the hit was applied. */
  killerKills: number
  /** Where the server respawned the victim, or null when it did not. */
  respawn: { x: number; y: number; z: number } | null
}

// --- server -> client ---

export interface WelcomeMessage {
  t: 'welcome'
  /** The receiving connection's own id. */
  id: string
  players: RemotePlayerInfo[]
}

export interface JoinBroadcast {
  t: 'join'
  player: RemotePlayerInfo
}

export interface LeaveBroadcast {
  t: 'leave'
  id: string
}

export interface StateBroadcast {
  t: 'state'
  id: string
  x: number
  y: number
  z: number
  yaw: number
  weapon: string
  /** Server-authoritative — clients never set their own health on the wire. */
  health: number
}

export interface NameBroadcast {
  t: 'name'
  id: string
  name: string
  avatar: string
  slot: number
}

export interface HitBroadcast extends HitMessage {
  t: 'hit'
}

export type ServerMessage =
  | WelcomeMessage
  | JoinBroadcast
  | LeaveBroadcast
  | StateBroadcast
  | NameBroadcast
  | HitBroadcast

// --- client -> server ---

export interface JoinRequest {
  t: 'join'
  name: string
  avatar: string
}

/** Client-owned transform update; health is reported but never trusted. */
export interface StateUpdate {
  t: 'state'
  x: number
  y: number
  z: number
  yaw: number
  weapon: string
  health: number
}

export interface HitReport {
  t: 'hit'
  target: string
  dmg: number
}

export type ClientMessage = JoinRequest | StateUpdate | HitReport

// --- game payload seam ---

/**
 * Game-specific message envelope. Games extend the protocol by sending any
 * `{ t }` value outside RESERVED_MESSAGE_TYPES; the transport routes those
 * verbatim to the game's handler on both ends.
 */
export interface GameMessage {
  t: string
}

/** Message types owned by the base transport; game payloads must not reuse them. */
export const RESERVED_MESSAGE_TYPES = ['welcome', 'join', 'leave', 'state', 'name', 'hit'] as const

export type ReservedMessageType = (typeof RESERVED_MESSAGE_TYPES)[number]

export function isReservedMessageType(t: string): t is ReservedMessageType {
  return (RESERVED_MESSAGE_TYPES as readonly string[]).includes(t)
}

/**
 * Tolerant wire decode: returns the parsed envelope when `raw` is a JSON
 * object with a string `t`, otherwise null (malformed input is dropped, never
 * thrown — a hostile peer must not be able to crash the loop).
 */
export function parseMessage(raw: unknown): (GameMessage & Record<string, unknown>) | null {
  if (typeof raw !== 'string') return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const t = (value as Record<string, unknown>).t
  if (typeof t !== 'string') return null
  return value as GameMessage & Record<string, unknown>
}
