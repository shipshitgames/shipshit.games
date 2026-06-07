import { isActiveSubscriptionStatus } from "@shipshitgames/shared";

export function StatusPill({ status }: { status?: string | null }) {
  const active = isActiveSubscriptionStatus(status);
  return (
    <span
      className={
        active
          ? "rounded-full border border-hellfire/50 bg-hellfire/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-hellfire"
          : "rounded-full border border-gunmetal bg-iron px-3 py-1 text-xs font-bold uppercase tracking-widest text-ash"
      }
    >
      {status ?? "inactive"}
    </span>
  );
}
