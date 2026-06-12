/**
 * End-to-end net seam test: two real NetClient instances talking to a real
 * createRoomServer room over actual WebSockets, all inside bun.
 *
 * The PartyKit runtime is replaced by a minimal protocol-compatible shim on
 * Bun.serve — upgrades on /parties/:party/:room, one room-server instance per
 * room id, connection ids from the `_pk` query param (PartySocket's own
 * convention) or a sequential counter. Everything that matters — the wire
 * JSON, the authority split, join/leave fan-out — runs the real engine code.
 */
import { afterAll, expect, test } from 'bun:test'
import type { ServerWebSocket } from 'bun'
import type * as Party from 'partykit/server'

import { NetClient } from '../../src/net/NetClient'
import type { GameMessage, HitMessage, RemotePlayerInfo } from '../../src/net/protocol'
import { createRoomServer, type RoomServerInstance } from '../../src/net/server'

interface ChatMessage extends GameMessage {
  t: 'chat'
  text: string
  from?: string
}

const SPAWN = { x: 3, z: 4 }
const SPAWN_HEIGHT = 1.8

const RoomServer = createRoomServer<ChatMessage>({
  spawnHeight: SPAWN_HEIGHT,
  spawnPoint: () => ({ ...SPAWN }),
  onGameMessage: (msg, sender, api) => {
    // fan game payloads back out to the whole room, stamped with the sender
    api.broadcast({ t: 'chat', text: msg.text, from: sender.id })
  },
})

// --- minimal PartyKit-compatible shim on Bun.serve ---

interface SocketData {
  party: string
  roomId: string
  connId: string
}

interface ShimRoom {
  server: RoomServerInstance
  sockets: Map<string, ServerWebSocket<SocketData>>
  conns: Map<string, Party.Connection>
}

const rooms = new Map<string, ShimRoom>()
let nextAnonId = 1

const getRoom = (data: SocketData): ShimRoom => {
  const key = `${data.party}/${data.roomId}`
  let room = rooms.get(key)
  if (!room) {
    const sockets = new Map<string, ServerWebSocket<SocketData>>()
    const partyRoom = {
      id: data.roomId,
      broadcast(msg: string, without?: string[]) {
        for (const [id, ws] of sockets) {
          if (without?.includes(id)) continue
          ws.send(msg)
        }
      },
    } as unknown as Party.Room
    room = { server: new RoomServer(partyRoom), sockets, conns: new Map() }
    rooms.set(key, room)
  }
  return room
}

const httpServer = Bun.serve<SocketData>({
  port: 0,
  fetch(req, server) {
    const url = new URL(req.url)
    const match = /^\/parties\/([^/]+)\/([^/]+)$/.exec(url.pathname)
    if (!match) return new Response('not found', { status: 404 })
    const data: SocketData = {
      party: match[1]!,
      roomId: match[2]!,
      connId: url.searchParams.get('_pk') ?? `anon-${nextAnonId++}`,
    }
    if (server.upgrade(req, { data })) return
    return new Response('expected a websocket upgrade', { status: 400 })
  },
  websocket: {
    open(ws) {
      const room = getRoom(ws.data)
      const conn = { id: ws.data.connId, send: (msg: string) => ws.send(msg) } as unknown as Party.Connection
      room.sockets.set(ws.data.connId, ws)
      room.conns.set(ws.data.connId, conn)
      room.server.onConnect(conn)
    },
    message(ws, raw) {
      const room = getRoom(ws.data)
      const conn = room.conns.get(ws.data.connId)
      if (conn) room.server.onMessage(typeof raw === 'string' ? raw : raw.toString(), conn)
    },
    close(ws) {
      const room = getRoom(ws.data)
      const conn = room.conns.get(ws.data.connId)
      room.sockets.delete(ws.data.connId)
      room.conns.delete(ws.data.connId)
      if (conn) room.server.onClose(conn)
    },
  },
})

// --- client harness ---

interface StateEvent {
  id: string
  x: number
  y: number
  z: number
  yaw: number
  weapon: string
  health: number
}

const makeClient = (connId: string) => {
  const events = {
    welcomes: [] as Array<{ selfId: string; players: RemotePlayerInfo[] }>,
    joins: [] as RemotePlayerInfo[],
    leaves: [] as string[],
    states: [] as StateEvent[],
    names: [] as Array<{ id: string; name: string; avatar: string; slot: number }>,
    hits: [] as HitMessage[],
    statuses: [] as boolean[],
    games: [] as ChatMessage[],
  }
  const client = new NetClient<ChatMessage>(
    {
      onWelcome: (selfId, players) => events.welcomes.push({ selfId, players }),
      onJoin: (p) => events.joins.push(p),
      onLeave: (id) => events.leaves.push(id),
      onState: (id, x, y, z, yaw, weapon, health) =>
        events.states.push({ id, x, y, z, yaw, weapon, health }),
      onName: (id, name, avatar, slot) => events.names.push({ id, name, avatar, slot }),
      onHit: (msg) => events.hits.push(msg),
      onStatus: (connected) => events.statuses.push(connected),
      onGameMessage: (msg) => events.games.push(msg),
    },
    {
      // the global WebSocket structurally satisfies NetSocketLike
      createSocket: ({ party, room }) =>
        new WebSocket(`ws://127.0.0.1:${httpServer.port}/parties/${party}/${room}?_pk=${connId}`),
    },
  )
  return { client, events }
}

const a = makeClient('alice')
const b = makeClient('bob')

const waitFor = async <T>(probe: () => T | undefined | null | false, label: string, timeoutMs = 3000): Promise<T> => {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = probe()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`)
    await Bun.sleep(10)
  }
}

afterAll(() => {
  a.client.disconnect()
  b.client.disconnect()
  httpServer.stop(true)
})

test('full multiplayer loop over real websockets', async () => {
  // --- A connects: welcome carries self, join lands server-side ---
  await a.client.connect('arena-1', 'Ada', 'pilot')
  const aWelcome = await waitFor(() => a.events.welcomes[0], "A's welcome")
  expect(a.client.selfId).toBe('alice')
  expect(aWelcome.selfId).toBe('alice')
  expect(aWelcome.players.map((p) => p.id)).toEqual(['alice'])
  expect(aWelcome.players[0]).toMatchObject({ slot: 1, health: 100, ...SPAWN, y: SPAWN_HEIGHT })
  expect(a.events.statuses[0]).toBe(true)

  // A's own name broadcast confirms the server processed A's join request
  // before B dials in (the welcome roster only lists joined players).
  const aName = await waitFor(() => a.events.names.find((n) => n.id === 'alice'), "A's name broadcast")
  expect(aName).toEqual({ id: 'alice', name: 'Ada', avatar: 'pilot', slot: 1 })

  // --- B connects: B's welcome includes joined A; A sees B's join + name ---
  await b.client.connect('arena-1', 'Bob', 'mage')
  const bWelcome = await waitFor(() => b.events.welcomes[0], "B's welcome")
  expect(bWelcome.selfId).toBe('bob')
  expect(bWelcome.players.map((p) => p.id).sort()).toEqual(['alice', 'bob'])
  const aInRoster = bWelcome.players.find((p) => p.id === 'alice')!
  expect(aInRoster).toMatchObject({ name: 'Ada', avatar: 'pilot', slot: 1 })

  const bJoin = await waitFor(() => a.events.joins.find((p) => p.id === 'bob'), "B's join at A")
  expect(bJoin).toMatchObject({ name: 'Bob', avatar: 'mage', slot: 2 })
  await waitFor(() => a.events.names.find((n) => n.id === 'bob'), "B's name broadcast at A")
  // B never hears about its own join broadcast (sender is excluded). The name
  // broadcast goes to everyone *after* the join broadcast on the server, so
  // once B has its own name event, a buggy join echo would already be here.
  await waitFor(() => b.events.names.find((n) => n.id === 'bob'), "B's name broadcast at B")
  expect(b.events.joins.map((p) => p.id)).not.toContain('bob')

  // --- A sends state: relayed to B with server-authoritative health, no echo to A ---
  a.client.sendState(10, 2, -5, 0.7, 'laser', 9999) // health lie must not survive the server
  const stateAtB = await waitFor(() => b.events.states.find((s) => s.id === 'alice'), "A's state at B")
  expect(stateAtB).toEqual({ id: 'alice', x: 10, y: 2, z: -5, yaw: 0.7, weapon: 'laser', health: 100 })

  // --- B hits A: both ends see the decremented, server-owned health ---
  b.client.sendHit(a.client.selfId, 30)
  const firstHitAtA = await waitFor(() => a.events.hits[0], 'first hit at A')
  const firstHitAtB = await waitFor(() => b.events.hits[0], 'first hit at B')
  // The server relayed A's state before it processed B's hit, and A's socket
  // delivers in order — so with the hit here, a buggy state echo to A would
  // already have arrived. Safe to assert the relay excluded the sender.
  expect(a.events.states.filter((s) => s.id === 'alice')).toEqual([])
  const expectedFirstHit = {
    t: 'hit',
    target: 'alice',
    by: 'bob',
    byName: 'Bob',
    health: 70,
    killed: false,
    killerKills: 0,
    respawn: null,
  }
  expect(firstHitAtA).toEqual(expectedFirstHit as unknown as HitMessage)
  expect(firstHitAtB).toEqual(expectedFirstHit as unknown as HitMessage)

  // --- repeated hits kill A: killer kills increment, respawn coords fan out ---
  b.client.sendHit('alice', 30) // 40
  b.client.sendHit('alice', 30) // 10
  b.client.sendHit('alice', 30) // kill
  const killAtB = await waitFor(() => b.events.hits.find((h) => h.killed), 'kill at B')
  expect(killAtB).toMatchObject({
    target: 'alice',
    by: 'bob',
    killed: true,
    killerKills: 1,
    health: 100, // post-respawn health, wire-compatible with the original arena
    respawn: { ...SPAWN, y: SPAWN_HEIGHT },
  })
  // the victim receives its own respawn
  const killAtA = await waitFor(() => a.events.hits.find((h) => h.killed), 'kill at A')
  expect(killAtA.respawn).toEqual({ ...SPAWN, y: SPAWN_HEIGHT })
  expect(killAtA.target).toBe('alice')

  // --- custom game message round-trips through the server to both clients ---
  a.client.sendGameMessage({ t: 'chat', text: 'gg' })
  const chatAtA = await waitFor(() => a.events.games[0], 'chat at A')
  const chatAtB = await waitFor(() => b.events.games[0], 'chat at B')
  expect(chatAtA).toEqual({ t: 'chat', text: 'gg', from: 'alice' })
  expect(chatAtB).toEqual({ t: 'chat', text: 'gg', from: 'alice' })

  // --- A disconnects: B sees the leave broadcast ---
  a.client.disconnect()
  await waitFor(() => b.events.leaves.includes('alice'), "A's leave at B")
  expect(b.events.leaves).toEqual(['alice'])
})
