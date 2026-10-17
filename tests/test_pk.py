"""Tests for layer 1. Each one checks a claim we make to the judges."""

import numpy as np

from model.pk import (adjustedHalfLifeH, bodyCaffeineMg, concentration, eliminationRate,
                      peakConcentration, peakTimeH, volumeL)
from model.schema import Dose, Profile

P = Profile()                       # 70 kg, 5 h half-life
COFFEE = [Dose(timeH=0.0, mg=100)]


def testEliminationRateFromHalfLife():
    assert abs(eliminationRate(P) - 0.1386) < 1e-3          # ln(2) / 5


def testVolumeScalesWithWeight():
    assert volumeL(P) == 42.0


def testZeroBeforeTheDose():
    assert concentration([-2.0, -0.01], [Dose(0.0, 100)], P).tolist() == [0.0, 0.0]


def testPeakMatchesClosedForm():
    # Scan finely and find the highest point; it should be where the derivative is zero.
    t = np.arange(0, 3, 0.001)
    scanned = t[np.argmax(concentration(t, COFFEE, P))]
    assert abs(scanned - peakTimeH(P)) < 0.01
    assert 0.75 < peakTimeH(P) < 1.0                        # about 50 minutes


def testPeakLevelIsRealistic():
    # Published values: ~1.5 to 2.5 mg/L an hour after 100 mg in a 70 kg adult.
    assert 1.5 < peakConcentration(100, P) < 2.5
    assert abs(peakConcentration(100, P) - concentration(peakTimeH(P), COFFEE, P)) < 1e-9


def testHalvesEveryHalfLifeOnceAbsorbed():
    # After absorption is done (a few hours), only exp(-ke t) is left, so each half-life halves it exactly.
    c3, c8 = concentration([3.0, 8.0], COFFEE, P)
    assert abs(c8 / c3 - 0.5) < 1e-3


def testHalfLifeAfterPeakIsOnlyApproximate():
    # From the peak it's about half, not exactly: at the peak some caffeine is still being absorbed.
    tp = peakTimeH(P)
    ratio = concentration(tp + 5, COFFEE, P) / concentration(tp, COFFEE, P)
    assert abs(ratio - 0.5) < 0.05


def testDosesAddUp():
    t = np.arange(0, 24, 0.1)
    d1, d2 = Dose(8.0, 100), Dose(13.0, 150)
    both = concentration(t, [d1, d2], P)
    assert np.allclose(both, concentration(t, [d1], P) + concentration(t, [d2], P))


def testDoubleDoseDoubleLevel():
    t = np.arange(0, 12, 0.5)
    assert np.allclose(concentration(t, [Dose(0, 200)], P), 2 * concentration(t, [Dose(0, 100)], P))


def testLongerHalfLifeLeavesMoreAtBedtime():
    slow = Profile(halfLifeH=10.0)
    noonCoffee = [Dose(12.0, 100)]
    assert bodyCaffeineMg(23.0, noonCoffee, slow) > bodyCaffeineMg(23.0, noonCoffee, P)


def testBodyCaffeineNearDoseAfterAbsorption():
    # 1 h after 100 mg, almost all of it is absorbed and only ~13% has been cleared.
    assert 80 < bodyCaffeineMg(1.0, COFFEE, P) < 95


def testHalfLifeAdjustments():
    assert adjustedHalfLifeH(5.0) == 5.0
    assert adjustedHalfLifeH(5.0, smoker=True) == 2.5
    assert adjustedHalfLifeH(5.0, oralContraceptives=True) == 10.0
    assert adjustedHalfLifeH(5.0, smoker=True, oralContraceptives=True) == 5.0
