import { expect, test } from 'bun:test'

import {
  clamp,
  clampBipolar,
  computeAttenuation,
  computePan,
  spatialize,
  DEFAULT_MAX_DISTANCE,
  DEFAULT_REF_DISTANCE,
  type AudioListener,
} from './spatial-audio'

const at = (x: number, y: number, z: number) => ({ x, y, z })
const facing = (yaw: number, position = at(0, 0, 0)): AudioListener => ({ position, yaw })

test('clamp keeps values inside the range and sends junk to the floor', () => {
  expect(clamp(0.5, 0, 1)).toBe(0.5)
  expect(clamp(-2, 0, 1)).toBe(0)
  expect(clamp(2, 0, 1)).toBe(1)
  expect(clamp(5, -1, 1)).toBe(1)
  // any non-finite input (NaN or ±Infinity) drops to the floor — a junk volume
  // becomes silence, never a NaN or a max-volume blast into the mixer
  expect(clamp(Number.NaN, -1, 1)).toBe(-1)
  expect(clamp(Number.POSITIVE_INFINITY, 0, 1)).toBe(0)
  expect(clamp(Number.NEGATIVE_INFINITY, 0, 1)).toBe(0)
})

test('clampBipolar keeps values in range and centers junk at the midpoint', () => {
  expect(clampBipolar(0.5, -1, 1)).toBe(0.5)
  expect(clampBipolar(-2, -1, 1)).toBe(-1)
  expect(clampBipolar(2, -1, 1)).toBe(1)
  // a *bipolar* value (pan) must center on non-finite input, NOT floor to -1 the
  // way clamp() does — a junk pan should sit dead-center, never hard-pan one ear
  expect(clampBipolar(Number.NaN, -1, 1)).toBe(0)
  expect(clampBipolar(Number.POSITIVE_INFINITY, -1, 1)).toBe(0)
  expect(clampBipolar(Number.NEGATIVE_INFINITY, -1, 1)).toBe(0)
  // the midpoint follows the range, not a hard-coded 0
  expect(clampBipolar(Number.NaN, 0, 1)).toBe(0.5)
})

test('computePan centers (never hard-pans) on any non-finite input', () => {
  // a NaN/∞ yaw, source coordinate, or panStrength must yield a centered 0 pan —
  // the regression that floored these to -1 sent every such sound hard-left
  expect(computePan(facing(Number.NaN), at(5, 0, 0))).toBe(0)
  expect(computePan(facing(0), at(Number.NaN, 0, 0))).toBe(0)
  expect(computePan(facing(0), at(5, 0, 0), Number.NaN)).toBe(0)
  expect(computePan(facing(Number.POSITIVE_INFINITY), at(5, 0, 0))).toBe(0)
})

test('computePan: at yaw 0 (-Z forward) right is +X and left is -X', () => {
  const listener = facing(0)
  expect(computePan(listener, at(5, 0, 0))).toBe(1) // dead right
  expect(computePan(listener, at(-5, 0, 0))).toBe(-1) // dead left
  expect(computePan(listener, at(0, 0, -5))).toBe(0) // straight ahead
  expect(computePan(listener, at(0, 0, 5))).toBe(0) // directly behind (front/back not distinguished)
})

test('computePan rotates with listener yaw', () => {
  // yaw = +90° about +Y: the right axis becomes -Z, so a source at -Z is now hard right.
  const listener = facing(Math.PI / 2)
  expect(computePan(listener, at(0, 0, -5))).toBeCloseTo(1, 6)
  expect(computePan(listener, at(0, 0, 5))).toBeCloseTo(-1, 6)
  expect(computePan(listener, at(5, 0, 0))).toBeCloseTo(0, 6)
})

test('computePan ignores vertical offset and centers a source on the listener', () => {
  const listener = facing(0)
  // height never moves a sound left or right
  expect(computePan(listener, at(5, 100, 0))).toBe(1)
  // a source sitting on (or within epsilon of) the listener is centered, not NaN
  expect(computePan(listener, at(0, 0, 0))).toBe(0)
  expect(computePan(listener, at(0, 5, 0))).toBe(0)
})

test('computePan applies panStrength before the final clamp', () => {
  const listener = facing(0)
  expect(computePan(listener, at(5, 0, 0), 0.5)).toBe(0.5)
  expect(computePan(listener, at(-5, 0, 0), 0.5)).toBe(-0.5)
  // an over-unity strength still clamps to the legal stereo range
  expect(computePan(listener, at(5, 0, 0), 4)).toBe(1)
  expect(computePan(listener, at(0.0001, 0, 5), 0)).toBe(0)
})

test('computeAttenuation: full gain inside ref, silent past max, linear between', () => {
  const listener = facing(0)
  // defaults: full gain within 1 unit, silent at/after 50
  expect(computeAttenuation(listener, at(0.5, 0, 0))).toBe(1)
  expect(computeAttenuation(listener, at(DEFAULT_REF_DISTANCE, 0, 0))).toBe(1)
  expect(computeAttenuation(listener, at(DEFAULT_MAX_DISTANCE, 0, 0))).toBe(0)
  expect(computeAttenuation(listener, at(60, 0, 0))).toBe(0)

  // a clean linear midpoint with ref 0 / max 10
  const cfg = { refDistance: 0, maxDistance: 10 }
  expect(computeAttenuation(listener, at(5, 0, 0), cfg)).toBe(0.5)
  expect(computeAttenuation(listener, at(2.5, 0, 0), cfg)).toBe(0.75)
})

test('computeAttenuation counts full 3D distance, including height', () => {
  const listener = facing(0)
  const cfg = { refDistance: 0, maxDistance: 10 }
  // a source straight overhead is still "6 units away" and attenuates accordingly
  expect(computeAttenuation(listener, at(0, 6, 0), cfg)).toBeCloseTo(0.4, 6)
  // 3-4-5 triangle across X and Y => distance 5 => half gain
  expect(computeAttenuation(listener, at(3, 4, 0), cfg)).toBe(0.5)
})

test('computeAttenuation tolerates a max below ref by collapsing the band', () => {
  const listener = facing(0)
  // degenerate config: max clamped up to ref, so anything past ref is silent
  expect(computeAttenuation(listener, at(0, 0, 0), { refDistance: 5, maxDistance: 1 })).toBe(1)
  expect(computeAttenuation(listener, at(10, 0, 0), { refDistance: 5, maxDistance: 1 })).toBe(0)
})

test('spatialize returns pan and gain together', () => {
  const listener = facing(0)
  const s = spatialize(listener, at(5, 0, 0), { refDistance: 0, maxDistance: 10, panStrength: 1 })
  expect(s.pan).toBe(1)
  expect(s.gain).toBe(0.5)

  // panStrength only touches pan; gain stays a pure distance term
  const half = spatialize(listener, at(-5, 0, 0), { refDistance: 0, maxDistance: 10, panStrength: 0.5 })
  expect(half.pan).toBe(-0.5)
  expect(half.gain).toBe(0.5)
})
