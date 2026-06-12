import { expect, test } from 'bun:test'

import { DEFAULT_DEV_PARTYKIT_HOST, resolvePartyKitHost } from './host'

test('an explicitly configured host wins regardless of build mode', () => {
  expect(resolvePartyKitHost({ envHost: 'play.example.com', dev: true })).toBe('play.example.com')
  expect(resolvePartyKitHost({ envHost: 'play.example.com', dev: false })).toBe('play.example.com')
  expect(resolvePartyKitHost({ envHost: 'play.example.com' })).toBe('play.example.com')
})

test('dev builds without a configured host fall back to the local partykit dev server', () => {
  expect(resolvePartyKitHost({ dev: true })).toBe(DEFAULT_DEV_PARTYKIT_HOST)
  expect(resolvePartyKitHost({ envHost: '', dev: true })).toBe(DEFAULT_DEV_PARTYKIT_HOST)
  expect(resolvePartyKitHost({ envHost: undefined, dev: true })).toBe('localhost:1999')
})

test("prod with no host resolves to '' so games treat multiplayer as unconfigured", () => {
  expect(resolvePartyKitHost()).toBe('')
  expect(resolvePartyKitHost({})).toBe('')
  expect(resolvePartyKitHost({ envHost: '', dev: false })).toBe('')
  expect(resolvePartyKitHost({ envHost: undefined })).toBe('')
})
