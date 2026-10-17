"""Tests for layer 5a, the optimizer. Each one checks a claim we make to the judges."""

import numpy as np

from model.alertness import alertnessAt
from model.optimizer import bestPlan
from model.params import BEDTIME_LIMIT_MG, DAILY_LIMIT_MG, DOSE_MIN_GAP_H, EVENT_SAMPLE_H
from model.pk import peakTimeH
from model.schema import Dose, EventWindow, FreeSlot, Profile, SleepBlock
from model.tolerance import receptorRatioNow

P = Profile()                                                   # 70 kg, 5 h half-life, 200 mg a day
R = receptorRatioNow(P)
RESTED = [SleepBlock(23.5, 31.0), SleepBlock(47.0, 55.0)]       # 11:30 PM to 7 AM, then bed at 11 PM
SHORT = [SleepBlock(27.0, 31.0), SleepBlock(47.0, 55.0)]        # 3 AM to 7 AM: a 4-hour night
MORNING_EXAM = EventWindow(33.0, 35.0)                          # 9 to 11 AM tomorrow
AFTERNOON_EXAM = EventWindow(38.0, 41.0)                        # 2 to 5 PM tomorrow


def testScoreMatchesScoringThePlanDirectly():
    # The optimizer adds up precomputed 1 mg curves (superposition). Its score must equal
    # running layers 1 to 4 on the chosen plan from scratch.
    plan = bestPlan(AFTERNOON_EXAM, SHORT, P, R)
    ts = np.arange(AFTERNOON_EXAM.startH, AFTERNOON_EXAM.endH + 1e-9, EVENT_SAMPLE_H)
    assert abs(plan.score - alertnessAt(ts, plan.doses, SHORT, P, R).mean()) < 1e-9


def testPointEventDoseLandsAtPeakTime():
    # For a single moment, the best single dose is taken one peak time (~52 min) before it.
    event = EventWindow(34.0, 34.0)
    plan = bestPlan(event, RESTED, P, R)
    assert len(plan.doses) == 1
    assert abs(plan.doses[0].timeH - (event.startH - peakTimeH(P))) <= 0.25


def testPlanBeatsNoCoffee():
    plan = bestPlan(MORNING_EXAM, RESTED, P, R)
    assert plan.score > plan.baselineScore


def testBedtimeLimitHolds():
    # 7 to 9 PM exam with bed at 11 PM: the plan must leave at most 50 mg at bedtime.
    plan = bestPlan(EventWindow(43.0, 45.0), RESTED, P, R)
    assert plan.doses
    assert plan.bedtimeCaffeineMg <= BEDTIME_LIMIT_MG + 1e-9


def testDailyLimitCountsDrinksAlreadyTaken():
    taken = [Dose(31.5, 200, "Celsius"), Dose(32.5, 150)]
    plan = bestPlan(AFTERNOON_EXAM, SHORT, P, R, fixedDoses=taken)
    assert sum(d.mg for d in taken + plan.doses) <= DAILY_LIMIT_MG


def testDosesAtLeastAnHourApart():
    plan = bestPlan(EventWindow(33.0, 39.0), SHORT, P, R)
    times = [d.timeH for d in plan.doses]
    assert all(b - a >= DOSE_MIN_GAP_H - 1e-9 for a, b in zip(times, times[1:]))


def testMoreToleranceGetsABiggerDose():
    # Same rule (each 50 mg must earn its keep), but tolerant receptors get less from each mg.
    def total(habit):
        p = Profile(habitualMgPerDay=habit)
        return sum(d.mg for d in bestPlan(MORNING_EXAM, RESTED, p, receptorRatioNow(p)).doses)
    assert total(0) < total(400)


def testNothingRecommendedBeforeNow():
    plan = bestPlan(AFTERNOON_EXAM, SHORT, P, R, earliestH=36.0)
    assert all(d.timeH >= 36.0 for d in plan.doses)


def testNoNapAfterAFullNight():
    assert bestPlan(AFTERNOON_EXAM, RESTED, P, R, allowNap=True).nap is None


def testNapAfterAShortNight():
    assert bestPlan(AFTERNOON_EXAM, SHORT, P, R, allowNap=True).nap is not None


def testNapStaysInsideTheFreeSlot():
    slot = FreeSlot(34.0, 35.0)
    nap = bestPlan(AFTERNOON_EXAM, SHORT, P, R, allowNap=True, freeSlots=[slot]).nap
    assert nap is None or (slot.startH <= nap.startH and nap.endH <= slot.endH)


def testNoDrinkingDuringTheNap():
    plan = bestPlan(AFTERNOON_EXAM, SHORT, P, R, allowNap=True)
    assert all(not (plan.nap.startH < d.timeH < plan.nap.endH) for d in plan.doses)


def testEventAlreadyOverRecommendsNothing():
    assert bestPlan(MORNING_EXAM, RESTED, P, R, earliestH=36.0).doses == []
