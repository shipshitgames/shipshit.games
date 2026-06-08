// Typed facade over the canonical CommonJS manifest writer in ./manifest-core.cjs.
//
// The runtime intentionally lives in a dependency-free .cjs so there is a single
// register()/license validator shared by BOTH the Electron desktop main process
// (CommonJS) and assetgen's bun-run TypeScript — see issue #17 ("no generator may
// skip register"). Do not reimplement register or license validation here or in
// the desktop; import from this facade (TS) or require manifest-core.cjs (CJS).
export { register, assertLicenseRecord, REQUIRED_LICENSE_FIELDS } from "./manifest-core.cjs";
export type { AssetEntry, AssetLicenseRecord } from "./manifest-core.cjs";
