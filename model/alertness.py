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

DEFAULT_KD_MG_L = 3.0       # concentration that blocks half the receptors (~ one cup of coffee)
INERTIA_DECAY_H = 0.5       # grogginess fades with a 30-minute time constant


def occupancy(conc, kd):
    """Fraction of adenosine receptors blocked by caffeine, between 0 and 1.

    Caffeine is a competitive antagonist at adenosine receptors. This is the
    Langmuir binding equation; Kd is the concentration at half block. Because
    the curve flattens out as it approaches 1, 400 mg is not 4x as good as 100 mg.
    """
    conc = np.asarray(conc, dtype=float)
    return conc / (conc + kd)


def felt_pressure(S, conc, tolerance, p):
    """Sleep pressure you feel after caffeine blocks part of the adenosine signal.

    tolerance is the receptor ratio R/R0 from tolerance.py (1.0 for a non-user).
    More receptors (R > 1) means the same adenosine is felt more strongly, which
    is both tolerance (caffeine works less) and withdrawal (no caffeine feels awful).
    """
    return S * tolerance * (1 - occupancy(conc, p.kd_mg_l))


def _inertia_amplitude(length_h):
    """How groggy you are right after waking, by how long you slept.

    Mild after a 20-min nap (you wake before deep sleep), worst after 30 to 60
    minutes (you wake out of deep sleep), lower again after a full 90-min cycle.
    """
    if length_h <= 0.35:
        return 0.10
    if length_h <= 1.0:
        return 0.35
    if length_h <= 1.75:
        return 0.20
    return 0.25                 # a full night


def inertia(t, sleep):
    """Sleep inertia penalty at times t: amplitude * exp(-(time since waking) / 0.5 h).

    Only the most recent sleep block that ended at or before each t counts.
    sleep is a list of blocks with .start_h and .end_h (hours since midnight, day 0).
    """
    t = np.asarray(t, dtype=float)
    penalty = np.zeros_like(t)
    latest_end = np.full_like(t, -np.inf)
    for block in sleep:
        since = t - block.end_h
        is_latest = (since >= 0) & (block.end_h > latest_end)
        amp = _inertia_amplitude(block.end_h - block.start_h)
        penalty = np.where(is_latest, amp * np.exp(-np.maximum(since, 0) / INERTIA_DECAY_H), penalty)
        latest_end = np.where(is_latest, block.end_h, latest_end)
    return penalty


def alertness_from(S, circ, conc, tolerance, inertia_val, kd=DEFAULT_KD_MG_L):
    """Alertness between 0 and 1 from already-computed pieces.

    This is the pure formula, with no sleep or caffeine modelling inside, so the
    optimizer can precompute S and circ once and only recompute conc per candidate.
    """
    felt = S * tolerance * (1 - occupancy(conc, kd))
    return np.clip(1 - felt + circ - inertia_val, 0, 1)


def alertness_at(t, doses, sleep, p, tolerance):
    """Alertness at times t, using layer 1 and layer 2. Zero while asleep."""
    # Imported here, not at the top, so the helpers above work before
    # pk.py and sleep.py are merged. Move these up once they exist.
    from .pk import concentration
    from .sleep import sleep_pressure, circadian, is_asleep

    t = np.asarray(t, dtype=float)
    S = sleep_pressure(t, sleep)
    conc = concentration(t, doses, p)
    alert = alertness_from(S, circadian(t, p), conc, tolerance, inertia(t, sleep), p.kd_mg_l)
    return np.where(is_asleep(t, sleep), 0.0, alert)


def alertness_curve(doses, sleep, p, tolerance, t0, t1):
    """Every curve the chart needs, on one shared time grid (the Plan.curve dict)."""
    from .params import STEP_H
    from .pk import concentration
    from .sleep import sleep_pressure

    t = np.arange(t0, t1, STEP_H)
    S = sleep_pressure(t, sleep)
    conc = concentration(t, doses, p)
    return {
        "t": t,
        "conc": conc,
        "pressure": S,
        "felt": felt_pressure(S, conc, tolerance, p),
        "alertness": alertness_at(t, doses, sleep, p, tolerance),
    }
