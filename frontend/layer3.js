// Layer 3 page: read the sliders, run model/alertness.py (in the browser via
// Pyodide), and show the result. The math itself is only in the Python file.

import { lineChart } from "./charts.js";
import { loadPython } from "./python.js";

const $ = (id) => document.getElementById(id);
const form = $("layer3Inputs");

// The shared Python (python.js) already has model/alertness.py and layer3_bridge.py on its disk.
async function loadModel() {
  const pyodide = await loadPython();
  return pyodide.pyimport("layer3_bridge").compute;
}

function readInputs() {
  const v = (name) => Number(form.elements[name].value);
  return {
    S: v("S"), conc: v("conc"), kd: v("kd"), R: v("R"), circ: v("circ"),
    sleepLen: v("sleepLen"), minutesSince: v("minutesSince"),
  };
}

// Show each slider's current value next to its label.
function showSliderValues(x) {
  const out = (name, text) => { form.querySelector(`output[data-for="${name}"]`).textContent = text; };
  out("S", x.S.toFixed(2));
  out("conc", `${x.conc.toFixed(1)} mg/L`);
  out("kd", `${x.kd.toFixed(1)} mg/L`);
  out("R", `${x.R.toFixed(2)}x`);
  out("circ", `${x.circ >= 0 ? "+" : ""}${x.circ.toFixed(2)}`);
}

function showOutputs(x, r) {
  const pct = (v) => `${Math.round(v * 100)}%`;
  $("alertScore").textContent = (r.alertness * 10).toFixed(1);
  $("outOcc").textContent = pct(r.occupancy);
  $("outFelt").textContent = `${r.felt.toFixed(2)} of ${x.S.toFixed(2)}`;
  $("outInertia").textContent = r.inertia > 0.005 ? `−${r.inertia.toFixed(2)}` : "none";
  $("outAlert").textContent = r.alertness.toFixed(2);

  // The formula with this moment's numbers plugged in. The model clips the result to 0..1.
  const raw = 1 - r.felt + x.circ - r.inertia;
  const sign = (v) => (v >= 0 ? `+ ${v.toFixed(2)}` : `− ${Math.abs(v).toFixed(2)}`);
  $("equation").textContent =
    `1 − ${r.felt.toFixed(2)} ${sign(x.circ)} − ${r.inertia.toFixed(2)} = ${raw.toFixed(2)}` +
    (raw > 1 || raw < 0 ? `, capped at ${r.alertness.toFixed(0)}` : "");

  lineChart($("occChart"), {
    series: [{ xs: r.chartConc, ys: r.chartOcc, color: getComputedStyle(document.documentElement).getPropertyValue("--mint").trim() }],
    yMin: 0, yMax: 1, tickStep: 2,
    formatTick: (c) => `${c}`,
    points: [{ x: x.conc, y: r.occupancy, label: pct(r.occupancy) }],
  });
}

export async function startLayer3() {
  const compute = await loadModel();
  const update = () => {
    const x = readInputs();
    showSliderValues(x);
    // Python returns a dict; toJs turns it into a plain JavaScript object.
    const r = compute(x.S, x.conc, x.kd, x.R, x.circ, x.sleepLen, x.minutesSince)
      .toJs({ dict_converter: Object.fromEntries });
    showOutputs(x, r);
  };
  form.addEventListener("input", update);
  window.addEventListener("resize", update);
  update();
}
