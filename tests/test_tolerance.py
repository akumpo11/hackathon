"""Tests for layer 3. Each one checks a claim we make to the judges."""

import numpy as np

from model.params import RESET_TARGET_R
from model.schema import Profile
from model.tolerance import (daysToReset, feelsLikeMg, receptorRatioNow, recommendQuitDay, simulateReset,
                             steadyStateConc, strengthPercent)

HEAVY = Profile(habitualMgPerDay=300, habitWeeks=8)      # 70 kg, 5 h half-life


def testSteadyStateLevel():
    # 300 mg a day over a clearance of ke * V * 24 = 0.139 * 42 * 24 = 140 L a day.
    assert abs(steadyStateConc(300, HEAVY) - 2.15) < 0.05


def testNonDrinkerHasNoExtraReceptors():
    assert receptorRatioNow(Profile(habitualMgPerDay=0)) == 1.0


def testThreeHundredMgGivesAboutOnePointFive():
    assert abs(receptorRatioNow(HEAVY) - 1.5) < 0.05


def testToleranceBuildsUpOverWeeks():
    early, settled = Profile(habitualMgPerDay=300, habitWeeks=0.5), HEAVY
    assert 1 < receptorRatioNow(early) < receptorRatioNow(settled)


def testKeepingTheHabitHasNoWithdrawal():
    run = simulateReset(HEAVY, None, 0, 10)
    assert np.all(run["withdrawal"] == 0)
    assert np.allclose(run["R"], run["R"][0])


def testQuittingLowersReceptorsEveryDay():
    run = simulateReset(HEAVY, 0, 0, 10)
    assert np.all(np.diff(run["R"]) < 0)
    assert run["R"][10] < 1.1


def testWithdrawalWorstOnTheFirstDayOff():
    run = simulateReset(HEAVY, 2, 0, 10)
    assert run["withdrawal"][:2].max() == 0
    assert run["withdrawal"].argmax() == 2
    assert abs(run["withdrawal"][2] - (run["R"][2] - 1)) < 1e-9     # with no caffeine you feel R - 1 extra


def testTaperIsGentlerThanColdTurkey():
    cold, taper = simulateReset(HEAVY, 0, 0, 14), simulateReset(HEAVY, 0, 3, 14)
    assert taper["withdrawal"].max() < cold["withdrawal"].max()
    assert list(taper["intakeMg"][:5]) == [225, 150, 75, 0, 0]


def testDaysToResetMatchesTheSimulation():
    days = daysToReset(HEAVY)
    run = simulateReset(HEAVY, 0, 0, days)
    assert run["R"][days] <= RESET_TARGET_R < run["R"][days - 1]
    assert days == 7                    # 4 * ln(0.5 / 0.1) = 6.4, rounded up


def testPlanGetsReceptorsBackByTheExam():
    plan = recommendQuitDay(HEAVY, 14)
    assert plan["reset"] and plan["examR"] <= RESET_TARGET_R
    assert plan["quitInDays"] + plan["taperDays"] <= 14


def testLongerRunwayPicksATaper():
    assert recommendQuitDay(HEAVY, 14)["taperDays"] > 0
    assert recommendQuitDay(HEAVY, 7) == {**recommendQuitDay(HEAVY, 7), "quitInDays": 0, "taperDays": 0}


def testTooCloseToTheExamKeepsTheHabit():
    plan = recommendQuitDay(HEAVY, 3)
    assert not plan["reset"] and "Not enough time" in plan["reason"]


def testLightDrinkerNeedsNoReset():
    assert not recommendQuitDay(Profile(habitualMgPerDay=40), 5)["reset"]


def testNoToleranceMeansFullStrength():
    assert abs(strengthPercent(95, HEAVY, 1.0) - 100) < 1e-9


def testToleranceWeakensTheSameCoffee():
    assert strengthPercent(95, HEAVY, 1.5) < strengthPercent(95, HEAVY, 1.2) < 100


def testSmallDoseCanBeFullyCancelled():
    # At R = 1.5 a dose must block a third of receptors before it does anything: c > Kd / 2.
    assert feelsLikeMg(50, HEAVY, 1.5) == 0
    assert feelsLikeMg(200, HEAVY, 1.5) > 0
