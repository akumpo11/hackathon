"""
Layer 2: sleep pressure and circadian rhythm (owner: Evan).

Two-process model (Borbely 1982). How sleepy you are comes from two processes:

    Process S, sleep pressure (0 = fully rested, 1 = exhausted):
        awake:   dS/dt = (1 - S) / tau_w      fills toward 1, tau_w = 18.2 h
        asleep:  dS/dt = -S / tau_s           drains toward 0, tau_s = 4.2 h

    Body clock (Process C in Borbely's paper):
        B(t) = A * cos(2*pi * (t - t_peak) / 24)      A = 0.15, t_peak = 5 PM

S carries over from one day to the next, so a short night leaves you starting
the next day higher. That is how sleep debt shows up.
Equations with plain-English readings: equations/layer-2-sleep.md.
"""

import numpy as np

from .params import BURN_IN_H, CIRCADIAN_AMP, STEP_H, TAU_SLEEP_H, TAU_WAKE_H
from .schema import SleepBlock


def circadian(t, p):
    """Body-clock alertness at times t: +0.15 at p.circadianPeakH (5 PM), -0.15 twelve hours later.

    Real circadian curves have harmonics (a dip after lunch, for example). We keep
    only the first term of that series: one cosine with a 24-hour period.
    """
    t = np.asarray(t, dtype=float)
    return CIRCADIAN_AMP * np.cos(2 * np.pi * (t - p.circadianPeakH) / 24)


def isAsleep(t, sleep):
    """True at each time in t that falls inside a sleep block (start included, end excluded)."""
    t = np.asarray(t, dtype=float)
    asleep = np.zeros_like(t, dtype=bool)
    for b in sleep:
        asleep |= (t >= b.startH) & (t < b.endH)
    return asleep


def _repeatBack(sleep, days=2):
    """The sleep list plus copies of the earliest night 1 and 2 days earlier.

    The simulation starts BURN_IN_H before the first time asked for, and we don't
    know how you slept back then. Assuming your schedule repeats is a better guess
    than "awake the whole time". Only the earliest night is copied: copying every
    block would stack extra nights on top of each other and repeat naps, adding
    sleep that never happened.
    """
    nights = [b for b in sleep if not b.isNap]
    if not nights:
        return list(sleep)
    first = min(nights, key=lambda b: b.startH)
    copies = [SleepBlock(first.startH - 24 * k, first.endH - 24 * k) for k in range(1, days + 1)]
    return copies + list(sleep)


def sleepPressure(t, sleep):
    """Sleep pressure S (0..1) at times t, given the sleep blocks in `sleep`.

    Marches S forward on a fine grid in steps of STEP_H (6 minutes), then reads it
    off at the requested times. Each step uses the exact solution of the ODE over
    that step, not an approximation:

        asleep:  S -> S * exp(-STEP_H / tau_s)
        awake:   S -> 1 - (1 - S) * exp(-STEP_H / tau_w)

    so stepping adds no integration error. The march starts BURN_IN_H (48 h) early
    at S = 0.5. Both time constants are under a day, so by the times we report, the
    starting guess has washed out and only your sleep history matters.
    """
    t = np.asarray(t, dtype=float)
    history = _repeatBack(sleep)
    fineT = np.arange(t.min() - BURN_IN_H, t.max() + STEP_H, STEP_H)
    asleep = isAsleep(fineT, history)

    drain = np.exp(-STEP_H / TAU_SLEEP_H)     # share of S left after one step asleep
    fill = np.exp(-STEP_H / TAU_WAKE_H)       # share of the gap to 1 left after one step awake
    fineS = np.empty_like(fineT)
    fineS[0] = 0.5
    for i in range(1, len(fineT)):
        # The step from fineT[i-1] to fineT[i] is asleep or awake depending on where it starts.
        prev = fineS[i - 1]
        fineS[i] = prev * drain if asleep[i - 1] else 1 - (1 - prev) * fill
    return np.interp(t, fineT, fineS)
