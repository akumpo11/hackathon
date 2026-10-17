// Layer 2 page: paint your sleep on the calendar, pick a body clock, and see
// sleep pressure (S) and the circadian wave (C) over the five days.
// The math runs in model/sleep.py (in the browser via Pyodide); this file only draws.

import { lineChart } from "./charts.js";
import { loadPython, toObject } from "./python.js";
import { initSleepCalendar } from "./sleepcal.js";
import { publish, shared, onShared } from "./shared.js";

const $ = (id) => document.getElementById(id);
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

let compute = null;   // layer2_bridge.compute, once Python has loaded

function draw(blocks) {
  const hours = blocks.reduce((sum, b) => sum + (b.endH - b.startH), 0);
  $("sleepSummary").textContent = `${blocks.length} block${blocks.length === 1 ? "" : "s"}, ${hours.toFixed(1)} h`;
  // Tell later pages (layer 4) what your sleep and body clock are.
  // The body clock comes from personal settings (settings.js), not this page.
  const shiftH = shared.settings.chronotypeShiftH;
  publish("layer2", { blocks, circadianPeakH: 17 + shiftH });

  if (!compute) return;   // the calendar works right away; the chart waits for Python

  const now = new Date();
  const nowH = now.getHours() + now.getMinutes() / 60;
  const r = toObject(compute(JSON.stringify(blocks), shiftH, nowH));
  $("pressureNow").textContent = `${Math.round(r.pressureNow * 100)}% now`;

  lineChart($("pressureChart"), {
    series: [
      // C swings ±0.15; drawn around 0.5 so it shares the 0..1 axis with S.
      { xs: r.t, ys: r.circadian.map((c) => 0.5 + c), color: cssVar("--muted"), dash: "5 4" },
      { xs: r.t, ys: r.pressure, color: cssVar("--accent") },
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

export async function startLayer2() {
  const cal = initSleepCalendar($("sleepCal"), draw);
  window.addEventListener("resize", () => draw(cal.getBlocks()));
  // Redraw when personal settings change. Only then: draw() publishes too, and
  // reacting to its own publish would loop forever.
  let seenSettings = shared.settings;
  onShared(() => {
    if (shared.settings === seenSettings) return;
    seenSettings = shared.settings;
    draw(cal.getBlocks());
  });

  const pyodide = await loadPython();
  compute = pyodide.pyimport("layer2_bridge").compute;
  draw(cal.getBlocks());
}
