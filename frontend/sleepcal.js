// Your sleep, one day at a time. Arrows (or a sideways swipe) move between days.
// Each day has a night bar and an optional nap bar; you drag the ends of a bar to
// change when it starts and ends, or drag the middle to slide the whole thing.
// Time uses the model convention: hours since midnight at the start of today.

import { hoursToClock } from "./time.js";

const FIRST_DAY = -2;                 // two days ago ...
const LAST_DAY = 1;                   // ... through tomorrow
// Each bar is a window of hours into its day. The night runs from 6 PM to noon the
// next day (36 = noon tomorrow), the nap window covers the afternoon.
const NIGHT = { startH: 18, endH: 36, stepH: 0.25, minH: 1, ticks: [18, 21, 24, 27, 30, 33, 36] };
const NAP = { startH: 11, endH: 19, stepH: 1 / 12, minH: 1 / 6, ticks: [11, 13, 15, 17, 19] };   // 5-minute steps, 10 minutes at least
const DEFAULT_NAP = { bed: 14, wake: 14 + 1 / 3 };   // a new nap starts as 2:00 to 2:20 PM
export const CALENDAR_END_H = (LAST_DAY + 1) * 24 + 12;   // noon after the last night: the last time this page covers

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const dateOf = (day) => { const d = new Date(); d.setDate(d.getDate() + day); return d; };
const dayLabel = (day) => ({ "-1": "Yesterday", 0: "Today", 1: "Tomorrow" })[day] ?? dateOf(day).toLocaleDateString(undefined, { weekday: "long" });
const dateLabel = (day) => dateOf(day).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const tickLabel = (h) => { const c = h % 24; return c === 0 ? "12a" : c === 12 ? "12p" : c < 12 ? `${c}a` : `${c - 12}p`; };
// "8 h", "7 h 30 m" or "20 min", whichever reads best for the length.
const lengthLabel = (h) => {
  const mins = Math.round(h * 60);
  if (mins < 60) return `${mins} min`;
  return mins % 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins / 60} h`;
};

export function initSleepCalendar(root, onChange = () => {}, usual = { bedtimeH: 23, wakeH: 7 }) {
  // One entry per day. Times are hours into that day (bedtime 23 = 11 PM, wake 31 =
  // 7 AM the next morning), so one day's math doesn't depend on which day it is.
  const nights = new Map();           // day -> { bed, wake }
  const naps = new Map();             // day -> { bed, wake } or nothing
  let shown = 0;                      // the day on screen
  let event = null;                   // { startH, endH } shaded on the bars

  // A bedtime before noon, like 1 AM, means after midnight.
  function usualNight({ bedtimeH, wakeH }) {
    const bed = bedtimeH < 12 ? bedtimeH + 24 : bedtimeH;
    return { bed, wake: bed + ((wakeH - bedtimeH + 24) % 24) };
  }
  function fillUsual(u) {
    for (let d = FIRST_DAY; d <= LAST_DAY; d++) nights.set(d, { ...usualNight(u) });
  }
  fillUsual(usual);

  // ---- build the one card
  const bar = (kind, name) => `
    <div class="bar ${kind}" data-kind="${kind}">
      <div class="bar-head">
        <strong>${name}</strong>
        <span class="bar-times"></span>
        <span class="chip plain bar-len"></span>
        ${kind === "nap" ? '<button type="button" class="link-btn bar-add">+ Add a nap</button><button type="button" class="bar-remove" aria-label="Remove the nap">×</button>' : ""}
      </div>
      <div class="bar-track" aria-label="${name}: drag the ends to change the start and end">
        <div class="bar-event" hidden></div>
        <div class="bar-span">
          <span class="bar-handle" data-edge="bed" aria-hidden="true"></span>
          <span class="bar-handle" data-edge="wake" aria-hidden="true"></span>
        </div>
      </div>
      <div class="bar-ticks">${(kind === "night" ? NIGHT : NAP).ticks.map((h) => `<span>${tickLabel(h)}</span>`).join("")}</div>
    </div>`;
  root.innerHTML = `
    <div class="day-card">
      <div class="day-nav">
        <button type="button" class="day-arrow" data-dir="-1" aria-label="Previous day"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></button>
        <div class="day-name"><strong></strong><small></small></div>
        <button type="button" class="day-arrow" data-dir="1" aria-label="Next day"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg></button>
      </div>
      <div class="day-body">${bar("night", "Night")}${bar("nap", "Nap")}</div>
      <div class="day-dots">${Array.from({ length: LAST_DAY - FIRST_DAY + 1 }, () => "<span></span>").join("")}</div>
    </div>`;
  const card = root.querySelector(".day-card");
  const body = root.querySelector(".day-body");
  const bars = { night: root.querySelector(".bar.night"), nap: root.querySelector(".bar.nap") };
  const limits = { night: NIGHT, nap: NAP };
  const spanOf = (kind) => (kind === "night" ? nights : naps).get(shown);

  function paintBar(kind) {
    const el = bars[kind], lim = limits[kind], span = spanOf(kind);
    const pct = (h) => `${((h - lim.startH) / (lim.endH - lim.startH)) * 100}%`;
    el.classList.toggle("empty", !span);   // an empty nap shows only its "Add a nap" line
    el.querySelector(".bar-times").textContent = span ? `${hoursToClock(span.bed)} – ${hoursToClock(span.wake)}` : "";
    el.querySelector(".bar-len").textContent = span ? lengthLabel(span.wake - span.bed) : "";
    const pill = el.querySelector(".bar-span");
    if (span) { pill.style.left = pct(span.bed); pill.style.width = pct(span.wake - span.bed + lim.startH); }
    // The event, if it falls inside this bar's window.
    const ev = el.querySelector(".bar-event");
    const a = event ? clamp(event.startH - shown * 24, lim.startH, lim.endH) : 0;
    const b = event ? clamp(event.endH - shown * 24, lim.startH, lim.endH) : 0;
    ev.hidden = !(event && b > a);
    if (!ev.hidden) { ev.style.left = pct(a); ev.style.width = pct(b - a + lim.startH); }
    el.classList.toggle("clash", Boolean(span) && !ev.hidden && span.wake > a && span.bed < b);   // asleep during the event
  }

  function paint() {
    root.querySelector(".day-name strong").textContent = dayLabel(shown);
    root.querySelector(".day-name small").textContent = dateLabel(shown);
    root.querySelectorAll(".day-arrow").forEach((b) => { b.disabled = shown + Number(b.dataset.dir) < FIRST_DAY || shown + Number(b.dataset.dir) > LAST_DAY; });
    root.querySelectorAll(".day-dots span").forEach((dot, i) => dot.classList.toggle("on", i === shown - FIRST_DAY));
    paintBar("night");
    paintBar("nap");
  }

  // ---- switch days: arrows, or a sideways swipe anywhere on the card but the bars
  function show(day, dir) {
    if (day < FIRST_DAY || day > LAST_DAY) return;
    shown = day;
    paint();
    body.classList.remove("from-left", "from-right");
    void body.offsetWidth;   // restart the slide animation
    body.classList.add(dir > 0 ? "from-right" : "from-left");
  }
  root.querySelectorAll(".day-arrow").forEach((b) => b.addEventListener("click", () => show(shown + Number(b.dataset.dir), Number(b.dataset.dir))));
  let swipe = null;
  card.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".bar-track, button")) return;
    swipe = { x: e.clientX, y: e.clientY };
  });
  card.addEventListener("pointerup", (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) show(shown - Math.sign(dx), -Math.sign(dx));
  });
  card.addEventListener("pointercancel", () => { swipe = null; });

  // ---- drag a bar: the ends move its start or end, the middle slides the whole thing
  body.addEventListener("pointerdown", (e) => {
    const track = e.target.closest(".bar-track");
    if (!track) return;
    const kind = track.closest(".bar").dataset.kind, lim = limits[kind], span = spanOf(kind);
    if (!span) return;
    const rect = track.getBoundingClientRect();
    const windowH = lim.endH - lim.startH;
    const snap = (h) => Math.round(h / lim.stepH) * lim.stepH;
    const hourAt = (x) => lim.startH + ((x - rect.left) / rect.width) * windowH;
    const edge = e.target.closest(".bar-handle")?.dataset.edge;
    const inSpan = Boolean(e.target.closest(".bar-span"));
    // Tapping an empty part of the track moves the nearest end there.
    const h0 = hourAt(e.clientX);
    const grab = edge ?? (inSpan ? "move" : Math.abs(h0 - span.bed) < Math.abs(h0 - span.wake) ? "bed" : "wake");
    const start = { x: e.clientX, bed: span.bed, wake: span.wake };
    track.setPointerCapture(e.pointerId);
    track.classList.add("dragging");

    const move = (ev) => {
      const h = snap(hourAt(ev.clientX));
      if (grab === "bed") span.bed = clamp(h, lim.startH, span.wake - lim.minH);
      else if (grab === "wake") span.wake = clamp(h, span.bed + lim.minH, lim.endH);
      else {
        const length = start.wake - start.bed;
        const dh = snap(((ev.clientX - start.x) / rect.width) * windowH);
        span.bed = clamp(start.bed + dh, lim.startH, lim.endH - length);
        span.wake = span.bed + length;
      }
      paintBar(kind);
    };
    if (grab !== "move") move(e);
    const end = () => {
      track.classList.remove("dragging");
      track.removeEventListener("pointermove", move);
      track.removeEventListener("pointerup", end);
      track.removeEventListener("pointercancel", end);
      onChange(getBlocks());
    };
    track.addEventListener("pointermove", move);
    track.addEventListener("pointerup", end);
    track.addEventListener("pointercancel", end);
  });

  // ---- add or remove the day's nap
  bars.nap.querySelector(".bar-add").addEventListener("click", () => {
    naps.set(shown, { ...DEFAULT_NAP });
    paintBar("nap");
    onChange(getBlocks());
  });
  bars.nap.querySelector(".bar-remove").addEventListener("click", () => {
    naps.delete(shown);
    paintBar("nap");
    onChange(getBlocks());
  });

  // ---- read everything back as sleep blocks for the model
  function getBlocks() {
    const blocks = [];
    for (const [d, s] of nights) blocks.push({ startH: d * 24 + s.bed, endH: d * 24 + s.wake, isNap: false });
    for (const [d, s] of naps) blocks.push({ startH: d * 24 + s.bed, endH: d * 24 + s.wake, isNap: true });
    return blocks.sort((a, b) => a.startH - b.startH);
  }

  // Shade the event so you can see where sleep sits relative to it.
  function setEvent(startH, endH) {
    event = { startH, endH };
    paint();
  }

  // Your usual sleep changed in settings: start every night over from it.
  function setUsual(newUsual) {
    fillUsual(newUsual);
    paint();
  }

  paint();
  onChange(getBlocks());
  return { getBlocks, setEvent, setUsual };
}
