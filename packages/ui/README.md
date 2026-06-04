# @shipshitgames/ui

Shared Ship Shit Games UI system.

The cross-game contract is CSS first:

```ts
import "@shipshitgames/ui/styles.css";
```

Use the `ssg-*` classes in every game, including vanilla TS/Three games:

- `ssg-menu-screen`
- `ssg-menu-panel`
- `ssg-menu-title`
- `ssg-menu-kicker`
- `ssg-button`
- `ssg-button--primary`
- `ssg-button--ghost`
- `ssg-button--stack`
- `ssg-button--back`
- `ssg-upgrade-card`
- `ssg-hud-corner`
- `ssg-stat-label`
- `ssg-stat-value`

React games can additionally import wrappers:

```tsx
import { Button, Card, UpgradeCard } from "@shipshitgames/ui";
```

## Style

The style is the locked Scourge universe bible:

- Near-black void, coal, iron, gunmetal.
- Blood red primary actions.
- Hellfire orange focus/hover/accent.
- Bone text and ash secondary text.
- Toxic green only for Scourge infection, breach cores, or parasite nodes.
- Hard edges, no soft rounded app UI.
- No cyan, magenta, purple, pastel, clean sci-fi, or shadcn default theme.

Generated UI mockups are reference art only. The shipped UI must be real DOM or React
controls using these classes.
