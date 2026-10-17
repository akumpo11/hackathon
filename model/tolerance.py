"""
Layer 3: tolerance, withdrawal and the caffeine reset (owner: Andrew).

Drinking caffeine every day makes the brain grow extra adenosine receptors to
make up for the ones caffeine keeps blocking. R is the receptor count relative
to a non-drinker (R = 1). It relaxes toward a target set by your average
caffeine level:

    dR/dt = (R_target - R) / tau_R              tau_R = 4 days
    R_target = 1 + g * C_avg                    g = 0.23 per mg/L, so 300 mg a day gives R ~ 1.5

Layer 4 multiplies sleep pressure by R (S_felt = S * R * (1 - occ)), so this one
number gives both effects:
- tolerance: with R > 1 the same coffee leaves you sleepier than it would a non-drinker
- withdrawal: with R > 1 and no caffeine, you feel S * R, worse than a non-drinker's S

The reset planner picks when to quit (cold turkey or tapering) so R is back near
1 by the exam, and caffeine works at close to full strength again.
Equations with plain-English readings: equations/layer-3-tolerance.md.
"""

import math

import numpy as np

from .alertness import occupancy
from .params import RESET_TARGET_R, TAPER_OPTIONS_DAYS, TAU_TOLERANCE_DAYS, TOLERANCE_GAIN_PER_MG_L
from .pk import eliminationRate, peakConcentration, volumeL


def steadyStateConc(mgPerDay, p):
    """Average blood caffeine (mg/L) of someone who drinks mgPerDay every day.

    At steady state, caffeine in = caffeine out. The body clears ke * V litres of
    blood per hour (the clearance), so over a day it clears ke * V * 24 litres.
    Average level = daily dose / litres cleared per day. About 2.2 mg/L at 300 mg a day.
    """
    return mgPerDay / (eliminationRate(p) * volumeL(p) * 24)


def receptorTarget(mgPerDay, p):
    """R that a daily intake pulls you toward if you keep it up: 1 + g * C_avg."""
    return 1 + TOLERANCE_GAIN_PER_MG_L * steadyStateConc(mgPerDay, p)


def receptorRatioNow(p):
    """R after drinking p.habitualMgPerDay for p.habitWeeks, starting from R = 1.

    Solution of dR/dt = (R_target - R) / tau with R(0) = 1:
        R(t) = 1 + (R_target - 1) * (1 - exp(-t / tau))
    After a few weeks the exponential is gone and R sits at its target.
    """
    days = p.habitWeeks * 7
    return 1 + (receptorTarget(p.habitualMgPerDay, p) - 1) * (1 - math.exp(-days / TAU_TOLERANCE_DAYS))


def _intakeOnDay(day, p, quitInDays, taperDays):
    """mg drunk on a given day of a reset plan.

    Usual intake before quitInDays, then taperDays of equal steps down, then 0.
    A 3-day taper from 200 mg goes 150, 100, 50, then 0.
    """
    if day < quitInDays:
        return p.habitualMgPerDay
    stepsDone = day - quitInDays + 1
    if stepsDone <= taperDays:
        return p.habitualMgPerDay * (1 - stepsDone / (taperDays + 1))
    return 0.0


def withdrawal(R, mgPerDay, p):
    """How much sleepier you feel than a non-drinker would with no caffeine, as a fraction.

    Felt pressure over S is R * (1 - occ) (layer 4). A non-drinker with no caffeine
    has 1 * (1 - 0) = 1. Anything above 1 is withdrawal: 0.3 means sleepiness feels
    30% stronger. Uses the day's average level, so it is a daily summary, not hourly.
    """
    occ = occupancy(steadyStateConc(mgPerDay, p), p.kdMgL)
    return max(0.0, R * (1 - occ) - 1)


def simulateReset(p, quitInDays, taperDays, horizonDays):
    """Day-by-day receptor ratio, intake and withdrawal for one reset plan.

    quitInDays: the first day you drink less than usual (0 = today).
    quitInDays=None means no reset: keep your usual intake.
    Returns numpy arrays for days 0..horizonDays. R[d] is the value on the morning of day d.

    Each day the intake is constant, so the ODE has an exact one-day solution:
        R_next = R_target + (R - R_target) * exp(-1 / tau)
    Same trick as sleep.py: stepping a day at a time adds no integration error.
    """
    stepLeft = math.exp(-1 / TAU_TOLERANCE_DAYS)     # share of the gap to the target left after one day
    R = receptorRatioNow(p)
    days = np.arange(horizonDays + 1)
    rs, intakes, fog = [], [], []
    for day in days:
        mg = p.habitualMgPerDay if quitInDays is None else _intakeOnDay(day, p, quitInDays, taperDays)
        rs.append(R)
        intakes.append(mg)
        fog.append(withdrawal(R, mg, p))
        target = receptorTarget(mg, p)
        R = target + (R - target) * stepLeft
    return {"day": days, "R": np.array(rs), "intakeMg": np.array(intakes), "withdrawal": np.array(fog)}


def daysToReset(p):
    """Days of no caffeine until R is back to RESET_TARGET_R (1.1), quitting cold turkey today.

    With no caffeine the target is 1, so R(t) = 1 + (R0 - 1) * exp(-t / tau).
    Set that equal to 1.1 and solve: t = tau * ln((R0 - 1) / 0.1).
    From R0 = 1.5 that is 4 * ln(5) = 6.4 days, so a week.
    """
    excess = receptorRatioNow(p) - 1
    if excess <= RESET_TARGET_R - 1:
        return 0
    return math.ceil(TAU_TOLERANCE_DAYS * math.log(excess / (RESET_TARGET_R - 1)))


def recommendQuitDay(p, examInDays):
    """Pick the reset plan for an exam examInDays from now. Returns a dict with a sentence for the app.

    Tries every start day (0..examInDays) with every taper length in TAPER_OPTIONS_DAYS,
    as long as you are off caffeine by the morning of the exam. Rules, in order:
    1. Receptors must be back to 1.1x or less on the morning of the exam.
    2. Of those plans, take the gentlest: the lowest worst-day withdrawal.
    3. If two are equally gentle, start as late as possible (fewest days without coffee).
    If no plan meets rule 1, there isn't time: quitting would leave you in withdrawal
    while you study, and the coffee still wouldn't be back to full strength. Keep your habit.
    """
    nowR = receptorRatioNow(p)
    needed = daysToReset(p)
    base = {"nowR": nowR, "daysNeeded": needed, "examInDays": examInDays}

    if nowR <= RESET_TARGET_R:
        return {**base, "reset": False, "quitInDays": None, "taperDays": 0, "examR": nowR, "worstDay": None,
                "peakWithdrawal": 0.0,
                "reason": "Caffeine already works almost fully."}

    best = None
    for taperDays in TAPER_OPTIONS_DAYS:
        for quitInDays in range(examInDays - taperDays + 1):     # off caffeine by exam morning
            run = simulateReset(p, quitInDays, taperDays, examInDays)
            examR = run["R"][examInDays]
            if examR > RESET_TARGET_R:
                continue
            peak = float(run["withdrawal"].max())
            # Lower peak wins; on a tie (within 0.001), the later start wins.
            key = (round(peak, 3), -quitInDays)
            if best is None or key < best[0]:
                best = (key, quitInDays, taperDays, float(examR), peak, int(run["withdrawal"].argmax()))

    if best is None:
        return {**base, "reset": False, "quitInDays": None, "taperDays": 0, "examR": nowR, "worstDay": None,
                "peakWithdrawal": 0.0,
                "reason": f"Not enough time: a reset takes about {needed} days. Quitting now would leave you foggy while you study."}

    _, quitInDays, taperDays, examR, peak, worstDay = best
    start = "today" if quitInDays == 0 else f"in {quitInDays} day{'s' if quitInDays > 1 else ''}"
    how = "stop cold turkey" if taperDays == 0 else f"cut down over {taperDays} days, then stop"
    return {**base, "reset": True, "quitInDays": quitInDays, "taperDays": taperDays, "examR": examR,
            "worstDay": worstDay, "peakWithdrawal": peak,
            "reason": f"Start {start} and {how}. Worst day: {round(peak * 100)}% sleepier than normal."}


def feelsLikeMg(doseMg, p, R):
    """The dose a non-drinker would need to feel what you feel from doseMg, at the dose's peak.

    You (receptor ratio R) feel   S * R * (1 - occ(c))      with c the peak level of your dose.
    A non-drinker at level cEq feels   S * (1 - occ(cEq)).
    Set them equal; S cancels:   1 - occ(cEq) = R * (1 - occ(c)).
    Then undo Langmuir, occ = c / (c + Kd)  =>  c = Kd * occ / (1 - occ), to get cEq.
    Peak level is proportional to the dose, so cEq converts back to mg with one ratio.

    If R * (1 - occ(c)) >= 1, the dose only cancels your extra receptors and feels like nothing.
    """
    c = peakConcentration(doseMg, p)
    occEq = 1 - R * (1 - occupancy(c, p.kdMgL))
    if occEq <= 0:
        return 0.0
    cEq = p.kdMgL * occEq / (1 - occEq)
    return cEq / peakConcentration(1, p)        # mg/L per mg of dose


def strengthPercent(doseMg, p, R):
    """How strong your coffee feels compared to a non-drinker's: "feels like 60% strength"."""
    if doseMg <= 0:
        return 100.0
    return 100 * feelsLikeMg(doseMg, p, R) / doseMg
