"""
Glue between the layer 4 page and model/alertness.py. Runs in the browser via Pyodide.

No math lives here: it turns what layers 1 and 2 decided into the arguments
alertness.py expects, calls it on a whole time grid, and hands back plain lists.

Caffeine comes from model/pk.py (layer 1). Sleep pressure, the body clock and the
asleep mask come from model/sleep.py (layer 2).
"""

import json

import numpy as np

from model.alertness import alertnessFrom, feltPressure, inertia, occupancy
from model.pk import adjustedHalfLifeH, concentration
from model.schema import Dose, Profile, SleepBlock
from model.sleep import circadian, isAsleep, sleepPressure


def compute(dosesJson, blocksJson, tJson, circadianPeakH,
            weightKg, baseHalfLifeH, smoker, oralContraceptives, kd, tolerance):
    """The two JSON arguments are lists, so they cross from JavaScript cleanly.

    dosesJson:  '[{"timeH": 8, "mg": 95, "label": "..."}, ...]'   from layer 1
    blocksJson: '[{"startH": 23.5, "endH": 31, "isNap": false}, ...]'   from layer 2
    tJson:      the time grid to score, in hours since midnight of day 0
    """
    doses = [Dose(**d) for d in json.loads(dosesJson)]
    sleep = [SleepBlock(**b) for b in json.loads(blocksJson)]
    t = np.array(json.loads(tJson), dtype=float)

    p = Profile(weightKg=weightKg, kdMgL=kd, circadianPeakH=circadianPeakH,
                halfLifeH=adjustedHalfLifeH(baseHalfLifeH, smoker, oralContraceptives))

    conc = concentration(t, doses, p)          # layer 1
    S = sleepPressure(t, sleep)                # layer 2
    circ = circadian(t, p)                     # layer 2
    groggy = inertia(t, sleep)

    chartConc = np.linspace(0, 10, 101)
    return {
        "conc": conc.tolist(),
        "pressure": S.tolist(),
        "circadian": circ.tolist(),
        "asleep": isAsleep(t, sleep).tolist(),
        "occupancy": occupancy(conc, kd).tolist(),
        "felt": feltPressure(S, conc, tolerance, kd).tolist(),
        "inertia": groggy.tolist(),
        "alertness": alertnessFrom(S, circ, conc, tolerance, groggy, kd).tolist(),
        "chartConc": chartConc.tolist(),
        "chartOcc": occupancy(chartConc, kd).tolist(),
    }
