// Talks to the Python model (api.py) using the JSON contract in TASKS.md.
//
// Until api.py exists, API_BASE is null and every call returns the fabricated
// sample responses in mock/. To switch to the real model, set:
//     const API_BASE = "http://localhost:8000";
const API_BASE = null;

export const usingMock = API_BASE === null;

async function post(route, body, mockFile) {
  if (usingMock) {
    const res = await fetch(`mock/${mockFile}`);
    return res.json();
  }
  const res = await fetch(`${API_BASE}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${route} returned ${res.status}`);
  return res.json();
}

export const getPlan = (req) => post("/api/plan", req, "plan_response.json");
export const getReset = (req) => post("/api/reset", req, "reset_response.json");
// The mock shows a wide "prior" until there are a few ratings, then a sharp posterior.
export const getLearn = (req) =>
  post("/api/learn", req, req.ratings.length >= 3 ? "learn_response.json" : "learn_prior.json");

// ---------- Time convention ----------
// The model measures time in decimal hours since midnight at the start of today
// ("day 0"). 14.5 = 2:30 PM today, 33.0 = 9:00 AM tomorrow.

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

// Turns the form values into the POST /api/plan request body.
export function buildPlanRequest(form) {
  const day = Number(form.eventDay);
  const start = clockToHours(form.eventStart, day);
  const end = start + Number(form.eventLength);

  // Last night: the most recent wake-up before the event, and the bedtime before that.
  let lastWake = clockToHours(form.wake, day);
  if (lastWake > start) lastWake -= 24;
  const nightLength = (clockToHours(form.wake) - clockToHours(form.bedtime) + 24) % 24;
  const lastBed = lastWake - nightLength;

  // Tonight: the first bedtime after the event ends.
  let nextBed = clockToHours(form.bedtime, day);
  if (nextBed <= end) nextBed += 24;

  return {
    event: { start_h: start, end_h: end },
    sleep: [
      { start_h: lastBed, end_h: lastWake, is_nap: false },
      { start_h: nextBed, end_h: nextBed + nightLength, is_nap: false },
    ],
    free_slots: [],
    fixed_doses: [],
    profile: {
      weight_kg: Number(form.weight), half_life_h: form.halfLife ?? 5, ka_per_h: 4, vd_l_per_kg: 0.6,
      kd_mg_l: 3, circadian_peak_h: 17, circadian_amp: 0.15,
      habitual_mg_per_day: Number(form.habitualMg), habit_weeks: 8,
    },
    allow_nap: form.allowNap,
  };
}
