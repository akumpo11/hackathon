# Research notes

The science behind the model's choices, with sources, so anyone on the team can answer "where does that number come from?". Grouped by layer (PLAN.md section 1).

## Layer 1: caffeine in your blood

### What each term in the Bateman formula means

The formula gives the caffeine level in your blood, C(t) in mg/L, at time t after a drink:

- t: hours since you took the drink
- D: the dose in mg (for example, 95 for a coffee)
- V: volume of distribution, 0.6 L/kg times your weight
- ke: how fast your body gets rid of caffeine, per hour
  - Derived from your half-life: ke = ln(2) / half-life, so 0.139 per hour for a 5 h half-life
  - The half-life starts at 5 h and is adjusted for smoker and oral contraceptives
  - Layer 5 changes the half-life based on your alertness ratings
- ka: how fast caffeine gets from your stomach into your blood
  - Constant, 4 per hour (`KA_PER_H`)

Code: `model/pk.py`, constants in `model/params.py`. Equations: `equations/layer-1-pk.md`.

### What we added to the Bateman formula

The single-drink curve is the standard Bateman function. What we add is the superposition principle, so the plan can have several drinks: each drink gets its own curve, and the total level is the sum.

Where this could break: if your liver got overloaded and cleared caffeine more slowly at high levels, the drinks would no longer be independent and simple addition would be wrong. Caffeine does start to saturate at very high doses, but at normal amounts, within the 400 mg daily limit, the addition is a good approximation.

## Layer 3: tolerance, withdrawal and the reset

### What R means

R is how many adenosine receptors you have compared with a non-drinker. It is not the receptors "left" in your body. Caffeine doesn't destroy receptors: it sits on them and blocks adenosine, the chemical behind sleep pressure. The brain makes up for the blocking by building extra receptors.

- R = 1.0: same receptor count as a non-drinker
- R = 1.49: 49% more receptors than a non-drinker (300 mg a day in our model)
- When you quit, the extra receptors are slowly removed and R falls back toward 1. That decay is the reset.

Code: `model/tolerance.py`. Equations: `equations/layer-3-tolerance.md`.

### Evidence that receptors increase

The mechanism is real. Rat studies from the 1980s found that chronic caffeine raises the number of A1 adenosine receptors in the cortex. The authors read it as the brain compensating for caffeine blocking those receptors.

- Rats drinking 0.1% caffeine for 28 days showed a 35% stronger A1 receptor response (inhibition of adenylate cyclase) than controls, and all A1 receptors shifted to the high-affinity state. ([JCI 1986](https://www.jci.org/articles/view/112280))
- A 1988 follow-up found a significant increase in A1 receptor number in rat cortex, a 28% stronger receptor response, and the signalling protein Gi at 133% of normal. ([JCI 1988](https://jci.org/articles/view/113577))
- Another 1988 rat study found more A1 receptor binding in cortex and cerebellum after 12 days of caffeine, with the change varying by brain region. ([University of Kentucky](https://scholars.uky.edu/en/publications/effects-of-chronic-administration-of-caffeine-on-adenosine-asub1s/))

### What is not established

- These are rat results. We did not find an established figure for how much receptors increase in humans.
- "300 mg a day gives 1.5x" is a value we tuned (`TOLERANCE_GAIN_PER_MG_L = 0.23`), not a measurement.
- Receptor growth is probably not the only cause of tolerance. The model treats it as the whole story.

### Withdrawal timing

Juliano and Griffiths reviewed 57 experimental and 9 survey studies of caffeine withdrawal ([Johns Hopkins](https://pure.johnshopkins.edu/en/publications/a-critical-review-of-caffeine-withdrawal-empirical-validation-of--5/), [full text](https://www.gwern.net/doc/nootropic/caffeine/2004-juliano.pdf)):

- Symptoms start 12 to 24 h after the last caffeine
- They peak at 20 to 51 h
- They last 2 to 9 days
- They get more common and more severe with higher daily intake. Quitting as little as 100 mg a day can cause them.
- Headache in 50% of people in the experimental studies; clinically significant distress or impairment in 13%

How the model compares:

- Our time constant tau_R = 4 days (`TAU_TOLERANCE_DAYS`) fits that window. Withdrawal falls to 10% of its worst level after tau_R * ln(10) ≈ 9 days, the top of the 2 to 9 day range.
- The model's withdrawal is worst on the first day off, a bit earlier than the real 1 to 2 day peak. The model works in whole days and treats each day's caffeine level as its average, so it ignores the caffeine still clearing on day one.

### Why the reset cutoff is 1.1x

The cutoff is 1.1x, meaning 10% more receptors than a non-drinker (not 1.1%). It is a choice, not a physiological threshold (`RESET_TARGET_R`).

The model needs some cutoff because R never gets back to exactly 1. After quitting it decays exponentially:

    R(t) = 1 + (R0 - 1) * exp(-t / 4 days)

That gets closer and closer to 1 without reaching it, so "back to normal" has no finish line.

The cutoff trades days without coffee against coffee strength on exam day. For R0 = 1.49 (300 mg a day) and a 95 mg coffee, from `daysToReset` and `strengthPercent`:

| Cutoff | Days off caffeine | Coffee strength on exam day |
|---|---|---|
| 1.2x | 3.6 | 58% |
| **1.1x (ours)** | **6.4** | **77%** |
| 1.05x | 9.2 | 88% |
| 1.01x | 15.6 | ~98% |
| no reset (1.49x) | 0 | 18% |

Why 1.1x:

- It sits where the returns start to shrink. One week off takes the coffee from 18% to 77% strength; getting to 88% costs nearly 3 more days.
- Reaching it takes 6 to 7 days, which falls inside the 2 to 9 days that withdrawal symptoms last. So "reset" roughly means "the withdrawal is mostly over".
- A hard cutoff stops the planner from choosing a 2-day break before an exam: two days of withdrawal while studying for a small gain (1.49x to about 1.3x, 18% to 42% strength). A reset is only worth the withdrawal if it finishes. Otherwise the app says to keep your habit.

### If a judge asks

"Chronic caffeine makes the brain add adenosine receptors to make up for the blocked ones. That's shown in rat studies, but the exact size in humans isn't known, so we tuned it. We did check the timing against human withdrawal data: symptoms last 2 to 9 days, and our model's reset takes about a week."

"Receptors decay exponentially, so they never fully return. We call it reset at 10% above baseline. That takes about a week and gets the coffee from 18% to 77% strength. Going further costs a lot more days for a little more strength."
