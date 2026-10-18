// Personal settings (frame 6): the values that describe you rather than your day.
// The gear in the top right opens this frame. Settings are saved on this device
// (local storage) and published through shared.js, so layers 1, 2 and 3 read them
// instead of asking again. It also holds the color theme. No math here.
//
// The first time the app opens on a device, this same frame opens as a survey
// you have to finish (Start) before you see the layers. It shows the same cards
// one step at a time, each card marked with its step by data-step in index.html.

import { clockToHours, hoursToClock } from "./time.js";
import { publish } from "./shared.js";
import { dragBar, usualNight, tickLabel, NIGHT } from "./sleepcal.js";

const $ = (id) => document.getElementById(id);
const KEY = "caffeineSettings";
const SURVEY_KEY = "caffeineSurveyDone";   // set once the first-run survey is finished on this device

// Field names match model/schema.py's Profile where they can, so they pass straight through.
const DEFAULTS = {
  weightKg: 70, halfLifeH: 5, smoker: false, oralContraceptives: false,
  chronotypeShiftH: 0, habitualMgPerDay: 300, habitWeeks: 8,
  bedtime: "23:00", wakeTime: "07:00",      // your usual night, as clock times like the time inputs use
  theme: "coffee",
};

// Each survey step's title and one-line intro (an empty intro hides the line). Step 0 is
// the welcome; steps 1 to 4 are questions. The longer "why we ask" sits behind each
// card's (i) button.
const STEPS = [
  { title: "Welcome to DeCaf", intro: "Time your coffee for exam day without losing sleep." },
  { title: "When do you sleep?", intro: "Your usual night." },
  { title: "How much coffee do you drink?", intro: "On a normal day." },
  { title: "Tell us about your body", intro: "How fast you clear caffeine." },
  { title: "Last thing", intro: "" },
];

// The themes styles.css defines with :root[data-theme="..."]. Coffee is the default.
const THEMES = ["coffee", "mint", "ocean", "berry", "night"];

// Switches every color token at once. Charts read the tokens when they draw, and
// every page redraws when settings change, so they pick up the new colors too.
function applyTheme(theme) {
  document.documentElement.dataset.theme = THEMES.includes(theme) ? theme : DEFAULTS.theme;
  const head = getComputedStyle(document.documentElement).getPropertyValue("--head").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", head);   // the phone's status bar, matched to the dark header band
}

// How each setting reads on the layer pages' "Settings" rows.
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const SHOW = {
  weightKg: (v) => `${v} kg`,
  smoker: (v) => (v ? "Yes" : "No"),
  oralContraceptives: (v) => (v ? "Yes" : "No"),
  chronotypeShiftH: (v) => ({ "-2": "Early bird", 0: "In between", 2: "Night owl" })[v],
  habitualMgPerDay: (v) => `${v} mg (${(v / 95).toFixed(1)} coffees)`,
  habitWeeks: (v) => plural(v, "week"),
  bedtime: (v) => hoursToClock(clockToHours(v)),
  wakeTime: (v) => hoursToClock(clockToHours(v)),
};

// Your night on the sleep bar, the same 6 PM to noon bar as the sleep page:
// 23:00 to 07:00 is { bed: 23, wake: 31 }.
const nightSpan = (s) => usualNight({ bedtimeH: clockToHours(s.bedtime), wakeH: clockToHours(s.wakeTime) });

// Back to the "HH:MM" the time inputs use, e.g. 31.5 -> "07:30".
function toInputTime(h) {
  const mins = Math.round(h * 60) % (24 * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

// Local storage can be missing or blocked (private windows), so every use is guarded.
function load() {
  try {
    // Half-life isn't a setting any more: everyone starts at the 5 h average, and the
    // learning page fits your own from your ratings.
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}"), halfLifeH: DEFAULTS.halfLifeH };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(settings) {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* still works, just not remembered */ }
}

// Has this device finished the first-run survey? If storage is blocked we can't
// remember, so the survey shows each visit; the defaults make it one tap.
function surveyDone() {
  try { return localStorage.getItem(SURVEY_KEY) === "yes"; } catch { return false; }
}

function markSurveyDone() {
  try { localStorage.setItem(SURVEY_KEY, "yes"); } catch { /* shows again next time */ }
}

// Opening the app with ?reset forgets this device's answers, so the survey can be shown again (demo).
function resetIfAsked() {
  const url = new URL(location.href);
  if (!url.searchParams.has("reset")) return;
  try { localStorage.removeItem(KEY); localStorage.removeItem(SURVEY_KEY); } catch { /* nothing saved anyway */ }
  url.searchParams.delete("reset");
  history.replaceState(null, "", url);      // so a refresh doesn't reset again
}

// Opening the app with ?survey shows the survey again but keeps your answers filled in.
function surveyAsked() {
  const url = new URL(location.href);
  if (!url.searchParams.has("survey")) return false;
  url.searchParams.delete("survey");
  history.replaceState(null, "", url);      // so a refresh doesn't reopen it
  return true;
}

function fillForm(form, s) {
  const el = form.elements;
  el.weight.value = s.weightKg;
  el.smoker.checked = s.smoker;
  el.oralContraceptives.checked = s.oralContraceptives;
  el.chronotype.value = String(s.chronotypeShiftH);
  el.habitualMg.value = s.habitualMgPerDay;
  el.habitWeeks.value = s.habitWeeks;
  el.bedtime.value = s.bedtime;
  el.wakeTime.value = s.wakeTime;
  el.theme.value = s.theme;
}

function readForm(form) {
  const el = form.elements;
  return {
    weightKg: Number(el.weight.value),
    halfLifeH: DEFAULTS.halfLifeH,
    smoker: el.smoker.checked,
    oralContraceptives: el.oralContraceptives.checked,
    chronotypeShiftH: Number(el.chronotype.value),
    habitualMgPerDay: Number(el.habitualMg.value),
    habitWeeks: Number(el.habitWeeks.value),
    bedtime: el.bedtime.value || DEFAULTS.bedtime,      // a cleared time box is "", so fall back
    wakeTime: el.wakeTime.value || DEFAULTS.wakeTime,
    theme: el.theme.value,
  };
}

// Writes the current values into the settings form's slider labels and every
// [data-setting] row on the layer pages.
// Places the night on the sleep bar and updates the hours chip. The chip counts the
// night as the bar shows it, so it matches the sleep page.
function paintSleep(s) {
  const { bed, wake } = nightSpan(s);
  const pct = (h) => `${(h / (NIGHT.endH - NIGHT.startH)) * 100}%`;
  $("sleepSpan").style.left = pct(bed - NIGHT.startH);
  $("sleepSpan").style.width = pct(wake - bed);
  const night = wake - bed;
  $("sleepLength").textContent = `${+night.toFixed(1)} h a night`;
  $("sleepLength").className = `chip ${night >= 7 ? "ok" : "bad"}`;     // adults need about 7 h or more
}

function show(form, s) {
  const out = (name, text) => { form.querySelector(`output[data-for="${name}"]`).textContent = text; };
  out("weight", SHOW.weightKg(s.weightKg));
  out("habitualMg", SHOW.habitualMgPerDay(s.habitualMgPerDay));
  out("habitWeeks", SHOW.habitWeeks(s.habitWeeks));

  paintSleep(s);
  document.querySelectorAll("[data-setting]").forEach((node) => {
    node.textContent = SHOW[node.dataset.setting](s[node.dataset.setting]);
  });
}

export function initSettings() {
  const form = $("settingsForm"), frame = $("settingsFrame"), gear = $("settingsOpen");
  resetIfAsked();
  let settings = load();
  applyTheme(settings.theme);
  fillForm(form, settings);
  $("sleepTicks").innerHTML = NIGHT.ticks.map((h) => `<span>${tickLabel(h)}</span>`).join("");
  show(form, settings);
  publish("settings", settings);      // before the layers start, so they can read it right away

  form.addEventListener("input", () => {
    settings = readForm(form);
    applyTheme(settings.theme);       // before publishing, so pages redraw in the new colors
    save(settings);
    show(form, settings);
    publish("settings", settings);
  });

  // Dragging the sleep bar fills in the time boxes as you go, and saves once you let go
  // (the same input event as typing), so the pages don't all redraw on every step.
  $("sleepTrack").addEventListener("pointerdown", (e) => {
    const span = nightSpan(settings);
    const fill = () => {
      form.elements.bedtime.value = toInputTime(span.bed);
      form.elements.wakeTime.value = toInputTime(span.wake);
      paintSleep(readForm(form));
    };
    dragBar(e, $("sleepTrack"), NIGHT, span, fill, () => form.dispatchEvent(new Event("input")));
  });

  let opener = gear;                  // where focus goes back to when the frame closes
  const open = (from) => {
    opener = from;
    frame.hidden = false;
    frame.scrollTop = 0;
    $("settingsBack").focus();
  };
  const close = () => {
    frame.hidden = true;
    opener.focus();
  };

  // First-run survey: the same frame and cards, one step at a time, with a progress
  // bar instead of the back arrow and Next instead of Done. There's no way out but
  // through, so the layers always start with your answers.
  const stepCards = [...frame.querySelectorAll("[data-step]")];
  const progress = [...$("surveyProgress").children];
  const normal = { title: $("settingsTitle").textContent, done: $("settingsDone").textContent };
  const last = STEPS.length - 1;
  let step = null;                    // the survey step on screen, or null when it's the normal settings
  const showStep = (n) => {
    step = n;
    stepCards.forEach((card) => { card.hidden = Number(card.dataset.step) !== n; });
    progress.forEach((bar, i) => bar.classList.toggle("on", i < n));
    $("surveyStepNo").textContent = n === 0 ? "Welcome" : `Question ${n} of ${last}`;
    $("settingsTitle").textContent = STEPS[n].title;
    $("settingsIntro").textContent = STEPS[n].intro;
    $("settingsIntro").hidden = !STEPS[n].intro;
    $("surveyBack").hidden = n === 0;
    $("settingsDone").textContent = n === 0 ? "Let's go" : n === last ? "Start" : "Next";
    frame.scrollTop = 0;
    $("settingsTitle").focus();      // screen readers read each step from its title
  };
  const openSurvey = () => {
    frame.classList.add("first-run");
    $("surveyTop").hidden = false;
    frame.hidden = false;
    showStep(0);
  };
  const finishSurvey = () => {
    save(settings);                   // even if nothing was changed, the defaults become your answers
    markSurveyDone();
    step = null;
    frame.classList.remove("first-run");
    $("surveyTop").hidden = true;
    $("surveyBack").hidden = true;
    stepCards.forEach((card) => { card.hidden = "surveyOnly" in card.dataset; });   // settings shows every card but the welcome
    $("settingsTitle").textContent = normal.title;
    $("settingsIntro").hidden = true;            // only the survey steps have an intro line
    $("settingsDone").textContent = normal.done;
    close();
    document.dispatchEvent(new Event("surveydone"));   // the home page's rating tab waits for this
  };

  gear.addEventListener("click", () => open(gear));
  document.querySelectorAll("[data-open-settings]").forEach((b) => b.addEventListener("click", () => open(b)));
  $("settingsBack").addEventListener("click", close);
  $("surveyBack").addEventListener("click", () => showStep(step - 1));
  $("settingsDone").addEventListener("click", () => {
    if (step === null) close();
    else if (step < last) showStep(step + 1);
    else finishSurvey();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !frame.hidden && step === null) close(); });

  // Tells app.js whether the survey is on screen, so the rating tab waits until it's done.
  const surveyOpen = surveyAsked() || !surveyDone();
  if (surveyOpen) openSurvey();
  return surveyOpen;
}
