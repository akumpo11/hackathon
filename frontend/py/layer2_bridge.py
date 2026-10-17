"""
Glue between the layer 2 page and model/sleep.py. Runs in the browser via Pyodide.

No math lives here: it turns the painted calendar into SleepBlocks, calls
sleep.py, and hands back plain lists for the chart.
"""

import json

import numpy as np

from model.schema import Profile, SleepBlock
from model.sleep import circadian, sleepPressure


def compute(blocksJson, chronotypeShiftH, nowH):
    """blocksJson: '[{"startH": -1, "endH": 7, "isNap": false}, ...]' (JSON, so lists cross cleanly)."""
    sleep = [SleepBlock(**b) for b in json.loads(blocksJson)]
    p = Profile(circadianPeakH=17 + chronotypeShiftH)

    # Same five days as the calendar (two days ago to two days ahead), in quarter hours.
    t = np.arange(-48, 72 + 1e-9, 0.25)
    return {
        "t": t.tolist(),
        "pressure": sleepPressure(t, sleep).tolist(),
        "circadian": circadian(t, p).tolist(),
        "pressureNow": float(sleepPressure(nowH, sleep)),
    }
