// Layer 2 page: paint your sleep on the calendar, pick a body clock, and see
// sleep pressure (S) and the circadian wave (C) over the five days.
// The math is a browser copy of layer 2 in sleepmodel.js until model/sleep.py lands.

import { lineChart } from "./charts.js";
import { initSleepCalendar } from "./sleepcal.js";
import { sleepPressure, circadian } from "./sleepmodel.js";
import { publish } from "./shared.js";

const $ = (id) => document.getElementById(id);
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Chart covers the same five days as the calendar, in quarter hours.
const ts = Array.from({ length: 5 * 24 * 4 + 1 }, (_, i) => -48 + i / 4);

function draw(blocks) {
  const hours = blocks.reduce((sum, b) => sum + (b.endH - b.startH), 0);
  $("sleepSummary").textContent = `${blocks.length} block${blocks.length === 1 ? "" : "s"}, ${hours.toFixed(1)} h`;

  const peak = 17 + Number($("layer2Inputs").elements.chronotype.value);
  publish("layer2", { blocks, circadianPeakH: peak });
  const S = sleepPressure(ts, blocks);
  const C = circadian(ts, peak);

  const now = new Date();
  const nowH = now.getHours() + now.getMinutes() / 60;
  const i = ts.findIndex((t) => t >= nowH);
  $("pressureNow").textContent = `${Math.round(S[i] * 100)}% now`;

  lineChart($("pressureChart"), {
    series: [
      // C swings ±0.15; drawn around 0.5 so it shares the 0..1 axis with S.
      { xs: ts, ys: C.map((c) => 0.5 + c), color: cssVar("--muted"), dash: "5 4" },
      { xs: ts, ys: S, color: cssVar("--mint") },
    ],
    yMin: 0, yMax: 1,
    vline: { x: nowH, label: "Now" },
    tickStep: 24,
    formatTick: (h) => {
      const d = new Date(now); d.setDate(d.getDate() + Math.round(h / 24));
      return d.toLocaleDateString(undefined, { weekday: "short" });
    },
  });
}

export function startLayer2() {
  const cal = initSleepCalendar($("sleepCal"), draw);
  $("layer2Inputs").addEventListener("change", () => draw(cal.getBlocks()));
  window.addEventListener("resize", () => draw(cal.getBlocks()));
}
