import { expect, test } from 'bun:test'

import type PartySocket from 'partysocket'

import {
  NetClient,
  type NetClientOptions,
  type NetEvents,
  type NetSocketFactory,
  type NetSocketLike,
} from './NetClient'
import type { GameMessage, HitMessage, RemotePlayerInfo } from './protocol'

class FakeSocket implements NetSocketLike {
  readyState = 1
  sent: string[] = []
  closed = false
  private listeners: Record<string, Array<(event: { data?: unknown }) => void>> = {}

  addEventListener(type: 'open' | 'close' | 'message', listener: (event: { data?: unknown }) => void): void {
    ;(this.listeners[type] ??= []).push(listener)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.closed = true
  }

  dispatch(type: 'open' | 'close' | 'message', event: { data?: unknown } = {}): void {
    for (const listener of this.listeners[type] ?? []) listener(event)
  }

  receive(payload: unknown): void {
    this.dispatch('message', { data: typeof payload === 'string' ? payload : JSON.stringify(payload) })
  }
}

const setup = <TGameMessage extends GameMessage = GameMessage>(
  events: NetEvents<TGameMessage> = {},
  options: Omit<NetClientOptions, 'createSocket'> = {},
) => {
  const sockets: FakeSocket[] = []
  const factoryCalls: Array<{ host: string; room: string; party: string }> = []
  const createSocket: NetSocketFactory = (opts) => {
    factoryCalls.push(opts)
    const socket = new FakeSocket()
    sockets.push(socket)
    return socket
  }
  const client = new NetClient<TGameMessage>(events, { ...options, createSocket })
  return { client, sockets, factoryCalls }
}

const playerInfo = (id: string): RemotePlayerInfo => ({
  id,
  name: `name-${id}`,
  avatar: `avatar-${id}`,
  slot: 1,
  x: 1,
  y: 2,
  z: 3,
  yaw: 0.5,
  weapon: `weapon-${id}`,
  health: 100,
  kills: 0,
})

test('connect sends the join request on open and reports connection status', async () => {
  const statuses: boolean[] = []
  const { client, sockets, factoryCalls } = setup({ onStatus: (connected) => statuses.push(connected) })

  await client.connect('room-1', 'Ada', 'pilot')
  const socket = sockets[0]!
  expect(client.socket).toBe(socket)
  expect(factoryCalls).toEqual([{ host: '', room: 'room-1', party: 'main' }])
  expect(socket.sent).toEqual([])

  socket.dispatch('open')
  expect(statuses).toEqual([true])
  expect(socket.sent).toEqual(['{"t":"join","name":"Ada","avatar":"pilot"}'])

  socket.dispatch('close')
  expect(statuses).toEqual([true, false])
})

test('connect host falls back to options.host then empty string, and party is configurable', async () => {
  const { client, factoryCalls } = setup({}, { host: 'fallback:1999', party: 'arena' })

  await client.connect('r', 'n', 'a')
  expect(factoryCalls[0]).toEqual({ host: 'fallback:1999', room: 'r', party: 'arena' })

  await client.connect('r', 'n', 'a', 'override:1999')
  expect(factoryCalls[1]).toEqual({ host: 'override:1999', room: 'r', party: 'arena' })
})

test('welcome sets selfId and delivers the roster (missing players becomes [])', async () => {
  const welcomes: Array<{ selfId: string; players: RemotePlayerInfo[] }> = []
  const { client, sockets } = setup({ onWelcome: (selfId, players) => welcomes.push({ selfId, players }) })
  await client.connect('r', 'n', 'a')
  const socket = sockets[0]!

  const roster = [playerInfo('p1'), playerInfo('p2')]
  socket.receive({ t: 'welcome', id: 'p1', players: roster })
  expect(client.selfId).toBe('p1')
  expect(welcomes[0]).toEqual({ selfId: 'p1', players: roster })

  socket.receive({ t: 'welcome', id: 7 })
  expect(client.selfId).toBe('7')
  expect(welcomes[1]).toEqual({ selfId: '7', players: [] })
})

test('join, leave, state, name, and hit route to their callbacks with coerced args', async () => {
  const joins: RemotePlayerInfo[] = []
  const leaves: string[] = []
  const states: unknown[][] = []
  const names: unknown[][] = []
  const hits: HitMessage[] = []
  const { client, sockets } = setup({
    onJoin: (p) => joins.push(p),
    onLeave: (id) => leaves.push(id),
    onState: (...args) => states.push(args),
    onName: (...args) => names.push(args),
    onHit: (msg) => hits.push(msg),
  })
  await client.connect('r', 'n', 'a')
  const socket = sockets[0]!

  const joiner = playerInfo('p2')
  socket.receive({ t: 'join', player: joiner })
  expect(joins).toEqual([joiner])

  socket.receive({ t: 'leave', id: 99 })
  expect(leaves).toEqual(['99'])

  socket.receive({ t: 'state', id: 'p2', x: '4', y: 2, z: 3, yaw: 0.5, weapon: 'Bow', health: 88 })
  expect(states).toEqual([['p2', 4, 2, 3, 0.5, 'Bow', 88]])

  socket.receive({ t: 'name', id: 'p2', name: 'Bea', avatar: 'mage', slot: 2 })
  expect(names).toEqual([['p2', 'Bea', 'mage', 2]])

  const hit = {
    t: 'hit',
    target: 'p2',
    by: 'p1',
    byName: 'Ada',
    health: 60,
    killed: false,
    killerKills: 3,
    respawn: null,
  }
  socket.receive(hit)
  expect(hits).toEqual([hit as unknown as HitMessage])
})

test('canon-free coercion fallbacks: weapon -> "", avatar -> "", health -> 100, slot -> 0', async () => {
  const states: unknown[][] = []
  const names: unknown[][] = []
  const { client, sockets } = setup({
    onState: (...args) => states.push(args),
    onName: (...args) => names.push(args),
  })
  await client.connect('r', 'n', 'a')
  const socket = sockets[0]!

  socket.receive({ t: 'state', id: 'p2', x: 1, y: 2, z: 3, yaw: 0 })
  expect(states).toEqual([['p2', 1, 2, 3, 0, '', 100]])

  socket.receive({ t: 'name', id: 'p2', name: 'Bea' })
  expect(names).toEqual([['p2', 'Bea', '', 0]])
})

test('malformed JSON, non-object JSON, and missing-t messages are silently dropped', async () => {
  const calls: string[] = []
  const { client, sockets } = setup({
    onWelcome: () => calls.push('welcome'),
    onJoin: () => calls.push('join'),
    onLeave: () => calls.push('leave'),
    onState: () => calls.push('state'),
    onName: () => calls.push('name'),
    onHit: () => calls.push('hit'),
    onStatus: () => calls.push('status'),
    onGameMessage: () => calls.push('game'),
  })
  await client.connect('r', 'n', 'a')
  const socket = sockets[0]!

  socket.receive('{not json')
  socket.receive('42')
  socket.receive('"state"')
  socket.receive('[{"t":"leave","id":"p2"}]')
  socket.receive('null')
  socket.receive('{"x":1}')
  socket.receive('{"t":7}')
  socket.dispatch('message', { data: 123 })
  socket.dispatch('message', {})

  expect(calls).toEqual([])
})

test('non-reserved t routes to onGameMessage; reserved types never do', async () => {
  interface ScoreMessage extends GameMessage {
    t: 'score'
    value: number
  }
  const gameMessages: ScoreMessage[] = []
  const reservedCalls: string[] = []
  const { client, sockets } = setup<ScoreMessage>({
    onGameMessage: (msg) => gameMessages.push(msg),
    onLeave: () => reservedCalls.push('leave'),
    onHit: () => reservedCalls.push('hit'),
  })
  await client.connect('r', 'n', 'a')
  const socket = sockets[0]!

  socket.receive({ t: 'score', value: 42 })
  expect(gameMessages).toEqual([{ t: 'score', value: 42 } as ScoreMessage])
  expect(gameMessages[0]?.value).toBe(42)

  for (const t of ['welcome', 'join', 'leave', 'state', 'name', 'hit']) {
    socket.receive({ t, id: 'p2', value: 1 })
  }
  expect(gameMessages).toHaveLength(1)
  expect(reservedCalls).toEqual(['leave', 'hit'])
})

test('sendState throttles at exactly 45ms by default: first send always goes out', async () => {
  let time = 1000
  const { client, sockets } = setup({}, { now: () => time })
  await client.connect('r', 'n', 'a')
  const socket = sockets[0]!

  client.sendState(1, 2, 3, 0.5, 'sword', 90)
  expect(socket.sent).toEqual(['{"t":"state","x":1,"y":2,"z":3,"yaw":0.5,"weapon":"sword","health":90}'])

  time = 1044 // 44ms later — still inside the default window
  client.sendState(1, 2, 3, 0.5, 'sword', 90)
  expect(socket.sent).toHaveLength(1)

  time = 1045 // exactly 45ms — parity with the original game client's interval
  client.sendState(4, 5, 6, 1, 'sword', 80)
  expect(socket.sent).toHaveLength(2)
  expect(JSON.parse(socket.sent[1]!)).toEqual({ t: 'state', x: 4, y: 5, z: 6, yaw: 1, weapon: 'sword', health: 80 })
})

test('sendState respects a custom stateHz', async () => {
  let time = 0
  const { client, sockets } = setup({}, { now: () => time, stateHz: 10 })
  await client.connect('r', 'n', 'a')
  const socket = sockets[0]!

  client.sendState(0, 0, 0, 0, '', 100)
  expect(socket.sent).toHaveLength(1)

  time = 99
  client.sendState(0, 0, 0, 0, '', 100)
  expect(socket.sent).toHaveLength(1)

  time = 100
  client.sendState(0, 0, 0, 0, '', 100)
  expect(socket.sent).toHaveLength(2)
})

test('sendHit emits the wire shape used by the original protocol', async () => {
  const { client, sockets } = setup()
  await client.connect('r', 'n', 'a')
  const socket = sockets[0]!

  client.sendHit('p2', 12)
  expect(socket.sent).toEqual(['{"t":"hit","target":"p2","dmg":12}'])
})

test('sendGameMessage throws TypeError on reserved t and sends otherwise', async () => {
  const { client, sockets } = setup()
  await client.connect('r', 'n', 'a')
  const socket = sockets[0]!

  for (const t of ['welcome', 'join', 'leave', 'state', 'name', 'hit']) {
    expect(() => client.sendGameMessage({ t })).toThrow(TypeError)
  }
  expect(socket.sent).toEqual([])

  client.sendGameMessage({ t: 'objective', phase: 2 } as GameMessage)
  expect(socket.sent).toEqual(['{"t":"objective","phase":2}'])
})

test('sends are dropped without throwing when the socket is not open or not created', async () => {
  const { client, sockets } = setup()

  expect(() => client.sendHit('p2', 1)).not.toThrow()
  expect(() => client.sendState(0, 0, 0, 0, '', 100)).not.toThrow()

  await client.connect('r', 'n', 'a')
  const socket = sockets[0]!
  socket.readyState = 0
  client.sendHit('p2', 1)
  socket.readyState = 3
  client.sendGameMessage({ t: 'ping' })
  expect(socket.sent).toEqual([])
})

test('disconnect closes the socket, reports onStatus(false) once, and ignores the late close event', async () => {
  const statuses: boolean[] = []
  const { client, sockets } = setup({ onStatus: (connected) => statuses.push(connected) })
  await client.connect('r', 'n', 'a')
  const socket = sockets[0]!
  socket.dispatch('open')
  expect(statuses).toEqual([true])

  client.disconnect()
  expect(socket.closed).toBe(true)
  expect(client.socket).toBeNull()
  expect(statuses).toEqual([true, false])

  // the closed socket's own events are session-stale and silenced
  socket.dispatch('close')
  socket.dispatch('open')
  expect(statuses).toEqual([true, false])

  // disconnecting again without a connection reports nothing
  client.disconnect()
  expect(statuses).toEqual([true, false])
})

test('disconnect while an async socket factory is pending closes the late socket', async () => {
  let resolveSocket: ((socket: NetSocketLike) => void) | null = null
  const createSocket: NetSocketFactory = () => new Promise((resolve) => {
    resolveSocket = resolve
  })
  const client = new NetClient({}, { createSocket })

  const pending = client.connect('r', 'n', 'a')
  client.disconnect()

  const late = new FakeSocket()
  resolveSocket!(late)
  await pending

  expect(late.closed).toBe(true)
  expect(client.socket).toBeNull()
})

test('connecting twice closes the first socket before opening the second', async () => {
  const { client, sockets } = setup()

  await client.connect('room-1', 'n', 'a')
  const first = sockets[0]!
  expect(first.closed).toBe(false)

  await client.connect('room-2', 'n', 'a')
  const second = sockets[1]!
  expect(first.closed).toBe(true)
  expect(client.socket).toBe(second)
})

test('a replaced socket cannot leak events or sends into the new session', async () => {
  const statuses: boolean[] = []
  const leaves: string[] = []
  const { client, sockets } = setup({
    onStatus: (connected) => statuses.push(connected),
    onLeave: (id) => leaves.push(id),
  })

  await client.connect('room-1', 'Ada', 'pilot')
  const first = sockets[0]!
  first.dispatch('open')
  expect(statuses).toEqual([true])

  // replacing the connection reports the drop synchronously...
  await client.connect('room-2', 'Ada', 'pilot')
  const second = sockets[1]!
  expect(statuses).toEqual([true, false])

  // ...and the first socket's late events are silenced: no status flips, no
  // stale messages, and crucially no room-1 join sent down the room-2 socket
  first.dispatch('close')
  first.receive({ t: 'leave', id: 'ghost' })
  first.dispatch('open')
  expect(statuses).toEqual([true, false])
  expect(leaves).toEqual([])
  expect(second.sent).toEqual([])

  // the new session still works end to end
  second.dispatch('open')
  expect(statuses).toEqual([true, false, true])
  expect(second.sent).toEqual(['{"t":"join","name":"Ada","avatar":"pilot"}'])
  second.receive({ t: 'leave', id: 'p9' })
  expect(leaves).toEqual(['p9'])
})

test('a sparse events object never crashes routing, status, or senders', async () => {
  const { client, sockets } = setup({})
  await client.connect('r', 'n', 'a')
  const socket = sockets[0]!

  socket.dispatch('open')
  socket.receive({ t: 'welcome', id: 'p1', players: [] })
  socket.receive({ t: 'join', player: playerInfo('p2') })
  socket.receive({ t: 'leave', id: 'p2' })
  socket.receive({ t: 'state', id: 'p2', x: 0, y: 0, z: 0, yaw: 0 })
  socket.receive({ t: 'name', id: 'p2', name: 'Bea' })
  socket.receive({ t: 'hit', target: 'p2', by: 'p1' })
  socket.receive({ t: 'custom-thing' })
  socket.dispatch('close')

  expect(client.selfId).toBe('p1')
  client.sendState(0, 0, 0, 0, '', 100)
  client.sendHit('p2', 5)
  client.disconnect()
  expect(socket.closed).toBe(true)
})

test('PartySocket and the standard WebSocket structurally satisfy NetSocketLike', () => {
  type Extends<A, B> = A extends B ? true : false
  const partySocketOk: Extends<PartySocket, NetSocketLike> = true
  const webSocketOk: Extends<WebSocket, NetSocketLike> = true
  expect(partySocketOk).toBe(true)
  expect(webSocketOk).toBe(true)
})
