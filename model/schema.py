"""Shared data types: the contract every model file and api.py agree on.

Time convention: every time is decimal hours since midnight at the start of day 0.
14.5 is 2:30 PM today, 38.0 is 2:00 PM tomorrow. Only the frontend touches clock times.

Named schema.py, not types.py, so it never shadows Python's built-in `types` module.

Inputs are frozen (immutable). That makes them hashable, so a function that takes
them can be cached with functools.lru_cache if it turns out to be slow.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Dose:
    timeH: float     # when it is taken
    mg: float
    label: str = ""  # "drip coffee", "recommended", ...


@dataclass(frozen=True)
class SleepBlock:
    startH: float
    endH: float
    isNap: bool = False


@dataclass(frozen=True)
class EventWindow:
    startH: float
    endH: float    # start + event length


@dataclass(frozen=True)
class FreeSlot:
    startH: float
    endH: float    # a window where a nap could fit


@dataclass(frozen=True)
class Profile:
    """What differs from person to person. Population constants (absorption rate,
    volume of distribution, circadian amplitude) live in params.py instead."""
    weightKg: float = 70.0
    halfLifeH: float = 5.0           # caffeine half-life; smoker / contraceptive adjustments already applied
    kdMgL: float = 3.0               # concentration that blocks half the adenosine receptors; learned in Tier 3
    circadianPeakH: float = 17.0     # time of day the circadian rhythm peaks (5 PM); chronotype shifts it
    habitualMgPerDay: float = 200.0
    habitWeeks: float = 8.0


@dataclass
class Plan:
    """Optimizer output. Not frozen: it holds lists and numpy arrays."""
    doses: list               # list[Dose], the recommended doses
    nap: SleepBlock | None
    score: float              # mean alertness over the event window, 0..1
    bedtimeCaffeineMg: float
    curve: dict               # {"t", "conc", "pressure", "felt", "alertness"}: numpy arrays on one time grid
