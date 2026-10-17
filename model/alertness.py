"""
Layer 3: alertness (owner: Nolan).

Joins layer 1 (caffeine concentration, Evan) and layer 2 (sleep pressure and
circadian rhythm, Andrew) into one alertness score between 0 and 1:

    occupancy  = C / (C + Kd)                      fraction of adenosine receptors caffeine blocks
    felt       = S * R * (1 - occupancy)           sleep pressure you actually feel
    alertness  = clip(1 - felt + circ - inertia, 0, 1)

S is sleep pressure (0 = fully rested, 1 = exhausted), R is the receptor ratio
from tolerance (1.0 for a non-user), circ is the circadian boost, and inertia is
grogginess right after waking up.

The helpers take plain numbers or numpy arrays and return the same shape, so the
optimizer can score a whole time grid in one call.
"""

import numpy as np

INERTIA_DECAY_H = 0.5       # grogginess fades with a 30-minute time constant


def occupancy(conc, kd):
    """Fraction of adenosine receptors blocked by caffeine, between 0 and 1.

    Caffeine is a competitive antagonist at adenosine receptors. This is the
    Langmuir binding equation; Kd is the concentration at half block. Because
    the curve flattens out as it approaches 1, 400 mg is not 4x as good as 100 mg.
    """
    conc = np.asarray(conc, dtype=float)
    return conc / (conc + kd)


def feltPressure(S, conc, tolerance, kd):
    """Sleep pressure you feel after caffeine blocks part of the adenosine signal.

    tolerance is the receptor ratio R/R0 from tolerance.py (1.0 for a non-user).
    More receptors (R > 1) means the same adenosine is felt more strongly, which
    is both tolerance (caffeine works less) and withdrawal (no caffeine feels awful).
    """
    return S * tolerance * (1 - occupancy(conc, kd))


def _inertiaAmplitude(lengthH):
    """How groggy you are right after waking, by how long you slept.

    Mild after a 20-min nap (you wake before deep sleep), worst after 30 to 60
    minutes (you wake out of deep sleep), lower again after a full 90-min cycle.
    """
    if lengthH <= 0.35:
        return 0.10
    if lengthH <= 1.0:
        return 0.35
    if lengthH <= 1.75:
        return 0.20
    return 0.25                 # a full night


def inertia(t, sleep):
    """Sleep inertia penalty at times t: amplitude * exp(-(time since waking) / 0.5 h).

    Only the most recent sleep block that ended at or before each t counts.
    sleep is a list of blocks with .startH and .endH (hours since midnight, day 0).
    """
    t = np.asarray(t, dtype=float)
    penalty = np.zeros_like(t)
    latestEnd = np.full_like(t, -np.inf)
    for block in sleep:
        since = t - block.endH
        isLatest = (since >= 0) & (block.endH > latestEnd)
        amp = _inertiaAmplitude(block.endH - block.startH)
        penalty = np.where(isLatest, amp * np.exp(-np.maximum(since, 0) / INERTIA_DECAY_H), penalty)
        latestEnd = np.where(isLatest, block.endH, latestEnd)
    return penalty


def alertnessFrom(S, circ, conc, tolerance, inertiaVal, kd):
    """Alertness between 0 and 1 from already-computed pieces.

    This is the pure formula, with no sleep or caffeine modelling inside, so the
    optimizer can precompute S and circ once and only recompute conc per candidate.
    kd is required (no default) so a learned Kd from Tier 3 can't be silently ignored.
    """
    felt = feltPressure(S, conc, tolerance, kd)
    return np.clip(1 - felt + circ - inertiaVal, 0, 1)


def _curves(t, doses, sleep, p, tolerance):
    """Caffeine, sleep pressure, felt pressure and alertness at times t, each computed once."""
    # Imported here, not at the top, so the helpers above work before
    # pk.py and sleep.py are merged. Move these up once they exist.
    from .pk import concentration
    from .sleep import sleepPressure, circadian, isAsleep

    t = np.asarray(t, dtype=float)
    S = sleepPressure(t, sleep)
    conc = concentration(t, doses, p)
    alert = alertnessFrom(S, circadian(t, p), conc, tolerance, inertia(t, sleep), p.kdMgL)
    return {
        "t": t,
        "conc": conc,
        "pressure": S,
        "felt": feltPressure(S, conc, tolerance, p.kdMgL),
        "alertness": np.where(isAsleep(t, sleep), 0.0, alert),     # zero while asleep
    }


def alertnessAt(t, doses, sleep, p, tolerance):
    """Alertness at times t, using layer 1 and layer 2. Zero while asleep."""
    return _curves(t, doses, sleep, p, tolerance)["alertness"]


def alertnessCurve(doses, sleep, p, tolerance, t0, t1):
    """Every curve the chart needs, on one shared time grid (the Plan.curve dict)."""
    from .params import STEP_H
    return _curves(np.arange(t0, t1, STEP_H), doses, sleep, p, tolerance)
