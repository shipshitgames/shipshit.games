import { expect, test } from 'bun:test'

import { ProjectilesSystem, type ProjectileTable } from './ProjectilesSystem'

type ProjectileKind = 'bullet' | 'orb'

const projectiles: ProjectileTable<ProjectileKind> = {
  bullet: { type: 'bullet', speed: 20, radius: 0.1, ttl: 1, damage: 4 },
  orb: { type: 'orb', speed: 5, radius: 0.4, ttl: 5, damage: 10 },
}

test('ProjectilesSystem spawns from content tables and moves with normalized velocity', () => {
  const system = new ProjectilesSystem(projectiles)

  const projectile = system.spawn({
    type: 'bullet',
    position: { x: 0, y: 0, z: 0 },
    direction: { x: 10, y: 0, z: 0 },
  })
  system.update(0.5)

  expect(projectile.damage).toBe(4)
  expect(projectile.position.x).toBeCloseTo(10)
  expect(projectile.position.z).toBeCloseTo(0)
  expect(system.active).toHaveLength(1)
})

test('ProjectilesSystem expires projectiles by ttl', () => {
  const system = new ProjectilesSystem(projectiles)
  const expired: string[] = []

  system.spawn({
    id: 'short-lived',
    type: 'bullet',
    position: { x: 0, y: 0, z: 0 },
    direction: { x: 0, y: 0, z: -1 },
    ttl: 0.2,
  })
  system.update(0.25, { onExpire: (projectile) => expired.push(projectile.id) })

  expect(system.active).toHaveLength(0)
  expect(expired).toEqual(['short-lived'])
})
