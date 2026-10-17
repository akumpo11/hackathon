// Calendar-style sleep input: one column per day, one row per half hour.
// Press and drag over cells to mark sleep; drag over marked cells to erase.
// Time uses the model convention: hours since midnight at the start of today.

const SLOT_H = 0.5;
const SLOTS_PER_DAY = 24 / SLOT_H;
const FIRST_DAY = -2;                 // columns run from two days ago ...
const LAST_DAY = 2;                   // ... to two days ahead
const DAYS = LAST_DAY - FIRST_DAY + 1;
const NAP_MAX_H = 3;

const slotOf = (day, row) => (day - FIRST_DAY) * SLOTS_PER_DAY + row;
const hoursOf = (slot) => FIRST_DAY * 24 + slot * SLOT_H;

export function initSleepCalendar(root, onChange = () => {}) {
  const asleep = new Set();
  const cells = [];

  // Default week: 11:30 PM to 7:00 AM every night, so the grid starts out filled in.
  for (let day = FIRST_DAY; day <= LAST_DAY; day++) {
    for (let row = 0; row < SLOTS_PER_DAY; row++) {
      const h = row * SLOT_H;
      if (h < 7 || (h >= 23.5 && day < LAST_DAY)) asleep.add(slotOf(day, row));
    }
  }

  // ---- build the grid
  const grid = document.createElement("div");
  grid.className = "cal";
  grid.style.setProperty("--days", DAYS);

  const corner = document.createElement("div");
  corner.className = "cal-corner";
  grid.append(corner);
  const today = new Date();
  for (let day = FIRST_DAY; day <= LAST_DAY; day++) {
    const d = new Date(today); d.setDate(d.getDate() + day);
    const head = document.createElement("div");
    head.className = "cal-head" + (day === 0 ? " today" : "");
    head.innerHTML = `<small>${d.toLocaleDateString(undefined, { weekday: "short" })}</small><strong>${d.getDate()}</strong>`;
    grid.append(head);
  }

  for (let row = 0; row < SLOTS_PER_DAY; row++) {
    const label = document.createElement("div");
    label.className = "cal-hour";
    if (row % 6 === 0) {
      const h = row * SLOT_H;
      label.textContent = h === 0 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`;
    }
    grid.append(label);
    for (let day = FIRST_DAY; day <= LAST_DAY; day++) {
      const cell = document.createElement("div");
      cell.className = "cal-cell" + (row % 2 === 0 ? " on-hour" : "");
      cell.dataset.slot = slotOf(day, row);
      cells[slotOf(day, row)] = cell;
      grid.append(cell);
    }
  }
  root.replaceChildren(grid);

  function paint() {
    cells.forEach((c, i) => c.classList.toggle("sleep", asleep.has(i)));
  }

  // ---- press and drag to paint
  let mode = null;                    // "add" or "remove" for the current drag
  const slotAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el?.classList.contains("cal-cell") ? Number(el.dataset.slot) : null;
  };
  const apply = (slot) => {
    if (slot === null) return;
    if (mode === "add") asleep.add(slot); else asleep.delete(slot);
    cells[slot].classList.toggle("sleep", mode === "add");
  };

  grid.addEventListener("pointerdown", (e) => {
    const slot = slotAt(e.clientX, e.clientY);
    if (slot === null) return;
    mode = asleep.has(slot) ? "remove" : "add";
    grid.setPointerCapture(e.pointerId);
    apply(slot);
  });
  grid.addEventListener("pointermove", (e) => {
    if (mode) apply(slotAt(e.clientX, e.clientY));
  });
  const end = () => { if (mode) { mode = null; onChange(getBlocks()); } };
  grid.addEventListener("pointerup", end);
  grid.addEventListener("pointercancel", end);

  // ---- read the grid back as sleep blocks
  function getBlocks() {
    const sorted = [...asleep].sort((a, b) => a - b);
    const blocks = [];
    for (const s of sorted) {
      const last = blocks.at(-1);
      if (last && last.endSlot === s) last.endSlot = s + 1;   // touching cells merge, even across midnight
      else blocks.push({ startSlot: s, endSlot: s + 1 });
    }
    return blocks.map((b) => {
      const startH = hoursOf(b.startSlot), endH = hoursOf(b.endSlot);
      return { startH, endH, isNap: endH - startH <= NAP_MAX_H };
    });
  }

  // Shade the event so you can see where sleep sits relative to it.
  function setEvent(startH, endH) {
    cells.forEach((c, i) => {
      const t = hoursOf(i);
      c.classList.toggle("event", t >= startH && t < endH);
    });
  }

  paint();
  onChange(getBlocks());
  return { getBlocks, setEvent };
}
