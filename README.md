# Caffeine Optimizer

MathHacks 2026. Tell it when your exam is, how you slept and how much coffee you usually drink. It solves a pharmacokinetic model of caffeine and tells you when to drink, how much, whether to nap, and whether to take a break from caffeine so it works again, without wrecking your sleep.

Everything is computed from formulas: no login, no database, and no data leaves your phone.

## The math in five layers

Each layer has its own page in the app and its own file in `model/`. Full equations with plain-English readings are in `equations/`.

1. **Caffeine in your blood** (`pk.py`). A one-compartment model with first-order absorption and elimination gives the Bateman function, `C(t) = D/V * ka/(ka-ke) * (e^(-ke t) - e^(-ka t))`. Its derivative set to zero gives the peak time, about 52 minutes. The equations are linear, so several drinks just add up.
2. **Sleep pressure and body clock** (`sleep.py`). Borbély's two-process model: sleep pressure fills toward 1 while you're awake and drains while you sleep, stepped with the exact solution of each ODE. A 24-hour cosine adds the body clock.
3. **Tolerance and reset** (`tolerance.py`). Daily caffeine grows extra adenosine receptors, `dR/dt = (R_target - R) / 4 days`. That one number gives both tolerance and withdrawal, and the planner picks when to quit or taper so R is back near 1 by the exam.
4. **Alertness** (`alertness.py`). Caffeine blocks receptors following the Langmuir equation `C / (C + Kd)`, which is why 400 mg isn't 4x 100 mg. Alertness is `1 - S * R * (1 - occupancy) + body clock - grogginess`.
5. **Optimizer and learning** (`optimizer.py`, `learn.py`). The optimizer tries every dose schedule on a 15-minute grid and keeps the most alertness per mg within the safety limits (400 mg a day, 200 mg a dose, 50 mg left at bedtime). Superposition makes that take milliseconds. Learning is Bayes' rule on a 20 x 20 grid of half-life and sensitivity, updated from your 1-to-5 alertness ratings.

## Run it

```bash
uv venv --python 3.12 && source .venv/bin/activate
uv pip install -r requirements.txt
pytest                    # the model's tests
python3 serve.py          # then open http://localhost:5500/frontend/
```

The app runs the `model/` Python files in the browser with [Pyodide](https://pyodide.org), so it's a static site: any static host serving the repo root works. The first load takes 10 to 15 seconds while Pyodide downloads. `frontend/README.md` explains how the pages call the model.

## Who did what

- **Andrew**: layer 1 (pharmacokinetics), layer 3 (tolerance and reset), the shared data types and constants.
- **Evan**: layer 2 (sleep pressure), layer 5 (optimizer and learning).
- **Nolan**: layer 4 (alertness), the app, charts and demo.

## Limitations

The parameters are population averages from the literature; the receptor gain in layer 3 is tuned, not measured (see `research.md`). Alertness is a model score, not a validated clinical measure, and food, genetics beyond half-life, and how a nap affects tonight's sleep aren't modeled. Learning from 1-to-5 ratings is slow: a week of ratings narrows your half-life to about ±1 hour (`equations/layer-5-learning.md` explains why).

Sources are in `research.md` and `model/params.py`.

**A model for learning, not medical advice.**
