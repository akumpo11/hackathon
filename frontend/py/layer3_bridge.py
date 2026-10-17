"""
Glue between the layer 3 page and model/alertness.py. Runs in the browser via Pyodide.

No math lives here: it turns the page's slider values into the arguments
alertness.py expects, calls it, and hands back plain numbers for the page.
"""

from types import SimpleNamespace

import numpy as np

from model.alertness import alertness_from, felt_pressure, inertia, occupancy


def compute(S, conc, kd, R, circ, sleep_len_h, minutes_since):
    p = SimpleNamespace(kd_mg_l=kd)

    # Pretend you woke up at time 0 after sleeping for sleep_len_h hours.
    sleep = [SimpleNamespace(start_h=-sleep_len_h, end_h=0.0)] if sleep_len_h > 0 else []
    groggy = float(inertia([minutes_since / 60], sleep)[0])

    chart_conc = np.linspace(0, 10, 101)
    return {
        "occupancy": float(occupancy(conc, kd)),
        "felt": float(felt_pressure(S, conc, R, p)),
        "inertia": groggy,
        "alertness": float(alertness_from(S, circ, conc, R, groggy, kd)),
        "chart_conc": chart_conc.tolist(),
        "chart_occ": occupancy(chart_conc, kd).tolist(),
    }
