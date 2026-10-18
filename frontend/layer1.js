// Layer 1 page: read the drinks and body inputs, run model/pk.py (in the browser
// via Pyodide), and show the caffeine curve. The math itself is only in Python.

import { clockToHours, hoursToClock, nowHours } from "./time.js";
import { areaChart } from "./charts.js";
import { initDrinkPicker, drinkMg } from "./drinkpicker.js";
import { loadPython, toObject } from "./python.js";
import { publish, shared, onShared, perFrame, onWidthChange } from "./shared.js";
import { dateKey, saveDay, loadDay, earlierDays, dayName, dayTitle, dateName, shiftKey, KEEP_DAYS } from "./history.js";

const $ = (id) => document.getElementById(id);
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const form = $("layer1Inputs");
let nextSlot = 0;          // each row gets a new number (time3, drink3), never reused after a remove
let series = "bodyMg";     // which curve the chart shows: "bodyMg" or "conc"
const todayKey = dateKey();   // fixed when the page opens, so drinks after midnight still count as tonight's
let viewKey = todayKey;    // the day the page shows: today, or an earlier day from the switcher
let viewBody = null;       // a past day's saved body (weight, half-life ...); null means use settings
let pastDays = [];         // earlier days from history.js, each with its recomputed curve

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
  // Your body comes from personal settings (settings.js), not this page. An earlier
  // day keeps the body saved with it, so its curve stays the one you saw that day.
  const s = viewBody ?? shared.settings;
  return {
    doses, bedtimeH,
    weightKg: s.weightKg,
    halfLifeH: s.halfLifeH,
    smoker: s.smoker,
    oralContraceptives: s.oralContraceptives,
  };
}

// One drink row: a time, the drink button (drinkpicker.js fills it in), and × to remove it.
// customMg is set for a custom drink, which carries its own caffeine (drinkpicker.js).
function drinkRow(time, drink, customMg) {
  const i = nextSlot++;
  const row = document.createElement("div");
  row.className = "row drink-row";
  row.dataset.slot = i;
  row.innerHTML = `
    <label class="field">Time<input type="time" name="time${i}" value="${time}"></label>
    <div class="field"><span id="drinkLabel${i}">Drink</span><input type="hidden" name="drink${i}"><button type="button" class="drink-pick" data-slot="${i}" aria-haspopup="dialog" aria-labelledby="drinkLabel${i} drinkPick${i}" id="drinkPick${i}"></button></div>
    <button type="button" class="drink-remove" aria-label="Remove this drink">×</button>`;
  // Set as properties, not in the HTML above, because a custom name can contain quotes.
  const input = row.querySelector(`[name="drink${i}"]`);
  input.value = drink;
  if (customMg !== undefined) input.dataset.mg = customMg;
  return row;
}

// Model hours to the "HH:MM" a time input wants. 25.5 (1:30 AM tomorrow) -> "01:30".
function toTimeInput(hours) {
  const minutes = Math.round(hours * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

// A new drink starts as a drip coffee now (to the nearest 15 minutes), since
// "I just had another one" is the usual reason to add a row.
function newDrinkTime() {
  return toTimeInput(Math.round(nowHours() * 4) / 4);
}

// The peak tag follows the clock. Every drink peaks the same time after it
// (pk.py peakTimeH), so it counts down to a drink that's still climbing, or
// else says when your last drink topped out.
function peakTag(doses, peakMin) {
  if (viewKey !== todayKey) {     // a past day is over, so only when the last drink peaked
    return doses.length ? `Peaked at ${hoursToClock(doses[doses.length - 1].timeH + peakMin / 60)}` : "No drinks";
  }
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
  $("pkSleepNote").textContent = !x.doses.length ? `No caffeine at ${hoursToClock(x.bedtimeH)}.`
    : ok ? `${Math.round(r.bedtimeMg)} mg left at ${hoursToClock(x.bedtimeH)}, under the ${r.limitMg} mg cutoff.`
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
    nowX: viewKey === todayKey ? nowHours : undefined,     // a past day has no "now" on it
    startX: x.doses.length ? x.doses[0].timeH + r.peakMin / 60 : r.t[0],
    onScrub: (i, atNow) => {
      $("pkReadout").textContent = series === "bodyMg" ? `${Math.round(ys[i])} mg` : `${ys[i].toFixed(2)} ${unit}`;
      $("pkReadoutTime").textContent = atNow ? "right now" : `at ${hoursToClock(r.t[i])}`;
    },
  });
}

// Previous days: one small chart per earlier day, newest first. The curves were
// computed once (in startLayer1); this only draws them, in the unit the toggle shows.
function drawHistory() {
  const box = $("pkHistory");
  if (!pastDays.length) {
    box.innerHTML = `<p class="muted small">No earlier days yet.</p>`;
    return;
  }
  box.replaceChildren();
  pastDays.forEach(({ key, x, r }, n) => {
    const totalMg = x.doses.reduce((sum, d) => sum + d.mg, 0);
    const ok = r.bedtimeMg <= r.limitMg;
    const day = document.createElement("div");
    day.className = "history-day";
    day.innerHTML = `
      <div class="card-head">
        <h3><button type="button" class="history-open" data-key="${key}">${dayName(key, todayKey)}</button></h3>
        <span class="chip ${ok ? "ok" : "bad"}">${Math.round(r.bedtimeMg)} mg at bedtime</span>
      </div>
      <p class="muted small">${x.doses.length} ${x.doses.length === 1 ? "drink" : "drinks"}, ${Math.round(totalMg)} mg in all.
        <span class="history-readout"></span></p>
      <svg class="chart mini" id="pkHistory${n}" role="img" aria-label="Caffeine level over ${dayName(key, todayKey)}"></svg>`;
    box.append(day);
    const readout = day.querySelector(".history-readout");
    const ys = r[series];
    const step = series === "bodyMg" ? 25 : 0.5;
    areaChart(day.querySelector("svg"), {
      xs: r.t, ys,
      yMax: Math.max(step, Math.ceil((Math.max(...ys) * 1.15) / step) * step),
      bands: [{ from: x.bedtimeH, to: x.bedtimeH + 8, color: cssVar("--night") }],
      markers: x.doses.map((d) => ({ x: d.timeH, label: `${d.mg} mg` })),
      formatTick: (h) => hoursToClock(h).replace(":00", ""),
      startX: x.doses[0].timeH + r.peakMin / 60,     // no "now" on a past day, so rest on the first peak
      onScrub: (i) => {
        const value = series === "bodyMg" ? `${Math.round(ys[i])} mg` : `${ys[i].toFixed(2)} mg/L`;
        readout.textContent = `${value} at ${hoursToClock(r.t[i])}.`;
      },
    });
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
    if (viewKey === todayKey) form.elements.bedtime.value = seenBedtime;
  });

  const pyodide = await loadPython();
  const bridge = pyodide.pyimport("layer1_bridge");
  const drinks = toObject(bridge.drinkOptions());

  // Earlier days: recompute each saved day's curve. Each uses the body saved with it.
  // Those days only change if you open one and edit it, so this runs on each day switch,
  // not on every edit.
  const loadHistory = () => {
    pastDays = earlierDays(todayKey).map(([key, x]) => ({
      key, x,
      r: toObject(bridge.compute(JSON.stringify(x.doses), x.weightKg, x.halfLifeH,
                                 x.smoker, x.oralContraceptives, x.bedtimeH)),
    }));
  };
  loadHistory();

  let last = null;
  const update = () => {
    const x = readInputs(drinks);
    // Only today's drinks feed the other pages; a past day is just for looking back.
    if (viewKey === todayKey) {
      publish("layer1", { doses: x.doses, weightKg: x.weightKg, halfLifeH: x.halfLifeH,
                          smoker: x.smoker, oralContraceptives: x.oralContraceptives });
    }
    const r = toObject(bridge.compute(JSON.stringify(x.doses), x.weightKg, x.halfLifeH,
                                      x.smoker, x.oralContraceptives, x.bedtimeH));
    last = { x, r };
    // Save today always. Save a past day only once it has something in it, so just
    // looking at an empty day doesn't add it to the log.
    if (viewKey === todayKey || x.doses.length || loadDay(viewKey)) saveDay(viewKey, x);
    showOutputs(x, r);
  };
  const showPick = initDrinkPicker(form, drinks, update);     // the drink list comes from model/params.py, so it waits for Python
  const rows = $("drinkRows");
  const addRow = (time, drink, customMg) => {
    const row = drinkRow(time, drink, customMg);
    rows.append(row);
    showPick(row.querySelector(".drink-pick"));
    return row;
  };
  // Fill the drink rows and bedtime for the day on screen. A saved day picks up where
  // you left off; a day with nothing saved (including a new today) starts empty.
  const fillDay = () => {
    rows.replaceChildren();
    const saved = loadDay(viewKey);
    const isToday = viewKey === todayKey;
    viewBody = !isToday && saved ? saved : null;
    if (saved) {
      saved.doses.forEach((d) => addRow(toTimeInput(d.timeH), d.label, d.label in drinks ? undefined : d.mg));
      form.elements.bedtime.value = toTimeInput(saved.bedtimeH);
    } else {
      form.elements.bedtime.value = shared.settings.bedtime;
    }
    const name = dayTitle(viewKey, todayKey);
    $("pkDayName").textContent = name;
    $("pkDayDate").textContent = dateName(viewKey);
    $("pkDrinksTitle").textContent = isToday ? "Your drinks today"
      : name === "Yesterday" ? "Your drinks yesterday" : `Your drinks on ${name}`;
    $("pkBedtimeLabel").textContent = isToday ? "Bedtime tonight" : "Bedtime that night";
    const back = $("pkDayNav").querySelector('[data-dir="-1"]');
    back.disabled = viewKey <= shiftKey(todayKey, -KEEP_DAYS);   // history.js keeps a week
    $("pkDayNav").querySelector('[data-dir="1"]').disabled = isToday;
  };
  // Switch the page to another day: the chart, drinks and sleep check all follow.
  const showDay = (key) => {
    viewKey = key;
    fillDay();
    update();
    loadHistory();      // a past day you just edited shows its new curve below
    drawHistory();
  };
  fillDay();
  $("pkDayNav").addEventListener("click", (e) => {
    const arrow = e.target.closest(".day-arrow");
    if (arrow && !arrow.disabled) showDay(shiftKey(viewKey, Number(arrow.dataset.dir)));
  });
  $("pkHistory").addEventListener("click", (e) => {
    const open = e.target.closest(".history-open");
    if (!open) return;
    showDay(open.dataset.key);
    open.closest(".page").scrollTo({ top: 0, behavior: "smooth" });
  });
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
    drawHistory();
  });
  const redo = perFrame(update);
  form.addEventListener("input", redo);
  onWidthChange(() => { update(); drawHistory(); });
  // Redo it when personal settings change. Only then: this page publishes too, and
  // reacting to its own publish would loop forever.
  let seenSettings = shared.settings;
  onShared(() => {
    if (shared.settings === seenSettings) return;
    seenSettings = shared.settings;
    redo();
  });
  update();
  drawHistory();
  // Keep the peak countdown current even when nothing is edited.
  setInterval(() => { if (last) $("pkPeakTag").textContent = peakTag(last.x.doses, last.r.peakMin); }, 60_000);
}
