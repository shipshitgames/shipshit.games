import { STATUS_LABELS, type GameStatus } from "@shipshitgames/shared";

import { Badge } from "@/components/ui/badge";

const STATUS_STYLES: Record<GameStatus, string> = {
  finished: "border-toxic/60 bg-toxic/10 text-toxic",
  playable: "border-hellfire/60 bg-hellfire/10 text-hellfire",
  prototype: "border-rust/70 bg-rust/15 text-bone",
  "in-dev": "border-gunmetal bg-iron text-ash",
  concept: "border-gunmetal bg-void text-ash",
};

export function StatusBadge({ status }: { status: GameStatus }) {
  return (
    <Badge
      variant="outline"
      className={`font-display uppercase tracking-widest ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}
