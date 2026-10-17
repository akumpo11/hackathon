"""
Glue between the layer 3 page and model/alertness.py. Runs in the browser via Pyodide.

No math lives here: it turns the page's slider values into the arguments
alertness.py expects, calls it, and hands back plain numbers for the page.
"""

from types import SimpleNamespace

import numpy as np

from model.alertness import alertnessFrom, feltPressure, inertia, occupancy


def compute(S, conc, kd, R, circ, sleepLenH, minutesSince):
    p = SimpleNamespace(kdMgL=kd)

    # Pretend you woke up at time 0 after sleeping for sleepLenH hours.
    sleep = [SimpleNamespace(startH=-sleepLenH, endH=0.0)] if sleepLenH > 0 else []
    groggy = float(inertia([minutesSince / 60], sleep)[0])

    chartConc = np.linspace(0, 10, 101)
    return {
        "occupancy": float(occupancy(conc, kd)),
        "felt": float(feltPressure(S, conc, R, p)),
        "inertia": groggy,
        "alertness": float(alertnessFrom(S, circ, conc, R, groggy, kd)),
        "chartConc": chartConc.tolist(),
        "chartOcc": occupancy(chartConc, kd).tolist(),
    }
