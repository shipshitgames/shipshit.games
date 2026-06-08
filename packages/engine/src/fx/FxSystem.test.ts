import { expect, test } from 'bun:test'

import { FxSystem } from './FxSystem'

test('FxSystem expires tracers and pops after their ttl', () => {
  const expired: string[] = []
  const fx = new FxSystem({ onExpire: (item) => expired.push(item.id) })

  fx.tracer({
    id: 'shot-line',
    ttl: 0.1,
    from: { x: 0, y: 1, z: 0 },
    to: { x: 4, y: 1, z: 0 },
  })
  fx.pop({
    id: 'damage-pop',
    ttl: 0.3,
    position: { x: 0, y: 1, z: 0 },
    value: 12,
    velocityY: 2,
  })

  fx.update(0.2)

  expect(fx.active.map((item) => item.id)).toEqual(['damage-pop'])
  expect(fx.active[0]?.kind === 'pop' ? fx.active[0].position.y : 0).toBeCloseTo(1.4)
  expect(expired).toEqual(['shot-line'])
})
