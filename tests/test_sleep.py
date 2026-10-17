"""Tests for layer 2. Each one checks a claim we make to the judges."""

import numpy as np

from model.alertness import alertnessCurve
from model.schema import Profile, SleepBlock
from model.sleep import circadian, isAsleep, sleepPressure

P = Profile()   # circadian peak at 5 PM


def nights(bedH, hours, days):
    """One night per day for `days` days, starting at bedH on day 0."""
    return [SleepBlock(bedH + 24 * d, bedH + 24 * d + hours) for d in range(days)]


def wakeUpPressure(sleep):
    return sleepPressure([b.endH for b in sleep], sleep)


def testSteadyScheduleGivesSameWakeUpPressure():
    # 8 h asleep and 16 h awake, three days running: every morning starts the same.
    S = wakeUpPressure(nights(23.0, 8, 3))
    assert np.ptp(S) < 0.01


def testShortNightsBuildSleepDebt():
    # 4 h nights after a normal one: you wake up a little sleepier each day.
    sleep = [SleepBlock(23.0, 31.0)] + nights(23.0 + 24 + 3, 4, 3)
    S = wakeUpPressure(sleep)
    assert np.all(np.diff(S) > 0)


def testPressureRisesAwakeAndFallsAsleep():
    sleep = [SleepBlock(23.0, 31.0)]
    S = sleepPressure([12.0, 22.9, 30.9, 40.0], sleep)
    assert S[1] > S[0]                       # awake all afternoon: rises
    assert S[2] < S[1]                       # asleep all night: falls
    assert S[3] > S[2]                       # awake again: rises
    assert np.all((S > 0) & (S < 1))


def testDrainMatchesClosedForm():
    # Asleep from 23:00, S should follow S0 * exp(-t / 4.2) exactly (the step is the exact solution).
    sleep = [SleepBlock(23.0, 31.0)]
    S0, S4 = sleepPressure([23.0, 27.0], sleep)
    assert abs(S4 - S0 * np.exp(-4 / 4.2)) < 1e-3


def testAllNighterKeepsRising():
    # Skip a night: pressure the next morning is far higher than after sleeping.
    slept = sleepPressure(33.0, nights(-1.0, 8, 2))
    skipped = sleepPressure(33.0, [SleepBlock(-1.0, 7.0)])
    assert skipped > slept + 0.3


def testCircadianPeaksAtPeakHour():
    t = np.arange(0, 24, 0.1)
    assert abs(t[np.argmax(circadian(t, P))] - P.circadianPeakH) < 0.06
    assert abs(circadian(P.circadianPeakH, P) - 0.15) < 1e-12
    assert abs(circadian(P.circadianPeakH + 12, P) + 0.15) < 1e-12


def testIsAsleepIncludesStartExcludesEnd():
    sleep = [SleepBlock(23.0, 31.0)]
    assert isAsleep([22.9, 23.0, 30.9, 31.0], sleep).tolist() == [False, True, True, False]


def testAlertnessCurveRunsWithRealSleep():
    # Layers 1, 2 and 4 joined: the full curve the optimizer and chart use.
    curve = alertnessCurve([], [SleepBlock(23.0, 31.0)], P, 1.0, 20.0, 34.0)
    assert set(curve) == {"t", "conc", "pressure", "felt", "alertness"}
    asleep = (curve["t"] >= 23.0) & (curve["t"] < 31.0)
    assert np.all(curve["alertness"][asleep] == 0)
