// Your drinks log: each day's drinks, bedtime and body are saved on this device
// (local storage, "caffeineHistory"), keyed by date. Layer 1 saves today's on every
// change and draws the earlier days as small charts. Only the inputs are saved:
// the curves are recomputed from them by model/pk.py, like every other answer.

const KEY = "caffeineHistory";
export const KEEP_DAYS = 7;   // earlier days kept and shown; anything older is dropped

// The date as "2026-10-17" in local time, so a day starts at your midnight, not UTC's.
export function dateKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Local storage can be missing or blocked (private windows), so every use is guarded.
function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; }
}

// day: { doses, bedtimeH, weightKg, halfLifeH, smoker, oralContraceptives }
export function saveDay(key, day) {
  const all = load();
  all[key] = day;
  // Keep today plus the last KEEP_DAYS days. "2026-10-17" strings sort in date order.
  const keys = Object.keys(all).sort().slice(-(KEEP_DAYS + 1));
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(keys.map((k) => [k, all[k]])))); }
  catch { /* still works, just not remembered */ }
}

export function loadDay(key) {
  return load()[key] ?? null;
}

// Days before `key` that have at least one drink, newest first, as [dateKey, day].
export function earlierDays(key) {
  return Object.entries(load())
    .filter(([k, day]) => k < key && day.doses?.length)
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, KEEP_DAYS);
}

// "2026-10-17" -> a Date at local midnight that day.
const toDate = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

// The date key `days` days after `key` (negative goes back). "2026-10-18", -1 -> "2026-10-17".
export function shiftKey(key, days) {
  const date = toDate(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

// "Today", "Yesterday", or "Wed, Oct 14" for older days.
export function dayName(key, todayKey) {
  if (key === todayKey) return "Today";
  if (key === shiftKey(todayKey, -1)) return "Yesterday";
  return dateName(key);
}

// The day switcher's big name: "Today", "Yesterday", or the weekday ("Friday"), since
// the date sits under it and the switcher only goes back a week.
export function dayTitle(key, todayKey) {
  if (key === todayKey || key === shiftKey(todayKey, -1)) return dayName(key, todayKey);
  return toDate(key).toLocaleDateString(undefined, { weekday: "long" });
}

// "Sun, Oct 18", the date under the day name in the day switcher.
export function dateName(key) {
  return toDate(key).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
