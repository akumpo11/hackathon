// Your drinks log: each day's drinks, bedtime and body are saved on this device
// (local storage, "caffeineHistory"), keyed by date. Layer 1 saves today's on every
// change and draws the earlier days as small charts. Only the inputs are saved:
// the curves are recomputed from them by model/pk.py, like every other answer.

const KEY = "caffeineHistory";
const KEEP_DAYS = 7;        // earlier days shown; anything older is dropped

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

// "2026-10-16" -> "Yesterday" (the day before todayKey), or "Wed, Oct 14" for older days.
const toDate = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export function dayName(key, todayKey) {
  const yesterday = toDate(todayKey);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === dateKey(yesterday)) return "Yesterday";
  return toDate(key).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
