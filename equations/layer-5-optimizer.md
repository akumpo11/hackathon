# Layer 5a: The optimizer (when to drink, how much, whether to nap)

Layers 1 to 4 predict your alertness for any coffee schedule. The optimizer turns that around: it tries every schedule on a grid, throws out the ones that break a safety limit, and keeps the one worth the most. Code: `model/optimizer.py`. Constants: `model/params.py`.

Inputs: the event window, your sleep (the night before and the night after the event), drinks you already have, your profile (half-life, weight, Kd, body clock) and tolerance R from layer 3.

## 1. The score

    score = mean over event times t of A(t)        t every 15 minutes from the start to the end of the event
    A(t)  = clip( 1 - S(t) * R * (1 - occ(C(t))) + circ(t) - inertia(t), 0, 1 )

- A(t): layer 4's alertness, 0 to 1. The page shows score times 10
- C(t): caffeine from all drinks, layer 1. The only part that depends on the schedule

Plain English: how alert you are on average during the event. A 2-hour exam is scored at 9 moments.

Code: `scoreOf(conc)` inside `bestPlan`.

## 2. The value (score minus a price on caffeine)

    value = score - MG_COST * (mg added)          MG_COST = 0.0005 per mg

Plain English: each extra 50 mg must raise your alertness by at least 0.025, which is 0.25 on the 10-point scale, to be worth drinking. Without this the plan would always fill up to the bedtime limit, because more caffeine never lowers the score (layer 4's occupancy curve flattens but never goes down).

What it does on its own: with a 9 to 11 AM exam, a non-drinker gets 100 mg, someone at 200 mg a day gets 150 mg, someone at 400 mg a day gets 200 mg. More tolerance means each mg does less, so it takes more mg to clear the same bar. No rule says "give tolerant people more"; it falls out of the price.

## 3. The constraints

    total that day        <= 400 mg          (drinks you already have count)
    each dose             <= 200 mg
    doses at least 1 h apart                 (two doses 15 min apart are really one oversized dose)
    each dose             >= wake-up time, and >= now
    caffeine at bedtime   <= 50 mg           (C(tBed) * V from layer 1: the "6-hour rule" in mg)

A schedule that breaks any of them is thrown out before comparing values.

## 4. Superposition: why trying everything is cheap

    C(t) for a schedule = sum over its doses of  mg_i * C_1mg(t - t_i)

- C_1mg: the caffeine curve of 1 mg (layer 1's Bateman function with D = 1)

Plain English: layer 1's equations are linear, so each dose's curve is its mg times the curve of 1 mg, and curves add. We compute the 1 mg curve once for each possible dose time. Then any schedule's caffeine is a weighted sum of rows of that table, and numpy scores every pair of doses in one array operation. Sleep pressure S, the body clock and inertia don't depend on the doses at all, so they're computed once per nap choice.

## 5. The search

    grid:    dose times every 15 min from wake-up to the end of the event, sizes {50, 100, 150, 200} mg
    1 dose:  every option                                        exhaustive
    2 doses: every pair, the second at least 1 h after the first  exhaustive
    3 doses: the best pair plus every option                      greedy

Plain English: "exhaustive where it is cheap, greedy where it is not". A morning exam has about 1,000 schedules, an afternoon one with naps about 50,000; either takes milliseconds.

Sanity check (a test): for an event that's a single moment, the best single dose lands one peak time (about 52 minutes, layer 1) before it.

## 6. Naps

    candidates: no nap, or 20 minutes starting every 30 min from 2 h after waking to 1 h before the event
    only after a night shorter than 7 h
    value of a nap plan = value - NAP_COST         NAP_COST = 0.01

- A nap changes S: during it S drains, S -> S * exp(-t / 4.2 h) (layer 2), so S is recomputed with the nap added to your sleep
- Waking from it adds layer 4's inertia (0.10 for 20 minutes, fading with a 30-minute time constant)
- No drinking during the nap; coffee right as it starts is allowed

Plain English: the model says a 20-minute nap always helps a little (about 0.25 out of 10), even after a full night. A nap costs 20 minutes and could hurt tonight's sleep, which the model doesn't capture, so (as CLAUDE.md asks) last night's sleep decides whether to offer one. With free slots entered, only naps that fit inside one are tried.

The coffee nap (drinking right before a 20-minute nap, so the caffeine peaks as you wake) is allowed but doesn't always win. In our test cases the optimizer preferred napping earlier and drinking closer to the event.
