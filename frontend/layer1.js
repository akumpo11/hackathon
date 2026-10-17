// Layer 1 page: read the drinks and body inputs, run model/pk.py (in the browser
// via Pyodide), and show the caffeine curve. The math itself is only in Python.

import { clockToHours, hoursToClock } from "./api.js";
import { areaChart } from "./charts.js";
import { initDrinkPicker } from "./drinkpicker.js";
import { loadPython, toObject } from "./python.js";
import { publish } from "./shared.js";

const $ = (id) => document.getElementById(id);
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const form = $("layer1Inputs");
const DRINK_ROWS = 3;
let series = "bodyMg";     // which curve the chart shows: "bodyMg" or "conc"

function readInputs(drinks) {
  const el = form.elements;
  let bedtimeH = clockToHours(el.bedtime.value);
  if (bedtimeH < 12) bedtimeH += 24;                     // 1 AM bedtime means tonight, not this morning
  const doses = [];
  for (let i = 0; i < DRINK_ROWS; i++) {
    const label = el[`drink${i}`].value;
    if (label) doses.push({ timeH: clockToHours(el[`time${i}`].value), mg: drinks[label], label });
  }
  doses.sort((a, b) => a.timeH - b.timeH);
  return {
    doses, bedtimeH,
    weightKg: Number(el.weight.value),
    halfLifeH: Number(el.halfLife.value),
    smoker: el.smoker.checked,
    oralContraceptives: el.oralContraceptives.checked,
  };
}

function showSliderValues(x) {
  const out = (name, text) => { form.querySelector(`output[data-for="${name}"]`).textContent = text; };
  out("weight", `${x.weightKg} kg`);
  out("halfLife", `${x.halfLifeH.toFixed(1)} h`);
}

function showOutputs(x, r) {
  $("peakMin").textContent = Math.round(r.peakMin);
  $("pkEquation").textContent =
    `ke = ln 2 / ${r.halfLifeH.toFixed(1)} h = ${r.ke.toFixed(3)} per hour. ` +
    `Peak at ln(ka/ke) / (ka − ke) = ${Math.round(r.peakMin)} min, with ka = ${r.ka} per hour.`;

  $("outHalfLife").textContent = `${r.halfLifeH.toFixed(1)} h`;
  $("outCleared").textContent = `${Math.round(r.clearedPerHour * 100)}% of what's left`;
  $("outPeak").textContent = `${r.firstPeakConc.toFixed(1)} mg/L from ${r.firstMg} mg`;
  $("outBedtime").textContent = `${Math.round(r.bedtimeMg)} mg`;

  // Sleep check: the meter runs to twice the limit, so the limit mark sits in the middle.
  const ok = r.bedtimeMg <= r.limitMg;
  const meterMax = r.limitMg * 2;
  $("pkSleepChip").textContent = ok ? "Fine for sleep" : "Too much";
  $("pkSleepChip").className = `chip ${ok ? "ok" : "bad"}`;
  $("pkMeter").style.width = `${Math.min(100, (r.bedtimeMg / meterMax) * 100)}%`;
  $("pkMeter").classList.toggle("bad", !ok);
  $("pkLimit").style.left = `${(r.limitMg / meterMax) * 100}%`;
  $("pkSleepNote").textContent = ok
    ? `${Math.round(r.bedtimeMg)} mg left at ${hoursToClock(x.bedtimeH)}, under the ${r.limitMg} mg cutoff.`
    : `${Math.round(r.bedtimeMg)} mg left at ${hoursToClock(x.bedtimeH)}, over the ${r.limitMg} mg cutoff. Move your last drink earlier or make it smaller.`;

  drawChart(x, r);
}

function drawChart(x, r) {
  const ys = r[series];
  const unit = series === "bodyMg" ? "mg" : "mg/L";
  const step = series === "bodyMg" ? 25 : 0.5;
  const yMax = Math.max(step, Math.ceil((Math.max(...ys) * 1.15) / step) * step);
  areaChart($("pkChart"), {
    xs: r.t, ys, yMax,
    bands: [{ from: x.bedtimeH, to: x.bedtimeH + 8, color: cssVar("--night") }],
    markers: x.doses.map((d) => ({ x: d.timeH, label: `${d.mg} mg` })),
    formatTick: (h) => hoursToClock(h).replace(":00", ""),
    startX: x.doses.length ? x.doses[0].timeH + r.peakMin / 60 : r.t[0],
    onScrub: (i) => {
      $("pkReadout").textContent = series === "bodyMg" ? `${Math.round(ys[i])} mg` : `${ys[i].toFixed(2)} ${unit}`;
      $("pkReadoutTime").textContent = `at ${hoursToClock(r.t[i])}`;
    },
  });
}

export async function startLayer1() {
  const pyodide = await loadPython();
  const bridge = pyodide.pyimport("layer1_bridge");
  const drinks = toObject(bridge.drinkOptions());

  let last = null;
  const update = () => {
    const x = readInputs(drinks);
    publish("layer1", { doses: x.doses, weightKg: x.weightKg, halfLifeH: x.halfLifeH,
                        smoker: x.smoker, oralContraceptives: x.oralContraceptives });
    showSliderValues(x);
    const r = toObject(bridge.compute(JSON.stringify(x.doses), x.weightKg, x.halfLifeH,
                                      x.smoker, x.oralContraceptives, x.bedtimeH));
    last = { x, r };
    showOutputs(x, r);
  };
  initDrinkPicker(form, drinks, update);     // the drink list comes from model/params.py, so it waits for Python

  $("pkToggle").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    $("pkToggle").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === btn));
    series = btn.dataset.series;
    if (last) drawChart(last.x, last.r);
  });
  form.addEventListener("input", update);
  window.addEventListener("resize", update);
  update();
}
