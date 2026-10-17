# Layer 4: Alertness (how awake you feel)

Joins layer 1 (caffeine in the blood) and layer 2 (sleep pressure and body clock) into one score between 0 and 1. Code: `model/alertness.py`. Constants: `model/params.py`.

Inputs: caffeine concentration C (layer 1), sleep pressure S and body clock circ (layer 2), your sleep blocks (for grogginess), Kd (a per-person setting, `Profile.kdMgL`), and tolerance R (layer 3; 1.0 for a non-drinker).

## 1. Receptor occupancy

    occ = C / (C + Kd)

- occ: fraction of adenosine receptors that caffeine is blocking, 0 to 1
- C: caffeine in the blood, mg/L (from layer 1)
- Kd = 3 mg/L: the concentration that blocks exactly half the receptors (about one cup of coffee)

Where it comes from: caffeine and adenosine compete for the same receptors. At equilibrium the share of receptors caffeine holds is the Langmuir binding equation, which is the same curve as the Hill equation with exponent 1.

Plain English: a little caffeine blocks a lot of receptors, then each extra drink blocks fewer. Doubling C from 3 to 6 mg/L takes occ from 50% to 67%, not to 100%. That is why 400 mg is not four times as good as 100 mg.

Code: `occupancy(conc, kd)`.

## 2. Felt sleep pressure

    S_felt = S * R * (1 - occ)

- S: sleep pressure from layer 2, 0 (rested) to 1 (exhausted)
- R: receptor ratio from layer 3. 1.0 for a non-drinker, about 1.5 at 300 mg a day
- (1 - occ): the part of the adenosine signal that gets through

Plain English: sleep pressure is adenosine landing on receptors. Caffeine blocks some receptors, so you feel less of it. Regular drinkers grow extra receptors (R above 1), so the same adenosine is felt more strongly. That one factor explains both tolerance (the same coffee works less) and withdrawal (with no caffeine, S_felt is S times R, worse than a non-drinker's).

Code: `feltPressure(S, conc, tolerance, kd)`.

## 3. Sleep inertia (grogginess after waking)

    inertia(t) = amp(sleep length) * exp(-(t - tWake) / 0.5 h)        for t after waking

Only the most recent sleep block that ended before t counts. The amplitude depends on how long that block was:

| Slept | amp | Why |
|---|---|---|
| 20 min or less | 0.10 | You wake before deep sleep |
| 20 to 60 min | 0.35 | You wake out of deep sleep, the groggiest |
| 60 to 105 min | 0.20 | A full 90 min cycle ends in light sleep |
| more than 105 min (a night) | 0.25 | |

Plain English: a penalty that starts at `amp` the moment you wake and halves every 21 minutes (0.5 h time constant). It is gone in about two hours. This is the part of the model that makes a 20 minute nap better than a 60 minute one.

Code: `inertia(t, sleep)`.

## 4. Alertness

    alertness = clip( 1 - S_felt + circ - inertia, 0, 1 )

- circ: body clock from layer 2, plus 0.15 at its peak (5 PM) and minus 0.15 twelve hours later
- clip: keep the result between 0 and 1. The terms can add up to slightly outside that range
- The page shows alertness times 10

Plain English: start from fully alert (1), subtract the sleepiness you actually feel, add or subtract the time-of-day swing, subtract grogginess. While you are asleep the score is 0 (it isn't defined).

Code: `alertnessFrom(S, circ, conc, tolerance, inertiaVal, kd)`. It is the pure formula, so the optimizer can precompute S and circ once and only recompute C for each candidate schedule. `alertnessAt` and `alertnessCurve` build S, circ, C and inertia from layers 1 and 2, then call it.

## 5. The whole formula in one line

Substitute equations 1 to 3 into equation 4. The step that does the work is rewriting "1 minus the share blocked" as "the share still open":

    1 - occ = 1 - C/(C + Kd) = Kd / (C + Kd)

    S_felt = S * R * Kd / (C + Kd)

    alertness(t) = clip( 1  -  S * R * Kd / (C + Kd)  +  0.15 * cos( 2*pi * (t - t_peak) / 24 )  -  amp * exp( -(t - t_wake) / 0.5 ),  0,  1 )

| Symbol | Meaning | Value or source |
|---|---|---|
| t | the moment being scored | hours since midnight, day 0 |
| C | caffeine in the blood | mg/L, layer 1 |
| Kd | concentration that blocks half the receptors | 3 mg/L |
| S | sleep pressure | 0 to 1, layer 2 |
| R | tolerance (receptor ratio) | 1.0 for a non-drinker, about 1.5 at 300 mg/day, layer 3 |
| t_peak | when the body clock peaks | 17 (5 PM), shifted -2 / 0 / +2 h by chronotype |
| t_wake | when the last sleep block ended | from the sleep blocks |
| amp | grogginess after the last sleep | 0.10, 0.35, 0.20 or 0.25 by its length (equation 3) |

Plain English: caffeine only enters through C in the denominator. As C grows, the felt pressure shrinks toward 0 more and more slowly, which is the saturation effect from equation 1 showing up in the final formula.

One level deeper, the two inputs from other layers are themselves formulas:

    C(t) = sum over drinks i of (D_i / V) * ka / (ka - ke) * ( exp(-ke (t - t_i)) - exp(-ka (t - t_i)) )      ke = ln(2) / t_half,  V = 0.6 * weight,  ka = 4     (layer 1)

    awake:   S(t) = 1 - (1 - S0) * exp(-t / 18.2)
    asleep:  S(t) = S0 * exp(-t / 4.2)                  S0 = where the previous step ended     (layer 2)

S has no single closed form because it carries across the whole week of sleep, so it is built step by step.

## Worked example (the page's defaults, at 8:54 AM)

Two 95 mg drip coffees (8 AM and 1 PM), 70 kg, 5 h half-life, 7 AM wake-up, Kd = 3, R = 1.

| Step | Value |
|---|---|
| C from layer 1 | 2.00 mg/L |
| S from layer 2 | 0.20 |
| circ from layer 2 | -0.08 |
| occ = 2.00 / (2.00 + 3) | 40% |
| S_felt = 0.20 * 1.0 * (1 - 0.40) | 0.12 |
| inertia (two hours after waking) | 0.01 |
| alertness = 1 - 0.12 + (-0.08) - 0.01 | 0.80, shown as 8.0 / 10 |

## Checked by tests (`tests/test_alertness.py`)

- `occupancy(3, 3)` is exactly 0.5, and the effect levels off at high doses.
- Higher tolerance makes the same sleep pressure feel stronger. With no caffeine and R = 1, felt pressure equals S.
- A 20 minute nap leaves you less groggy than a 60 minute one. Inertia fades with time and is 0 before waking. Only the latest sleep block counts.
- Alertness is clipped to 0..1, and caffeine raises it.
