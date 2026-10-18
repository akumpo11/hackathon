"""
Glue between the layer 5 page and model/optimizer.py and model/learn.py. Runs in the browser via Pyodide.

No math lives here: it turns what the page and layers 1 to 3 decided into the
arguments the model expects, calls it, and hands back plain lists and numbers.

The body (weight, half-life, smoker, pill) comes from personal settings, drinks
from layer 1, sleep and the body clock from layer 2, tolerance R from layer 3.
"""

import json
from dataclasses import replace

import numpy as np

from model.learn import Rating, concentrationBand, posterior, ratingTeaches, simulateDays
from model.optimizer import bestPlan, lastNightBefore
from model.params import BEDTIME_LIMIT_MG, DAILY_LIMIT_MG, DRINKS, MG_COST
from model.pk import adjustedHalfLifeH, concentration
from model.schema import Dose, EventWindow, FreeSlot, Profile, SleepBlock


def _profile(body, circadianPeakH, learned):
    """Profile from the settings body, or from learned values when the page says to use them.

    body:    {"weightKg", "halfLifeH", "smoker", "oralContraceptives"}, halfLifeH before adjustments
    learned: None, or {"halfLifeH", "kdMgL"} from layer 5's learning (half-life already personal)
    """
    halfLife = adjustedHalfLifeH(body["halfLifeH"], body["smoker"], body["oralContraceptives"])
    p = Profile(weightKg=body["weightKg"], halfLifeH=halfLife, circadianPeakH=circadianPeakH)
    if learned:
        p = replace(p, halfLifeH=learned["halfLifeH"], kdMgL=learned["kdMgL"])
    return p


def plan(requestJson):
    """requestJson: {"event": {"startH", "endH"}, "sleep": [blocks], "drinks": [doses],
    "body": {...}, "circadianPeakH", "tolerance", "learned", "allowNap", "freeSlots": [slots], "nowH"}
    """
    q = json.loads(requestJson)
    p = _profile(q["body"], q["circadianPeakH"], q["learned"])
    sleep = [SleepBlock(**b) for b in q["sleep"]]
    drinks = [Dose(**d) for d in q["drinks"]]
    event = EventWindow(**q["event"])
    try:
        wake = lastNightBefore(event, sleep).endH
        result = bestPlan(event, sleep, p, q["tolerance"], allowNap=q["allowNap"],
                          freeSlots=[FreeSlot(**s) for s in q["freeSlots"]], fixedDoses=drinks,
                          earliestH=q["nowH"])
    except ValueError as err:          # no night before or after the event on the sleep calendar
        return {"error": str(err)}

    coffee = DRINKS["drip coffee (8 oz)"]
    curve = result.curve
    return {
        "doses": [{"timeH": d.timeH, "mg": d.mg, "cups": d.mg / coffee} for d in result.doses],
        "nap": None if result.nap is None else {"startH": result.nap.startH, "endH": result.nap.endH},
        "score": result.score,
        "baselineScore": result.baselineScore,
        "tried": result.tried,
        "bedtimeMg": result.bedtimeCaffeineMg,
        "bedtimeLimitMg": BEDTIME_LIMIT_MG,
        "dayMg": sum(d.mg for d in drinks + result.doses if d.timeH >= wake),     # what counts toward 400 mg
        "dailyLimitMg": DAILY_LIMIT_MG,
        "mgCostPer50": MG_COST * 50 * 10,     # on the 0..10 scale the page shows
        "halfLifeH": p.halfLifeH, "kdMgL": p.kdMgL,
        "t": curve["t"].tolist(),
        "alertness": curve["alertness"].tolist(),
    }


def _learned(post, todayDoses, p):
    """What the page shows after learning: the heatmap, the estimates, and today's caffeine band."""
    t = np.arange(5, 24.01, 0.25)
    low, high = concentrationBand(t, todayDoses, p, post)
    middle = concentration(t, todayDoses, replace(p, halfLifeH=post["meanHalfLife"]))
    return {
        "halfLives": post["halfLives"].tolist(), "kds": post["kds"].tolist(), "prob": post["prob"].tolist(),
        "meanHalfLife": post["meanHalfLife"], "sdHalfLife": post["sdHalfLife"],
        "meanKd": post["meanKd"], "sdKd": post["sdKd"],
        "priorHalfLife": p.halfLifeH, "priorKd": p.kdMgL,
        "bandT": t.tolist(), "bandLow": low.tolist(), "bandHigh": high.tolist(), "bandMiddle": middle.tolist(),
    }


def learn(requestJson):
    """requestJson: {"ratings": [{"t", "score"}], "doses": [...], "sleep": [...], "todayDoses": [...],
    "body": {...}, "circadianPeakH", "tolerance"}. The prior is centered on your settings.

    lastRatingTeaches: whether your latest rating could move the estimate (None with no ratings),
    so the page can say when it couldn't."""
    q = json.loads(requestJson)
    p = _profile(q["body"], q["circadianPeakH"], None)
    ratings = [Rating(**r) for r in q["ratings"]]
    doses = [Dose(**d) for d in q["doses"]]
    sleep = [SleepBlock(**b) for b in q["sleep"]]
    post = posterior(ratings, doses, sleep, p, q["tolerance"])
    teaches = ratingTeaches(ratings[-1].t, doses, sleep, p, q["tolerance"]) if ratings else None
    return {**_learned(post, [Dose(**d) for d in q["todayDoses"]], p), "lastRatingTeaches": teaches}


def simulate(requestJson):
    """Demo button: a week of fake ratings from a hidden half-life, then learn from them.

    requestJson: {"trueHalfLife", "seed", "todayDoses", "body", "circadianPeakH", "tolerance"}
    """
    q = json.loads(requestJson)
    p = _profile(q["body"], q["circadianPeakH"], None)
    ratings, doses, sleep = simulateDays(q["trueHalfLife"], p, q["tolerance"], seed=q["seed"])
    post = posterior(ratings, doses, sleep, p, q["tolerance"])
    return {**_learned(post, [Dose(**d) for d in q["todayDoses"]], p),
            "trueHalfLife": q["trueHalfLife"], "ratingCount": len(ratings)}
