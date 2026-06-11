import { expect, test } from 'bun:test'
import type * as Party from 'partykit/server'

import type { GameMessage } from './protocol'
import { createRoomServer } from './server'
import type { RoomPlayerState, RoomServerApi, RoomServerOptions } from './server'

interface Broadcast {
  msg: Record<string, any>
  without: string[] | undefined
}

function createHarness<TGameMessage extends GameMessage = GameMessage>(
  options?: RoomServerOptions<TGameMessage>,
) {
  const broadcasts: Broadcast[] = []
  const room = {
    id: 'test-room',
    broadcast(raw: string, without?: string[]) {
      broadcasts.push({ msg: JSON.parse(raw), without })
    },
  }
  const RoomServer = createRoomServer<TGameMessage>(options)
  const server = new RoomServer(room as unknown as Party.Room)

  function connect(id: string) {
    const sent: Record<string, any>[] = []
    const conn = {
      id,
      send(payload: string) {
        sent.push(JSON.parse(payload))
      },
    } as unknown as Party.Connection
    server.onConnect(conn)
    return {
      id,
      sent,
      send(msg: unknown) {
        server.onMessage(JSON.stringify(msg), conn)
      },
      sendRaw(payload: string) {
        server.onMessage(payload, conn)
      },
      close() {
        server.onClose(conn)
      },
    }
  }

  return { server, broadcasts, connect }
}

test('defaults are canon-free: empty avatar and weapon, generic name', () => {
  const h = createHarness()
  h.connect('a')
  const p = h.server.players.get('a')!
  expect(p.name).toBe('Player')
  expect(p.avatar).toBe('')
  expect(p.weapon).toBe('')
  expect(p.health).toBe(100)
  expect({ x: p.x, y: p.y, z: p.z }).toEqual({ x: 0, y: 0, z: 0 })
})

test('welcome roster hides pre-join players but always includes self', () => {
  const h = createHarness()
  const a = h.connect('a')
  const b = h.connect('b')

  const welcome = b.sent[0]!
  expect(welcome.t).toBe('welcome')
  expect(welcome.id).toBe('b')
  expect(welcome.players.map((p: RoomPlayerState) => p.id)).toEqual(['b'])

  a.send({ t: 'join', name: 'Ann', avatar: 'x' })
  const c = h.connect('c')
  expect(c.sent[0]!.players.map((p: RoomPlayerState) => p.id).sort()).toEqual(['a', 'c'])
})

test('slots assign the lowest free integer and freed slots are reused', () => {
  const h = createHarness()
  h.connect('a')
  const b = h.connect('b')
  h.connect('c')
  expect(h.server.players.get('a')!.slot).toBe(1)
  expect(h.server.players.get('b')!.slot).toBe(2)
  expect(h.server.players.get('c')!.slot).toBe(3)

  b.close()
  h.connect('d')
  expect(h.server.players.get('d')!.slot).toBe(2)
})

test('join sanitizes name/avatar, broadcasts join once excluding sender, then always name', () => {
  const joined: string[] = []
  const h = createHarness({
    maxNameLength: 4,
    sanitizeAvatar: (value) => (value === 'knight' ? 'knight' : 'fallback'),
    onJoined: (p) => joined.push(p.id),
  })
  const a = h.connect('a')

  a.send({ t: 'join', name: 'Abcdefgh', avatar: 'knight' })
  expect(h.broadcasts).toHaveLength(2)
  const join = h.broadcasts[0]!
  expect(join.msg.t).toBe('join')
  expect(join.msg.player.name).toBe('Abcd')
  expect(join.msg.player.avatar).toBe('knight')
  expect(join.without).toEqual(['a'])
  const name = h.broadcasts[1]!
  expect(name.msg).toEqual({ t: 'name', id: 'a', name: 'Abcd', avatar: 'knight', slot: 1 })
  expect(name.without).toBeUndefined()
  expect(joined).toEqual(['a'])

  // second join only re-broadcasts name; empty name falls back to the
  // untruncated default, exactly like arena.ts
  a.send({ t: 'join', name: '', avatar: 'unknown-skin' })
  expect(h.broadcasts).toHaveLength(3)
  expect(h.broadcasts[2]!.msg).toEqual({ t: 'name', id: 'a', name: 'Player', avatar: 'fallback', slot: 1 })
  expect(joined).toEqual(['a'])
})

test('empty join name falls back to the full default name', () => {
  const h = createHarness()
  const a = h.connect('a')
  a.send({ t: 'join', name: '', avatar: '' })
  expect(h.server.players.get('a')!.name).toBe('Player')
})

test('state relay excludes the sender and carries server-side health', () => {
  const h = createHarness({ spawnHeight: 1.8 })
  const a = h.connect('a')
  h.connect('b')

  // client lies about health and omits y entirely
  a.send({ t: 'state', x: 3, z: -2, yaw: 1.5, weapon: 'laser', health: 9999 })
  const relay = h.broadcasts.at(-1)!
  expect(relay.without).toEqual(['a'])
  expect(relay.msg).toEqual({ t: 'state', id: 'a', x: 3, y: 1.8, z: -2, yaw: 1.5, weapon: 'laser', health: 100 })

  // non-string weapon is ignored, last weapon sticks
  a.send({ t: 'state', x: 1, y: 2, z: 1, yaw: 0, weapon: 42 })
  expect(h.broadcasts.at(-1)!.msg.weapon).toBe('laser')
})

test('state coercion is finite-only: NaN/Infinity never replicate, finite y=0 stands', () => {
  const h = createHarness({ spawnHeight: 1.8 })
  const a = h.connect('a')
  h.connect('b')

  // raw JSON because JSON.stringify cannot emit Infinity — 1e999 parses to it;
  // a hostile client must not be able to park its body at Infinity or NaN
  a.sendRaw('{"t":"state","x":1e999,"y":0,"z":"junk","yaw":-1e999}')
  const p = h.server.players.get('a')!
  expect({ x: p.x, y: p.y, z: p.z, yaw: p.yaw }).toEqual({ x: 0, y: 0, z: 0, yaw: 0 })
  expect(h.broadcasts.at(-1)!.msg).toMatchObject({ t: 'state', id: 'a', x: 0, y: 0, z: 0, yaw: 0 })

  // y=0 above stood as sent — a null y (what NaN becomes on the wire) falls back
  a.send({ t: 'state', x: 1, y: null, z: 2, yaw: 0.5 })
  expect(h.server.players.get('a')!.y).toBe(1.8)
})

test('the default sanitizeAvatar caps the avatar id at 32 characters', () => {
  const h = createHarness()
  const a = h.connect('a')
  a.send({ t: 'join', name: 'Ann', avatar: 'x'.repeat(100) })
  expect(h.server.players.get('a')!.avatar).toBe('x'.repeat(32))
})

test('dead attackers cannot deal damage under the default allowHit', () => {
  const h = createHarness({ respawn: null })
  const a = h.connect('a')
  const b = h.connect('b')

  a.send({ t: 'hit', target: 'b', dmg: 100 }) // kills b, who stays dead
  expect(h.server.players.get('b')!.alive).toBe(false)

  const count = h.broadcasts.length
  b.send({ t: 'hit', target: 'a', dmg: 30 }) // hit report from the corpse is dropped
  expect(h.server.players.get('a')!.health).toBe(100)
  expect(h.broadcasts).toHaveLength(count)
})

test('hit applies damage and ignores self-hit, zero dmg, and unknown targets', () => {
  const h = createHarness()
  const a = h.connect('a')
  h.connect('b')
  a.send({ t: 'join', name: 'Attacker', avatar: '' })

  const before = h.broadcasts.length
  a.send({ t: 'hit', target: 'b', dmg: 30 })
  expect(h.server.players.get('b')!.health).toBe(70)
  const hit = h.broadcasts.at(-1)!
  expect(hit.without).toBeUndefined()
  expect(hit.msg).toEqual({
    t: 'hit',
    target: 'b',
    by: 'a',
    byName: 'Attacker',
    health: 70,
    killed: false,
    killerKills: 0,
    respawn: null,
  })

  a.send({ t: 'hit', target: 'a', dmg: 30 }) // self-hit blocked by default allowHit
  expect(h.server.players.get('a')!.health).toBe(100)
  a.send({ t: 'hit', target: 'b', dmg: 0 }) // zero dmg
  a.send({ t: 'hit', target: 'b' }) // missing dmg
  a.send({ t: 'hit', target: 'nobody', dmg: 30 }) // unknown target
  expect(h.server.players.get('b')!.health).toBe(70)
  expect(h.broadcasts).toHaveLength(before + 1)
})

test('kill increments kills and the default respawn restores health at spawnPoint', () => {
  const spawnCalls: (RoomPlayerState | null)[] = []
  const h = createHarness({
    startingHealth: 50,
    spawnHeight: 2,
    spawnPoint: (player) => {
      spawnCalls.push(player)
      return player ? { x: 7, z: 9 } : { x: 0, z: 0 }
    },
  })
  const a = h.connect('a')
  h.connect('b')
  a.send({ t: 'join', name: 'Killer', avatar: '' })

  a.send({ t: 'hit', target: 'b', dmg: 50 })
  const victim = h.server.players.get('b')!
  expect(victim.alive).toBe(true)
  expect(victim.health).toBe(50)
  expect({ x: victim.x, y: victim.y, z: victim.z }).toEqual({ x: 7, y: 2, z: 9 })
  expect(h.server.players.get('a')!.kills).toBe(1)

  const hit = h.broadcasts.at(-1)!
  expect(hit.msg.killed).toBe(true)
  expect(hit.msg.killerKills).toBe(1)
  // wire-compatible with arena.ts: a kill broadcasts the post-respawn health
  expect(hit.msg.health).toBe(50)
  expect(hit.msg.respawn).toEqual({ x: 7, y: 2, z: 9 })

  expect(spawnCalls[0]).toBeNull() // initial connects pass null
  expect(spawnCalls.at(-1)).toBe(victim) // respawns pass the victim
})

test('respawn: null leaves the victim dead and further hits are no-ops', () => {
  const h = createHarness({ respawn: null })
  const a = h.connect('a')
  h.connect('b')

  a.send({ t: 'hit', target: 'b', dmg: 100 })
  const victim = h.server.players.get('b')!
  expect(victim.alive).toBe(false)
  expect(victim.health).toBe(0)
  const hit = h.broadcasts.at(-1)!
  expect(hit.msg.killed).toBe(true)
  expect(hit.msg.health).toBe(0)
  expect(hit.msg.respawn).toBeNull()

  const count = h.broadcasts.length
  a.send({ t: 'hit', target: 'b', dmg: 10 })
  expect(h.broadcasts).toHaveLength(count)
  expect(victim.health).toBe(0)
})

test('custom respawn function controls coords and can return null to leave dead', () => {
  let mode: 'coords' | 'null' = 'coords'
  const h = createHarness({
    respawn: (victim, killer, api) => {
      expect(killer.id).toBe('a')
      expect(api.players.has(victim.id)).toBe(true)
      return mode === 'coords' ? { x: -4, y: 3, z: 8 } : null
    },
  })
  const a = h.connect('a')
  h.connect('b')

  a.send({ t: 'hit', target: 'b', dmg: 100 })
  const victim = h.server.players.get('b')!
  expect(victim.alive).toBe(true)
  expect(victim.health).toBe(100)
  expect({ x: victim.x, y: victim.y, z: victim.z }).toEqual({ x: -4, y: 3, z: 8 })
  expect(h.broadcasts.at(-1)!.msg.respawn).toEqual({ x: -4, y: 3, z: 8 })

  mode = 'null'
  a.send({ t: 'hit', target: 'b', dmg: 100 })
  expect(victim.alive).toBe(false)
  expect(victim.health).toBe(0)
  expect(h.broadcasts.at(-1)!.msg.respawn).toBeNull()
})

test('allowHit override blocks all damage for co-op rooms', () => {
  const h = createHarness({ allowHit: () => false })
  const a = h.connect('a')
  h.connect('b')

  const count = h.broadcasts.length
  a.send({ t: 'hit', target: 'b', dmg: 40 })
  expect(h.server.players.get('b')!.health).toBe(100)
  expect(h.broadcasts).toHaveLength(count)
})

interface PingMessage extends GameMessage {
  t: 'ping'
  n: number
}

test('non-reserved messages route to onGameMessage with sender and a working api', () => {
  const received: { t: string; n: number; sender: string }[] = []
  let capturedApi: RoomServerApi<PingMessage> | null = null
  const h = createHarness<PingMessage>({
    onGameMessage: (msg, sender, api) => {
      received.push({ t: msg.t, n: msg.n, sender: sender.id })
      capturedApi = api
    },
  })
  const a = h.connect('a')
  const b = h.connect('b')

  a.send({ t: 'ping', n: 7 })
  expect(received).toEqual([{ t: 'ping', n: 7, sender: 'a' }])

  // reserved transport types never reach the game handler
  a.send({ t: 'welcome', id: 'spoof', players: [] })
  a.send({ t: 'name', id: 'spoof', name: 'x', avatar: '', slot: 1 })
  a.send({ t: 'leave', id: 'b' })
  expect(received).toHaveLength(1)

  // malformed input is dropped, never thrown
  a.sendRaw('{not json')
  a.sendRaw(JSON.stringify({ no: 't' }))
  a.sendRaw(JSON.stringify([1, 2, 3]))
  expect(received).toHaveLength(1)

  capturedApi!.broadcast({ t: 'ping', n: 1 }, ['a'])
  const last = h.broadcasts.at(-1)!
  expect(last.msg).toEqual({ t: 'ping', n: 1 })
  expect(last.without).toEqual(['a'])

  capturedApi!.send('b', { t: 'ping', n: 2 })
  expect(b.sent.at(-1)).toEqual({ t: 'ping', n: 2 })
  expect(() => capturedApi!.send('ghost', { t: 'ping', n: 3 })).not.toThrow()
})

test('messages from unknown senders are dropped', () => {
  const h = createHarness()
  const ghost = { id: 'ghost', send() {} } as unknown as Party.Connection
  h.server.onMessage(JSON.stringify({ t: 'state', x: 1, z: 1 }), ghost)
  expect(h.broadcasts).toHaveLength(0)
})

test('close removes the player, broadcasts leave, and fires onLeft for joined players only', () => {
  const left: string[] = []
  const h = createHarness({ onLeft: (p) => left.push(p.id) })
  const a = h.connect('a')
  const b = h.connect('b')
  a.send({ t: 'join', name: 'Ann', avatar: '' })

  a.close()
  expect(h.server.players.has('a')).toBe(false)
  expect(h.broadcasts.at(-1)!.msg).toEqual({ t: 'leave', id: 'a' })
  expect(left).toEqual(['a'])

  b.close() // never joined: leave still broadcast, onLeft not fired
  expect(h.broadcasts.at(-1)!.msg).toEqual({ t: 'leave', id: 'b' })
  expect(left).toEqual(['a'])
})
