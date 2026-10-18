"""Tests for layer 5b, learning from ratings. Each one checks a claim we make to the judges.

TASKS.md hoped a few days of ratings would recover a hidden half-life within 0.7 h.
Testing showed 1-to-5 ratings can't do that (see the docstring of model/learn.py),
so these tests check what the math does guarantee: the likelihood points at the
truth, and real-looking ratings move the estimate the right way and narrow it.
"""

from dataclasses import replace

import numpy as np

from model.alertness import alertnessAt
from model.learn import (Rating, concentrationBand, grid, logPrior, posterior, predictedAlertness,
                         ratingSpread, ratingTeaches, ratingToAlertness, simulateDays)
from model.schema import Profile
from model.tolerance import receptorRatioNow

P = Profile()                                   # settings say a 5 h half-life, Kd 3 mg/L
R = receptorRatioNow(P)


def priorOnly():
    return posterior([], [], [], P, R)


def testRatingScale():
    assert list(ratingToAlertness([1, 3, 5])) == [0.0, 0.5, 1.0]


def testProbabilitiesAddToOne():
    assert abs(posterior(*simulateDays(6.0, P, R, seed=0), P, R)["prob"].sum() - 1) < 1e-9


def testNoRatingsGivesThePrior():
    post = priorOnly()
    halfLives, kds = grid()
    expected = np.exp(logPrior(halfLives, kds, P))
    assert np.allclose(post["prob"], expected / expected.sum())
    assert abs(post["meanHalfLife"] - P.halfLifeH) < 0.15     # a little above 5: the grid runs to 10


def testGridMatchesTheModel():
    # The shortcut (20 caffeine curves broadcast over 20 Kds) must equal layers 1 to 4 run directly.
    _, doses, sleep = simulateDays(5.0, P, R, days=1, seed=0)
    ts = np.array([-14.0, -6.0, -3.0])
    halfLives, kds = grid()
    pred = predictedAlertness(ts, doses, sleep, P, R, halfLives, kds)
    direct = alertnessAt(ts, doses, sleep, replace(P, halfLifeH=halfLives[7], kdMgL=kds[11]), R)
    assert np.allclose(pred[7, 11], direct)


def testPerfectRatingsPointAtTheTruth():
    # Noise-free ratings: the most likely half-life is the true one, to within a grid step.
    ratings, doses, sleep = simulateDays(7.0, P, R, seed=0)
    ts = np.array([r.t for r in ratings])
    perfect = alertnessAt(ts, doses, sleep, replace(P, halfLifeH=7.0), R)
    halfLives, kds = grid()
    logLik = (-0.5 * ((perfect - predictedAlertness(ts, doses, sleep, P, R, halfLives, kds)) / 0.15) ** 2).sum(-1)
    i, _ = np.unravel_index(np.argmax(logLik), logLik.shape)
    assert abs(halfLives[i] - 7.0) <= halfLives[1] - halfLives[0]


def testRatingsMoveTheEstimateTheRightWay():
    prior = priorOnly()
    slow = posterior(*simulateDays(7.5, P, R, seed=1), P, R)
    fast = posterior(*simulateDays(3.0, P, R, seed=1), P, R)
    assert fast["meanHalfLife"] < prior["meanHalfLife"] < slow["meanHalfLife"]


def testRatingsNarrowTheEstimate():
    post = posterior(*simulateDays(6.0, P, R, seed=2), P, R)
    assert post["sdHalfLife"] < priorOnly()["sdHalfLife"]


def testBandLowIsBelowHigh():
    ratings, doses, sleep = simulateDays(6.0, P, R, seed=0)
    t = np.linspace(-20, 0, 50)
    low, high = concentrationBand(t, doses, P, posterior(ratings, doses, sleep, P, R))
    assert np.all(low <= high)


def testRatingWithNoCaffeineTeachesNothing():
    # Before any drink, every guess predicts the same alertness, so the rating can't move the estimate.
    _, doses, sleep = simulateDays(5.0, P, R, days=1, seed=0)   # drinks at -16 h (8 AM) and -11 h (1 PM)
    beforeCoffee = -17.0                                        # 7 AM, just after waking
    assert ratingSpread(beforeCoffee, doses, sleep, P, R) == 0
    assert not ratingTeaches(beforeCoffee, doses, sleep, P, R)
    post = posterior([Rating(beforeCoffee, 1)], doses, sleep, P, R)
    assert np.allclose(post["prob"], priorOnly()["prob"])


def testRatingAfterCoffeeTeaches():
    _, doses, sleep = simulateDays(5.0, P, R, days=1, seed=0)
    assert ratingTeaches(-6.0, doses, sleep, P, R)              # 6 PM, five hours after the 1 PM coffee
