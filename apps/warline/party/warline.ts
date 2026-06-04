import type * as Party from 'partykit/server'
import {
  applyCommand,
  applyOperation,
  createInitialWorld,
  resetWorld,
  summarize,
  tick,
  TICK_MS,
  GAME_OPERATIONS,
} from '@shipshitgames/warline'
import type {
  Command,
  GameSlug,
  HumanFaction,
  OperationResult,
  WorldState,
} from '@shipshitgames/warline'

// Warline front room (spec §12). Singleton room `front` on party `main`.
// Holds the authoritative WorldState, ticks the living world on an alarm, and
// fans out every mutation to connected clients. Imports ONLY the pure core of
// @shipshitgames/warline — never the browser ./client subpath.

interface WarlineEnv {
  WARLINE_TOKEN?: string
  WARLINE_ADMIN_TOKEN?: string
}

const STORAGE_KEY = 'world'
const GAME_SLUGS = Object.keys(GAME_OPERATIONS) as GameSlug[]
const HUMAN_FACTIONS: HumanFaction[] = ['pyre', 'wardens']

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function pick<T>(arr: readonly T[], i: number): T {
  // arr is always one of the non-empty constant tables above; the fallback keeps
  // noUncheckedIndexedAccess happy without ever actually being reached.
  const v = arr[((i % arr.length) + arr.length) % arr.length]
  return v ?? arr[0]!
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function bearer(req: Party.Request): string | undefined {
  const header = req.headers.get('Authorization') ?? req.headers.get('authorization')
  if (!header) return undefined
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match ? match[1] : undefined
}

export default class Warline implements Party.Server {
  state: WorldState

  constructor(readonly room: Party.Room) {
    // Provisional seed; onStart replaces this with the persisted world (or a
    // fresh one) before anything is served.
    this.state = createInitialWorld(Date.now())
  }

  private get env(): WarlineEnv {
    return this.room.env as WarlineEnv
  }

  async onStart() {
    const stored = await this.room.storage.get<WorldState>(STORAGE_KEY)
    this.state = stored ?? createInitialWorld(Date.now())
    if (!stored) await this.persist()

    const alarm = await this.room.storage.getAlarm()
    if (alarm === null) {
      await this.room.storage.setAlarm(Date.now() + TICK_MS)
    }
  }

  private async persist() {
    await this.room.storage.put(STORAGE_KEY, this.state)
  }

  private broadcast() {
    this.room.broadcast(JSON.stringify({ t: 'state', state: this.state }))
  }

  async onAlarm() {
    this.state = tick(this.state, Date.now())
    await this.persist()
    this.broadcast()
    await this.room.storage.setAlarm(Date.now() + TICK_MS)
  }

  onConnect(conn: Party.Connection) {
    conn.send(JSON.stringify({ t: 'hello', state: this.state }))
  }

  async onMessage(raw: string, sender: Party.Connection) {
    let msg: { t?: string; [k: string]: unknown }
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }

    if (msg.t === 'command') {
      const command = msg.command as Command | undefined
      if (!command) {
        sender.send(JSON.stringify({ t: 'cmdresult', ok: false, error: 'missing command' }))
        return
      }
      const result = applyCommand(this.state, command, Date.now())
      if (result.ok) {
        this.state = result.state
        await this.persist()
        this.broadcast()
      }
      sender.send(JSON.stringify({ t: 'cmdresult', ok: result.ok, error: result.error }))
      return
    }

    if (msg.t === 'sim') {
      const requested = typeof msg.game === 'string' ? (msg.game as GameSlug) : undefined
      const op = this.synthOperation(sender.id, requested)
      const { state } = applyOperation(this.state, op, Date.now())
      this.state = state
      await this.persist()
      this.broadcast()
      return
    }

    if (msg.t === 'reset') {
      const token = typeof msg.token === 'string' ? msg.token : ''
      const admin = this.env.WARLINE_ADMIN_TOKEN
      if (admin && token !== admin) {
        sender.send(JSON.stringify({ t: 'cmdresult', ok: false, error: 'unauthorized' }))
        return
      }
      if (!admin) {
        console.warn('[warline] WARLINE_ADMIN_TOKEN unset — allowing reset (dev-permissive)')
      }
      this.state = resetWorld(Date.now(), this.state.epoch)
      await this.persist()
      this.broadcast()
      return
    }
  }

  // Demo path (spec §12): build a plausible OperationResult that varies by the
  // connection id and the current tick so the stream can show the loop with no
  // token. Clearly a demo — not the trusted `report` HTTP route.
  private synthOperation(connId: string, requested?: GameSlug): OperationResult {
    let seed = this.state.tick * 31
    for (let i = 0; i < connId.length; i++) {
      seed = (seed * 33 + connId.charCodeAt(i)) >>> 0
    }
    const game =
      requested && GAME_SLUGS.includes(requested) ? requested : pick(GAME_SLUGS, seed)
    const faction = pick(HUMAN_FACTIONS, seed >>> 3)
    // Mostly victories so the demo visibly pushes the front back.
    const outcome: OperationResult['outcome'] = (seed >>> 5) % 5 === 0 ? 'defeat' : 'victory'
    const score = 400 + ((seed >>> 7) % 3200)
    return { game, faction, outcome, score, player: 'demo' }
  }

  async onRequest(req: Party.Request): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    if (req.method === 'GET') {
      return jsonResponse({ state: this.state, summary: summarize(this.state) })
    }

    if (req.method === 'POST') {
      let body: { type?: string; [k: string]: unknown }
      try {
        body = (await req.json()) as { type?: string; [k: string]: unknown }
      } catch {
        return jsonResponse({ ok: false, error: 'invalid json' }, 400)
      }

      if (body.type === 'report') {
        const expected = this.env.WARLINE_TOKEN
        if (expected) {
          if (bearer(req) !== expected) {
            return jsonResponse({ ok: false, error: 'unauthorized' }, 401)
          }
        } else {
          console.warn('[warline] WARLINE_TOKEN unset — accepting report (dev-permissive)')
        }
        const result = body.result as OperationResult | undefined
        if (!result || !this.isOperationResult(result)) {
          return jsonResponse({ ok: false, error: 'invalid result' }, 400)
        }
        const applied = applyOperation(this.state, result, Date.now())
        this.state = applied.state
        await this.persist()
        this.broadcast()
        return jsonResponse({
          ok: true,
          summary: summarize(this.state),
          credited: applied.credited,
          event: applied.event,
        })
      }

      if (body.type === 'command') {
        const command = body.command as Command | undefined
        if (!command) {
          return jsonResponse({ ok: false, error: 'missing command' }, 400)
        }
        const result = applyCommand(this.state, command, Date.now())
        if (result.ok) {
          this.state = result.state
          await this.persist()
          this.broadcast()
        }
        return jsonResponse({
          ok: result.ok,
          error: result.error,
          summary: summarize(this.state),
        })
      }

      if (body.type === 'reset') {
        const expected = this.env.WARLINE_ADMIN_TOKEN
        if (expected) {
          if (bearer(req) !== expected) {
            return jsonResponse({ ok: false, error: 'unauthorized' }, 401)
          }
        } else {
          console.warn('[warline] WARLINE_ADMIN_TOKEN unset — accepting reset (dev-permissive)')
        }
        this.state = resetWorld(Date.now(), this.state.epoch)
        await this.persist()
        this.broadcast()
        return jsonResponse({ ok: true, summary: summarize(this.state) })
      }

      return jsonResponse({ ok: false, error: 'unknown type' }, 400)
    }

    return jsonResponse({ ok: false, error: 'method not allowed' }, 405)
  }

  private isOperationResult(v: unknown): v is OperationResult {
    if (typeof v !== 'object' || v === null) return false
    const r = v as Record<string, unknown>
    return (
      typeof r.game === 'string' &&
      GAME_SLUGS.includes(r.game as GameSlug) &&
      (r.faction === 'pyre' || r.faction === 'wardens') &&
      (r.outcome === 'victory' || r.outcome === 'defeat') &&
      typeof r.score === 'number'
    )
  }
}
