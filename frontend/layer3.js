// Layer 3 page: read your caffeine habit and exam date, run model/tolerance.py
// (in the browser via Pyodide), and show coffee strength and the reset plan.
// The math itself is only in the Python file.

import { lineChart } from "./charts.js";
import { loadPython, toObject } from "./python.js";
import { publish, shared, onShared, perFrame, onWidthChange } from "./shared.js";

const $ = (id) => document.getElementById(id);
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const form = $("layer3Inputs");

let compute = null;        // layer3_bridge.compute, once Python has loaded
let last = null;           // the latest results, for redrawing
let series = "R";          // which curve the chart shows: "R" or "withdrawal"

// "in 3 days" -> "Tue, Oct 20", so the plan reads like a calendar.
function dayToDate(day) {
  const d = new Date();
  d.setDate(d.getDate() + day);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function readInputs() {
  // Your habit comes from personal settings (settings.js). The exam date is about
  // the event, not you, so it stays on this page.
  const s = shared.settings;
  // Body and drink come from layer 1 if it has loaded; otherwise your settings and no drinks yet.
  const body = shared.layer1 ?? { ...s, doses: [] };
  return {
    habitualMg: s.habitualMgPerDay, habitWeeks: s.habitWeeks,
    examInDays: Number(form.elements.examInDays.value),
    body, doseMg: body.doses[0]?.mg ?? 95,
  };
}

function showSliderValues(x) {
  const out = (name, text) => { form.querySelector(`output[data-for="${name}"]`).textContent = text; };
  out("examInDays", x.examInDays === 0 ? "today" : `${x.examInDays} day${x.examInDays === 1 ? "" : "s"}`);
}

function showOutputs(x, r) {
  const plan = r.plan;
  $("strengthNow").textContent = `${Math.round(r.strengthNow)}%`;
  $("feelsLike").textContent = `Your ${r.doseMg} mg feels like ${Math.round(r.feelsLikeMg)} mg`;
  $("tolEquation").textContent = `${r.nowR.toFixed(2)}x a non-drinker's receptors`;

  $("resetChip").textContent = plan.reset ? (plan.taperDays ? `${plan.taperDays}-day taper` : "Cold turkey") : "Keep your habit";
  $("resetChip").className = `chip ${plan.reset || plan.nowR <= 1.1 ? "ok" : "bad"}`;
  // The chip already says how (taper or cold turkey), so the line only adds when.
  $("resetReason").textContent = plan.reset
    ? `Start ${dayToDate(plan.quitInDays)}. Worst day: ${dayToDate(plan.worstDay)}.`
    : plan.reason;

  $("outDaysNeeded").textContent = plan.daysNeeded ? `${plan.daysNeeded} days` : "none";
  $("outExamR").textContent = `${plan.examR.toFixed(2)}x`;
  $("outStrengthExam").textContent = `${Math.round(r.strengthAtExam)}%`;

  drawChart(x, r);
}

function drawChart(x, r) {
  const { plan, recommended: rec, coldTurkeyToday: cold } = r;
  const ys = (run) => run[series];
  const isR = series === "R";
  const top = Math.max(...ys(rec), ...ys(cold));
  // Receptors start at 1 (a non-drinker); withdrawal starts at 0. Leave headroom for the labels.
  const yMin = isR ? 1 : 0;
  const yMax = isR ? Math.max(1.2, top + 0.1) : Math.max(0.1, top * 1.25);

  const examDay = x.examInDays;
  const points = isR
    ? [{ x: examDay, y: rec.R[examDay], label: `${rec.R[examDay].toFixed(2)}x` }]
    : plan.reset ? [{ x: plan.worstDay, y: plan.peakWithdrawal, label: `+${Math.round(plan.peakWithdrawal * 100)}%` }] : [];

  $("resetChartNote").textContent = isR
    ? "Extra adenosine receptors, 1.0x is a non-drinker. They fall back toward 1 once you stop."
    : "How much sleepier you feel than a non-drinker with no caffeine. Worst on the first day without it.";

  lineChart($("resetChart"), {
    series: [
      { xs: cold.day, ys: ys(cold), color: cssVar("--muted"), dash: "5 4" },
      { xs: rec.day, ys: ys(rec), color: cssVar("--accent") },
    ],
    yMin, yMax,
    vline: { x: examDay, label: "Exam" },
    points,
    tickStep: rec.day.length > 14 ? 4 : 2,
    formatTick: (d) => (d === 0 ? "Today" : dayToDate(d).split(", ")[1]),
  });
}

function update() {
  if (!compute) return;
  const x = readInputs();
  showSliderValues(x);
  const { body } = x;
  const r = toObject(compute(x.habitualMg, x.habitWeeks, x.examInDays,
                             body.weightKg, body.halfLifeH, body.smoker, body.oralContraceptives, x.doseMg));
  last = { x, r };
  // Tell layer 4 your tolerance: receptors now, and on exam day if you follow the plan.
  publish("layer3", { R: r.nowR, examR: r.plan.examR, habitualMgPerDay: x.habitualMg });
  showOutputs(x, r);
}

export async function startLayer3() {
  const pyodide = await loadPython();
  compute = pyodide.pyimport("layer3_bridge").compute;

  $("resetToggle").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    $("resetToggle").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === btn));
    series = btn.dataset.series;
    if (last) drawChart(last.x, last.r);
  });
  const redo = perFrame(update);
  form.addEventListener("input", redo);
  onWidthChange(update);
  // Redo it when layer 1's body or drinks change, or your settings (your habit).
  // Only then: this page publishes too, and reacting to its own publish would loop forever.
  let seenLayer1 = shared.layer1, seenSettings = shared.settings;
  onShared(() => {
    if (shared.layer1 === seenLayer1 && shared.settings === seenSettings) return;
    seenLayer1 = shared.layer1;
    seenSettings = shared.settings;
    redo();
  });
  update();
}
