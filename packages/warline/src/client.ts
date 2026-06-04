/**
 * @shipshitgames/warline/client — browser SDK (spec §8).
 *
 * The ONLY module allowed to import 'partysocket'. Never imported by the index
 * barrel, so the pure core stays dependency-free and server-safe.
 */

import { PartySocket } from 'partysocket'
import type {
  Command,
  OperationResult,
  ResourceBag,
  Summary,
  WorldState,
} from './types'

export interface WarlineClientOptions {
  host: string
  token?: string
}

export interface ReportResponse {
  ok: boolean
  summary?: Summary
  credited?: Partial<ResourceBag>
  error?: string
}

/** Resolve the HTTP/WS base path for the singleton `front` room. */
export function warlineUrl(host: string): string {
  const isHttps =
    typeof location !== 'undefined' && location.protocol === 'https:'
  const secure = isHttps || /^(https|wss):\/\//.test(host)
  const bare = host.replace(/^(https?|wss?):\/\//, '')
  const proto = secure ? 'https:' : 'http:'
  return `${proto}//${bare}/parties/main/front`
}

export class WarlineClient {
  private host: string
  private token?: string

  constructor(opts: WarlineClientOptions) {
    this.host = opts.host
    this.token = opts.token
  }

  /** GET the current world (server returns { state, summary }). */
  async fetchState(): Promise<WorldState> {
    const res = await fetch(warlineUrl(this.host), { method: 'GET' })
    if (!res.ok) throw new Error(`warline fetchState failed: ${res.status}`)
    const data = (await res.json()) as { state: WorldState }
    return data.state
  }

  /** POST a trusted game result. Requires the bearer token. */
  async reportOperation(result: OperationResult): Promise<ReportResponse> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    }
    if (this.token) headers['authorization'] = `Bearer ${this.token}`
    const res = await fetch(warlineUrl(this.host), {
      method: 'POST',
      headers,
      body: JSON.stringify({ type: 'report', result }),
    })
    const data = (await res.json().catch(() => ({}))) as ReportResponse
    return { ...data, ok: res.ok && data.ok !== false }
  }

  /** POST an open build/deploy command (no auth). */
  async sendCommand(
    cmd: Command
  ): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(warlineUrl(this.host), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'command', command: cmd }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
    }
    return { ok: res.ok && data.ok !== false, error: data.error }
  }
}

export interface WarlineSocket {
  send: (msg: unknown) => void
  close: () => void
}

/**
 * Open a live WS to the `front` room and stream world state.
 * Parses { t:'hello'|'state', state } frames.
 */
export function connectWarline(
  host: string,
  handlers: {
    onState: (s: WorldState) => void
    onStatus?: (connected: boolean) => void
  }
): WarlineSocket {
  const socket = new PartySocket({
    host,
    party: 'main',
    room: 'front',
  })

  socket.addEventListener('open', () => {
    handlers.onStatus?.(true)
  })

  socket.addEventListener('close', () => {
    handlers.onStatus?.(false)
  })

  socket.addEventListener('message', (ev: MessageEvent) => {
    try {
      const raw = typeof ev.data === 'string' ? ev.data : String(ev.data)
      const msg = JSON.parse(raw) as { t?: string; state?: WorldState }
      if ((msg.t === 'hello' || msg.t === 'state') && msg.state) {
        handlers.onState(msg.state)
      }
    } catch {
      // ignore malformed frames
    }
  })

  return {
    send: (msg: unknown) => socket.send(JSON.stringify(msg)),
    close: () => socket.close(),
  }
}
