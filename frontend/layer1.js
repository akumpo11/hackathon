// Layer 1 page: read the drinks and body inputs, run model/pk.py (in the browser
// via Pyodide), and show the caffeine curve. The math itself is only in Python.

import { clockToHours, hoursToClock, nowHours } from "./time.js";
import { areaChart } from "./charts.js";
import { initDrinkPicker, drinkMg } from "./drinkpicker.js";
import { loadPython, toObject } from "./python.js";
import { publish, shared, onShared, perFrame, onWidthChange } from "./shared.js";

const $ = (id) => document.getElementById(id);
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const form = $("layer1Inputs");
// The rows you start with. Add as many more as you drank; remove any with ×.
const START_DRINKS = [{ time: "08:00", drink: "drip coffee (8 oz)" }, { time: "13:00", drink: "drip coffee (8 oz)" }];
let nextSlot = 0;          // each row gets a new number (time3, drink3), never reused after a remove
let series = "bodyMg";     // which curve the chart shows: "bodyMg" or "conc"

function readInputs(drinks) {
  const el = form.elements;
  let bedtimeH = clockToHours(el.bedtime.value);
  if (bedtimeH < 12) bedtimeH += 24;                     // 1 AM bedtime means tonight, not this morning
  const doses = [...$("drinkRows").children].map((row) => {
    const i = row.dataset.slot;
    const input = el[`drink${i}`];
    return { timeH: clockToHours(el[`time${i}`].value), mg: drinkMg(input, drinks), label: input.value };
  });
  doses.sort((a, b) => a.timeH - b.timeH);
  // Your body comes from personal settings (settings.js), not this page.
  const s = shared.settings;
  return {
    doses, bedtimeH,
    weightKg: s.weightKg,
    halfLifeH: s.halfLifeH,
    smoker: s.smoker,
    oralContraceptives: s.oralContraceptives,
  };
}

// One drink row: a time, the drink button (drinkpicker.js fills it in), and × to remove it.
function drinkRow(time, drink) {
  const i = nextSlot++;
  const row = document.createElement("div");
  row.className = "row drink-row";
  row.dataset.slot = i;
  row.innerHTML = `
    <label class="field">Time<input type="time" name="time${i}" value="${time}"></label>
    <div class="field"><span id="drinkLabel${i}">Drink</span><input type="hidden" name="drink${i}" value="${drink}"><button type="button" class="drink-pick" data-slot="${i}" aria-haspopup="dialog" aria-labelledby="drinkLabel${i} drinkPick${i}" id="drinkPick${i}"></button></div>
    <button type="button" class="drink-remove" aria-label="Remove this drink">×</button>`;
  return row;
}

// A new drink starts as a drip coffee now (to the nearest 15 minutes), since
// "I just had another one" is the usual reason to add a row.
function newDrinkTime() {
  const quarters = Math.round(nowHours() * 4) % 96;
  return `${String(Math.floor(quarters / 4)).padStart(2, "0")}:${String((quarters % 4) * 15).padStart(2, "0")}`;
}

// The peak tag follows the clock. Every drink peaks the same time after it
// (pk.py peakTimeH), so it counts down to a drink that's still climbing, or
// else says when your last drink topped out.
function peakTag(doses, peakMin) {
  const now = nowHours();
  const peakH = peakMin / 60;
  const taken = doses.filter((d) => d.timeH <= now);
  const climbing = taken.find((d) => now < d.timeH + peakH);
  if (climbing) return `Peaks in ${Math.ceil((climbing.timeH + peakH - now) * 60)} min`;
  if (taken.length) return `Peaked at ${hoursToClock(taken[taken.length - 1].timeH + peakH)}`;
  return `Peaks ${Math.round(peakMin)} min after a drink`;
}

function showOutputs(x, r) {
  $("pkPeakTag").textContent = peakTag(x.doses, r.peakMin);
  $("outHalfLife").textContent = `${r.halfLifeH.toFixed(1)} h`;
  $("outCleared").textContent = `${Math.round(r.clearedPerHour * 100)}% of what's left`;
  $("outPeak").textContent = `${r.firstPeakConc.toFixed(1)} mg/L from ${r.firstMg} mg`;

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
    : `${Math.round(r.bedtimeMg)} mg left at ${hoursToClock(x.bedtimeH)}, over the ${r.limitMg} mg cutoff. Drink earlier or less.`;

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
    peaks: x.doses.map((d) => d.timeH + r.peakMin / 60),     // every drink peaks the same time after it
    formatTick: (h) => hoursToClock(h).replace(":00", ""),
    nowX: nowHours,
    startX: x.doses.length ? x.doses[0].timeH + r.peakMin / 60 : r.t[0],
    onScrub: (i, atNow) => {
      $("pkReadout").textContent = series === "bodyMg" ? `${Math.round(ys[i])} mg` : `${ys[i].toFixed(2)} ${unit}`;
      $("pkReadoutTime").textContent = atNow ? "right now" : `at ${hoursToClock(r.t[i])}`;
    },
  });
}

export async function startLayer1() {
  // Tonight's bedtime starts as your usual one from personal settings. You can
  // change it here for tonight; a new usual bedtime in settings resets it.
  form.elements.bedtime.value = shared.settings.bedtime;
  let seenBedtime = shared.settings.bedtime;
  onShared(() => {
    if (shared.settings.bedtime === seenBedtime) return;
    seenBedtime = shared.settings.bedtime;
    form.elements.bedtime.value = seenBedtime;
  });

  const pyodide = await loadPython();
  const bridge = pyodide.pyimport("layer1_bridge");
  const drinks = toObject(bridge.drinkOptions());

  let last = null;
  const update = () => {
    const x = readInputs(drinks);
    publish("layer1", { doses: x.doses, weightKg: x.weightKg, halfLifeH: x.halfLifeH,
                        smoker: x.smoker, oralContraceptives: x.oralContraceptives });
    const r = toObject(bridge.compute(JSON.stringify(x.doses), x.weightKg, x.halfLifeH,
                                      x.smoker, x.oralContraceptives, x.bedtimeH));
    last = { x, r };
    showOutputs(x, r);
  };
  const showPick = initDrinkPicker(form, drinks, update);     // the drink list comes from model/params.py, so it waits for Python
  const rows = $("drinkRows");
  const addRow = (time, drink) => {
    const row = drinkRow(time, drink);
    rows.append(row);
    showPick(row.querySelector(".drink-pick"));
    return row;
  };
  START_DRINKS.forEach((d) => addRow(d.time, d.drink));
  $("addDrink").addEventListener("click", () => {
    addRow(newDrinkTime(), "drip coffee (8 oz)").querySelector(".drink-pick").focus();
    update();
  });
  rows.addEventListener("click", (e) => {
    const remove = e.target.closest(".drink-remove");
    if (!remove) return;
    remove.closest(".drink-row").remove();
    $("addDrink").focus();
    update();
  });

  $("pkToggle").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    $("pkToggle").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === btn));
    series = btn.dataset.series;
    if (last) drawChart(last.x, last.r);
  });
  const redo = perFrame(update);
  form.addEventListener("input", redo);
  onWidthChange(update);
  // Redo it when personal settings change. Only then: this page publishes too, and
  // reacting to its own publish would loop forever.
  let seenSettings = shared.settings;
  onShared(() => {
    if (shared.settings === seenSettings) return;
    seenSettings = shared.settings;
    redo();
  });
  update();
  // Keep the peak countdown current even when nothing is edited.
  setInterval(() => { if (last) $("pkPeakTag").textContent = peakTag(last.x.doses, last.r.peakMin); }, 60_000);
}
