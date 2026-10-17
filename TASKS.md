# Work Breakdown: three people, all Python

Companion to PLAN.md. Roles: A (kinetics, optimizer, learning), B (sleep, alertness, tolerance), C (app, charts, deploy, demo).

Tiers follow CLAUDE.md: Tier 1 is the caffeine plan, the curve graph, and the sleep check. Tier 2 is the tolerance estimate, reset plan, and nap plan. Tier 3 is the personalized model from ratings. Saturday afternoon is Tier 1, Saturday evening is Tier 2, Sunday morning is Tier 3.

Rule of the day: every file has exactly one owner, and the owner can explain every line of it to a judge. If you use AI to write something, rewrite it until you could have written it yourself.

Why Python for the model: judges weight understanding at 30%, and the math is the product. The original plan used Streamlit for the UI; a teammate is now building a separate frontend, so the model is exposed through a thin FastAPI layer instead. See the update directly below.

---

## Update, Saturday afternoon: who is actually doing what

Owners by layer (see PLAN.md section 1 for the layers):

| Layer | Owner | Files |
|---|---|---|
| 1. Pharmacokinetics | Andrew | `model/pk.py` |
| 2. Sleep and circadian | Evan | `model/sleep.py`, `equations/` |
| 3. Alertness | Nolan | `model/alertness.py` |
| 4. Tolerance and reset | Andrew | `model/tolerance.py` |
| 5a. Optimizer | Evan | `model/optimizer.py` |
| 5b. Learning (Sunday) | Evan | `model/learn.py` |
| Frontend, deploy, demo | Nolan | the frontend, `README.md` |
| Glue: contract, API | Andrew | `model/schema.py`, `model/params.py`, `api.py` |

Nolan owns both the frontend and layer 3. Layer 3 is a 60-line file that joins Andrew's concentration and Evan's sleep pressure, so the person drawing the curve also owns the formula that produces it. It slots in at 2:30 PM between the inputs form and the chart.

### The one change to the workflow: an API boundary

With a separate frontend, the model needs to be reachable over HTTP. Add one file, `api.py`, with FastAPI. It contains no math; it converts JSON to dataclasses, calls `model/`, and converts the result back. The math stays in pure Python with pytest, exactly as planned.

```bash
uv pip install fastapi uvicorn
uvicorn api:app --reload --port 8000     # frontend dev server calls http://localhost:8000
```

Add `CORSMiddleware` with `allow_origins=["*"]` so the frontend dev server can call it. Pydantic models in `api.py` mirror the dataclasses in `model/schema.py` field for field.

### JSON contract (agree on this in the next 30 minutes, then nobody changes it alone)

All times are decimal hours since midnight of day 0, same as the model. The frontend converts clock times.

`POST /api/plan`

```json
{
  "event": {"startH": 33.0, "endH": 35.0},
  "sleep": [{"startH": 23.5, "endH": 31.0, "isNap": false}, {"startH": 47.0, "endH": 55.0, "isNap": false}],
  "freeSlots": [{"startH": 31.5, "endH": 32.5}],
  "fixedDoses": [{"timeH": 31.25, "mg": 95, "label": "drip coffee"}],
  "profile": {"weightKg": 70, "halfLifeH": 5, "kdMgL": 3, "circadianPeakH": 17,
              "habitualMgPerDay": 190, "habitWeeks": 8},
  "allowNap": true
}
```

Response:

```json
{
  "doses": [{"timeH": 32.25, "mg": 150, "label": "recommended"}],
  "nap": {"startH": 31.5, "endH": 31.83, "isNap": true},
  "score": 0.82,
  "bedtimeCaffeineMg": 38.0,
  "strengthPercent": 64.0,
  "curve": {"t": [31.0, 31.1, "..."], "conc": ["..."], "pressure": ["..."], "felt": ["..."], "alertness": ["..."]}
}
```

`POST /api/reset` takes `{"profile": {...}, "examInDays": 5}` and returns `{"quitInDays": 2, "taperDays": 3, "reason": "...", "days": [{"day": 0, "R": 1.5, "intakeMg": 190, "withdrawal": 0.0}, "..."]}` for both cold turkey and the taper (`"coldTurkey": [...], "taper": [...]`).

`POST /api/learn` takes `{"ratings": [{"t": 33.0, "score": 4}], "doses": [...], "sleep": [...], "profile": {...}}` and returns `{"halfLives": [...], "kds": [...], "prob": [[...]], "meanHalfLife": 4.6, "meanKd": 2.9}`.

### Unblocking the frontend today

Done: Nolan's `frontend/mock/` has fabricated plan, reset and learn responses in the contract shape. The frontend renders those until `api.py` is live, then sets `API_BASE` in `frontend/api.js`.

### Storage: none

The model is stateless. Every request carries everything it needs and every answer is recomputed from formulas, so Tier 1 and Tier 2 store nothing. No database, no hosted backend service.

Tier 3 ratings need to persist between visits. Keep them in the browser's local storage on the frontend and send them along with each `/api/learn` request. If a shared store is ever needed, Python's built-in `sqlite3` with one table `ratings(userId, tH, score)` is enough and takes ten lines. Decide that on Sunday, not now.

### Deployment with a separate frontend

Two deploys instead of one: the frontend on Vercel or Netlify, the API on Render or Railway (free tiers, deploy from the GitHub repo with a start command of `uvicorn api:app --host 0.0.0.0 --port $PORT`). Do the API deploy Saturday evening so the Sunday morning is not spent on it. Fallback that always works: run both on the demo laptop and show it there; the phone QR link becomes a stretch goal instead of a given.

Open question for the team: the layer pages already run `model/` in the browser with Pyodide (see `frontend/README.md`). If the full plan runs that way too, the app is a static site (GitHub Pages), with no `api.py`, no Render, and no cold starts. The cost is a 10 to 15 s first load. Decide before anyone builds `api.py`.

### Andrew's next steps, in order

1. Done: `model/schema.py`, `model/params.py`, `requirements.txt`, `.gitignore`.
2. `pk.py` (A1). The 2:30 PM checkpoint needs `concentration`, and alertness.py already calls it.
3. `pk.py` tests, then `feelsLikeMg` and `strengthPercent` in tolerance.py (A2 step 6), which need `concentration`.
4. `api.py` stubs that return the `frontend/mock/` JSON, unless the team decides to run the whole model in the browser (see Deployment above).

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

3. Andrew creates `model/schema.py` and `model/params.py` and pushes. Nobody edits these without telling the group.
4. C creates a one-line `app.py` (`import streamlit as st; st.title("Caffeine Optimizer")`), pushes, and deploys on Streamlit Community Cloud (share.streamlit.io, sign in with GitHub, pick the repo, main file `app.py`). Get the public URL now, not Sunday. The repo must be public.
5. Everyone pulls, activates the venv, runs `streamlit run app.py` and `pytest`. Agree: commit small, pull before push, never force-push main.

### Shared contract

Time convention: all times are decimal hours since midnight at the start of "day 0" (the day the plan starts). 14.5 means 2:30 PM today. 38.0 means 2:00 PM tomorrow. Only the frontend touches clock times; the model never sees a datetime.

The contract lives in `model/schema.py` (dataclasses: Dose, SleepBlock, EventWindow, FreeSlot, Profile, Plan) and `model/params.py` (constants, limits, drink table). Read those files rather than copying code from here. Inputs are `frozen=True`, so build a changed copy with `dataclasses.replace(p, halfLifeH=4)` instead of assigning. It is called `schema.py` so it never shadows Python's built-in `types` module.

Curves are numpy arrays over a shared time grid. Every curve function takes `t` as a numpy array and returns an array of the same shape. That one convention keeps everything vectorized and lets the charts plot it directly.

Dependencies, so you know who is waiting on whom:

    Andrew: pk.py (layer 1) ─────────────┐
    Evan:   sleep.py (layer 2) ──────────┼─► Nolan: alertness.py (layer 3) ─► Evan: optimizer.py ─► Andrew: api.py ─► Nolan: frontend
    Andrew: tolerance.py (layer 4) ──────┘                                                          
    Evan:   learn.py (Sunday, needs alertness.py) ──────────────────────────────────────────────► Nolan: Learn tab

Evan and Andrew each have about 90 minutes before anyone else needs them. Nolan builds the frontend against hand-typed fake arrays until then, and starts alertness.py at 2:30 PM when layers 1 and 2 are merged.

---

## Evan: sleep (layer 2), optimizer, learning

Files: `model/sleep.py`, `model/optimizer.py`, `model/learn.py`, their tests, `equations/`.
Judge line: "I own the two-process model of sleep, how we search for the best schedule, and how the app learns your half-life."

### E1. sleep.py (Tier 1, done by 2:30 PM)

```python
def circadian(t, p: Profile):            # CIRCADIAN_AMP * cos(2π (t - p.circadianPeakH)/24)
def isAsleep(t, sleep: list) -> np.ndarray   # boolean array
def sleepPressure(t, sleep: list) -> np.ndarray
```

Steps:
1. `circadian`: one cosine, peak at 5 PM, trough at 5 AM. Comment that real circadian curves have harmonics and we keep the first term.
2. `isAsleep`: `np.zeros_like(t, bool)`, OR together `(t >= b.startH) & (t < b.endH)` for each block.
3. `sleepPressure`: build an internal fine grid from `t.min() - 48` to `t.max()` with step `STEP_H` (the 48 h burn-in lets the starting guess wash out; time constants are under a day. Say this to the judge). Start `S = 0.5`. March forward:
   - asleep: `S = S * exp(-STEP_H / TAU_SLEEP_H)`
   - awake:  `S = 1 - (1 - S) * exp(-STEP_H / TAU_WAKE_H)`
   These are the exact solutions of `dS/dt = -S/tau_s` and `dS/dt = (1-S)/tau_w` over one step, so there is no integration error. Put that sentence in a comment. Store the fine curve, then `np.interp(t, fineT, fineS)` to return values at the requested times.
   For the burn-in, assume the person's sleep schedule repeats: copy only the earliest night (not naps) back by 24 and 48 h with a helper `_repeatBack(sleep, days=2)`. Copying every block would overlap extra nights and repeat naps, adding sleep that never happened. The frontend sends last night and tonight (`buildPlanRequest` in `frontend/api.js`).
4. The optimizer calls this many times with different nap lists. It is a 500-step loop in pure Python, about 1 ms; fine. If profiling shows it matters, use `functools.lru_cache` keyed on a tuple of the blocks.

Once sleep.py exists, load it on the layer 2 page through Pyodide the way `layer3.js` loads alertness.py, and delete `frontend/sleepmodel.js`. That file is a JavaScript copy of this math, and CLAUDE.md keeps all calculations in Python. Keep `equations/layer-2-sleep.md` in step with the code.

Tests: 8 h sleep + 16 h wake repeated 3 days gives the same S at each wake-up within 0.01; 4 h nights make S at wake-up rise each day (sleep debt); `circadian` is maximal at `circadianPeakH`.

### E2. optimizer.py (Tier 1 v1 by 6:00 PM, Tier 2 naps by 9:00 PM)

Needs Nolan's `alertness.py`. Until it lands, test against a stub that returns `1 - S*(1-occ)`.

```python
def bestPlan(event: EventWindow, sleep: list, p: Profile, tolerance: float,
              allowNap: bool, freeSlots: list | None = None,
              dailyLimit=400, singleLimit=200, bedtimeLimit=50) -> Plan
```

Key insight, and your best judge talking point: sleep pressure and circadian do not depend on the doses. Precompute them once at the exam sample points; inside the search only recompute concentration.

Steps:
1. Sample points: `ts = np.arange(event.startH, event.endH + 1e-9, 0.25)` (a 3 h exam gives 13 points). `tBed` = start of the first non-nap sleep block after the event. `wake` = end of the last sleep block before the event.
2. Precompute `S = sleepPressure(ts, sleep)` and `circ = circadian(ts, p)` with your own sleep.py functions.
3. `score(doses)`: `conc = concentration(ts, doses, p)`; `alert = alertnessFrom(S, circ, conc, tolerance, 0, p.kdMgL)` (Nolan's pure helper, vectorized); return `alert.mean()`.
4. `feasible(doses)`: total mg <= daily limit, each <= single limit, each `timeH >= wake`, and `bodyCaffeineMg(tBed, doses, p) <= bedtimeLimit`.
5. Candidate grid: `times = np.arange(wake, event.endH, 0.25)`, `sizes = [50, 100, 150, 200]`.
6. v1: loop over every (time, size), keep the best feasible single dose. Test: for a point event (`startH == endH`) the dose lands at `startH - peakTimeH` within 15 min.
7. v2: loop over all pairs with `itertools.combinations` (about 40 slots x 4 sizes, choose 2: roughly 13k candidates, each scoring 13 points: well under a second). Then a greedy third dose: holding the best pair, try every single addition and keep it only if it improves the score by more than 1%. Judge line: "exhaustive where it is cheap, greedy where it is not."
8. Naps (if `allowNap`): candidates are no nap, plus a 20-min nap starting at each 30-min slot from `wake + 2` to `event.startH - 1`. If `freeSlots` is given, keep only candidates that fit entirely inside a slot (CLAUDE.md: "free time slots: when a nap could fit"). Because the nap only wins if it raises the exam score, a well-rested user gets no nap, which is the "no nap if it isn't needed" rule for free. A nap changes S, so for each candidate recompute `S` with the nap appended to `sleep` and rerun steps 5 to 7. About 20 candidates. Also add the inertia term at the sample points for that nap (Nolan's `inertia(ts, sleep)`), since a nap ending inside the exam would be penalized correctly.
9. Build the `Plan`: doses, nap, score, bedtime mg, and the full curve from `wake` to `tBed` via Nolan's `alertnessCurve`.
10. Tie-break: among plans within 1% of the best score, prefer the lowest total mg. Judges like that the app is not pushing caffeine.

Tests: point event lands at `start - peak`; bedtime constraint keeps the last dose out of the final hour when bedtime is 2 h after the event; total never exceeds 400 mg.

### E3. learn.py (Tier 3, Sunday 8:00 to 10:00 AM)

```python
@dataclass
class Rating:
    t: float
    score: int      # 1 = exhausted ... 5 = fully alert (CLAUDE.md uses a 1 to 5 scale)

def posterior(ratings, doses, sleep, p: Profile, tolerance) -> dict
    # returns {"halfLives": array(20), "kds": array(20), "prob": array(20,20), "meanHalfLife": float, "meanKd": float}
def simulateWeek(trueHalfLife, p: Profile) -> tuple[list, list, list]   # ratings, doses, sleep
```

Steps:
1. Grid: `halfLives = np.linspace(3, 8, 20)`, `kds = np.linspace(1, 6, 20)`.
2. Prior (log space): `-0.5*((h-5)/1.5)**2 - 0.5*((kd-3)/1.5)**2` on the 20x20 meshgrid. Comment: "population values; the prior keeps one rating from dragging the estimate anywhere."
3. Observation on the model scale: `observed = (score - 1) / 4`, so 1 -> 0.0 and 5 -> 1.0. Tell judges the Karolinska Sleepiness Scale is the 9-point research version; we use 5 points because nobody will tap 9 buttons on a phone.
4. Log-likelihood per cell: for each cell build `Profile(**{**vars(p), "halfLifeH": h, "kdMgL": kd})`, compute predicted alertness at the rating times with Nolan's `alertnessAt(ts, doses, sleep, p2, tolerance)`, and add `-0.5*((observed - predicted)/0.15)**2` summed over ratings. 400 cells x a few ratings is instant.
5. `logPost = logPrior + logLik; prob = np.exp(logPost - logPost.max()); prob /= prob.sum()`. Judge line: "Bayes' rule on a grid: posterior is proportional to prior times likelihood, and 400 cells is nothing."
6. Means: `meanHalfLife = (prob.sum(axis=1) * halfLives).sum()` (check which axis is which with a test).
7. `simulateWeek`: 3 days, awake 7 AM to 11 PM, doses at 8 AM and 1 PM of 100 mg, 4 ratings a day at 9, 12, 15, 20 generated from the model at `trueHalfLife` plus `np.random.normal(0, 0.1)`, converted back to a 1 to 5 score with `round(1 + 4 * value)` clipped to [1, 5]. Powers the demo button so the heatmap converges on stage.
8. Uncertainty band, last, 10 lines: sample 200 half-lives from the marginal with `np.random.choice(halfLives, 200, p=marginal)`, compute 200 concentration curves, take `np.percentile(..., [10, 90], axis=0)`. C shades it.

Tests: no ratings gives the normalized prior; `simulateWeek(3.5)` then `posterior` recovers 3.5 within 0.7 h, same for 7.0; `prob.sum()` is 1.

---

## Andrew: pharmacokinetics (layer 1), tolerance (layer 4), and the glue

Files: `model/pk.py`, `model/tolerance.py`, `model/schema.py`, `model/params.py`, `api.py`, tests.
Judge line: "I own how caffeine moves through the body, why coffee stops working, and the contract that ties the model to the app."

### A1. pk.py (Tier 1, done by 2:30 PM)

```python
import numpy as np
from .params import KA_PER_H, VD_L_PER_KG
from .schema import Dose, Profile

def eliminationRate(p: Profile) -> float:
    """ke = ln2 / half-life. First-order kinetics: rate out is proportional to amount in."""
    return np.log(2) / p.halfLifeH

def volumeL(p: Profile) -> float:
    return VD_L_PER_KG * p.weightKg

def peakTimeH(p: Profile) -> float:
    """Set d/dt of the Bateman function to zero: ke*exp(-ke t) = ka*exp(-ka t)  =>  t = ln(ka/ke)/(ka-ke)."""
    ka, ke = KA_PER_H, eliminationRate(p)
    return np.log(ka / ke) / (ka - ke)

def concentration(t, doses: list, p: Profile):
    """Blood caffeine in mg/L at times t (numpy array). One-compartment model with first-order
    absorption (ka) and elimination (ke). The model is linear, so doses add (superposition)."""
    t = np.asarray(t, dtype=float)
    ka, ke, vd = KA_PER_H, eliminationRate(p), volumeL(p)
    total = np.zeros_like(t)
    for d in doses:
        dt = t - d.timeH
        active = dt >= 0                              # a dose contributes nothing before it is taken
        term = (d.mg / vd) * ka / (ka - ke) * (np.exp(-ke * dt) - np.exp(-ka * dt))
        total += np.where(active, term, 0.0)
    return total

def bodyCaffeineMg(t, doses, p):
    """Total caffeine in the body = concentration x volume. Used for the bedtime limit."""
    return concentration(t, doses, p) * volumeL(p)
```

Steps: type the above, understand every line, then write `tests/test_pk.py`:
- Single 100 mg at t=0: value at `peak + halfLife` is about half the value at `peak` (within 10%; absorption is not fully finished at the peak, say that to the judge if asked why not exact).
- `concentration(t, [d1, d2])` equals `concentration(t, [d1]) + concentration(t, [d2])`.
- `np.argmax` of a fine scan over 0 to 3 h lands within 0.02 h of `peakTimeH`.
- Concentration is 0 before the dose.
- 100 mg at 70 kg peaks around 1.5 to 2.5 mg/L (sanity against published values).

### A2. tolerance.py (Tier 2, done by 10:00 PM)

```python
def steadyStateConc(mgPerDay, p):        # mgPerDay / (ke * vd * 24)
def receptorRatioNow(p):                   # R/R0 after habitWeeks at habitual intake
def simulateReset(p, quitInDays, taperDays, horizonDays) -> dict   # arrays: day, R, intakeMg, withdrawal
def recommendQuitDay(p, examInDays) -> dict   # {"quitInDays", "taperDays", "reason"}
def feelsLikeMg(doseMg, p, R) -> float    # required: powers "your coffee feels like 60% strength"
def strengthPercent(doseMg, p, R) -> float # 100 * feelsLikeMg / doseMg
```

Steps:
1. `steadyStateConc`: at steady state, in = out. Clearance is `ke * vd` litres per hour, so average concentration is daily dose over clearance times 24. At defaults 300 mg/day is about 2.2 mg/L.
2. Receptor target: `rTarget = 1 + G * steadyStateConc`, `G = 0.23` per mg/L so that 300 mg/day gives R about 1.5. Judge line: "chronic caffeine upregulates adenosine receptors by roughly 20 to 50%; G is tuned to that."
3. `receptorRatioNow`: `1 + (rTarget - 1) * (1 - exp(-habitDays / TAU_TOLERANCE_DAYS))`.
4. `simulateReset`: loop over days. Intake: habitual before the quit day, linear taper from habitual to 0 over `taperDays`, then 0. Update `R = rTarget(intake) + (R - rTarget(intake)) * exp(-1 / TAU_TOLERANCE_DAYS)`, the exact solution of `dR/dt = (rTarget - R)/tau` over one day (same trick as sleep.py, so there is no integration error). Withdrawal on that day is the felt pressure above a non-user's baseline: `max(0, R * (1 - occupancy(steadyStateConc(intake), kd)) - 1)`. It is 0 while you keep up your habit and jumps to about R - 1 the day you quit. Return arrays.
5. `recommendQuitDay`: try `quitInDays` in 0..examInDays and `taperDays` in {0, 3, 5}; keep options with `R[exam] <= 1.1`; among those minimize the peak withdrawal in the 3 days before the exam. If none qualifies, take the lowest `R[exam]` and say so. Write `reason` as a sentence the app prints: "Quit in 2 days with a 3-day taper: receptors back to 1.06x by the exam, worst day Oct 21."
6. `feelsLikeMg` (do this right after step 3, it is a Tier 2 output in CLAUDE.md): a non-user with caffeine level cEq feels pressure `S * (1 - occ(cEq))`; you with tolerance R feel `S * R * (1 - occ(c))`. Set them equal and solve for cEq with the Langmuir equation: `1 - occ(cEq) = R * (1 - occ(c))`, so `occ(cEq) = 1 - R*(1 - occ(c))` and `cEq = kd * occ / (1 - occ)`. Convert c to mg with the peak concentration of that dose (`peakConcentration(mg, p)` from pk.py; it is proportional to the dose) and back. `strengthPercent` is `100 * cEqMg / doseMg`, printed as "your coffee feels like 60% strength". If `occ(cEq)` comes out below 0 the dose is fully cancelled by tolerance; clamp to 0 and say "feels like 0%".

Tests: 0 mg/day gives R == 1; 300 mg/day for 8 weeks gives R within 0.05 of 1.5; after quitting R decreases monotonically and is under 1.1 within 10 days; taper has lower peak withdrawal than cold turkey.

---

## Nolan: frontend, alertness (layer 3), deploy, demo

The frontend sections below were written for Streamlit. Nolan is prototyping something else, so read the `st.*` widget names as "the equivalent control in your framework" and the Plotly calls as "your chart library". The inputs, outputs, and timing are what matter. Data comes from Andrew's API (JSON contract above); until it is live, from `frontend/mock/`.

Files: the frontend, `model/alertness.py` and its tests, `README.md`, deployment.
Judge line: "I own how your inputs become a plan on screen, and the formula that turns caffeine and sleep pressure into alertness."

### N1. Setup and deploy (12:45 PM, see Step 0)

### N2. Time helpers and state (by 2:00 PM)

`ui/timeconv.py`:
```python
def clockToHours(t: datetime.time, dayOffset: int) -> float    # 14:30 tomorrow -> 38.5
def hoursToClock(h: float) -> str                                # 38.5 -> "2:30 PM (tomorrow)"
```
Test both; they are the classic bug source. Streamlit's `st.time_input` returns a `datetime.time`.

Streamlit reruns the whole script on every widget change, so there is no state machine to design. Read widgets at the top, convert to model inputs in one function `toModelInputs()`, call the model, draw. Use `st.session_state` only for the ratings list and the last plan.

### N3. alertness.py (Tier 1, layer 3, 2:30 to 4:30 PM)

This is the join point: it reads Andrew's concentration and Evan's sleep pressure and produces the curve the optimizer and the chart both consume. Do it between the inputs form and the chart; the chart can keep using fake arrays until this lands.


```python
def occupancy(conc, kd):                      # conc / (conc + kd): Langmuir binding, fraction of receptors blocked
def feltPressure(S, conc, tolerance, kd):    # S * tolerance * (1 - occupancy)
def inertia(t, sleep: list) -> np.ndarray
def alertnessFrom(S, circ, conc, tolerance, inertiaVal, kd):   # clip(1 - felt + circ - inertia, 0, 1); kd required
def alertnessAt(t, doses, sleep, p, tolerance) -> np.ndarray
def alertnessCurve(doses, sleep, p, tolerance, t0, t1) -> dict   # the Plan.curve dict
```

Steps:
1. `occupancy`: comment "caffeine is a competitive antagonist at adenosine receptors; Kd is the concentration at half block; this is why 400 mg is not 4x 100 mg."
2. `feltPressure`: `tolerance` is the receptor ratio R/R0 from Andrew's tolerance.py, 1.0 for a non-user.
3. `inertia`: for each t, find the most recent block that ended at or before t. Let `length = end - start`, `since = t - end`. Amplitude by length: `<= 0.35 h: 0.10`, `<= 1.0 h: 0.35`, `<= 1.75 h: 0.20`, else `0.25` (full night). Return `amp * exp(-since / 0.5)`. Comment: "grogginess after waking; worst after deep sleep (30 to 60 min naps), mild after a 20-min nap, gone in about 30 min." Vectorize by looping over blocks and using `np.where(since >= 0, ...)` to take the latest.
4. `alertnessAt`: `S = sleepPressure(t, sleep)`, `conc = concentration(t, doses, p)` (Andrew's), combine, and set alertness to 0 where `isAsleep`.
5. `alertnessCurve`: `t = np.arange(t0, t1, STEP_H)`, return the dict of arrays the Plan expects.

Tests: `occupancy(3, 3) == 0.5`; no caffeine and normal sleep gives the minimum between 3 and 6 AM; 100 mg at 9 AM raises 10 AM alertness more than 10 PM alertness; a 20-min nap at 2 PM beats a 60-min nap at 2 PM at 3 PM, and both beat no nap by 4 PM. If that last test fails, tune the inertia amplitudes, not the test; the coffee-nap demo depends on it. The `occupancy` and `feltPressure` helpers are also imported by Andrew's tolerance.py, so keep their signatures stable.

### N4. Inputs (by 2:30 PM, before alertness.py)
Use `st.sidebar` for inputs and the main area for results. One screen.
- Event: `st.radio("Day", ["today", "tomorrow"])`, `st.time_input` for the start, `st.number_input("Length (hours)", 0.5, 6.0, 2.0, 0.5)`. Build `EventWindow(start, start + length)`.
- Sleep: last night's bedtime and wake, tonight's planned bedtime. An `st.expander("More nights")` with two extra nights for the sleep-debt feature.
- Drinks already taken or planned: `st.multiselect` from `DRINKS` with a time each (keep simple: one time per drink). These are fixed doses passed into the optimizer, which adds recommendations on top.
- Profile: weight slider, checkboxes "smoker (x0.5 half-life)", "oral contraceptives (x2)", "slow metabolizer (x1.5)", chronotype radio (early/normal/late shifts `circadianPeakH` by -2/0/+2), habitual mg/day slider, habit weeks.
- `st.checkbox("Allow a nap")`, and under it an `st.expander("Free time slots for a nap")` with up to two start/end time pairs that become `FreeSlot`s. Empty means any time is fine.
- `st.button("Plan my caffeine")`.
Wrap the model call in `@st.cache_data` keyed on the inputs so dragging a slider does not re-run the optimizer unnecessarily. Pass plain tuples/floats into cached functions; dataclasses are fine if hashable, otherwise convert.

### N5. Chart (by 6:00 PM, with fake arrays until layers 1 to 3 land)
Plotly `make_subplots(specs=[[{"secondary_y": True}]])`:
- Alertness (0 to 10, left axis). Multiply the model's 0..1 by 10 for display.
- Caffeine mg/L (right axis).
- `fig.add_vrect` shaded for the event window, lighter for sleep blocks and the nap.
- `fig.add_vline` at each dose with annotation "150 mg".
- Hover shows time as clock text: build a `customdata` column with `hoursToClock`.
- Shaded 10th to 90th percentile band when Evan's uncertainty band exists (Sunday).
Keep `ui/demo_curve.py` with hand-typed arrays so you can style before the model exists.

### N6. Plan card (by 7:00 PM)
`st.metric` row: predicted exam alertness (x/10), total mg, and the sleep check: caffeine at bedtime with a delta vs the 50 mg limit and `st.error` if over. On Saturday night add a fourth metric, "coffee strength", from Andrew's `strengthPercent`. Then a plain list:
- "12:50 PM: 150 mg (about 1.5 drip coffees)"
- "1:00 PM: 20-minute nap"
`st.warning` if any limit is within 10%. Optional: "Download calendar (.ics)" via `st.download_button` with a hand-built ICS string (20 lines).

### N7. What-if mode (by 9:00 PM)
Under the chart, one `st.slider` per recommended dose for its time, defaulting to the recommendation. Recompute `alertnessCurve` with the edited doses (not the optimizer) and redraw. Show the new exam score next to the optimal one. Proves the model is live, not a lookup table.

### N8. Reset tab (Tier 2, Saturday 10 PM) and Learn tab (Tier 3, Sunday 8:00 to 10:00 AM)
`tabPlan, tabReset, tabLearn = st.tabs([...])`.
- Reset: inputs are habitual intake and exam date (`st.date_input`). Show `recommendQuitDay` as a sentence and a Plotly chart of `simulateReset` with cold turkey and taper lines for R and withdrawal. Show "your 200 mg feels like N mg" if B finished it.
- Learn: five buttons labelled 1 (exhausted) to 5 (fully alert), "rate now" appends `(current time in hours, score)` to `st.session_state.ratings`. "Simulate a week" button calls Evan's `simulateWeek`. Draw `prob` with `px.imshow(prob, x=kds, y=halfLives)`. Show the posterior mean half-life and a button "use my learned half-life" that overrides the profile.

### N9. Sunday 10:00 to 11:30
README: problem, the five formulas (one sentence each, in PLAN.md order), how to run, who did what, sources, "model for learning, not medical advice". Verify the deployed URL loads on a phone. Make a QR code (any QR site, or `uv pip install qrcode` and 3 lines). Run the demo script twice with a timer. Add `st.caption("Not medical advice")` to the footer.

---

## Integration checkpoints (whole team, 5 minutes each)

- 2:30 PM: pk.py and sleep.py merged; C replaces fake arrays with `concentration` and `sleepPressure`. First real curve on screen.
- 5:00 PM: alertness.py and optimizer v1 merged; the plan card shows one recommended dose. Screenshot it. This is your fallback demo.
- 9:00 PM: optimizer v2 with naps and the what-if slider. Check that a coffee nap appears when a nap is allowed and the event is 2 to 3 h after wake-up. If not, Nolan tunes the inertia amplitudes with Andrew before sleeping.
- 10:30 PM: tolerance.py merged into the Reset tab. Go to sleep. Use the app to pick tomorrow's coffee time and tell the judges you did.
- Sunday 9:30 AM: learn.py merged; "simulate a week" converges on the heatmap.
- Sunday 10:00 AM: feature freeze. Bug fixes, README, rehearsal, submit by 12:30.

Cut order if behind: uncertainty band, then learn.py (replace with a manual half-life slider), then the taper option, then naps. Never cut: curve, optimizer, bedtime constraint, deploy.

## Judge-proofing checklist (each person, Sunday 10:30 AM)
- Open your file. Pick any line. Explain it in one breath.
- State the formula you implemented and one assumption behind it.
- State one thing you learned that you did not know Saturday morning.
- State one limitation of your part.
