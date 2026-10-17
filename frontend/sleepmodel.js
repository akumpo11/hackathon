// Browser preview of layer 2 (equations/layer-2-sleep.md), so the Sleep tab can
// show sleep pressure as you paint. The real model is model/sleep.py; keep the two in step.

const TAU_WAKE_H = 18.2;
const TAU_SLEEP_H = 4.2;
const STEP_H = 0.1;
const BURN_IN_H = 48;
const CIRCADIAN_AMP = 0.15;

// Process S, marched forward in exact steps of dS/dt = -S/tau_s (asleep) and (1-S)/tau_w (awake).
export function sleepPressure(ts, blocks) {
  const t0 = ts[0] - BURN_IN_H, t1 = ts[ts.length - 1];
  const fineT = [], fineS = [];
  let S = 0.5;
  for (let t = t0; t <= t1 + STEP_H; t += STEP_H) {
    const asleep = blocks.some((b) => t >= b.start_h && t < b.end_h);
    S = asleep ? S * Math.exp(-STEP_H / TAU_SLEEP_H) : 1 - (1 - S) * Math.exp(-STEP_H / TAU_WAKE_H);
    fineT.push(t); fineS.push(S);
  }
  return ts.map((t) => fineS[Math.min(fineS.length - 1, Math.max(0, Math.round((t - t0) / STEP_H)))]);
}

// Process C, first harmonic only.
export const circadian = (ts, peakH) => ts.map((t) => CIRCADIAN_AMP * Math.cos((2 * Math.PI * (t - peakH)) / 24));
