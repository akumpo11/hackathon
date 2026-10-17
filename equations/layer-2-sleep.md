# Layer 2: Sleep pressure and circadian rhythm

Two-process model (Borbely, 1982). Code: `model/sleep.py`.

Inputs: sleep history (start and end of each sleep block, naps included) and chronotype (shifts the circadian peak by -2, 0 or +2 h).

## 1. Sleep pressure while awake

    S(t) = 1 - (1 - S0) * exp(-t / tau_w)

- S: sleep pressure, 0 (rested) to 1 (maximally sleepy)
- S0: sleep pressure at the moment you woke up
- t: hours since waking
- tau_w = 18.2 h: fill time constant

Plain English: each hour awake closes a fixed share of the remaining gap to "full". Fast when rested, slower as you tire.

## 2. Sleep pressure while asleep

    S(t) = S0 * exp(-t / tau_s)

- S0: sleep pressure at the moment you fell asleep
- t: hours since falling asleep
- tau_s = 4.2 h: drain time constant

Plain English: each hour asleep removes a fixed share of what is left. Draining is much faster than filling.

Implementation: both equations are the exact solutions of dS/dt = (1 - S)/tau_w and dS/dt = -S/tau_s, so stepping them over `STEP_H` = 0.1 h has no integration error. The simulation starts 48 h before the first time asked for (initial S = 0.5), assuming your earliest night repeats on the two nights before it, so the starting guess washes out. S carries across nights, which is how sleep debt shows up.

## 3. Circadian alertness

    C(t) = A * cos(2*pi * (t - t_peak) / 24)

- C: body-clock alertness offset
- A = 0.15: amplitude
- t_peak = 17 (5 PM) by default: hour of peak alertness; chronotype shifts it by -2 / 0 / +2 h
- 24: period in hours

Plain English: a smooth daily wave, +0.15 at the peak, -0.15 twelve hours later (about 5 AM). Real circadian curves have harmonics; we keep only the first term.
