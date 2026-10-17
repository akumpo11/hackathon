"""Tests for layer 3 that don't need layers 1 and 2.

The TASKS.md tests that use real sleep and caffeine curves (minimum between
3 and 6 AM, 100 mg at 9 AM, nap comparisons over a full day) go here once
pk.py and sleep.py are merged.
"""

from types import SimpleNamespace

import numpy as np

from model.alertness import alertnessFrom, feltPressure, inertia, occupancy

KD = 3.0


def block(startH, endH):
    return SimpleNamespace(startH=startH, endH=endH)


def testHalfBlockAtKd():
    assert occupancy(3, 3) == 0.5


def testEffectSaturates():
    # Four times the caffeine blocks far less than four times as many receptors.
    assert occupancy(8, 3) < 4 * occupancy(2, 3)
    assert occupancy(1000, 3) < 1


def testWorksOnArrays():
    out = occupancy(np.array([0.0, 3.0, 6.0]), 3)
    assert out.shape == (3,)
    assert out[0] == 0


def testToleranceMakesPressureFeelStronger():
    assert feltPressure(0.5, 2.0, 1.5, KD) > feltPressure(0.5, 2.0, 1.0, KD)


def testNoCaffeineNoToleranceFeelsLikeRawPressure():
    assert feltPressure(0.6, 0.0, 1.0, KD) == 0.6


def testShortNapLessGroggyThanDeepNap():
    wake = 15.0
    after20Min = inertia([wake + 0.1], [block(wake - 20 / 60, wake)])[0]
    after60Min = inertia([wake + 0.1], [block(wake - 1.0, wake)])[0]
    assert after20Min < after60Min


def testInertiaFadesAndIsZeroBeforeWaking():
    sleep = [block(23.0, 31.0)]
    early, later = inertia([31.05, 33.0], sleep)
    assert early > later
    assert inertia([30.0], sleep)[0] == 0


def testOnlyLatestSleepCounts():
    sleep = [block(23.0, 31.0), block(38.0, 38 + 20 / 60)]   # night, then a 20-min nap
    justAfterNap = inertia([38 + 20 / 60], sleep)[0]
    assert abs(justAfterNap - 0.10) < 1e-9


def testAlertnessIsClippedTo01():
    assert alertnessFrom(0.0, 0.15, 0.0, 1.0, 0.0, KD) == 1.0
    assert alertnessFrom(1.0, -0.15, 0.0, 1.8, 0.3, KD) == 0.0


def testCaffeineRaisesAlertness():
    assert alertnessFrom(0.7, 0.0, 3.0, 1.0, 0.0, KD) > alertnessFrom(0.7, 0.0, 0.0, 1.0, 0.0, KD)
