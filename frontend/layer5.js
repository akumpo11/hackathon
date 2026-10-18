// Layer 5 page: plan your coffee for an event (model/optimizer.py) and learn your
// half-life and sensitivity from 1-to-5 ratings (model/learn.py), both in the
// browser via Pyodide. The math itself is only in the Python files.

import { clockToHours, hoursToClock } from "./time.js";
import { areaChart, heatmap, lineChart } from "./charts.js";
import { loadPython, toObject } from "./python.js";
import { publish, shared, onShared, perFrame, onWidthChange, fillRing } from "./shared.js";
import { CALENDAR_END_H } from "./sleepcal.js";

const $ = (id) => document.getElementById(id);
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const form = $("layer5Inputs");

const RATINGS_KEY = "caffeineRatings";   // your ratings and the drinks around them, on this device
const LEARNED_KEY = "caffeineLearned";   // learned half-life and Kd, and whether to plan with them
const CALENDAR_START_H = -48;            // the sleep calendar starts two days ago; older ratings have no sleep to go with them

let bridge = null;         // layer5_bridge, once Pyodide has loaded
let learned = null;        // the latest learning result, for the "plan with my learned half-life and sensitivity" box
let simulated = null;      // {trueHalfLife, seed} while showing the "simulate a week" demo

// ---------- Time ----------
// The model counts hours from midnight today, but a rating saved yesterday needs a real
// timestamp, so storage uses milliseconds and converts on the way to the model.
const midnightMs = () => new Date().setHours(0, 0, 0, 0);
const toH = (ms) => (ms - midnightMs()) / 3.6e6;
const toMs = (h) => midnightMs() + h * 3.6e6;
const nowH = () => toH(Date.now());

// The event's date box holds "2026-10-24". Built from its parts, the Date is local
// midnight (a bare string would be read as UTC). Rounding absorbs the hour a
// daylight-saving change adds or removes.
function daysFromToday(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Math.round((new Date(y, m - 1, d) - midnightMs()) / 864e5);
}
function isoDateIn(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------- Storage ----------
function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
const loadRatings = () => loadJson(RATINGS_KEY, { ratings: [], drinks: [] });
const loadLearned = () => loadJson(LEARNED_KEY, { use: false });
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

// When you last rated, or null if never. The home page's rating tab (ratenudge.js) asks.
export const lastRatingMs = () => loadRatings().ratings.at(-1)?.atMs ?? null;

// What every model call needs about you: settings for the body, layer 2 for the clock, layer 3 for R.
function you() {
  const s = shared.settings;
  return {
    body: { weightKg: s.weightKg, halfLifeH: s.halfLifeH, smoker: s.smoker, oralContraceptives: s.oralContraceptives },
    circadianPeakH: shared.layer2.circadianPeakH,
    tolerance: shared.layer3.R,
  };
}

// ---------- The plan ----------

// The optimizer needs the night before and the night after the event, but layer 2's
// night list stops at noon two days from now. Past that edge we assume your usual
// night from settings, the same guess the night list starts out filled with. If a
// night runs up to the edge, it carries on to your usual wake time.
function sleepThrough(event, blocks, settings) {
  const bed = clockToHours(settings.bedtime), wake = clockToHours(settings.wakeTime);
  const bedH = bed < 12 ? bed + 24 : bed;             // a bedtime like 1 AM is after midnight
  const lengthH = (wake - bed + 24) % 24;
  const out = blocks.map((b) => ({ ...b }));
  // Nights through the one after the event's last day, in case the event runs past bedtime.
  const lastNight = Math.floor(event.endH / 24) + 1;
  for (let day = Math.floor(CALENDAR_END_H / 24) - 1; day <= lastNight; day++) {
    const startH = day * 24 + bedH, endH = startH + lengthH;
    if (endH <= CALENDAR_END_H) continue;             // the calendar shows all of this night
    if (startH < CALENDAR_END_H) {
      const evening = out.find((b) => !b.isNap && b.endH === CALENDAR_END_H);
      if (evening) { evening.endH = endH; continue; }
    }
    out.push({ startH, endH, isNap: false });
  }
  return out;
}

function readEvent() {
  const el = form.elements;
  const day = daysFromToday(el.eventDate.value || isoDateIn(1));   // a cleared box means tomorrow
  const startH = clockToHours(el.eventStart.value || "09:00", day);
  const lengthH = Number(el.eventLength.value);
  // One optional free slot for a nap, on the event day. An end before the start means past midnight.
  let freeSlots = [];
  if (el.slotStart.value && el.slotEnd.value) {
    const a = clockToHours(el.slotStart.value, day);
    let b = clockToHours(el.slotEnd.value, day);
    if (b <= a) b += 24;
    freeSlots = [{ startH: a, endH: b }];
  }
  return { event: { startH, endH: startH + lengthH }, lengthH, allowNap: el.allowNap.checked, freeSlots };
}

const cupsText = (cups) => {
  const halves = Math.max(1, Math.round(cups * 2));
  return `about ${halves / 2} cup${halves === 2 ? "" : "s"} of coffee`;
};

function timelineRow(when, what, detail, tag, tagClass = "") {
  const li = document.createElement("li");
  li.innerHTML = `<span class="when"></span><span class="what"><span></span><small></small></span><span class="tag ${tagClass}"></span>`;
  li.querySelector(".when").textContent = hoursToClock(when);
  li.querySelector(".what span").textContent = what;
  li.querySelector(".what small").textContent = detail;
  li.querySelector(".tag").textContent = tag;
  return li;
}

function showPlan(x, r) {
  const list = $("planList");
  list.replaceChildren();
  if (r.error) {
    $("planScore").textContent = "–";
    fillRing($("planRing"), null);
    $("planEquation").textContent = "Your sleep calendar needs the night before and the night after your event.";
    $("planChip").textContent = "Needs sleep";
    $("planNote").textContent = "";
    return;
  }

  const added = r.doses.reduce((sum, d) => sum + d.mg, 0);
  $("planScore").textContent = (r.score * 10).toFixed(1);
  fillRing($("planRing"), r.score);
  $("planEquation").textContent = `${(r.baselineScore * 10).toFixed(1)} → ${(r.score * 10).toFixed(1)} out of 10.`;
  $("planChip").textContent = added ? `${added} mg added` : "Nothing to add";

  // Doses, the nap and the event, in time order.
  const rows = r.doses.map((d) => ({ t: d.timeH, li: timelineRow(d.timeH, `${d.mg} mg`, cupsText(d.cups), "Coffee") }));
  if (r.nap) {
    rows.push({ t: r.nap.startH, li: timelineRow(r.nap.startH, "20-minute nap", `until ${hoursToClock(r.nap.endH)}`, "Nap", "nap") });
  }
  const eventDay = new Date(toMs(x.event.startH)).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  rows.push({ t: x.event.startH, li: timelineRow(x.event.startH, "Your event", `${eventDay}, ${x.lengthH} h, until ${hoursToClock(x.event.endH)}`, "Event", "event") });
  rows.sort((a, b) => a.t - b.t).forEach((row) => list.append(row.li));

  const drinksNote = shared.layer1.doses.length ? " It counts today's drinks too." : "";
  $("planNote").textContent = (added
    ? "Caffeine peaks about 50 minutes after a drink, so doses come shortly before you need them."
    : "No extra caffeine is worth it: it wouldn't add 0.25 out of 10 per 50 mg, or it would break a limit.") + drinksNote;

  // Sleep check: the verdict sits in the chart's header, the mg on the chart at bedtime.
  const ok = sleepOk(r);
  $("planSleepChip").textContent = ok ? "Fine for sleep" : "Too much";
  $("planSleepChip").className = `chip ${ok ? "ok" : "bad"}`;
  $("planSleepNote").textContent = ok
    ? `${Math.round(r.bedtimeMg)} mg left at bedtime, under the ${r.bedtimeLimitMg} mg cutoff.`
    : `${Math.round(r.bedtimeMg)} mg left at bedtime from the drinks you already have. The plan adds nothing that makes it worse.`;

  drawPlanChart(x, r);
}

// The + 0.5 lets a plan that lands right on the limit (49.7 mg, shown as 50) count as fine.
const sleepOk = (r) => r.bedtimeMg <= r.bedtimeLimitMg + 0.5;

function drawPlanChart(x, r) {
  const sleepBands = x.sleep.concat(r.nap ? [r.nap] : []);
  const asleep = (t) => sleepBands.some((b) => t >= b.startH && t < b.endH);
  const inRange = (t) => t >= r.t[0] && t <= r.t[r.t.length - 1];
  const drinks = shared.layer1.doses.concat(r.doses).filter((d) => inRange(d.timeH));
  areaChart($("planChart"), {
    xs: r.t, ys: r.alertness.map((a) => a * 10), yMax: 10,
    bands: [
      ...sleepBands.map((b) => ({ from: b.startH, to: b.endH, color: cssVar("--night") })),
      { from: x.event.startH, to: Math.max(x.event.endH, x.event.startH + 0.1), color: cssVar("--coral-soft") },
    ],
    markers: drinks.map((d) => ({ x: d.timeH, label: `${d.mg} mg` })),
    flag: { x: r.bedtimeH, label: `${Math.round(r.bedtimeMg)} mg at bed`, ok: sleepOk(r) },
    formatTick: (h) => hoursToClock(h).replace(":00", ""),
    nowX: nowH,
    startX: x.event.startH,
    onScrub: (i, atNow) => {
      const t = r.t[i];
      $("planReadout").textContent = asleep(t) ? "Asleep" : `${(r.alertness[i] * 10).toFixed(1)} / 10`;
      $("planReadoutTime").textContent = atNow ? "right now" : `at ${hoursToClock(t)}`;
    },
  });
}

function updatePlan() {
  const { layer1, layer2, layer3, settings } = shared;
  if (!bridge || !layer1 || !layer2 || !layer3 || !settings) return;
  const x = readEvent();
  form.querySelector('output[data-for="eventLength"]').textContent = `${x.lengthH} h`;

  if (x.event.endH <= nowH()) {
    $("planList").replaceChildren();
    $("planScore").textContent = "–";
    fillRing($("planRing"), null);
    $("planEquation").textContent = "That's already over. Pick a later time.";
    $("planChip").textContent = "–";
    return;
  }
  x.sleep = sleepThrough(x.event, layer2.blocks, settings);
  const saved = loadLearned();
  const r = toObject(bridge.plan(JSON.stringify({
    ...you(),
    event: x.event, sleep: x.sleep, drinks: layer1.doses,
    learned: saved.use ? saved : null,
    allowNap: x.allowNap, freeSlots: x.freeSlots, nowH: nowH(),
  })));
  showPlan(x, r);
}

// ---------- Learning ----------

function rate(score) {
  const store = loadRatings();
  // Keep a copy of today's drinks from layer 1 with the rating, so the model knows what
  // you'd had when you rated. Today's copy is replaced; earlier days stay as they were.
  const today = midnightMs(), tomorrow = today + 24 * 3.6e6;
  store.drinks = store.drinks
    .filter((d) => d.atMs < today || d.atMs >= tomorrow)
    .concat(shared.layer1.doses.map((d) => ({ atMs: toMs(d.timeH), mg: d.mg, label: d.label })));
  store.ratings.push({ atMs: Date.now(), score });
  save(RATINGS_KEY, store);
  simulated = null;
  updateLearn();
}

function showLearn(r, source) {
  learned = r;
  $("learnSource").textContent = source;
  heatmap($("heatChart"), { prob: r.prob, xs: r.kds, ys: r.halfLives, mark: { x: r.meanKd, y: r.meanHalfLife } });
  $("learnHalfLife").textContent = `${r.meanHalfLife.toFixed(1)} h`;
  $("learnHalfLifeNote").textContent = `half-life, ± ${r.sdHalfLife.toFixed(1)} h`;
  $("learnKd").textContent = r.meanKd.toFixed(1);
  $("learnKdNote").textContent = `Kd in mg/L, ± ${r.sdKd.toFixed(1)}`;

  const top = Math.max(1, ...r.bandHigh) * 1.15;
  lineChart($("bandChart"), {
    series: [
      { xs: r.bandT, ys: r.bandHigh, color: cssVar("--muted"), dash: "5 4" },
      { xs: r.bandT, ys: r.bandLow, color: cssVar("--muted"), dash: "5 4" },
      { xs: r.bandT, ys: r.bandMiddle, color: cssVar("--accent") },
    ],
    yMin: 0, yMax: top,
    tickStep: 3,
    formatTick: (h) => hoursToClock(h).replace(":00", ""),
  });

  // If you plan with learned numbers, keep them in step with the latest estimate.
  const saved = loadLearned();
  if (saved.use && (saved.halfLifeH !== r.meanHalfLife || saved.kdMgL !== r.meanKd)) {
    save(LEARNED_KEY, { use: true, halfLifeH: r.meanHalfLife, kdMgL: r.meanKd });
    updatePlan();
  }
}

function updateLearn() {
  const { layer1, layer2, layer3, settings } = shared;
  if (!bridge || !layer1 || !layer2 || !layer3 || !settings) return;

  if (simulated) {
    const r = toObject(bridge.simulate(JSON.stringify({ ...you(), ...simulated, todayDoses: layer1.doses })));
    $("ratingNote").textContent = "Showing a simulated week. Rate yourself to go back to your own ratings.";
    showLearn(r, `Test run: a pretend person's caffeine wears off by half every ` +
                 `${r.trueHalfLife.toFixed(1)} hours. Just from how alert they felt, ` +
                 `DeCaf guessed about ${r.meanHalfLife.toFixed(1)} hours.`);
    return;
  }

  const store = loadRatings();
  const ratings = store.ratings
    .map((x) => ({ t: toH(x.atMs), score: x.score }))
    .filter((x) => x.t >= CALENDAR_START_H);
  const doses = store.drinks.map((d) => ({ timeH: toH(d.atMs), mg: d.mg, label: d.label }));
  const r = toObject(bridge.learn(JSON.stringify({
    ...you(), ratings, doses, sleep: layer2.blocks, todayDoses: layer1.doses,
  })));

  // r.lastRatingTeaches is false when every guess predicted the same alertness at your
  // last rating (no caffeine in you), so the estimate couldn't move. Say so, or the
  // button looks broken.
  const last = store.ratings.at(-1);
  const advice = r.lastRatingTeaches === false
    ? " There was almost no caffeine in you then. Rate again a few hours after coffee."
    : " Rate a few hours after coffee too.";
  $("ratingNote").textContent = store.ratings.length
    ? `${store.ratings.length} rating${store.ratings.length === 1 ? "" : "s"} saved on this device. ` +
      `Last: ${last.score} at ${hoursToClock(toH(last.atMs))}.${advice}`
    : "No ratings yet. Rate a few hours after coffee.";
  showLearn(r, ratings.length
    ? `From ${ratings.length} rating${ratings.length === 1 ? "" : "s"} in the last two days (the ones on your sleep calendar).`
    : "No ratings yet, so this is the prior: your settings, give or take.");
}

export async function startLayer5() {
  form.elements.eventDate.value = isoDateIn(1);       // tomorrow, the usual case
  form.elements.eventDate.min = isoDateIn(0);
  const pyodide = await loadPython();
  bridge = pyodide.pyimport("layer5_bridge");

  $("ratingButtons").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    btn.classList.add("picked");
    setTimeout(() => btn.classList.remove("picked"), 600);
    rate(Number(btn.dataset.score));
  });
  $("simulateBtn").addEventListener("click", () => {
    // A hidden "true" half-life between 3 and 8 h; the demo shows how close the guess gets.
    simulated = { trueHalfLife: Math.round((3 + Math.random() * 5) * 10) / 10, seed: Math.floor(Math.random() * 1e6) };
    updateLearn();
  });
  // Clearing can't be undone, so the first tap only warns and the second tap clears.
  // The warning goes away on its own after a few seconds or when focus leaves the button.
  const clearBtn = $("clearRatingsBtn"), clearWarn = $("clearWarn");
  let clearTimer = null;
  const disarmClear = () => {
    clearTimeout(clearTimer);
    clearBtn.classList.remove("armed");
    clearBtn.textContent = "Clear ratings";
    clearWarn.hidden = true;
  };
  clearBtn.addEventListener("click", () => {
    const count = loadRatings().ratings.length;
    if (count && !clearBtn.classList.contains("armed")) {
      clearBtn.classList.add("armed");
      clearBtn.textContent = "Tap again to clear";
      clearWarn.textContent = `This deletes your ${count} rating${count === 1 ? "" : "s"} and what ` +
        `DeCaf learned from them. It can't be undone.`;
      clearWarn.hidden = false;
      clearTimer = setTimeout(disarmClear, 5000);
      return;
    }
    disarmClear();
    localStorage.removeItem(RATINGS_KEY);
    save(LEARNED_KEY, { use: false });
    $("useLearned").checked = false;
    simulated = null;
    updateLearn();
    updatePlan();
  });
  clearBtn.addEventListener("blur", disarmClear);
  $("useLearned").checked = loadLearned().use;
  $("useLearned").addEventListener("change", (e) => {
    save(LEARNED_KEY, e.target.checked && learned
      ? { use: true, halfLifeH: learned.meanHalfLife, kdMgL: learned.meanKd }
      : { use: false });
    updatePlan();
  });

  // Tell layer 2 the event, so it can shade it on the sleep calendar.
  const publishEvent = () => publish("layer5", { event: readEvent().event });
  const redoPlan = perFrame(updatePlan), redoLearn = perFrame(updateLearn);
  form.addEventListener("input", () => { publishEvent(); redoPlan(); });
  onWidthChange(() => { updatePlan(); updateLearn(); });

  // Redo both when settings or layers 1 to 3 change. Not when only layer 5's own event
  // changed: the form handler already did that, and reacting to our own publish would loop.
  let seen = [];
  onShared(() => {
    const now = [shared.settings, shared.layer1, shared.layer2, shared.layer3];
    if (now.every((v, i) => v === seen[i])) return;
    seen = now;
    redoPlan();
    redoLearn();
  });
  publishEvent();
}
