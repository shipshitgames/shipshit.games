import { expect, test } from 'bun:test'

import { HudSystem } from './HudSystem'

interface TestHudState {
  health: number
  ammo: number
  status: 'playing' | 'paused'
}

test('HudSystem emits typed snapshots and unsubscribe stops fan-out', () => {
  const hud = new HudSystem<TestHudState>({ health: 100, ammo: 6, status: 'playing' })
  const snapshots: TestHudState[] = []
  const unsubscribe = hud.subscribe((snapshot) => snapshots.push({ ...snapshot }))

  hud.patch({ ammo: 5 })
  unsubscribe()
  hud.patch({ health: 75 })

  expect(snapshots).toEqual([
    { health: 100, ammo: 6, status: 'playing' },
    { health: 100, ammo: 5, status: 'playing' },
  ])
  expect(hud.getSnapshot()).toEqual({ health: 75, ammo: 5, status: 'playing' })
})

test('HudSystem accepts reducer-style state updates', () => {
  const hud = new HudSystem<TestHudState>({ health: 20, ammo: 1, status: 'paused' })

  hud.patch((previous) => ({ ...previous, health: previous.health + 10, status: 'playing' }))

  expect(hud.getSnapshot()).toEqual({ health: 30, ammo: 1, status: 'playing' })
})
