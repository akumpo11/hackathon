"""
Glue between the layer 1 page and model/pk.py. Runs in the browser via Pyodide.

No math lives here: it turns the page's inputs into a Profile and Doses, calls
pk.py, and hands back plain numbers and lists for the page.
"""

import json

import numpy as np

from model.params import BEDTIME_LIMIT_MG, DRINKS, KA_PER_H
from model.pk import (adjustedHalfLifeH, bodyCaffeineMg, concentration, eliminationRate,
                      peakConcentration, peakTimeH)
from model.schema import Dose, Profile


def drinkOptions():
    """The drink table from params.py, so the page's menu matches the model."""
    return DRINKS


def compute(drinksJson, weightKg, baseHalfLifeH, smoker, oralContraceptives, bedtimeH):
    """drinksJson: '[{"timeH": 8, "mg": 95, "label": "coffee (8 oz)"}, ...]' (JSON, so lists cross cleanly)."""
    doses = [Dose(**d) for d in json.loads(drinksJson)]
    p = Profile(weightKg=weightKg, halfLifeH=adjustedHalfLifeH(baseHalfLifeH, smoker, oralContraceptives))

    # Chart from an hour before the first drink (or 6 AM) to two hours after bedtime.
    t0 = min([6.0] + [d.timeH - 1 for d in doses])
    t = np.arange(t0, bedtimeH + 2 + 1e-9, 0.05)
    ke = eliminationRate(p)
    first = doses[0].mg if doses else 95
    return {
        "halfLifeH": p.halfLifeH,
        "ke": float(ke),
        "ka": KA_PER_H,
        "clearedPerHour": float(1 - np.exp(-ke)),      # share of what's left that the liver clears each hour
        "peakMin": float(peakTimeH(p) * 60),
        "firstMg": first,
        "firstPeakConc": peakConcentration(first, p),
        "bedtimeMg": float(bodyCaffeineMg(bedtimeH, doses, p)),
        "limitMg": BEDTIME_LIMIT_MG,
        "t": t.tolist(),
        "conc": concentration(t, doses, p).tolist(),
        "bodyMg": bodyCaffeineMg(t, doses, p).tolist(),
    }
