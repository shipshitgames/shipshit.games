import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyCommand,
  applyOperation,
  createInitialWorld,
  summarize,
  tick,
  TICK_MS,
} from '@shipshitgames/warline'
import type {
  Command,
  GameSlug,
  HumanFaction,
  OperationResult,
  Summary,
  WorldState,
} from '@shipshitgames/warline'
import { connectWarline } from '@shipshitgames/warline/client'
import type { WarlineSocket } from '@shipshitgames/warline/client'

// Resolve the server host. Empty host => skip connecting => local mode.
const WARLINE_HOST: string =
  import.meta.env.VITE_WARLINE_HOST ||
  (import.meta.env.DEV ? 'localhost:1999' : '')

const FACTION_KEY = 'warline.faction'

// Wait this long for a socket to open before falling back to local mode.
const CONNECT_TIMEOUT_MS = 2500

export type WarlineStatus = 'LIVE' | 'LOCAL' | 'CONNECTING'

export interface WarlineStore {
  state: WorldState
  summary: Summary
  status: WarlineStatus
  faction: HumanFaction
  setFaction: (f: HumanFaction) => void
  command: (cmd: Command) => void
  simulate: (game?: GameSlug) => void
  connected: boolean
}

const GAME_SLUGS: GameSlug[] = [
  'scourge-survivors',
  'deadlane',
  'pactfall',
  'starblight',
  'redline',
  'rothulk',
]

function loadFaction(): HumanFaction {
  if (typeof localStorage === 'undefined') return 'wardens'
  const stored = localStorage.getItem(FACTION_KEY)
  return stored === 'pyre' || stored === 'wardens' ? stored : 'wardens'
}

function pickGame(): GameSlug {
  const idx = Math.floor(Math.random() * GAME_SLUGS.length)
  return GAME_SLUGS[idx] ?? 'scourge-survivors'
}

/**
 * Synthesize a plausible OperationResult for a demo "Run operation" click.
 * Mostly victories (the front needs the help) with a varied score so the
 * magnitude swings. Mirrors the server's `sim` demo path so LOCAL and LIVE
 * behave the same to the player.
 */
function synthResult(faction: HumanFaction, game: GameSlug): OperationResult {
  const outcome: OperationResult['outcome'] =
    Math.random() < 0.78 ? 'victory' : 'defeat'
  const score = Math.floor(400 + Math.random() * 3200)
  return { game, faction, outcome, score }
}

/**
 * useWarline — dual-runtime store (spec §13).
 *
 * Tries to connect to a PartyKit server via connectWarline. If a socket opens,
 * we mirror authoritative server state and forward commands/sims over the wire
 * (LIVE). If there is no host, or the socket never opens within a short window,
 * we fall back to a fully-playable in-browser simulation seeded from
 * createInitialWorld(Date.now()), ticking every TICK_MS (LOCAL).
 */
export function useWarline(): WarlineStore {
  const [state, setState] = useState<WorldState>(() =>
    createInitialWorld(Date.now()),
  )
  const [status, setStatus] = useState<WarlineStatus>(
    WARLINE_HOST ? 'CONNECTING' : 'LOCAL',
  )
  const [faction, setFactionState] = useState<HumanFaction>(loadFaction)

  // Refs so callbacks can read the latest values without re-binding.
  const socketRef = useRef<WarlineSocket | null>(null)
  const liveRef = useRef(false)
  const stateRef = useRef(state)
  stateRef.current = state
  const factionRef = useRef(faction)
  factionRef.current = faction

  // ---- connection lifecycle ----
  useEffect(() => {
    // No host configured: stay in LOCAL mode, never attempt a socket.
    if (!WARLINE_HOST) {
      setStatus('LOCAL')
      return
    }

    let cancelled = false
    let opened = false

    const socket = connectWarline(WARLINE_HOST, {
      onState: (s) => {
        if (cancelled) return
        liveRef.current = true
        setState(s)
      },
      onStatus: (connected) => {
        if (cancelled) return
        if (connected) {
          opened = true
          liveRef.current = true
          setStatus('LIVE')
        } else if (liveRef.current) {
          // Lost a previously-live connection: keep showing the last state but
          // mark it as reconnecting.
          setStatus('CONNECTING')
        }
      },
    })
    socketRef.current = socket

    // If the socket never opens in time, fall back to a local simulation.
    const timer = window.setTimeout(() => {
      if (cancelled || opened || liveRef.current) return
      liveRef.current = false
      socket.close()
      socketRef.current = null
      setStatus('LOCAL')
      setState(createInitialWorld(Date.now()))
    }, CONNECT_TIMEOUT_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      socket.close()
      socketRef.current = null
      liveRef.current = false
    }
  }, [])

  // ---- local tick loop (only runs while not live) ----
  useEffect(() => {
    if (status !== 'LOCAL') return
    const id = window.setInterval(() => {
      setState((prev) => tick(prev, Date.now()))
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [status])

  // ---- faction persistence ----
  const setFaction = useCallback((f: HumanFaction) => {
    setFactionState(f)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(FACTION_KEY, f)
    }
  }, [])

  // ---- command dispatch (LIVE -> ws, LOCAL -> reducer) ----
  const command = useCallback((cmd: Command) => {
    if (liveRef.current && socketRef.current) {
      socketRef.current.send({ t: 'command', command: cmd })
      return
    }
    setState((prev) => {
      const res = applyCommand(prev, cmd, Date.now())
      return res.ok ? res.state : prev
    })
  }, [])

  // ---- operation simulation (LIVE -> ws, LOCAL -> reducer) ----
  const simulate = useCallback((game?: GameSlug) => {
    const slug = game ?? pickGame()
    if (liveRef.current && socketRef.current) {
      socketRef.current.send({ t: 'sim', game: slug })
      return
    }
    setState((prev) => {
      const result = synthResult(factionRef.current, slug)
      const res = applyOperation(prev, result, Date.now())
      return res.state
    })
  }, [])

  const summary = useMemo(() => summarize(state), [state])
  const connected = status === 'LIVE'

  return {
    state,
    summary,
    status,
    faction,
    setFaction,
    command,
    simulate,
    connected,
  }
}
