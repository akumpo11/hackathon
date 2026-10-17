// Layer 4 page: take the drinks from layer 1 and the sleep from layer 2, run
// model/alertness.py (in the browser via Pyodide), and show how alert you are.
// The math itself is only in the Python files.

import { hoursToClock } from "./api.js";
import { areaChart, lineChart } from "./charts.js";
import { loadPython, toObject } from "./python.js";
import { shared, onShared, perFrame, onWidthChange } from "./shared.js";

const $ = (id) => document.getElementById(id);
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const form = $("layer4Inputs");

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
  const { r } = last;
  const S = r.pressure[i], circ = r.circadian[i], asleep = r.asleep[i];
  const conc = r.conc[i], felt = r.felt[i], groggy = r.inertia[i], alert = r.alertness[i];

  $("alertWhen").textContent = `at ${hoursToClock(ts[i])}`;
  $("alertReadoutTime").textContent = `at ${hoursToClock(ts[i])}`;
  $("alertScore").textContent = asleep ? "Zz" : (alert * 10).toFixed(1);
  $("alertSub").textContent = asleep ? "asleep" : "out of 10";
  $("alertReadout").textContent = asleep ? "Asleep" : `${(alert * 10).toFixed(1)} / 10`;

  $("inConc").textContent = `${conc.toFixed(2)} mg/L`;
  $("inS").textContent = S.toFixed(2);
  $("inCirc").textContent = signed(circ);

  $("outOcc").textContent = pct(r.occupancy[i]);
  $("outFelt").textContent = `${felt.toFixed(2)} of ${S.toFixed(2)}`;
  $("outInertia").textContent = groggy > 0.005 ? `−${groggy.toFixed(2)}` : "none";
  $("outAlert").textContent = alert.toFixed(2);

  // The formula with this moment's numbers plugged in. The model clips the result to 0..1.
  const raw = 1 - felt + circ - groggy;
  $("equation").textContent = asleep
    ? "You're asleep, so alertness isn't scored."
    : `1 − ${felt.toFixed(2)} ${circ >= 0 ? "+" : "−"} ${Math.abs(circ).toFixed(2)} − ${groggy.toFixed(2)} = ${raw.toFixed(2)}` +
      (raw > 1 || raw < 0 ? `, capped at ${Math.round(alert)}` : "");

  lineChart($("occChart"), {
    series: [{ xs: r.chartConc, ys: r.chartOcc, color: cssVar("--mint") }],
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

  last = { r: toObject(compute(
    JSON.stringify(layer1.doses), JSON.stringify(layer2.blocks), JSON.stringify(ts), layer2.circadianPeakH,
    layer1.weightKg, layer1.halfLifeH, layer1.smoker, layer1.oralContraceptives, x.kd, x.R,
  )) };
  drawChart();
}

export async function startLayer4() {
  const pyodide = await loadPython();
  compute = pyodide.pyimport("layer4_bridge").compute;

  const redo = perFrame(update);
  form.addEventListener("input", redo);
  onWidthChange(update);
  onShared(redo);            // redo it whenever an earlier page changes, once per frame
  update();
}
