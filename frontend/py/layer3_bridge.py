"""
Glue between the layer 3 page and model/tolerance.py. Runs in the browser via Pyodide.

No math lives here: it turns the page's inputs into a Profile, calls tolerance.py,
and hands back plain numbers and lists for the page.
"""

from model.pk import adjustedHalfLifeH
from model.schema import Profile
from model.tolerance import (daysToReset, feelsLikeMg, receptorRatioNow, recommendQuitDay,
                             simulateReset, strengthPercent)


def _lists(run):
    return {key: values.tolist() for key, values in run.items()}


def compute(habitualMgPerDay, habitWeeks, examInDays, weightKg, baseHalfLifeH, smoker, oralContraceptives, doseMg):
    """doseMg is the drink to rate ("your 95 mg coffee feels like ..."), the first drink from layer 1."""
    p = Profile(weightKg=weightKg, halfLifeH=adjustedHalfLifeH(baseHalfLifeH, smoker, oralContraceptives),
                habitualMgPerDay=habitualMgPerDay, habitWeeks=habitWeeks)
    nowR = receptorRatioNow(p)
    plan = recommendQuitDay(p, examInDays)

    # Chart a few days past the exam, and long enough to show a full cold-turkey reset.
    horizon = max(examInDays + 3, daysToReset(p) + 3, 10)
    return {
        "nowR": nowR,
        "doseMg": doseMg,
        "feelsLikeMg": feelsLikeMg(doseMg, p, nowR),
        "strengthNow": strengthPercent(doseMg, p, nowR),
        "strengthAtExam": strengthPercent(doseMg, p, plan["examR"]),
        "plan": plan,
        "recommended": _lists(simulateReset(p, plan["quitInDays"], plan["taperDays"], horizon)),
        "coldTurkeyToday": _lists(simulateReset(p, 0, 0, horizon)),
    }
