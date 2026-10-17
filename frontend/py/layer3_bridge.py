"""
Glue between the layer 3 page and model/alertness.py. Runs in the browser via Pyodide.

No math lives here: it turns what layers 1 and 2 decided into the arguments
alertness.py expects, calls it on a whole time grid, and hands back plain lists.

Caffeine comes from model/pk.py (layer 1). Sleep pressure S and the body clock
circ arrive as lists from the layer 2 page, until model/sleep.py exists.
"""

import json

import numpy as np

from model.alertness import alertnessFrom, feltPressure, inertia, occupancy
from model.pk import adjustedHalfLifeH, concentration
from model.schema import Dose, Profile, SleepBlock


def compute(dosesJson, blocksJson, tJson, sJson, circJson,
            weightKg, baseHalfLifeH, smoker, oralContraceptives, kd, tolerance):
    """Every JSON argument is a list, so it crosses from JavaScript cleanly.

    dosesJson:  '[{"timeH": 8, "mg": 95, "label": "..."}, ...]'   from layer 1
    blocksJson: '[{"startH": 23.5, "endH": 31, "isNap": false}, ...]'   from layer 2
    tJson, sJson, circJson: the time grid and layer 2's sleep pressure and body clock on it
    """
    doses = [Dose(**d) for d in json.loads(dosesJson)]
    sleep = [SleepBlock(**b) for b in json.loads(blocksJson)]
    t = np.array(json.loads(tJson), dtype=float)
    S = np.array(json.loads(sJson), dtype=float)
    circ = np.array(json.loads(circJson), dtype=float)

    p = Profile(weightKg=weightKg, kdMgL=kd,
                halfLifeH=adjustedHalfLifeH(baseHalfLifeH, smoker, oralContraceptives))

    conc = concentration(t, doses, p)
    groggy = inertia(t, sleep)

    chartConc = np.linspace(0, 10, 101)
    return {
        "conc": conc.tolist(),
        "occupancy": occupancy(conc, kd).tolist(),
        "felt": feltPressure(S, conc, tolerance, kd).tolist(),
        "inertia": groggy.tolist(),
        "alertness": alertnessFrom(S, circ, conc, tolerance, groggy, kd).tolist(),
        "chartConc": chartConc.tolist(),
        "chartOcc": occupancy(chartConc, kd).tolist(),
    }
