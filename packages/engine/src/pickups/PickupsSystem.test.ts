import { expect, test } from 'bun:test'

import { PickupsSystem, type PickupTable } from './PickupsSystem'

type PickupKind = 'health' | 'ammo'

const pickups: PickupTable<PickupKind, number> = {
  health: { type: 'health', radius: 1, value: 25 },
  ammo: { type: 'ammo', radius: 0.75, value: 12, ttl: 1 },
}

test('PickupsSystem collects pickups by radius and preserves spawn order', () => {
  const system = new PickupsSystem(pickups)

  system.spawn({ id: 'health-1', type: 'health', position: { x: 0, y: 0, z: 0 } })
  system.spawn({ id: 'ammo-1', type: 'ammo', position: { x: 2, y: 0, z: 0 } })

  const collected = system.collectAt({ x: 0.5, y: 0, z: 0 }, { radius: 0.1 })

  expect(collected.map((pickup) => pickup.id)).toEqual(['health-1'])
  expect(system.active.map((pickup) => pickup.id)).toEqual(['ammo-1'])
})

test('PickupsSystem expires ttl-bound pickups', () => {
  const system = new PickupsSystem(pickups)

  system.spawn({ id: 'ammo-1', type: 'ammo', position: { x: 0, y: 0, z: 0 } })
  system.update(1.1)

  expect(system.active).toHaveLength(0)
})
