/**
 * @shipshitgames/warline — derived snapshot for HUDs (spec §7).
 */

import type { Summary, WorldState } from "./types";
import { clamp } from "./map";

/** Pure derivation of headline war stats from a WorldState. */
export function summarize(state: WorldState): Summary {
  const control = { pyre: 0, wardens: 0, scourge: 0, neutral: 0 };
  for (const r of state.regions) {
    control[r.faction] += 1;
  }

  const regionsHuman = control.pyre + control.wardens;
  const regionsScourge = control.scourge;
  const regionsNeutral = control.neutral;
  const contested = regionsHuman + regionsScourge;
  const frontControlPct =
    contested > 0 ? (regionsHuman / contested) * 100 : 0;

  // threat: mean pressure over human+neutral regions, plus 0.3× mean active-breach intensity.
  let pressureSum = 0;
  let pressureCount = 0;
  for (const r of state.regions) {
    if (r.faction === "scourge") continue;
    pressureSum += r.pressure;
    pressureCount += 1;
  }
  const meanPressure = pressureCount > 0 ? pressureSum / pressureCount : 0;

  let breachSum = 0;
  let activeBreaches = 0;
  for (const b of state.breaches) {
    if (!b.active) continue;
    breachSum += b.intensity;
    activeBreaches += 1;
  }
  const meanBreach = activeBreaches > 0 ? breachSum / activeBreaches : 0;

  const threat = clamp(meanPressure + 0.3 * meanBreach, 0, 100);

  return {
    regionsTotal: state.regions.length,
    regionsHuman,
    regionsScourge,
    regionsNeutral,
    control,
    frontControlPct,
    threat,
    activeBreaches,
    army: state.pactArmy,
    resources: { ...state.resources },
  };
}
