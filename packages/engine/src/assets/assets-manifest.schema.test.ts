/**
 * Contract test for the published assets-manifest JSON Schema (issue #76).
 *
 * The schema ships as a package export (`@shipshitgames/engine/assets-manifest.schema.json`)
 * and declares the draft 2020-12 dialect, so it must itself be a *valid* 2020-12
 * schema — not just "JSON that looks schema-ish". We compile it with Ajv's 2020
 * validator, which meta-validates it against the dialect on compile. This is a
 * real regression guard: the sprite cue map previously used draft-07's array-form
 * `items` (tuple syntax), which 2020-12 removed in favour of `prefixItems`; that
 * form makes Ajv throw here, so this test fails the moment the schema regresses.
 */
import { expect, test } from 'bun:test'
import Ajv2020 from 'ajv/dist/2020'

import schema from './assets-manifest.schema.json'

const compile = () => new Ajv2020({ strict: false }).compile(schema as object)

test('the manifest schema declares and meta-validates under draft 2020-12', () => {
  expect((schema as { $schema: string }).$schema).toBe('https://json-schema.org/draft/2020-12/schema')
  // compile() meta-validates the schema against the 2020-12 dialect and throws if
  // it is not a legal schema (e.g. array-form `items` instead of `prefixItems`).
  expect(() => compile()).not.toThrow()
})

test('a #21/#76-shaped manifest with sprite cues validates', () => {
  const validate = compile()
  const ok = validate({
    assets: [
      { id: 'menu', kind: 'music', path: 'menu.webm', category: 'music', volume: 0.6, loop: true, duration: 90 },
      { id: 'laser', kind: 'sfx', path: 'laser.webm', category: 'sfx', volume: 0.9 },
      // one-file-many-cues sheet: 2-tuple and 3-tuple (with the optional loop flag)
      { id: 'ui', kind: 'sfx', path: 'ui.webm', sprite: { click: [0, 120], loopHum: [200, 400, true] } },
    ],
  })
  expect(validate.errors ?? []).toEqual([])
  expect(ok).toBe(true)
})

test('the schema rejects malformed audio entries and sprite cues', () => {
  const validate = compile()
  // missing the required `assets` array
  expect(validate({})).toBe(false)
  // a sprite cue must be [offsetMs, durationMs] (+ optional loop): too short,
  // non-numeric offset, and too long must all fail.
  expect(validate({ assets: [{ id: 'a', kind: 'sfx', path: 'a.webm', sprite: { c: [0] } }] })).toBe(false)
  expect(validate({ assets: [{ id: 'a', kind: 'sfx', path: 'a.webm', sprite: { c: ['x', 1] } }] })).toBe(false)
  expect(validate({ assets: [{ id: 'a', kind: 'sfx', path: 'a.webm', sprite: { c: [0, 1, true, 9] } }] })).toBe(false)
  // category is constrained to the audio playback buses
  expect(validate({ assets: [{ id: 'a', kind: 'sfx', path: 'a.webm', category: 'haptics' }] })).toBe(false)
  // authoring volume stays in [0, 1]
  expect(validate({ assets: [{ id: 'a', kind: 'sfx', path: 'a.webm', volume: 2 }] })).toBe(false)
})
