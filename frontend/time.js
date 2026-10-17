// Time convention: the model measures time in decimal hours since midnight at the
// start of today ("day 0"). 14.5 = 2:30 PM today, 33.0 = 9:00 AM tomorrow.
// Only the frontend turns those into clock times and back.

export function clockToHours(hhmm, dayOffset = 0) {
  const [h, m] = hhmm.split(":").map(Number);
  return dayOffset * 24 + h + m / 60;
}

export function hoursToClock(hours, withDay = false) {
  const day = Math.floor(hours / 24);
  let minutes = Math.round((hours - day * 24) * 60);
  if (minutes === 24 * 60) minutes -= 1;
  const h24 = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, "0");
  const h12 = ((h24 + 11) % 12) + 1;
  const time = `${h12}:${mm} ${h24 < 12 ? "AM" : "PM"}`;
  if (!withDay) return time;
  return `${["Today", "Tomorrow"][day] ?? `In ${day} days`}, ${time}`;
}
