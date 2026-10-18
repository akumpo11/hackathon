// Layer 4 page: take the drinks from layer 1, the sleep from layer 2 and the
// tolerance from layer 3, run model/alertness.py (in the browser via Pyodide),
// and show how alert you are.
// The math itself is only in the Python files.

import { hoursToClock, nowHours } from "./time.js";
import { areaChart, lineChart } from "./charts.js";
import { loadPython, toObject } from "./python.js";
import { shared, onShared, perFrame, onWidthChange } from "./shared.js";

const $ = (id) => document.getElementById(id);
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// The chart runs from 5 AM today to 5 AM tomorrow, every 0.1 h (the model's STEP_H).
const T0 = 5, STEP_H = 0.1, STEPS = 240;
const ts = Array.from({ length: STEPS + 1 }, (_, i) => T0 + i * STEP_H);

let compute = null;        // the Python function, once Pyodide has loaded
let last = null;           // the latest results, for redrawing and scrubbing

const pct = (v) => `${Math.round(v * 100)}%`;
const signed = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;

// Tags each input Low, Average or High, colored by what that means for alertness:
// green helps, yellow is in between, red hurts. For caffeine and the body clock
// higher helps; for sleep pressure and tolerance lower helps.
function tagLevel(id, value, low, high, higherHelps) {
  const word = value < low ? "Low" : value > high ? "High" : "Average";
  const helps = word === (higherHelps ? "High" : "Low");
  const hurts = word === (higherHelps ? "Low" : "High");
  $(id).textContent = word;
  $(id).className = `src ${helps ? "good" : hurts ? "bad" : "mid"}`;
}

// Everything for one moment: the readout, the inputs and the four outputs.
function showMoment(i, atNow) {
  const { r } = last;
  const S = r.pressure[i], circ = r.circadian[i], asleep = r.asleep[i];
  const conc = r.conc[i], felt = r.felt[i], groggy = r.inertia[i], alert = r.alertness[i];

  $("alertReadoutTime").textContent = atNow ? "right now" : `at ${hoursToClock(ts[i])}`;
  $("alertReadout").textContent = asleep ? "Asleep" : `${(alert * 10).toFixed(1)} / 10`;

  $("inConc").textContent = `${conc.toFixed(2)} mg/L`;
  $("inS").textContent = S.toFixed(2);
  $("inCirc").textContent = signed(circ);
  $("inR").textContent = `${last.R.toFixed(2)}x`;
  $("inKd").textContent = `${r.kd.toFixed(1)} mg/L`;

  // Cut points: caffeine by the share of receptors it blocks (under 20%, over 50%);
  // sleep pressure and the body clock split their ranges (0 to 1, ±0.15) about in thirds;
  // tolerance 1.2x is a light drinker, 1.6x a heavy one (1.0x is none).
  tagLevel("lvlConc", r.occupancy[i], 0.2, 0.5, true);
  tagLevel("lvlS", S, 0.4, 0.7, false);
  tagLevel("lvlCirc", circ, -0.05, 0.05, true);
  tagLevel("lvlR", last.R, 1.2, 1.6, false);

  $("outOcc").textContent = pct(r.occupancy[i]);
  $("outFelt").textContent = `${felt.toFixed(2)} of ${S.toFixed(2)}`;
  $("outInertia").textContent = groggy > 0.005 ? `−${groggy.toFixed(2)}` : "none";
  $("outAlert").textContent = alert.toFixed(2);

  lineChart($("occChart"), {
    series: [{ xs: r.chartConc, ys: r.chartOcc, color: cssVar("--accent") }],
    yMin: 0, yMax: 1, tickStep: 2,
    formatTick: (c) => `${c}`,
    points: [{ x: Math.min(conc, 10), y: r.occupancy[i], label: pct(r.occupancy[i]) }],
  });
}

function drawChart() {
  const { r } = last;
  const { layer1, layer2 } = shared;
  // While asleep, alertness isn't defined, so the curve drops to 0 and the night is shaded.
  const ys = r.alertness.map((a, i) => (r.asleep[i] ? 0 : a * 10));
  areaChart($("alertChart"), {
    xs: ts, ys, yMax: 10,
    bands: layer2.blocks.map((b) => ({ from: b.startH, to: b.endH, color: cssVar("--night"), label: b.isNap ? "Nap" : "Asleep", labelColor: cssVar("--night-ink") })),
    markers: layer1.doses.map((d) => ({ x: d.timeH, label: `${d.mg} mg` })),
    formatTick: (h) => hoursToClock(h).replace(":00", ""),
    nowX: nowHours,
    onScrub: showMoment,
  });
}

function update() {
  const { layer1, layer2, layer3 } = shared;
  if (!compute || !layer1 || !layer2 || !layer3) return;

  // Tolerance today: the receptors layer 3 says you have now, from your usual habit.
  const R = layer3.R;
  last = { R, r: toObject(compute(
    JSON.stringify(layer1.doses), JSON.stringify(layer2.blocks), JSON.stringify(ts), layer2.circadianPeakH,
    layer1.weightKg, layer1.halfLifeH, layer1.smoker, layer1.oralContraceptives, R,
  )) };
  drawChart();
}

export async function startLayer4() {
  const pyodide = await loadPython();
  compute = pyodide.pyimport("layer4_bridge").compute;

  const redo = perFrame(update);
  onWidthChange(update);
  onShared(redo);            // redo it whenever layer 1, 2 or 3 changes, once per frame
  // Each time you arrive on this page (the 4th), redraw so the dot is at the latest now.
  document.addEventListener("pageshown", (e) => { if (e.detail === 3 && last) drawChart(); });
  update();
}
