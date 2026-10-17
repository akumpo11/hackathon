// Personal settings (frame 6): the values that describe you rather than your day.
// The gear in the top right opens this frame. Settings are saved on this device
// (local storage) and published through shared.js, so layers 1, 2 and 3 read them
// instead of asking again. It also holds the color theme. No math here.
//
// The first time the app opens on a device, this same frame opens as a survey
// you have to finish (Start) before you see the layers.

import { publish } from "./shared.js";

const $ = (id) => document.getElementById(id);
const KEY = "caffeineSettings";
const SURVEY_KEY = "caffeineSurveyDone";   // set once the first-run survey is finished on this device

// Field names match model/schema.py's Profile where they can, so they pass straight through.
const DEFAULTS = {
  weightKg: 70, halfLifeH: 5, smoker: false, oralContraceptives: false,
  chronotypeShiftH: 0, habitualMgPerDay: 300, habitWeeks: 8,
  theme: "coffee",
};

// The themes styles.css defines with :root[data-theme="..."]. Coffee is the default.
const THEMES = ["coffee", "mint", "ocean", "berry", "night"];

// Switches every color token at once. Charts read the tokens when they draw, and
// every page redraws when settings change, so they pick up the new colors too.
function applyTheme(theme) {
  document.documentElement.dataset.theme = THEMES.includes(theme) ? theme : DEFAULTS.theme;
  const canvas = getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", canvas);   // the phone's status bar
}

// How each setting reads on the layer pages' "Settings" rows.
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const SHOW = {
  weightKg: (v) => `${v} kg`,
  halfLifeH: (v) => `${v.toFixed(1)} h`,
  smoker: (v) => (v ? "Yes" : "No"),
  oralContraceptives: (v) => (v ? "Yes" : "No"),
  chronotypeShiftH: (v) => ({ "-2": "Morning person", 0: "In between", 2: "Night owl" })[v],
  habitualMgPerDay: (v) => `${v} mg (${(v / 95).toFixed(1)} coffees)`,
  habitWeeks: (v) => plural(v, "week"),
};

// Local storage can be missing or blocked (private windows), so every use is guarded.
function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
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

function fillForm(form, s) {
  const el = form.elements;
  el.weight.value = s.weightKg;
  el.halfLife.value = s.halfLifeH;
  el.smoker.checked = s.smoker;
  el.oralContraceptives.checked = s.oralContraceptives;
  el.chronotype.value = String(s.chronotypeShiftH);
  el.habitualMg.value = s.habitualMgPerDay;
  el.habitWeeks.value = s.habitWeeks;
  el.theme.value = s.theme;
}

function readForm(form) {
  const el = form.elements;
  return {
    weightKg: Number(el.weight.value),
    halfLifeH: Number(el.halfLife.value),
    smoker: el.smoker.checked,
    oralContraceptives: el.oralContraceptives.checked,
    chronotypeShiftH: Number(el.chronotype.value),
    habitualMgPerDay: Number(el.habitualMg.value),
    habitWeeks: Number(el.habitWeeks.value),
    theme: el.theme.value,
  };
}

// Writes the current values into the settings form's slider labels and every
// [data-setting] row on the layer pages.
function show(form, s) {
  const out = (name, text) => { form.querySelector(`output[data-for="${name}"]`).textContent = text; };
  out("weight", SHOW.weightKg(s.weightKg));
  out("halfLife", SHOW.halfLifeH(s.halfLifeH));
  out("habitualMg", SHOW.habitualMgPerDay(s.habitualMgPerDay));
  out("habitWeeks", SHOW.habitWeeks(s.habitWeeks));
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
  show(form, settings);
  publish("settings", settings);      // before the layers start, so they can read it right away

  form.addEventListener("input", () => {
    settings = readForm(form);
    applyTheme(settings.theme);       // before publishing, so pages redraw in the new colors
    save(settings);
    show(form, settings);
    publish("settings", settings);
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

  // First-run survey: the same frame and fields, with welcome text, no way back,
  // and Start instead of Done. Finishing it saves your answers and remembers the device.
  const normal = { title: $("settingsTitle").textContent, intro: $("settingsIntro").textContent, done: $("settingsDone").textContent };
  let inSurvey = false;
  const openSurvey = () => {
    inSurvey = true;
    frame.classList.add("first-run");
    $("settingsTitle").textContent = "Welcome! Tell us about you";
    $("settingsIntro").textContent =
      "A few questions so every layer is about you, not an average person. You can change them later with the gear in the top right.";
    $("settingsDone").textContent = "Start";
    frame.hidden = false;
    frame.scrollTop = 0;
    $("settingsTitle").focus();      // screen readers start at the welcome text
  };
  const finishSurvey = () => {
    save(settings);                   // even if nothing was changed, the defaults become your answers
    markSurveyDone();
    inSurvey = false;
    frame.classList.remove("first-run");
    $("settingsTitle").textContent = normal.title;
    $("settingsIntro").textContent = normal.intro;
    $("settingsDone").textContent = normal.done;
    close();
  };

  gear.addEventListener("click", () => open(gear));
  document.querySelectorAll("[data-open-settings]").forEach((b) => b.addEventListener("click", () => open(b)));
  $("settingsBack").addEventListener("click", close);
  $("settingsDone").addEventListener("click", () => (inSurvey ? finishSurvey() : close()));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !frame.hidden && !inSurvey) close(); });

  if (!surveyDone()) openSurvey();
}
