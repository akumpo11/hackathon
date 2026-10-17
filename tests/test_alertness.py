"""Tests for layer 3 that don't need layers 1 and 2.

The TASKS.md tests that use real sleep and caffeine curves (minimum between
3 and 6 AM, 100 mg at 9 AM, nap comparisons over a full day) go here once
pk.py and sleep.py are merged.
"""

from types import SimpleNamespace

import numpy as np

from model.alertness import alertness_from, felt_pressure, inertia, occupancy

P = SimpleNamespace(kd_mg_l=3.0)


def block(start_h, end_h):
    return SimpleNamespace(start_h=start_h, end_h=end_h)


def test_half_block_at_kd():
    assert occupancy(3, 3) == 0.5


def test_effect_saturates():
    # Four times the caffeine blocks far less than four times as many receptors.
    assert occupancy(8, 3) < 4 * occupancy(2, 3)
    assert occupancy(1000, 3) < 1


def test_works_on_arrays():
    out = occupancy(np.array([0.0, 3.0, 6.0]), 3)
    assert out.shape == (3,)
    assert out[0] == 0


def test_tolerance_makes_pressure_feel_stronger():
    assert felt_pressure(0.5, 2.0, 1.5, P) > felt_pressure(0.5, 2.0, 1.0, P)


def test_no_caffeine_no_tolerance_feels_like_raw_pressure():
    assert felt_pressure(0.6, 0.0, 1.0, P) == 0.6


def test_short_nap_less_groggy_than_deep_nap():
    wake = 15.0
    after_20_min = inertia([wake + 0.1], [block(wake - 20 / 60, wake)])[0]
    after_60_min = inertia([wake + 0.1], [block(wake - 1.0, wake)])[0]
    assert after_20_min < after_60_min


def test_inertia_fades_and_is_zero_before_waking():
    sleep = [block(23.0, 31.0)]
    early, later = inertia([31.05, 33.0], sleep)
    assert early > later
    assert inertia([30.0], sleep)[0] == 0


def test_only_latest_sleep_counts():
    sleep = [block(23.0, 31.0), block(38.0, 38 + 20 / 60)]   # night, then a 20-min nap
    just_after_nap = inertia([38 + 20 / 60], sleep)[0]
    assert abs(just_after_nap - 0.10) < 1e-9


def test_alertness_is_clipped_to_0_1():
    assert alertness_from(0.0, 0.15, 0.0, 1.0, 0.0) == 1.0
    assert alertness_from(1.0, -0.15, 0.0, 1.8, 0.3) == 0.0


def test_caffeine_raises_alertness():
    assert alertness_from(0.7, 0.0, 3.0, 1.0, 0.0) > alertness_from(0.7, 0.0, 0.0, 1.0, 0.0)
