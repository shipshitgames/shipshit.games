# Feature flags

A small, typed feature-flag seam lives in
[`src/flags.ts`](./src/flags.ts) and is re-exported from
`@shipshitgames/shared`. It exists so unfinished or environment-specific work
can merge to `master` **dark** — shipped in the build but inert until an env var
turns it on. That is what makes continuous merging to a single trunk safe.

This is intentionally the *lightest* mechanism that fits the stack (plain env
vars, no SaaS, no extra dependency). Reach for LaunchDarkly / Unleash / PostHog
flags only if/when runtime targeting, percentage rollouts, or per-user
overrides become a real need.

## Usage

```ts
import { isEnabled } from "@shipshitgames/shared";

if (!isEnabled("skoolFulfillment")) return false;
// ...flagged behaviour...
```

## Adding a flag

1. Register it in the `FLAGS` map in [`src/flags.ts`](./src/flags.ts):

   ```ts
   export const FLAGS = {
     skoolFulfillment: {
       env: "SKOOL_FULFILLMENT_ENABLED",
       description: "Send Skool community invites during Studio Pass fulfillment.",
     },
     // add yours here
   } as const satisfies Record<string, FlagDef>;
   ```

2. Gate the code path with `isEnabled("yourFlag")`. `FlagName` is the union of
   registered keys, so typos are a compile error.
3. Set the env var where the code runs (Vercel project env, `.env`, CI).
4. **Delete the flag** once the work it guards is permanently on. A flag is a
   temporary seam, not a config system — keep the registry short.

## Rules

- **Fails closed.** A flag is "on" only when its env var is one of
  `true` / `1` / `on` / `yes` (any case, whitespace trimmed). Unset or anything
  else is "off".
- **Server-only.** This seam is for **server** flags: `isEnabled` reads
  `process.env[...]` dynamically, which Next.js cannot inline into the client
  bundle, so it cannot deliver client/browser flags. For client/browser flags,
  use the PostHog seam in [`apps/web/lib/flags.ts`](../../apps/web/lib/flags.ts).
- **Operational env vars are not flags.** Mode switches like
  `CONTENT_SNAPSHOT_ONLY` (used in `apps/web/lib/github.ts` and
  `apps/web/lib/youtube.ts`) describe *how the app runs*, not *whether a feature
  is exposed*, so they stay as direct `process.env` reads. Use the flag registry
  for shippable features that need to merge dark.

## Why it matters for trunk-based development

With a flag seam in place, a half-finished feature can be merged behind
`isEnabled("…")=false` and continuously integrated against `master`, instead of
living on a long-running branch. Turning it on is an env-var change (and a
deploy), decoupled from the merge.
