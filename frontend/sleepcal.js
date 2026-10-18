// Your sleep, one day at a time. Arrows (or a sideways swipe) move between days.
// Each day reads in time order: the night before it (bed the evening before, up that
// morning), then an optional nap that afternoon. So the day of your event shows the
// night before it, the event and any nap on the same card. You drag the ends of a bar
// to change when it starts and ends, or drag the middle to slide the whole thing.
// Time uses the model convention: hours since midnight at the start of today.

import { hoursToClock } from "./time.js";

// The model always gets the nights from two days ago through tomorrow. A night belongs
// to the day it starts on (nights.get(0) is tonight) but shows on the next day's card,
// so the cards run one day later: yesterday to the day after tomorrow. The back arrow
// goes as far as you like; an older day only joins the model once you change it (see getBlocks).
const FIRST_DAY = -2;                 // two days ago ...
const LAST_DAY = 1;                   // ... through tomorrow
const LAST_CARD = LAST_DAY + 1;       // its night is tomorrow night; the page ends at noon that day, so it has no nap
// Each bar is a window of hours into its day. The night runs from 6 PM to noon the
// next day (36 = noon tomorrow), the nap window covers the afternoon.
// leadH is how much room a bar keeps before the event when it grows to show it (see windowFor).
export const NIGHT = { startH: 18, endH: 36, stepH: 0.25, minH: 1, leadH: 0, ticks: [18, 21, 24, 27, 30, 33, 36] };
const NAP = { startH: 11, endH: 19, stepH: 1 / 12, minH: 1 / 6, leadH: 2, ticks: [11, 13, 15, 17, 19] };   // 5-minute steps, 10 minutes at least
const DEFAULT_NAP = { bed: 14, wake: 14 + 1 / 3 };   // a new nap starts as 2:00 to 2:20 PM
export const CALENDAR_END_H = (LAST_DAY + 1) * 24 + 12;   // noon after the last night: the last time this page covers

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const dateOf = (day) => { const d = new Date(); d.setDate(d.getDate() + day); return d; };
const dayLabel = (day) => ({ "-1": "Yesterday", 0: "Today", 1: "Tomorrow" })[day] ?? dateOf(day).toLocaleDateString(undefined, { weekday: "long" });
const dateLabel = (day) => dateOf(day).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
export const tickLabel = (h) => { const c = h % 24; return c === 0 ? "12am" : c === 12 ? "12pm" : c < 12 ? `${c}am` : `${c - 12}pm`; };
// "8 h", "7 h 30 m" or "20 min", whichever reads best for the length.
const lengthLabel = (h) => {
  const mins = Math.round(h * 60);
  if (mins < 60) return `${mins} min`;
  return mins % 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins / 60} h`;
};

// Your usual night as { bed, wake } hours on the night bar. A bedtime before noon, like
// 1 AM, means after midnight. The bar only covers 6 PM to noon, so a night that doesn't
// fit (an afternoon bedtime like 12 PM) is cut to that window instead of spilling off
// the bar into the day before. Settings uses this too, so both bars agree.
export function usualNight({ bedtimeH, wakeH }) {
  const bed = bedtimeH < 12 ? bedtimeH + 24 : bedtimeH;
  const wake = bed + ((wakeH - bedtimeH + 24) % 24);
  const fitBed = clamp(bed, NIGHT.startH, NIGHT.endH - NIGHT.minH);
  return { bed: fitBed, wake: clamp(wake, fitBed + NIGHT.minH, NIGHT.endH) };
}

// The hours a bar shows. If the event pokes into the bar, the bar grows one tick at a time
// until the whole event fits, so a 10 AM to 2 PM exam isn't cut off at the night bar's noon
// edge. It also keeps lim.leadH hours before the event, so a morning exam still leaves room
// on the nap bar to nap before it. ev is in the bar's hours, or null. Growing by whole ticks
// keeps them evenly spaced.
function windowFor(lim, ev) {
  if (!ev || ev.endH <= lim.startH - lim.leadH || ev.startH >= lim.endH) return lim;
  const step = lim.ticks[1] - lim.ticks[0];
  let startH = lim.startH, endH = lim.endH;
  while (startH > ev.startH - lim.leadH) startH -= step;
  while (endH < ev.endH) endH += step;
  const ticks = Array.from({ length: Math.round((endH - startH) / step) + 1 }, (_, i) => startH + i * step);
  return { ...lim, startH, endH, ticks };
}

export function initSleepCalendar(root, onChange = () => {}, usual = { bedtimeH: 23, wakeH: 7 }) {
  // One entry per day. Times are hours into that day (bedtime 23 = 11 PM, wake 31 =
  // 7 AM the next morning), so one day's math doesn't depend on which day it is.
  // A day you haven't changed has no entry and shows your usual night.
  const nights = new Map();           // day -> { bed, wake }
  const naps = new Map();             // day -> { bed, wake } or nothing
  let usualSpan = usualNight(usual);  // { bed, wake } for a night you haven't changed
  let shown = 0;                      // the day on screen: last night's sleep and today's nap
  let event = null;                   // { startH, endH } shaded on the bars

  const nightOf = (day) => nights.get(day) ?? usualSpan;

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
      <div class="bar-ticks"></div>
    </div>`;
  root.innerHTML = `
    <div class="day-card">
      <div class="day-nav">
        <button type="button" class="day-arrow" data-dir="-1" aria-label="Previous day"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg></button>
        <div class="day-name"><strong></strong><small></small></div>
        <button type="button" class="day-arrow" data-dir="1" aria-label="Next day"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg></button>
      </div>
      <div class="day-body">${bar("night", "Night before")}${bar("nap", "Nap")}</div>
      <div class="day-dots">${Array.from({ length: LAST_CARD - FIRST_DAY }, () => "<span></span>").join("")}</div>
    </div>`;
  const card = root.querySelector(".day-card");
  const body = root.querySelector(".day-body");
  const bars = { night: root.querySelector(".bar.night"), nap: root.querySelector(".bar.nap") };
  const limits = { night: NIGHT, nap: NAP };
  // The day a bar's hours count from: the night on screen started the evening before.
  const dayOf = (kind) => (kind === "night" ? shown - 1 : shown);
  const spanOf = (kind) => (kind === "night" ? nightOf(dayOf(kind)) : naps.get(shown));
  // The event in a bar's hours (on the night bar, 9 AM on the shown day is 33), or null.
  const eventOn = (kind) => {
    const offset = dayOf(kind) * 24;
    return event ? { startH: event.startH - offset, endH: event.endH - offset } : null;
  };
  // The bar's window on the shown day, and the event inside it, if any.
  const windowOf = (kind) => windowFor(limits[kind], eventOn(kind));
  const eventIn = (kind) => {
    const ev = eventOn(kind), win = windowOf(kind);
    return ev && ev.endH > win.startH && ev.startH < win.endH ? ev : null;
  };

  // What a bar can't overlap, in its hours: the event, and the other sleep around it (a nap
  // can't overlap last night or tonight, and a night can't overlap a nap).
  const wallsFor = (kind) => {
    const offset = dayOf(kind) * 24;
    const other = kind === "nap" ? [shown - 1, shown].map((d) => [d, nightOf(d)])
      : [shown - 1, shown].filter((d) => naps.has(d)).map((d) => [d, naps.get(d)]);
    const sleep = other.map(([d, s]) => ({ startH: d * 24 + s.bed - offset, endH: d * 24 + s.wake - offset }));
    return [eventIn(kind), ...sleep].filter(Boolean);
  };

  function paintBar(kind) {
    const el = bars[kind], win = windowOf(kind), span = spanOf(kind);
    const pct = (h) => `${((h - win.startH) / (win.endH - win.startH)) * 100}%`;
    el.classList.toggle("empty", !span);   // an empty nap shows only its "Add a nap" line
    el.querySelector(".bar-times").textContent = span ? `${hoursToClock(span.bed)} – ${hoursToClock(span.wake)}` : "";
    el.querySelector(".bar-len").textContent = span ? lengthLabel(span.wake - span.bed) : "";
    el.querySelector(".bar-ticks").innerHTML = win.ticks.map((h) => `<span>${tickLabel(h)}</span>`).join("");
    const pill = el.querySelector(".bar-span");
    if (span) {
      // Kept inside the bar, in case the event moved and the bar shrank back.
      const a = clamp(span.bed, win.startH, win.endH), b = clamp(span.wake, win.startH, win.endH);
      pill.style.left = pct(a); pill.style.width = pct(b - a + win.startH);
    }
    // The event, if it falls inside this bar's window.
    const shade = el.querySelector(".bar-event"), ev = eventIn(kind);
    shade.hidden = !ev;
    if (ev) { shade.style.left = pct(ev.startH); shade.style.width = pct(ev.endH - ev.startH + win.startH); }
    el.classList.toggle("clash", Boolean(span && ev) && span.wake > ev.startH && span.bed < ev.endH);   // asleep during the event
  }

  function paint() {
    root.querySelector(".day-name strong").textContent = dayLabel(shown);
    root.querySelector(".day-name small").textContent = dateLabel(shown);
    root.querySelectorAll(".day-arrow").forEach((b) => { b.disabled = shown + Number(b.dataset.dir) > LAST_CARD; });
    // The dots cover yesterday through the day after tomorrow; on an older day none is lit.
    root.querySelectorAll(".day-dots span").forEach((dot, i) => dot.classList.toggle("on", i === shown - FIRST_DAY - 1));
    bars.nap.hidden = shown > LAST_DAY;
    paintBar("night");
    paintBar("nap");
  }

  // ---- switch days: arrows, or a sideways swipe anywhere on the card but the bars
  function show(day, dir) {
    if (day > LAST_CARD) return;   // no limit going back
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

  // ---- drag a bar (see dragBar below)
  body.addEventListener("pointerdown", (e) => {
    const track = e.target.closest(".bar-track");
    if (!track) return;
    const kind = track.closest(".bar").dataset.kind;
    // Dragging a usual night makes it this day's own, so the change sticks.
    if (kind === "night" && !nights.has(dayOf(kind))) nights.set(dayOf(kind), { ...usualSpan });
    const span = spanOf(kind), win = windowOf(kind);
    // The event is a wall: you can't drag sleep into the time you need to be awake.
    if (span) dragBar(e, track, win, span, () => paintBar(kind), () => onChange(getBlocks()), wallsFor(kind));
  });

  // ---- add or remove the day's nap
  bars.nap.querySelector(".bar-add").addEventListener("click", () => {
    // A new nap goes at 2 PM, or if that hits the event or a night, just after the event,
    // or just before it.
    const length = DEFAULT_NAP.wake - DEFAULT_NAP.bed, win = windowOf("nap"), walls = wallsFor("nap"), ev = eventIn("nap");
    const fits = (bed) => bed >= win.startH && bed + length <= win.endH && walls.every((w) => bed + length <= w.startH || bed >= w.endH);
    const bed = [DEFAULT_NAP.bed, ev?.endH, ev && ev.startH - length].find((b) => b != null && fits(b)) ?? DEFAULT_NAP.bed;
    naps.set(shown, { bed, wake: bed + length });
    paintBar("nap");
    onChange(getBlocks());
  });
  bars.nap.querySelector(".bar-remove").addEventListener("click", () => {
    naps.delete(shown);
    paintBar("nap");
    onChange(getBlocks());
  });

  // ---- read everything back as sleep blocks for the model
  // Every night from the oldest day you changed (or two days ago) through tomorrow,
  // with no gaps: a missing night would read to the model as a night spent awake.
  function getBlocks() {
    const blocks = [];
    const oldest = Math.min(FIRST_DAY, ...nights.keys(), ...naps.keys());
    for (let d = oldest; d <= LAST_DAY; d++) {
      const s = nightOf(d);
      blocks.push({ startH: d * 24 + s.bed, endH: d * 24 + s.wake, isNap: false });
    }
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
    usualSpan = usualNight(newUsual);
    nights.clear();
    paint();
  }

  paint();
  onChange(getBlocks());
  return { getBlocks, setEvent, setUsual };
}

// Drags one bar: the ends move its start or end, the middle slides the whole thing,
// and tapping an empty part of the track moves the nearest end there. span is
// { bed, wake } in the hours lim covers, and is changed in place. onMove repaints
// after every step; onEnd runs once when you let go. Settings uses this too.
// walls is a list of { startH, endH } the bar can't overlap (the event): an end stops
// at a wall, and a sliding bar jumps to the other side once its middle passes the wall's.
export function dragBar(e, track, lim, span, onMove, onEnd, walls = []) {
  const rect = track.getBoundingClientRect();
  const windowH = lim.endH - lim.startH;
  const snap = (h) => Math.round(h / lim.stepH) * lim.stepH;
  const hourAt = (x) => lim.startH + ((x - rect.left) / rect.width) * windowH;
  const edge = e.target.closest(".bar-handle")?.dataset.edge;
  const inSpan = Boolean(e.target.closest(".bar-span"));
  const h0 = hourAt(e.clientX);
  const grab = edge ?? (inSpan ? "move" : Math.abs(h0 - span.bed) < Math.abs(h0 - span.wake) ? "bed" : "wake");
  const start = { x: e.clientX, bed: span.bed, wake: span.wake };
  // How far each end can go before it reaches a wall, from where the bar started.
  const bedFloor = Math.max(lim.startH, ...walls.filter((w) => w.endH <= start.wake).map((w) => w.endH));
  const wakeCeiling = Math.min(lim.endH, ...walls.filter((w) => w.startH >= start.bed).map((w) => w.startH));
  track.setPointerCapture(e.pointerId);
  track.classList.add("dragging");

  const move = (ev) => {
    const h = snap(hourAt(ev.clientX));
    if (grab === "bed") span.bed = clamp(h, bedFloor, span.wake - lim.minH);
    else if (grab === "wake") span.wake = clamp(h, span.bed + lim.minH, wakeCeiling);
    else {
      const length = start.wake - start.bed;
      const dh = snap(((ev.clientX - start.x) / rect.width) * windowH);
      let bed = start.bed + dh;
      const wall = walls.find((w) => bed < w.endH && bed + length > w.startH);
      if (wall) bed = bed + length / 2 < (wall.startH + wall.endH) / 2 ? wall.startH - length : wall.endH;
      bed = clamp(bed, lim.startH, lim.endH - length);
      if (walls.some((w) => bed < w.endH && bed + length > w.startH)) return;   // no room on that side: stay put
      span.bed = bed;
      span.wake = bed + length;
    }
    onMove();
  };
  if (grab !== "move") move(e);
  const end = () => {
    track.classList.remove("dragging");
    track.removeEventListener("pointermove", move);
    track.removeEventListener("pointerup", end);
    track.removeEventListener("pointercancel", end);
    onEnd();
  };
  track.addEventListener("pointermove", move);
  track.addEventListener("pointerup", end);
  track.addEventListener("pointercancel", end);
}
