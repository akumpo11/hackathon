// Layer 3 page: take the drinks from layer 1 and the sleep from layer 2, run
// model/alertness.py (in the browser via Pyodide), and show how alert you are.
// The math itself is only in the Python file.

import { hoursToClock } from "./api.js";
import { areaChart, lineChart } from "./charts.js";
import { loadPython, toObject } from "./python.js";
import { shared, onShared } from "./shared.js";
// Layer 2's sleep pressure and body clock, from its browser copy until model/sleep.py exists.
import { sleepPressure, circadian } from "./sleepmodel.js";

const $ = (id) => document.getElementById(id);
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const form = $("layer3Inputs");

// The chart runs from 5 AM today to 5 AM tomorrow, every 0.1 h (the model's STEP_H).
const T0 = 5, STEP_H = 0.1, STEPS = 240;
const ts = Array.from({ length: STEPS + 1 }, (_, i) => T0 + i * STEP_H);

let compute = null;        // the Python function, once Pyodide has loaded
let last = null;           // the latest results, for redrawing and scrubbing
let momentH = 9;           // the moment you picked by dragging the chart (9 AM to start)

const pct = (v) => `${Math.round(v * 100)}%`;
const signed = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;

function readInputs() {
  return { kd: Number(form.elements.kd.value), R: Number(form.elements.R.value) };
}

function showSliderValues(x) {
  const out = (name, text) => { form.querySelector(`output[data-for="${name}"]`).textContent = text; };
  out("kd", `${x.kd.toFixed(1)} mg/L`);
  out("R", `${x.R.toFixed(2)}x`);
}

// Everything for one moment: the three inputs, the four outputs, and the equation.
function showMoment(i) {
  const { r, S, C, asleep } = last;
  const conc = r.conc[i], felt = r.felt[i], groggy = r.inertia[i], alert = r.alertness[i];

  $("alertWhen").textContent = `at ${hoursToClock(ts[i])}`;
  $("alertReadoutTime").textContent = `at ${hoursToClock(ts[i])}`;
  $("alertScore").textContent = asleep[i] ? "Zz" : (alert * 10).toFixed(1);
  $("alertSub").textContent = asleep[i] ? "asleep" : "out of 10";
  $("alertReadout").textContent = asleep[i] ? "Asleep" : `${(alert * 10).toFixed(1)} / 10`;

  $("inConc").textContent = `${conc.toFixed(2)} mg/L`;
  $("inS").textContent = S[i].toFixed(2);
  $("inCirc").textContent = signed(C[i]);

  $("outOcc").textContent = pct(r.occupancy[i]);
  $("outFelt").textContent = `${felt.toFixed(2)} of ${S[i].toFixed(2)}`;
  $("outInertia").textContent = groggy > 0.005 ? `−${groggy.toFixed(2)}` : "none";
  $("outAlert").textContent = alert.toFixed(2);

  // The formula with this moment's numbers plugged in. The model clips the result to 0..1.
  const raw = 1 - felt + C[i] - groggy;
  $("equation").textContent = asleep[i]
    ? "You're asleep, so alertness isn't scored."
    : `1 − ${felt.toFixed(2)} ${C[i] >= 0 ? "+" : "−"} ${Math.abs(C[i]).toFixed(2)} − ${groggy.toFixed(2)} = ${raw.toFixed(2)}` +
      (raw > 1 || raw < 0 ? `, capped at ${Math.round(alert)}` : "");

  lineChart($("occChart"), {
    series: [{ xs: r.chartConc, ys: r.chartOcc, color: cssVar("--mint") }],
    yMin: 0, yMax: 1, tickStep: 2,
    formatTick: (c) => `${c}`,
    points: [{ x: Math.min(conc, 10), y: r.occupancy[i], label: pct(r.occupancy[i]) }],
  });
}

function drawChart() {
  const { r, asleep } = last;
  const { layer1, layer2 } = shared;
  // While asleep, alertness isn't defined, so the curve drops to 0 and the night is shaded.
  const ys = r.alertness.map((a, i) => (asleep[i] ? 0 : a * 10));
  areaChart($("alertChart"), {
    xs: ts, ys, yMax: 10,
    bands: layer2.blocks.map((b) => ({ from: b.startH, to: b.endH, color: cssVar("--night") })),
    markers: layer1.doses.map((d) => ({ x: d.timeH, label: `${d.mg} mg` })),
    formatTick: (h) => hoursToClock(h).replace(":00", ""),
    startX: momentH,
    onScrub: (i) => { momentH = ts[i]; showMoment(i); },
  });
}

function update() {
  const { layer1, layer2 } = shared;
  if (!compute || !layer1 || !layer2) return;

  const x = readInputs();
  showSliderValues(x);

  const S = sleepPressure(ts, layer2.blocks);
  const C = circadian(ts, layer2.circadianPeakH);
  const asleep = ts.map((t) => layer2.blocks.some((b) => t >= b.startH && t < b.endH));

  const r = toObject(compute(
    JSON.stringify(layer1.doses), JSON.stringify(layer2.blocks),
    JSON.stringify(ts), JSON.stringify(S), JSON.stringify(C),
    layer1.weightKg, layer1.halfLifeH, layer1.smoker, layer1.oralContraceptives, x.kd, x.R,
  ));
  last = { r, S, C, asleep };
  drawChart();
}

export async function startLayer3() {
  const pyodide = await loadPython();
  compute = pyodide.pyimport("layer3_bridge").compute;

  form.addEventListener("input", update);
  window.addEventListener("resize", update);
  onShared(update);          // redo it whenever layer 1 or layer 2 changes
  update();
}
