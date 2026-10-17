"""
Layer 5a: the dose optimizer (owner: Evan).

Layers 1 to 4 predict how alert you'll be for any coffee schedule. This file
turns that around: it tries every schedule on a grid, throws out the unsafe
ones, and keeps the one that's worth the most.

    score  = mean over event times t of A(t)
             A(t) = clip(1 - S(t) * R * (1 - occ(C(t))) + circ(t) - inertia(t), 0, 1)
    value  = score - MG_COST * (mg added)

    maximize value, subject to:
        caffeine that day <= 400 mg, each dose <= 200 mg, doses at least 1 h apart,
        no dose before you wake up (or before now),
        caffeine left in you at bedtime <= 50 mg

Why the mg cost: caffeine has diminishing returns (layer 4's occupancy curve
flattens) but more is never worse for the score, so without a cost the plan
would always fill up to the bedtime limit. With it, each extra 50 mg must earn
0.25 points out of 10. Someone with more tolerance gets less from each dose,
so the same rule gives them a bigger plan, with no special case.

Two facts make trying everything cheap:
- Only C(t) depends on the doses. Sleep pressure S, the body clock and sleep
  inertia depend only on your sleep, so they're computed once per nap choice.
- C(t) is a sum over doses (superposition, layer 1), and each dose's curve is
  proportional to its mg. So we compute one curve for 1 mg at each dose time,
  and any schedule's caffeine is those curves scaled and added. numpy then
  scores every pair of doses in one array operation.

Search: every single dose and every pair ("exhaustive where it is cheap"),
then a third dose added to the best pair if it raises the value ("greedy where
it is not").

Equations with plain-English readings: equations/layer-5-optimizer.md.
"""

import numpy as np

from .alertness import alertnessCurve, alertnessFrom, inertia
from .params import (BEDTIME_LIMIT_MG, DAILY_LIMIT_MG, DOSE_MIN_GAP_H, DOSE_SIZES_MG, DOSE_STEP_H,
                     EVENT_SAMPLE_H, MG_COST, NAP_COST, NAP_EARLIEST_AFTER_WAKE_H, NAP_IF_SLEPT_UNDER_H,
                     NAP_LATEST_BEFORE_EVENT_H, NAP_LENGTH_H, NAP_STEP_H, SINGLE_LIMIT_MG)
from .pk import bodyCaffeineMg, concentration
from .schema import Dose, Plan, SleepBlock
from .sleep import circadian, sleepPressure


def lastNightBefore(event, sleep):
    """The night (not a nap) you wake up from on the event day: the last one ending before the event."""
    nights = [b for b in sleep if not b.isNap and b.endH <= event.startH]
    if not nights:
        raise ValueError("The sleep list needs the night before the event.")
    return max(nights, key=lambda b: b.endH)


def bedtimeAfter(event, sleep):
    """When you go to bed after the event: the start of the first night (not a nap) after it."""
    starts = [b.startH for b in sleep if not b.isNap and b.startH >= event.endH]
    if not starts:
        raise ValueError("The sleep list needs the night after the event.")
    return min(starts)


def _roundUp(h, step):
    """The first grid time at or after h, so doses land on whole quarter hours (9:15, not 9:07)."""
    return np.ceil(h / step - 1e-9) * step


def napOptions(event, wake, earliestH, freeSlots=None):
    """Naps to try besides no nap: a 20-minute nap starting every 30 minutes from 2 h after
    waking until 1 h before the event. With free slots, only naps that fit inside one.
    """
    first = _roundUp(max(wake + NAP_EARLIEST_AFTER_WAKE_H, earliestH), NAP_STEP_H)
    starts = np.arange(first, event.startH - NAP_LATEST_BEFORE_EVENT_H + 1e-9, NAP_STEP_H)
    naps = [SleepBlock(float(s), float(s) + NAP_LENGTH_H, isNap=True) for s in starts]
    if freeSlots:
        naps = [n for n in naps if any(f.startH <= n.startH and n.endH <= f.endH for f in freeSlots)]
    return naps


def _searchDoses(scoreOf, optConc, optBedMg, optMg, optTime, allowed, fixedConc, fixedBedMg, fixedDayMg,
                 dailyLimit, bedtimeLimit):
    """Best doses for one nap choice.

    Option k is one dose: optMg[k] mg at optTime[k]. optConc[k] is its caffeine at the
    event times and optBedMg[k] what's left of it at bedtime. allowed[k] is False for
    times you can't drink (during the nap).

    Returns (value, score, [option indices], number of schedules tried).
    """
    def feasible(mg, bedMg):
        return (fixedDayMg + mg <= dailyLimit) & (fixedBedMg + bedMg <= bedtimeLimit)

    def valueOf(score, mg, ok):
        """score - cost of the caffeine, or -inf for schedules that break a limit."""
        return np.where(ok, score - MG_COST * mg, -np.inf)

    # No added caffeine. Always allowed: you can't undo drinks already taken.
    noneScore = float(scoreOf(fixedConc))
    best = (noneScore, noneScore, [])

    # One dose: option k alone.
    oneScore = scoreOf(fixedConc + optConc)
    one = valueOf(oneScore, optMg, allowed & feasible(optMg, optBedMg))

    # Two doses: options a and b, b at least an hour after a (so each pair is counted once).
    pairConc = fixedConc + optConc[:, None, :] + optConc[None, :, :]
    pairMg = optMg[:, None] + optMg[None, :]
    ok2 = (allowed[:, None] & allowed[None, :] & (optTime[None, :] - optTime[:, None] >= DOSE_MIN_GAP_H)
           & feasible(pairMg, optBedMg[:, None] + optBedMg[None, :]))
    pairScore = scoreOf(pairConc)
    two = valueOf(pairScore, pairMg, ok2)
    tried = 1 + int(allowed.sum()) + int(ok2.sum())

    if one.size and one.max() > best[0]:
        k = int(np.argmax(one))
        best = (float(one[k]), float(oneScore[k]), [k])
    if two.size and two.max() > best[0]:
        a, b = np.unravel_index(np.argmax(two), two.shape)
        best = (float(two[a, b]), float(pairScore[a, b]), [a, b])

        # Three doses, greedy: hold the best pair and try adding each option.
        ok3 = (allowed & (np.abs(optTime - optTime[a]) >= DOSE_MIN_GAP_H)
               & (np.abs(optTime - optTime[b]) >= DOSE_MIN_GAP_H)
               & feasible(pairMg[a, b] + optMg, optBedMg[a] + optBedMg[b] + optBedMg))
        threeScore = scoreOf(pairConc[a, b] + optConc)
        three = valueOf(threeScore, pairMg[a, b] + optMg, ok3)
        tried += int(ok3.sum())
        if three.max() > best[0]:
            k = int(np.argmax(three))
            best = (float(three[k]), float(threeScore[k]), [a, b, k])

    value, score, chosen = best
    return value, score, chosen, tried


def bestPlan(event, sleep, p, tolerance, allowNap=False, freeSlots=None, fixedDoses=(), earliestH=None,
             dailyLimit=DAILY_LIMIT_MG, singleLimit=SINGLE_LIMIT_MG, bedtimeLimit=BEDTIME_LIMIT_MG):
    """The coffee (and nap) plan that's worth the most for the event, within the safety limits.

    event:       EventWindow
    sleep:       SleepBlocks, including the night before the event and the night after it
    tolerance:   receptor ratio R from layer 3 (1.0 for a non-drinker)
    fixedDoses:  drinks already taken or planned; they count toward the curve and the limits
    earliestH:   don't recommend anything before this time (the frontend sends "now")
    """
    fixedDoses = list(fixedDoses)
    lastNight, tBed = lastNightBefore(event, sleep), bedtimeAfter(event, sleep)
    wake = lastNight.endH
    earliest = wake if earliestH is None else max(wake, earliestH)

    # Alertness is scored every 15 minutes across the event (a 2 h exam gives 9 times).
    ts = np.arange(event.startH, event.endH + 1e-9, EVENT_SAMPLE_H)

    # Dose options: every quarter hour from wake-up (or now) to the end of the event, times every size.
    times = np.arange(_roundUp(earliest, DOSE_STEP_H), event.endH, DOSE_STEP_H)
    sizes = np.array([s for s in DOSE_SIZES_MG if s <= singleLimit], dtype=float)
    optTime, optMg = np.repeat(times, len(sizes)), np.tile(sizes, len(times))

    # Superposition: caffeine from 1 mg taken at each time, computed once. A dose of m mg is m times it.
    unitConc = np.array([concentration(ts, [Dose(t, 1.0)], p) for t in times]).reshape(len(times), len(ts))
    unitBedMg = np.array([float(bodyCaffeineMg(tBed, [Dose(t, 1.0)], p)) for t in times])
    optConc = optMg[:, None] * np.repeat(unitConc, len(sizes), axis=0)
    optBedMg = optMg * np.repeat(unitBedMg, len(sizes))

    # Drinks you already have. Only the ones on the event day count toward the 400 mg.
    fixedConc = concentration(ts, fixedDoses, p)
    fixedBedMg = float(bodyCaffeineMg(tBed, fixedDoses, p))
    fixedDayMg = sum(d.mg for d in fixedDoses if d.timeH >= wake)

    # Naps: the model says a short nap always helps a little, but it costs time, so
    # (as CLAUDE.md asks) last night's sleep decides whether a nap is worth suggesting.
    shortNight = lastNight.endH - lastNight.startH < NAP_IF_SLEPT_UNDER_H
    naps = [None] + (napOptions(event, wake, earliest, freeSlots) if allowNap and shortNight else [])

    circ = circadian(ts, p)                       # doesn't depend on doses or naps: computed once
    best, tried = None, 0
    for nap in naps:
        sleepWith = sleep + [nap] if nap else list(sleep)
        S = sleepPressure(ts, sleepWith)          # a nap lowers S, so S is redone for each nap ...
        groggy = inertia(ts, sleepWith)           # ... and adds grogginess right after it

        def scoreOf(conc):
            """Mean alertness over the event; conc can hold many schedules (one per row)."""
            return alertnessFrom(S, circ, conc, tolerance, groggy, p.kdMgL).mean(axis=-1)

        # No drinking during the nap. Coffee right as it starts (a coffee nap) is fine.
        allowed = np.ones(len(optTime), dtype=bool)
        if nap:
            allowed = ~((optTime > nap.startH) & (optTime < nap.endH))
        value, score, chosen, n = _searchDoses(scoreOf, optConc, optBedMg, optMg, optTime, allowed,
                                               fixedConc, fixedBedMg, fixedDayMg, dailyLimit, bedtimeLimit)
        tried += n
        if nap:
            value -= NAP_COST
        else:
            baseline = float(scoreOf(fixedConc))  # no added caffeine, no nap: what the plan is compared to
        if best is None or value > best["value"]:
            best = {"value": value, "score": score, "chosen": chosen, "nap": nap, "sleep": sleepWith}

    recommended = sorted((Dose(float(optTime[k]), float(optMg[k]), "recommended") for k in best["chosen"]),
                         key=lambda d: d.timeH)
    allDoses = fixedDoses + recommended
    return Plan(
        doses=recommended,
        nap=best["nap"],
        score=best["score"],
        bedtimeCaffeineMg=float(bodyCaffeineMg(tBed, allDoses, p)),
        curve=alertnessCurve(allDoses, best["sleep"], p, tolerance, wake - 1, tBed + 1),
        baselineScore=baseline,
        tried=tried,
    )
