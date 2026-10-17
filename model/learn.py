"""
Layer 5b: learning your half-life and sensitivity from alertness ratings (owner: Evan).

Two numbers in the model vary a lot between people and we can't measure them
directly: the caffeine half-life (how fast you clear it) and Kd (how much
caffeine blocks half your receptors). Your 1-to-5 ratings after drinks tell us
about both, through Bayes' rule on a grid:

    posterior(h, Kd)  is proportional to  prior(h, Kd) * likelihood(ratings | h, Kd)

- Grid: 20 half-lives x 20 Kd values = 400 guesses about you.
- Prior: a bell curve around the values in your settings. It keeps one odd
  rating from dragging the estimate anywhere.
- Likelihood: for each guess, layers 1 to 4 predict your alertness at the times
  you rated. A rating is the prediction plus noise, observed ~ Normal(A(t), 0.15),
  so guesses that predict your ratings well get a high likelihood.
- Multiply, then divide by the total so the 400 probabilities add up to 1.

We work with logs (log prior + log likelihood) because multiplying many small
numbers underflows to 0; subtracting the max before exp() keeps it in range.

What ratings can and can't tell us (found by testing, see tests/test_learn.py):
- Half-life only shows in how fast caffeine wears off, so the informative
  ratings are hours after your last drink. A rating 1 h after coffee says
  almost nothing about it.
- A longer half-life (more caffeine left) and a higher Kd (each mg blocks less)
  predict nearly the same ratings, so the posterior is a diagonal ridge in the
  heatmap: the ratings pin down a combination of the two, not each one.
- One step on the 1-to-5 scale is 0.25 of alertness, while half-life 5 h vs 7 h
  changes predicted alertness by 0.03 to 0.15. So a week of ratings narrows the
  half-life from +-1.5 h to about +-1 h. It learns, but slowly.

Equations with plain-English readings: equations/layer-5-learning.md.
"""

from dataclasses import dataclass, replace

import numpy as np

from .alertness import alertnessAt, alertnessFrom, inertia
from .params import (LEARN_GRID_POINTS, LEARN_HALF_LIVES_H, LEARN_KDS_MG_L, PRIOR_SD_HALF_LIFE_H,
                     PRIOR_SD_KD_MG_L, RATING_SD)
from .pk import concentration
from .schema import Dose, SleepBlock
from .sleep import circadian, sleepPressure


@dataclass(frozen=True)
class Rating:
    t: float        # when you rated, hours since midnight of day 0
    score: int      # 1 = exhausted ... 5 = fully alert


def ratingToAlertness(score):
    """1..5 onto the model's 0..1 alertness scale: 1 -> 0.0, 3 -> 0.5, 5 -> 1.0.

    The research version is the 9-point Karolinska Sleepiness Scale; 5 points is
    what people will actually tap on a phone.
    """
    return (np.asarray(score, dtype=float) - 1) / 4


def grid():
    """The half-lives (h) and Kd values (mg/L) we consider, 20 of each."""
    return (np.linspace(*LEARN_HALF_LIVES_H, LEARN_GRID_POINTS),
            np.linspace(*LEARN_KDS_MG_L, LEARN_GRID_POINTS))


def logPrior(halfLives, kds, p):
    """Log of a bell curve around your settings (p.halfLifeH, p.kdMgL), shape (half-lives, Kds).

    Logs of Gaussians are just -0.5 * z^2; the normalizing constants cancel later.
    """
    zH = (halfLives[:, None] - p.halfLifeH) / PRIOR_SD_HALF_LIFE_H
    zK = (kds[None, :] - p.kdMgL) / PRIOR_SD_KD_MG_L
    return -0.5 * zH ** 2 - 0.5 * zK ** 2


def predictedAlertness(ts, doses, sleep, p, tolerance, halfLives, kds):
    """Alertness at times ts for every guess on the grid, shape (half-lives, Kds, times).

    Sleep pressure, the body clock and inertia don't depend on the guess, so they're
    computed once. Caffeine depends only on the half-life (20 curves), and numpy
    broadcasts those across the 20 Kd values, so 400 guesses cost 20 caffeine curves.
    """
    S, circ, groggy = sleepPressure(ts, sleep), circadian(ts, p), inertia(ts, sleep)
    conc = np.array([concentration(ts, doses, replace(p, halfLifeH=h)) for h in halfLives])
    return alertnessFrom(S, circ, conc[:, None, :], tolerance, groggy, kds[None, :, None])


def posterior(ratings, doses, sleep, p, tolerance):
    """Probability of each (half-life, Kd) on the grid, given your ratings.

    ratings: list of Rating. doses and sleep: what you drank and slept around those
    times, so the model can predict each rating. With no ratings it's just the prior.
    prob[i][j] belongs to halfLives[i] and kds[j].
    """
    halfLives, kds = grid()
    logPost = logPrior(halfLives, kds, p)
    if ratings:
        ts = np.array([r.t for r in ratings], dtype=float)
        observed = ratingToAlertness([r.score for r in ratings])
        predicted = predictedAlertness(ts, doses, sleep, p, tolerance, halfLives, kds)
        logPost = logPost + (-0.5 * ((observed - predicted) / RATING_SD) ** 2).sum(axis=-1)

    prob = np.exp(logPost - logPost.max())      # subtract the max so exp() can't underflow to all zeros
    prob /= prob.sum()

    # Marginals: add up the other parameter's axis. Then mean and spread of each.
    byHalfLife, byKd = prob.sum(axis=1), prob.sum(axis=0)
    meanHalfLife, meanKd = (byHalfLife * halfLives).sum(), (byKd * kds).sum()
    return {
        "halfLives": halfLives, "kds": kds, "prob": prob,
        "meanHalfLife": float(meanHalfLife), "meanKd": float(meanKd),
        "sdHalfLife": float(np.sqrt((byHalfLife * (halfLives - meanHalfLife) ** 2).sum())),
        "sdKd": float(np.sqrt((byKd * (kds - meanKd) ** 2).sum())),
    }


def concentrationBand(t, doses, p, post, n=200, seed=0):
    """10th to 90th percentile of your caffeine curve, given what we've learned.

    Draw n half-lives from the posterior, compute a caffeine curve for each, and at
    each time take the 10th and 90th percentile. A narrow band means we're sure.
    Only 20 distinct half-lives exist on the grid, so each curve is computed once
    and the draws pick from them.
    """
    t = np.asarray(t, dtype=float)
    rng = np.random.default_rng(seed)
    curves = np.array([concentration(t, doses, replace(p, halfLifeH=h)) for h in post["halfLives"]])
    draws = rng.choice(len(post["halfLives"]), size=n, p=post["prob"].sum(axis=1))
    low, high = np.percentile(curves[draws], [10, 90], axis=0)
    return low, high


def simulateDays(trueHalfLife, p, tolerance, trueKd=None, days=7, seed=None):
    """Fake ratings from a hidden "true" you, for the demo button.

    The `days` days before today: asleep 11 PM to 7 AM, 100 mg at 8 AM and 1 PM,
    ratings at 10 AM, 3 PM, 6 PM and 9 PM. Each rating is the model's alertness at
    the true values plus noise (sd 0.1), rounded onto the 1-to-5 scale.
    Returns (ratings, doses, sleep).
    """
    rng = np.random.default_rng(seed)
    dayStarts = [24 * d for d in range(-days, 0)]
    sleep = [SleepBlock(d - 1, d + 7) for d in dayStarts] + [SleepBlock(-1, 7)]
    doses = [Dose(d + h, 100, "drip coffee") for d in dayStarts for h in (8, 13)]
    ts = np.array([d + h for d in dayStarts for h in (10, 15, 18, 21)], dtype=float)

    truth = replace(p, halfLifeH=trueHalfLife, kdMgL=p.kdMgL if trueKd is None else trueKd)
    felt = alertnessAt(ts, doses, sleep, truth, tolerance) + rng.normal(0, 0.1, len(ts))
    scores = np.clip(np.round(1 + 4 * felt), 1, 5).astype(int)
    return [Rating(float(t), int(s)) for t, s in zip(ts, scores)], doses, sleep
