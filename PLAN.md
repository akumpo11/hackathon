# Caffeine Optimizer: Build Plan

Deadline: Sunday Oct 18, 1:00 PM. Judging 1:45 to 4:55 PM (two judges, 8 min each, every member gets a question).

Pitch in one line: "Tell it your exam time, your sleep, and your coffee habit. It solves a pharmacokinetic model and tells you when to drink, how much, when to nap, and when to quit caffeine so it works again."

Prior art to know about (judges may ask): the US Army's 2B-Alert app predicts alertness from sleep and caffeine. Our angle is different in three ways: tolerance and withdrawal are modeled via adenosine receptors, we schedule a "caffeine reset" and taper, and the model learns your half-life from your own alertness ratings.

---

## 1. The math (what judges will ask about)

Five layers. Each one is a short formula someone on the team must be able to derive on a whiteboard.

### Layer 1: Pharmacokinetics (where caffeine is in your blood)

First-order kinetics: the rate caffeine leaves the body is proportional to how much is there.

    dA/dt = -ke * A        =>   A(t) = A0 * exp(-ke * t)
    ke = ln(2) / t_half    (t_half ~ 5 h, so ke ~ 0.139 per hour)

Add first-order absorption from the gut (one-compartment model, the "Bateman function"):

    C(t) = (D / Vd) * ka / (ka - ke) * [ exp(-ke * (t - t0)) - exp(-ka * (t - t0)) ]   for t >= t0

- D = dose in mg, t0 = time taken, Vd = volume of distribution ~ 0.6 L/kg (42 L for 70 kg)
- ka = absorption rate ~ 4 per hour (absorption half-life ~10 min)
- Peak time (set derivative to zero):  t_max = ln(ka / ke) / (ka - ke)  ~ 50 min. This is a calculus result worth showing.

Superposition: the model is linear, so N doses just add. Total C(t) = sum over doses. Simple, and it is why the optimizer is cheap.

Half-life modifiers (toggles in the UI): smoker x0.5, oral contraceptives x2, pregnancy x2 to x3, CYP1A2 slow metabolizer x1.5 to x2.

### Layer 2: Sleep pressure and circadian rhythm (two-process model, Borbely 1982)

Process S (homeostatic sleep pressure, normalized 0..1):

    awake:   S(t) = 1 - (1 - S0) * exp(-t / tau_w)     tau_w = 18.2 h
    asleep:  S(t) = S0 * exp(-t / tau_s)                tau_s = 4.2 h

Process C (circadian alertness):

    C_circ(t) = A * cos(2*pi * (t - t_peak) / 24)       A ~ 0.15, t_peak ~ 5 PM (shift by chronotype)

Integrate S across the whole sleep history you entered, so short sleep carries debt into the next day. This is the "sleep correlation" feature.

### Layer 3: How caffeine acts (receptor occupancy)

Caffeine is a competitive antagonist at adenosine receptors. Adenosine is the signal behind sleep pressure. Fraction of receptors blocked follows the Langmuir / Hill binding equation:

    occ(t) = C(t) / (C(t) + Kd)         Kd ~ 3 mg/L (~ 15 uM; one cup gives about half-maximal effect)

Felt sleep pressure is the unblocked part:

    S_felt(t) = S(t) * (1 - occ(t))

Alertness score:

    Alertness(t) = 1 - S_felt(t) + C_circ(t) - inertia(t)      (then map to 0..10 for display)

Saturation falls out naturally: 400 mg is not 4x as good as 100 mg. Judges like that the model explains a thing people already feel.

### Layer 4: Tolerance, withdrawal, and the caffeine reset

Chronic caffeine upregulates adenosine receptors. Model receptor count R(t) relaxing toward a target set by your average caffeine exposure:

    dR/dt = ( R_target(C) - R ) / tau_R          tau_R ~ 4 days
    R_target = R0 * (1 + g * C_avg)              g is tuned so 300 mg/day gives R ~ 1.5 R0

Then felt pressure becomes:

    S_felt(t) = S(t) * (R(t) / R0) * (1 - occ(t))

One formula gives both effects:
- Tolerance: with R > R0 you need more caffeine to get back to baseline.
- Withdrawal: with R > R0 and no caffeine, S_felt > S. That is the headache and fog on day 1 to 3 of quitting.

Reset scheduler: given the exam date, pick the quit date so that R(exam) is within 10% of R0 AND the withdrawal trough (days 1 to 3) is over before the exam. With tau_R = 4 days, 90% recovery takes tau_R * ln(10) ~ 9 days. Also offer a taper (dose shrinks linearly over N days) and plot felt pressure for cold turkey vs taper.

Inputs needed: usual mg/day and how long you have been at it (weeks). That sets R(0).

Tolerance readout (Tier 2 output in CLAUDE.md): "your coffee feels like 60% strength". Solve the Langmuir equation for the dose a non-user would need to get the same felt pressure, and report effective mg / actual mg as a percent.

### Layer 5: Optimization and learning

Dose schedule optimizer:
- Decision variables: up to 3 doses, times on a 15-minute grid, sizes in {50, 100, 150, 200} mg.
- Objective: maximize mean Alertness over the exam window.
- Constraints: total <= 400 mg/day, single dose <= 200 mg, body caffeine at bedtime <= 50 mg (the "6-hour rule" in mg form), no dose before wake-up.
- Method: exhaustive grid search. The model is a closed-form sum of exponentials, so ~100k candidate schedules evaluate in well under a second in the browser. Easy to explain: "we try them all".
- Sanity check to present: for a 1-point event, the optimizer should put a single dose at (event - t_max). For a 3-hour exam it splits into two doses. That difference is a good demo moment.

Nap scheduling:
- During a nap, S decays with tau_s. A 20-min nap removes little pressure but avoids sleep inertia.
- Sleep inertia penalty after waking: inertia(t) = I(nap_length) * exp(-(t - t_wake) / 0.5 h), where I is small for <= 20 min, large for 30 to 60 min (deep sleep), smaller again at 90 min (full cycle).
- Nap candidates are limited to the free time slots the user enters (CLAUDE.md optional input). With no slots given, any time between wake-up plus 2 h and one hour before the event is allowed. Last night's sleep decides whether a nap is worth it: if sleep pressure at the event is already low, the optimizer will not pick one.
- The coffee nap should EMERGE: caffeine taken at nap start peaks ~50 min later, right as a 20-min nap plus inertia clears. If the optimizer discovers this on its own, that is the best 20 seconds of the demo.
- "Naps are bad" answer: a long late nap drops S so far that bedtime sleep is delayed, so the next day is worse. Plot both days and let the model say when a nap helps.

Learning from alertness ratings (Bayesian grid):
- User rates alertness 1 to 5 (1 = exhausted, 5 = fully alert) after drinks, per CLAUDE.md. Mention to judges that the Karolinska Sleepiness Scale is the research version of this.
- Unknown parameters: t_half in [3, 8] h and sensitivity Kd in [1, 6] mg/L. Put a 20x20 grid on them.
- Prior: Gaussian around population values (t_half ~ N(5, 1.5^2)).
- Map a rating to the model scale: observed = (rating - 1) / 4. Likelihood: observed_i ~ Normal( model(t_i; theta), sigma = 0.15 ).
- Posterior on the grid: multiply prior by likelihood, normalize. Show it as a heatmap that sharpens as ratings come in. Recommendations use the posterior mean.
- Demo trick: a "simulate my week" button that generates fake ratings from a hidden true half-life, so you can show the posterior converging live without waiting hours.

Uncertainty band: sample 200 half-lives from the posterior, plot the 10th to 90th percentile band around the caffeine curve. Four lines of code, visibly mathy.

---

## 2. Parameter table (defaults, all tunable in one file)

| Parameter | Default | Note |
|---|---|---|
| t_half | 5 h | range 3 to 8 h; drives everything |
| ka | 4 /h | gives t_max ~ 50 min |
| Vd | 0.6 L/kg | 42 L at 70 kg; 100 mg -> ~2 mg/L peak |
| Kd | 3 mg/L | half-maximal receptor block |
| tau_w, tau_s | 18.2 h, 4.2 h | Borbely two-process |
| circadian amplitude, peak | 0.15, 5 PM | shift by chronotype |
| tau_R | 4 days | tolerance / withdrawal time constant |
| inertia amplitude, tau | 0.3, 0.5 h | scaled by nap depth |
| daily limit, single dose limit | 400 mg, 200 mg | FDA / EFSA guidance |
| bedtime residual limit | 50 mg | ~ the 6-hour rule |

Drink table (mg): espresso 63, drip coffee 8 oz 95, black tea 47, green tea 28, Diet Coke 46, Red Bull 80, Monster 160, Celsius 200, 5-hour Energy 200, dark chocolate 1 oz 20.

Verify the numbers against a source before the demo and cite it in the README (any pharmacology reference or the FDA caffeine page is enough).

---

## 3. Tech stack and architecture

Decision: all Python. Team of 3, everyone is comfortable in Python, and judges weight understanding at 30%. Nobody should be explaining a framework they learned at 2 AM.

- Math: a plain Python package `model/` using numpy. No framework code in it. One file per layer, one owner per file.
- App: Streamlit (`app.py`). Sliders and time inputs, Plotly charts, re-runs top to bottom on every change. Phones can use it.
- Tests: pytest.
- Deploy: Streamlit Community Cloud (free, connects to a public GitHub repo, gives a URL for the QR code). Fallback: run locally and show it on the laptop.
- Setup: `brew install uv`, then `uv venv --python 3.12 && source .venv/bin/activate && uv pip install numpy plotly streamlit pytest`. The system Python is 3.9 with no packages; do not use it.

If someone later wants a slicker frontend, wrap the same `model/` functions in FastAPI and point a React page at it. The math does not change, so this can be decided Sunday morning and is not required.

    model/params.py       parameter table above, drink table
    model/types.py        dataclasses: Dose, SleepBlock, EventWindow, Profile, Plan
    model/pk.py           concentration(t, doses, profile); peak_time()
    model/sleep.py        sleep_pressure(t, sleep_blocks); circadian(t)
    model/alertness.py    occupancy, inertia, alertness curve
    model/tolerance.py    receptor model, reset and taper planner
    model/optimizer.py    grid search over dose schedules
    model/learn.py        Bayesian grid update from ratings
    tests/test_*.py
    app.py                Streamlit app
    README.md

Unit tests that double as demo talking points:
- After t_half the level halves (pk).
- Peak time matches the closed form t_max (pk).
- Two doses equal the sum of two single doses (superposition).
- Optimizer with a 1-point event returns one dose at event - t_max.
- With zero caffeine, alertness is lowest around 4 to 5 AM (circadian).

## 4. Schedule (Sat 12 PM to Sun 1 PM)

Milestones are ordered so that at any cutoff you have something demoable.

| When | Goal | Done when |
|---|---|---|
| Sat 12:00 to 1:00 | Lock scope. Whiteboard layers 1 to 3. Agree parameter table. Scaffold repo, deploy "hello world" link. Assign owners. | Live URL exists |
| Sat 1:00 to 4:00 | Tier 1: Layer 1 + chart + inputs (event time and length, drinks, sleep). | Caffeine curve draws for typed-in doses |
| Sat 4:00 to 7:00 | Tier 1: Layer 2 + 3 + single-dose optimizer + sleep check. | App says "drink X mg at HH:MM", shows alertness curve, warns about bedtime caffeine |
| Sat 7:00 to 10:00 | Tier 2: multi-dose optimizer, nap plan within free slots, coffee nap. | Plan card with 1 to 3 doses and a nap |
| Sat 10:00 to 12:00 | Tier 2: tolerance estimate ("feels like 60% strength"), reset date, taper vs cold turkey plot. | Reset planner works |
| Sun 12:00 to 8:00 | SLEEP. Use the app to plan your own morning coffee; tell the judges you did. | |
| Sun 8:00 to 10:00 | Tier 3: 1-to-5 rating widget, posterior heatmap, uncertainty band. | Posterior visibly sharpens |
| Sun 10:00 to 11:30 | Feature freeze. Tests pass, README, QR code, practice 3-min demo twice, each member rehearses their file. | |
| Sun 11:30 to 12:30 | Submit (name, team number, 2 to 3 sentences, repo link, live link). | Submitted with 30 min to spare |

Cut order if behind: uncertainty band -> Bayesian learning (replace with manual half-life slider) -> taper planner -> nap. Never cut: curve, optimizer, bedtime constraint.

Owners (team of 3, details in TASKS.md):
- A: pk.py, optimizer.py, then learn.py on Sunday (kinetics, search, Bayes)
- B: sleep.py, alertness.py, tolerance.py (two-process model, receptors, reset)
- C: app.py, charts, deploy, README, demo (the product and the data flow)

---

## 5. Demo script (3 minutes)

1. Problem (20 s): "Everyone here drank coffee today on vibes. Caffeine has a 5-hour half-life, saturating effects, and tolerance. We solved the math."
2. Type it in (30 s): exam Sunday 2 to 5 PM, slept 1 to 7 AM, usually 2 cups a day. Hit Plan.
3. The plan (40 s): point at the curve. "One dose at 12:50 so it peaks at the start, a small second dose at 2:30 to hold the 3-hour window, nothing after 4 because of the bedtime constraint." Drag a dose and show the curve move.
4. Coffee nap (30 s): add a 20-min nap at 1:00. "Caffeine peaks when you wake. The optimizer found the coffee nap by itself."
5. Tolerance (30 s): switch to the Reset tab. "You are at 1.5x receptors. Quit by Tuesday and the withdrawal trough is over before the exam. The taper line avoids the trough entirely."
6. Learning (20 s): tap three 1-to-5 alertness ratings, show the posterior heatmap tighten. "After a week it knows your half-life better than the population average."
7. Close (10 s): QR code. "Scan it and plan your afternoon."

## 6. Questions to rehearse

- Why exponential decay? First-order kinetics: elimination rate proportional to amount; the ODE solution is an exponential.
- Why does the effect saturate? Receptor binding follows C / (C + Kd); once receptors are mostly blocked, more caffeine does little.
- Where does t_max come from? Differentiate the Bateman function and set to zero.
- Why can you add doses? The ODE is linear, so solutions superpose.
- Why is a 20-minute nap different from a 60-minute one? Sleep inertia from deep sleep; we penalize it with a decaying term.
- How do you learn the half-life? Bayesian update on a grid: prior times likelihood, normalized.
- What are the limitations? Population parameters, no food effects, alertness is a proxy, not validated clinically. Not medical advice.
- What did you learn? Each person answers for their own file.

## 7. Extra ideas, ranked by value per hour

1. Coffee nap emerging from the optimizer (free if nap + PK are right).
2. "Vicious cycle" view: late caffeine -> delayed sleep -> more pressure tomorrow -> more caffeine. Plot two days.
3. Uncertainty band from the posterior (tiny code, looks rigorous).
4. Calendar export (.ics) of the dose plan. Twenty lines, delightful.
5. Sensitivity readout: "your plan is most sensitive to half-life; a 1 h error shifts the peak by 12 min". Numerical derivative of the objective.
6. Chronotype quiz (3 questions) that shifts the circadian phase.
7. Safety checks: over 400 mg/day warning, anxiety threshold note, "not medical advice" footer.
