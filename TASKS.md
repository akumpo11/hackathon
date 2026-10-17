# Work Breakdown: three people, all Python

Companion to PLAN.md. Roles: A (kinetics, optimizer, learning), B (sleep, alertness, tolerance), C (app, charts, deploy, demo).

Tiers follow CLAUDE.md: Tier 1 is the caffeine plan, the curve graph, and the sleep check. Tier 2 is the tolerance estimate, reset plan, and nap plan. Tier 3 is the personalized model from ratings. Saturday afternoon is Tier 1, Saturday evening is Tier 2, Sunday morning is Tier 3.

Rule of the day: every file has exactly one owner, and the owner can explain every line of it to a judge. If you use AI to write something, rewrite it until you could have written it yourself.

Why Python for the model: judges weight understanding at 30%, and the math is the product. The original plan used Streamlit for the UI; a teammate is now building a separate frontend, so the model is exposed through a thin FastAPI layer instead. See the update directly below.

---

## Update, Saturday afternoon: who is actually doing what

Reality: one teammate is prototyping a frontend (not Streamlit), one is on the calculations, and Andrew is unassigned. Mapping onto the roles below:

- Frontend teammate = Person C, minus Streamlit. They build whatever they are prototyping, against the JSON contract below.
- Calculations teammate = Person A: `pk.py`, `optimizer.py`, later `learn.py`.
- Andrew = Person B (`sleep.py`, `alertness.py`, `tolerance.py`) plus the glue: `types.py`, `params.py`, the FastAPI layer in `api.py`, and the sample JSON the frontend builds against. Being the glue is the right job for the person who has read the whole plan.

### The one change to the workflow: an API boundary

With a separate frontend, the model needs to be reachable over HTTP. Add one file, `api.py`, with FastAPI. It contains no math; it converts JSON to dataclasses, calls `model/`, and converts the result back. The math stays in pure Python with pytest, exactly as planned.

```bash
uv pip install fastapi uvicorn
uvicorn api:app --reload --port 8000     # frontend dev server calls http://localhost:8000
```

Add `CORSMiddleware` with `allow_origins=["*"]` so the frontend dev server can call it. Pydantic models in `api.py` mirror the dataclasses in `model/types.py` field for field.

### JSON contract (agree on this in the next 30 minutes, then nobody changes it alone)

All times are decimal hours since midnight of day 0, same as the model. The frontend converts clock times.

`POST /api/plan`

```json
{
  "event": {"start_h": 33.0, "end_h": 35.0},
  "sleep": [{"start_h": 23.5, "end_h": 31.0, "is_nap": false}, {"start_h": 47.0, "end_h": 55.0, "is_nap": false}],
  "free_slots": [{"start_h": 31.5, "end_h": 32.5}],
  "fixed_doses": [{"time_h": 31.25, "mg": 95, "label": "drip coffee"}],
  "profile": {"weight_kg": 70, "half_life_h": 5, "ka_per_h": 4, "vd_l_per_kg": 0.6, "kd_mg_l": 3,
              "circadian_peak_h": 17, "circadian_amp": 0.15, "habitual_mg_per_day": 190, "habit_weeks": 8},
  "allow_nap": true
}
```

Response:

```json
{
  "doses": [{"time_h": 32.25, "mg": 150, "label": "recommended"}],
  "nap": {"start_h": 31.5, "end_h": 31.83, "is_nap": true},
  "score": 0.82,
  "bedtime_caffeine_mg": 38.0,
  "strength_percent": 64.0,
  "curve": {"t": [31.0, 31.1, "..."], "conc": ["..."], "pressure": ["..."], "felt": ["..."], "alertness": ["..."]}
}
```

`POST /api/reset` takes `{"profile": {...}, "exam_in_days": 5}` and returns `{"quit_in_days": 2, "taper_days": 3, "reason": "...", "days": [{"day": 0, "R": 1.5, "intake_mg": 190, "withdrawal": 0.0}, "..."]}` for both cold turkey and the taper (`"cold_turkey": [...], "taper": [...]`).

`POST /api/learn` takes `{"ratings": [{"t": 33.0, "score": 4}], "doses": [...], "sleep": [...], "profile": {...}}` and returns `{"half_lives": [...], "kds": [...], "prob": [[...]], "mean_half_life": 4.6, "mean_kd": 2.9}`.

### Unblocking the frontend today

The frontend should not wait for the model. Andrew writes `sample/plan_response.json` by hand right now, matching the response above with a plausible curve (50 points is enough), and commits it. The frontend renders that file until the real endpoint exists, then swaps the URL. Same for `sample/reset_response.json` tonight.

### Storage: none

The model is stateless. Every request carries everything it needs and every answer is recomputed from formulas, so Tier 1 and Tier 2 store nothing. No database, no hosted backend service.

Tier 3 ratings need to persist between visits. Keep them in the browser's local storage on the frontend and send them along with each `/api/learn` request. If a shared store is ever needed, Python's built-in `sqlite3` with one table `ratings(user_id, t_h, score)` is enough and takes ten lines. Decide that on Sunday, not now.

### Deployment with a separate frontend

Two deploys instead of one: the frontend on Vercel or Netlify, the API on Render or Railway (free tiers, deploy from the GitHub repo with a start command of `uvicorn api:app --host 0.0.0.0 --port $PORT`). Do the API deploy Saturday evening so the Sunday morning is not spent on it. Fallback that always works: run both on the demo laptop and show it there; the phone QR link becomes a stretch goal instead of a given.

### Andrew's next two hours, in order

1. Push `model/types.py`, `model/params.py`, `requirements.txt`, and the `.venv` gitignore (Step 0 below, minus Streamlit).
2. Write `sample/plan_response.json` and send the contract to the frontend teammate.
3. Write `api.py` with the three routes calling stub functions that return the sample JSON. Run it, confirm the frontend can fetch it.
4. Start `sleep.py` (B1). The calculations teammate should be on `pk.py` (A1) by then; check that their function signature matches `concentration(t, doses, p)`.

---

## Step 0: Everyone together, first 45 minutes (12:00 to 12:45)

1. Whiteboard the five layers from PLAN.md section 1. Each person re-derives one formula out loud.
2. C runs the setup and pushes the skeleton:

```bash
brew install uv
cd hackathon
uv venv --python 3.12
source .venv/bin/activate
uv pip install numpy plotly streamlit pytest
uv pip freeze > requirements.txt     # Streamlit Cloud reads this
mkdir -p model tests && touch model/__init__.py
echo ".venv/" >> .gitignore
```

3. C creates `model/types.py` and `model/params.py` exactly as below and pushes. Nobody edits these without telling the group.
4. C creates a one-line `app.py` (`import streamlit as st; st.title("Caffeine Optimizer")`), pushes, and deploys on Streamlit Community Cloud (share.streamlit.io, sign in with GitHub, pick the repo, main file `app.py`). Get the public URL now, not Sunday. The repo must be public.
5. Everyone pulls, activates the venv, runs `streamlit run app.py` and `pytest`. Agree: commit small, pull before push, never force-push main.

### Shared contract

Time convention: all times are decimal hours since midnight at the start of "day 0" (the day the plan starts). 14.5 means 2:30 PM today. 38.0 means 2:00 PM tomorrow. Only `app.py` touches clock times; the model never sees a datetime.

`model/types.py`:

```python
from dataclasses import dataclass, field

@dataclass
class Dose:
    time_h: float      # hours since midnight day 0
    mg: float
    label: str = ""

@dataclass
class SleepBlock:
    start_h: float
    end_h: float
    is_nap: bool = False

@dataclass
class EventWindow:
    start_h: float
    end_h: float      # start + event length

@dataclass
class FreeSlot:
    start_h: float
    end_h: float      # a window where a nap could fit (optional input from CLAUDE.md)

@dataclass
class Profile:
    weight_kg: float = 70.0
    half_life_h: float = 5.0
    ka_per_h: float = 4.0
    vd_l_per_kg: float = 0.6
    kd_mg_l: float = 3.0
    circadian_peak_h: float = 17.0
    circadian_amp: float = 0.15
    habitual_mg_per_day: float = 200.0
    habit_weeks: float = 8.0

@dataclass
class Plan:
    doses: list                 # list[Dose]
    nap: SleepBlock | None
    score: float                # mean alertness over the event window, 0..1
    bedtime_caffeine_mg: float
    curve: dict                 # {"t": array, "conc": array, "pressure": array, "felt": array, "alertness": array}
```

`model/params.py`:

```python
TAU_WAKE_H = 18.2
TAU_SLEEP_H = 4.2
TAU_TOLERANCE_DAYS = 4.0
STEP_H = 0.1
DAILY_LIMIT_MG = 400
SINGLE_LIMIT_MG = 200
BEDTIME_LIMIT_MG = 50
DRINKS = {"espresso": 63, "drip coffee (8 oz)": 95, "black tea": 47, "green tea": 28,
          "Diet Coke": 46, "Red Bull": 80, "Monster": 160, "Celsius": 200, "5-hour Energy": 200}
```

Curves are numpy arrays over a shared time grid. Every curve function takes `t` as a numpy array and returns an array of the same shape. That one convention keeps everything vectorized and lets Plotly plot it directly.

Dependencies, so you know who is waiting on whom:

    A: pk.py ───────────────────┐
    B: sleep.py ─► alertness.py ─► A: optimizer.py ─► C: app.py
    B: tolerance.py ────────────────────────────────► C: Reset tab
    A: learn.py (Sunday, needs alertness.py) ───────► C: Learn tab

A and B each have about 90 minutes before anyone else needs them. C builds the app against hand-typed fake arrays until then.

---

## Person A: pharmacokinetics, optimizer, learning

Files: `model/pk.py`, `model/optimizer.py`, `model/learn.py`, their tests.
Judge line: "I own how caffeine moves through the body, how we search for the best schedule, and how the app learns your half-life."

### A1. pk.py (Tier 1, done by 2:00 PM)

```python
import numpy as np
from .types import Dose, Profile

def elimination_rate(p: Profile) -> float:
    """ke = ln2 / half-life. First-order kinetics: rate out is proportional to amount in."""
    return np.log(2) / p.half_life_h

def volume_l(p: Profile) -> float:
    return p.vd_l_per_kg * p.weight_kg

def peak_time_h(p: Profile) -> float:
    """Set d/dt of the Bateman function to zero: ke*exp(-ke t) = ka*exp(-ka t)  =>  t = ln(ka/ke)/(ka-ke)."""
    ka, ke = p.ka_per_h, elimination_rate(p)
    return np.log(ka / ke) / (ka - ke)

def concentration(t, doses: list, p: Profile):
    """Blood caffeine in mg/L at times t (numpy array). One-compartment model with first-order
    absorption (ka) and elimination (ke). The model is linear, so doses add (superposition)."""
    t = np.asarray(t, dtype=float)
    ka, ke, vd = p.ka_per_h, elimination_rate(p), volume_l(p)
    total = np.zeros_like(t)
    for d in doses:
        dt = t - d.time_h
        active = dt >= 0                              # a dose contributes nothing before it is taken
        term = (d.mg / vd) * ka / (ka - ke) * (np.exp(-ke * dt) - np.exp(-ka * dt))
        total += np.where(active, term, 0.0)
    return total

def body_caffeine_mg(t, doses, p):
    """Total caffeine in the body = concentration x volume. Used for the bedtime limit."""
    return concentration(t, doses, p) * volume_l(p)
```

Steps: type the above, understand every line, then write `tests/test_pk.py`:
- Single 100 mg at t=0: value at `peak + half_life` is about half the value at `peak` (within 10%; absorption is not fully finished at the peak, say that to the judge if asked why not exact).
- `concentration(t, [d1, d2])` equals `concentration(t, [d1]) + concentration(t, [d2])`.
- `np.argmax` of a fine scan over 0 to 3 h lands within 0.02 h of `peak_time_h`.
- Concentration is 0 before the dose.
- 100 mg at 70 kg peaks around 1.5 to 2.5 mg/L (sanity against published values).

### A2. optimizer.py (Tier 1 v1 by 6:00 PM, Tier 2 naps by 9:00 PM)

Needs B's `alertness.py`. Until it lands, test against a stub that returns `1 - S*(1-occ)`.

```python
def best_plan(event: EventWindow, sleep: list, p: Profile, tolerance: float,
              allow_nap: bool, free_slots: list | None = None,
              daily_limit=400, single_limit=200, bedtime_limit=50) -> Plan
```

Key insight, and your best judge talking point: sleep pressure and circadian do not depend on the doses. Precompute them once at the exam sample points; inside the search only recompute concentration.

Steps:
1. Sample points: `ts = np.arange(event.start_h, event.end_h + 1e-9, 0.25)` (a 3 h exam gives 13 points). `t_bed` = start of the first non-nap sleep block after the event. `wake` = end of the last sleep block before the event.
2. Precompute `S = sleep_pressure(ts, sleep)` and `circ = circadian(ts, p)` with B's functions.
3. `score(doses)`: `conc = concentration(ts, doses, p)`; `alert = alertness_from(S, circ, conc, tolerance, inertia=0)` (B's pure helper, vectorized); return `alert.mean()`.
4. `feasible(doses)`: total mg <= daily limit, each <= single limit, each `time_h >= wake`, and `body_caffeine_mg(t_bed, doses, p) <= bedtime_limit`.
5. Candidate grid: `times = np.arange(wake, event.end_h, 0.25)`, `sizes = [50, 100, 150, 200]`.
6. v1: loop over every (time, size), keep the best feasible single dose. Test: for a point event (`start_h == end_h`) the dose lands at `start_h - peak_time_h` within 15 min.
7. v2: loop over all pairs with `itertools.combinations` (about 40 slots x 4 sizes, choose 2: roughly 13k candidates, each scoring 13 points: well under a second). Then a greedy third dose: holding the best pair, try every single addition and keep it only if it improves the score by more than 1%. Judge line: "exhaustive where it is cheap, greedy where it is not."
8. Naps (if `allow_nap`): candidates are no nap, plus a 20-min nap starting at each 30-min slot from `wake + 2` to `event.start_h - 1`. If `free_slots` is given, keep only candidates that fit entirely inside a slot (CLAUDE.md: "free time slots: when a nap could fit"). Because the nap only wins if it raises the exam score, a well-rested user gets no nap, which is the "no nap if it isn't needed" rule for free. A nap changes S, so for each candidate recompute `S` with the nap appended to `sleep` and rerun steps 5 to 7. About 20 candidates. Also add the inertia term at the sample points for that nap (B's `inertia(ts, sleep)`), since a nap ending inside the exam would be penalized correctly.
9. Build the `Plan`: doses, nap, score, bedtime mg, and the full curve from `wake` to `t_bed` via B's `alertness_curve`.
10. Tie-break: among plans within 1% of the best score, prefer the lowest total mg. Judges like that the app is not pushing caffeine.

Tests: point event lands at `start - peak`; bedtime constraint keeps the last dose out of the final hour when bedtime is 2 h after the event; total never exceeds 400 mg.

### A3. learn.py (Tier 3, Sunday 8:00 to 10:00 AM)

```python
@dataclass
class Rating:
    t: float
    score: int      # 1 = exhausted ... 5 = fully alert (CLAUDE.md uses a 1 to 5 scale)

def posterior(ratings, doses, sleep, p: Profile, tolerance) -> dict
    # returns {"half_lives": array(20), "kds": array(20), "prob": array(20,20), "mean_half_life": float, "mean_kd": float}
def simulate_week(true_half_life, p: Profile) -> tuple[list, list, list]   # ratings, doses, sleep
```

Steps:
1. Grid: `half_lives = np.linspace(3, 8, 20)`, `kds = np.linspace(1, 6, 20)`.
2. Prior (log space): `-0.5*((h-5)/1.5)**2 - 0.5*((kd-3)/1.5)**2` on the 20x20 meshgrid. Comment: "population values; the prior keeps one rating from dragging the estimate anywhere."
3. Observation on the model scale: `observed = (score - 1) / 4`, so 1 -> 0.0 and 5 -> 1.0. Tell judges the Karolinska Sleepiness Scale is the 9-point research version; we use 5 points because nobody will tap 9 buttons on a phone.
4. Log-likelihood per cell: for each cell build `Profile(**{**vars(p), "half_life_h": h, "kd_mg_l": kd})`, compute predicted alertness at the rating times with B's `alertness_at(ts, doses, sleep, p2, tolerance)`, and add `-0.5*((observed - predicted)/0.15)**2` summed over ratings. 400 cells x a few ratings is instant.
5. `log_post = log_prior + log_lik; prob = np.exp(log_post - log_post.max()); prob /= prob.sum()`. Judge line: "Bayes' rule on a grid: posterior is proportional to prior times likelihood, and 400 cells is nothing."
6. Means: `mean_half_life = (prob.sum(axis=1) * half_lives).sum()` (check which axis is which with a test).
7. `simulate_week`: 3 days, awake 7 AM to 11 PM, doses at 8 AM and 1 PM of 100 mg, 4 ratings a day at 9, 12, 15, 20 generated from the model at `true_half_life` plus `np.random.normal(0, 0.1)`, converted back to a 1 to 5 score with `round(1 + 4 * value)` clipped to [1, 5]. Powers the demo button so the heatmap converges on stage.
8. Uncertainty band, last, 10 lines: sample 200 half-lives from the marginal with `np.random.choice(half_lives, 200, p=marginal)`, compute 200 concentration curves, take `np.percentile(..., [10, 90], axis=0)`. C shades it.

Tests: no ratings gives the normalized prior; `simulate_week(3.5)` then `posterior` recovers 3.5 within 0.7 h, same for 7.0; `prob.sum()` is 1.

---

## Person B: sleep, alertness, tolerance

Files: `model/sleep.py`, `model/alertness.py`, `model/tolerance.py`, tests.
Judge line: "I own the two-process model of sleep, how caffeine changes felt sleep pressure, and why coffee stops working."

### B1. sleep.py (Tier 1, done by 2:30 PM)

```python
def circadian(t, p: Profile):            # p.circadian_amp * cos(2π (t - peak)/24)
def is_asleep(t, sleep: list) -> np.ndarray   # boolean array
def sleep_pressure(t, sleep: list) -> np.ndarray
```

Steps:
1. `circadian`: one cosine, peak at 5 PM, trough at 5 AM. Comment that real circadian curves have harmonics and we keep the first term.
2. `is_asleep`: `np.zeros_like(t, bool)`, OR together `(t >= b.start_h) & (t < b.end_h)` for each block.
3. `sleep_pressure`: build an internal fine grid from `t.min() - 48` to `t.max()` with step `STEP_H` (the 48 h burn-in lets the starting guess wash out; time constants are under a day. Say this to the judge). Start `S = 0.5`. March forward:
   - asleep: `S = S * exp(-STEP_H / TAU_SLEEP_H)`
   - awake:  `S = 1 - (1 - S) * exp(-STEP_H / TAU_WAKE_H)`
   These are the exact solutions of `dS/dt = -S/tau_s` and `dS/dt = (1-S)/tau_w` over one step, so there is no integration error. Put that sentence in a comment. Store the fine curve, then `np.interp(t, fine_t, fine_S)` to return values at the requested times.
   For the burn-in, assume the person's sleep schedule repeats: if the earliest block starts at 23 h, shift copies of all blocks back by 24 and 48 h. Keep it simple: a helper `_repeat_back(sleep, days=2)`.
4. The optimizer calls this many times with different nap lists. It is a 500-step loop in pure Python, about 1 ms; fine. If profiling shows it matters, use `functools.lru_cache` keyed on a tuple of the blocks.

Tests: 8 h sleep + 16 h wake repeated 3 days gives the same S at each wake-up within 0.01; 4 h nights make S at wake-up rise each day (sleep debt); `circadian` is maximal at `circadian_peak_h`.

### B2. alertness.py (Tier 1, done by 4:30 PM)

```python
def occupancy(conc, kd):                      # conc / (conc + kd): Langmuir binding, fraction of receptors blocked
def felt_pressure(S, conc, tolerance, p):     # S * tolerance * (1 - occupancy)
def inertia(t, sleep: list) -> np.ndarray
def alertness_from(S, circ, conc, tolerance, inertia_val):   # clip(1 - felt + circ - inertia, 0, 1)
def alertness_at(t, doses, sleep, p, tolerance) -> np.ndarray
def alertness_curve(doses, sleep, p, tolerance, t0, t1) -> dict   # the Plan.curve dict
```

Steps:
1. `occupancy`: comment "caffeine is a competitive antagonist at adenosine receptors; Kd is the concentration at half block; this is why 400 mg is not 4x 100 mg."
2. `felt_pressure`: `tolerance` is the receptor ratio R/R0 from your tolerance.py, 1.0 for a non-user.
3. `inertia`: for each t, find the most recent block that ended at or before t. Let `length = end - start`, `since = t - end`. Amplitude by length: `<= 0.35 h: 0.10`, `<= 1.0 h: 0.35`, `<= 1.75 h: 0.20`, else `0.25` (full night). Return `amp * exp(-since / 0.5)`. Comment: "grogginess after waking; worst after deep sleep (30 to 60 min naps), mild after a 20-min nap, gone in about 30 min." Vectorize by looping over blocks and using `np.where(since >= 0, ...)` to take the latest.
4. `alertness_at`: `S = sleep_pressure(t, sleep)`, `conc = concentration(t, doses, p)` (A's), combine, and set alertness to 0 where `is_asleep`.
5. `alertness_curve`: `t = np.arange(t0, t1, STEP_H)`, return the dict of arrays the Plan expects.

Tests: `occupancy(3, 3) == 0.5`; no caffeine and normal sleep gives the minimum between 3 and 6 AM; 100 mg at 9 AM raises 10 AM alertness more than 10 PM alertness; a 20-min nap at 2 PM beats a 60-min nap at 2 PM at 3 PM, and both beat no nap by 4 PM. If that last test fails, tune the inertia amplitudes, not the test; the coffee-nap demo depends on it.

### B3. tolerance.py (Tier 2, done by 10:00 PM)

```python
def steady_state_conc(mg_per_day, p):        # mg_per_day / (ke * vd * 24)
def receptor_ratio_now(p):                   # R/R0 after habit_weeks at habitual intake
def simulate_reset(p, quit_in_days, taper_days, horizon_days) -> dict   # arrays: day, R, intake_mg, withdrawal
def recommend_quit_day(p, exam_in_days) -> dict   # {"quit_in_days", "taper_days", "reason"}
def feels_like_mg(dose_mg, p, R) -> float    # required: powers "your coffee feels like 60% strength"
def strength_percent(dose_mg, p, R) -> float # 100 * feels_like_mg / dose_mg
```

Steps:
1. `steady_state_conc`: at steady state, in = out. Clearance is `ke * vd` litres per hour, so average concentration is daily dose over clearance times 24. At defaults 300 mg/day is about 2.2 mg/L.
2. Receptor target: `R_target = 1 + G * steady_state_conc`, `G = 0.23` per mg/L so that 300 mg/day gives R about 1.5. Judge line: "chronic caffeine upregulates adenosine receptors by roughly 20 to 50%; G is tuned to that."
3. `receptor_ratio_now`: `1 + (R_target - 1) * (1 - exp(-habit_days / TAU_TOLERANCE_DAYS))`.
4. `simulate_reset`: loop over days. Intake: habitual before the quit day, linear taper from habitual to 0 over `taper_days`, then 0. Update `R += (R_target(intake) - R) / TAU_TOLERANCE_DAYS` (a one-day Euler step; fine because tau is 4 days and say so). Withdrawal on that day: `(R - 1) * (1 - occupancy(steady_state_conc(intake), kd))`, the felt pressure above baseline. Return arrays.
5. `recommend_quit_day`: try `quit_in_days` in 0..exam_in_days and `taper_days` in {0, 3, 5}; keep options with `R[exam] <= 1.1`; among those minimize the peak withdrawal in the 3 days before the exam. If none qualifies, take the lowest `R[exam]` and say so. Write `reason` as a sentence the app prints: "Quit in 2 days with a 3-day taper: receptors back to 1.06x by the exam, worst day Oct 21."
6. `feels_like_mg` (do this right after step 3, it is a Tier 2 output in CLAUDE.md): a non-user with caffeine level c_eq feels pressure `S * (1 - occ(c_eq))`; you with tolerance R feel `S * R * (1 - occ(c))`. Set them equal and solve for c_eq with the Langmuir equation: `1 - occ(c_eq) = R * (1 - occ(c))`, so `occ(c_eq) = 1 - R*(1 - occ(c))` and `c_eq = kd * occ / (1 - occ)`. Convert c to mg with the peak concentration of that dose (A's `concentration` at `peak_time_h`) and back. `strength_percent` is `100 * c_eq_mg / dose_mg`, printed as "your coffee feels like 60% strength". If `occ(c_eq)` comes out below 0 the dose is fully cancelled by tolerance; clamp to 0 and say "feels like 0%".

Tests: 0 mg/day gives R == 1; 300 mg/day for 8 weeks gives R within 0.05 of 1.5; after quitting R decreases monotonically and is under 1.1 within 10 days; taper has lower peak withdrawal than cold turkey.

---

## Person C: Streamlit app, charts, deploy, demo

Files: `app.py`, `ui/` helpers if it grows, `README.md`, deployment.
Judge line: "I own the product: how your inputs become a plan on screen, and the data flow through the app."

### C1. Setup and deploy (12:45 PM, see Step 0)

### C2. Time helpers and state (by 2:00 PM)

`ui/timeconv.py`:
```python
def clock_to_hours(t: datetime.time, day_offset: int) -> float    # 14:30 tomorrow -> 38.5
def hours_to_clock(h: float) -> str                                # 38.5 -> "2:30 PM (tomorrow)"
```
Test both; they are the classic bug source. Streamlit's `st.time_input` returns a `datetime.time`.

Streamlit reruns the whole script on every widget change, so there is no state machine to design. Read widgets at the top, convert to model inputs in one function `to_model_inputs()`, call the model, draw. Use `st.session_state` only for the ratings list and the last plan.

### C3. Inputs (by 3:30 PM)
Use `st.sidebar` for inputs and the main area for results. One screen.
- Event: `st.radio("Day", ["today", "tomorrow"])`, `st.time_input` for the start, `st.number_input("Length (hours)", 0.5, 6.0, 2.0, 0.5)`. Build `EventWindow(start, start + length)`.
- Sleep: last night's bedtime and wake, tonight's planned bedtime. An `st.expander("More nights")` with two extra nights for the sleep-debt feature.
- Drinks already taken or planned: `st.multiselect` from `DRINKS` with a time each (keep simple: one time per drink). These are fixed doses passed into the optimizer, which adds recommendations on top.
- Profile: weight slider, checkboxes "smoker (x0.5 half-life)", "oral contraceptives (x2)", "slow metabolizer (x1.5)", chronotype radio (early/normal/late shifts `circadian_peak_h` by -2/0/+2), habitual mg/day slider, habit weeks.
- `st.checkbox("Allow a nap")`, and under it an `st.expander("Free time slots for a nap")` with up to two start/end time pairs that become `FreeSlot`s. Empty means any time is fine.
- `st.button("Plan my caffeine")`.
Wrap the model call in `@st.cache_data` keyed on the inputs so dragging a slider does not re-run the optimizer unnecessarily. Pass plain tuples/floats into cached functions; dataclasses are fine if hashable, otherwise convert.

### C4. Chart (by 5:30 PM, with fake arrays until A and B land)
Plotly `make_subplots(specs=[[{"secondary_y": True}]])`:
- Alertness (0 to 10, left axis). Multiply the model's 0..1 by 10 for display.
- Caffeine mg/L (right axis).
- `fig.add_vrect` shaded for the event window, lighter for sleep blocks and the nap.
- `fig.add_vline` at each dose with annotation "150 mg".
- Hover shows time as clock text: build a `customdata` column with `hours_to_clock`.
- Shaded 10th to 90th percentile band when A's uncertainty band exists (Sunday).
Keep `ui/demo_curve.py` with hand-typed arrays so you can style before the model exists.

### C5. Plan card (by 7:00 PM)
`st.metric` row: predicted exam alertness (x/10), total mg, and the sleep check: caffeine at bedtime with a delta vs the 50 mg limit and `st.error` if over. On Saturday night add a fourth metric, "coffee strength", from B's `strength_percent`. Then a plain list:
- "12:50 PM: 150 mg (about 1.5 drip coffees)"
- "1:00 PM: 20-minute nap"
`st.warning` if any limit is within 10%. Optional: "Download calendar (.ics)" via `st.download_button` with a hand-built ICS string (20 lines).

### C6. What-if mode (by 9:00 PM)
Under the chart, one `st.slider` per recommended dose for its time, defaulting to the recommendation. Recompute `alertness_curve` with the edited doses (not the optimizer) and redraw. Show the new exam score next to the optimal one. Proves the model is live, not a lookup table.

### C7. Reset tab (Tier 2, Saturday 10 PM) and Learn tab (Tier 3, Sunday 8:00 to 10:00 AM)
`tab_plan, tab_reset, tab_learn = st.tabs([...])`.
- Reset: inputs are habitual intake and exam date (`st.date_input`). Show `recommend_quit_day` as a sentence and a Plotly chart of `simulate_reset` with cold turkey and taper lines for R and withdrawal. Show "your 200 mg feels like N mg" if B finished it.
- Learn: five buttons labelled 1 (exhausted) to 5 (fully alert), "rate now" appends `(current time in hours, score)` to `st.session_state.ratings`. "Simulate a week" button calls A's `simulate_week`. Draw `prob` with `px.imshow(prob, x=kds, y=half_lives)`. Show the posterior mean half-life and a button "use my learned half-life" that overrides the profile.

### C8. Sunday 10:00 to 11:30
README: problem, the five formulas (one sentence each, in PLAN.md order), how to run, who did what, sources, "model for learning, not medical advice". Verify the deployed URL loads on a phone. Make a QR code (any QR site, or `uv pip install qrcode` and 3 lines). Run the demo script twice with a timer. Add `st.caption("Not medical advice")` to the footer.

---

## Integration checkpoints (whole team, 5 minutes each)

- 2:30 PM: pk.py and sleep.py merged; C replaces fake arrays with `concentration` and `sleep_pressure`. First real curve on screen.
- 5:00 PM: alertness.py and optimizer v1 merged; the plan card shows one recommended dose. Screenshot it. This is your fallback demo.
- 9:00 PM: optimizer v2 with naps and the what-if slider. Check that a coffee nap appears when a nap is allowed and the event is 2 to 3 h after wake-up. If not, A and B tune inertia amplitudes before sleeping.
- 10:30 PM: tolerance.py merged into the Reset tab. Go to sleep. Use the app to pick tomorrow's coffee time and tell the judges you did.
- Sunday 9:30 AM: learn.py merged; "simulate a week" converges on the heatmap.
- Sunday 10:00 AM: feature freeze. Bug fixes, README, rehearsal, submit by 12:30.

Cut order if behind: uncertainty band, then learn.py (replace with a manual half-life slider), then the taper option, then naps. Never cut: curve, optimizer, bedtime constraint, deploy.

## Judge-proofing checklist (each person, Sunday 10:30 AM)
- Open your file. Pick any line. Explain it in one breath.
- State the formula you implemented and one assumption behind it.
- State one thing you learned that you did not know Saturday morning.
- State one limitation of your part.
