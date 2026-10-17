# Research notes

The science behind the model's choices, with sources, so anyone on the team can answer "where does that number come from?". Grouped by layer (PLAN.md section 1).

## Layer 1: caffeine in your blood

### What each term in the Bateman formula means

The formula gives the caffeine level in your blood, C(t) in mg/L, at time t after one drink:

    C(t) = (D / V) * ka / (ka - ke) * ( exp(-ke * t) - exp(-ka * t) )        for t >= 0, and 0 before the drink

- t: hours since you took the drink
- D: the dose in mg (for example, 95 for a coffee)
- V: volume of distribution, 0.6 L/kg times your weight
- ke: how fast your body gets rid of caffeine, per hour
  - Derived from your half-life: ke = ln(2) / half-life, so 0.139 per hour for a 5 h half-life
  - The half-life starts at 5 h and is adjusted for smoker and oral contraceptives in the short urn
  - Layer 5 changes the half-life based on your alertness ratings in thee long run
- ka: how fast caffeine gets from your stomach into your blood
  - Constant, 4 per hour (`KA_PER_H`)
  - In reality ka varies with food, drink type and how fast someone drinks. We use one value for every drink as a simplification.

Code: `model/pk.py`, constants in `model/params.py`. Equations: `equations/layer-1-pk.md`.

### What we added to the Bateman formula

The single-drink curve is the standard Bateman function. What we add is the superposition principle, so the plan can have several drinks: each drink gets its own curve, and the total level is the sum.

    C_total(t) = sum over drinks i of (D_i / V) * ka / (ka - ke) * ( exp(-ke * (t - t_i)) - exp(-ka * (t - t_i)) )

- D_i: dose of drink i, in mg
- t_i: the time drink i was taken. Each drink counts only from t_i onward, so its term is 0 while t < t_i.
- V, ka and ke are the same for every drink.

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

## Layer 5: learning from your ratings

### What the "What it has learned" heatmap shows

A map of 400 guesses about your body, for two numbers we can't measure directly:

- **Up the side: half-life, 2 to 10 h.** How fast your body clears caffeine.
- **Along the bottom: Kd, 1 to 6 mg/L.** Your sensitivity: the caffeine level that blocks half your adenosine receptors. Lower Kd means each mg hits harder.

20 half-lives times 20 Kd values. Each square's color is how likely that guess is given your ratings: the darkest square is the most likely, and the rest are shaded relative to it (`heatmap` in `frontend/charts.js`). The ring is the average of all 400 guesses weighted by their probability, which isn't always the darkest square. The two numbers below are that average for each axis, ± how spread out the likely guesses are.

With no ratings it's a round blob around your settings (your half-life, adjusted for smoking or the pill, and the population Kd of 3). That's the prior: what the app assumes before it knows anything about you.

### Where the data comes from

| Input | Source |
|---|---|
| Your 1-to-5 ratings and when you made them | Local storage on your phone (`caffeineRatings`) |
| What you drank around those times | A copy of layer 1's drinks, saved with each rating |
| How you slept | Layer 2's sleep calendar |
| Your tolerance R | Layer 3 |
| Weight, half-life, smoker, pill | Settings |

Only ratings from the last two days count, since that's how far back the sleep calendar goes. Without your sleep the model can't predict how alert you should have been.

### How it's calculated (`posterior` in `model/learn.py`)

For each of the 400 squares:

1. **Predict your ratings.** Run layers 1 to 4 at each moment you rated, with that square's half-life (layer 1's caffeine curve) and Kd (layer 4's occupancy), plus your sleep pressure and body clock (layer 2) and tolerance (layer 3). Result: "if you were this person, you'd have felt 0.72 at 3 PM."
2. **Compare with what you said.** Your rating goes onto the same 0-to-1 scale with `(rating - 1) / 4`, so a 4 is 0.75. The guess scores `-0.5 * (error / 0.15)^2`, summed over all ratings. Small errors, good score.
3. **Add the prior.** Guesses far from your settings lose a little, so one odd rating can't drag the estimate far.
4. **Turn scores into probabilities.** Exponentiate, then divide by the total so all 400 add up to 1. That's Bayes' rule: posterior is proportional to prior times likelihood.

`frontend/py/layer5_bridge.py` hands the 400 probabilities, the averages and the spreads to the page, which draws them. Full formulas: `equations/layer-5-learning.md`.

### Why it's often a diagonal band, not a dot

Two different people can give the same ratings: one with a long half-life (lots of caffeine left) but a high Kd (each mg does little), and one with a short half-life and a low Kd. So a set of ratings fits a whole line of guesses running up and to the right. Your ratings tell the app which band you're on well before they say where on it you sit.

Not every rating is equally useful. A rating shortly after coffee says almost nothing about half-life. Ratings 5 or more hours after your last drink say the most, because that's when a fast and a slow clearer feel different. A week of ratings narrows the half-life from about ±1.5 h to about ±1.1 h.

### "Simulate a week" mode

The ratings aren't yours. `simulateDays` invents a person with a hidden half-life (random, 3 to 8 h) and Kd 3, who drinks 100 mg at 8 AM and 1 PM for 7 days and rates their alertness at 10 AM, 3 PM, 6 PM and 9 PM with some noise. The heatmap shows what the app learns from those 28 made-up ratings, and the caption reveals the hidden value so you can see how close it got.

The "Your caffeine today, give or take" chart uses the same probabilities: it draws 200 half-lives in proportion to their probability, computes your caffeine curve for each, and shades between the 10th and 90th percentile.

### If a judge asks

"Each square is a guess about your half-life and sensitivity. We run our model with that guess at the times you rated yourself, and the closer it predicts your ratings, the more likely it gets. That's Bayes' rule on a grid of 400 guesses."

"It learns slowly, and we checked why. One step on a 1-to-5 scale is bigger than the difference half-life makes to how alert you feel, and a long half-life with low sensitivity looks the same as a short one with high sensitivity. With perfect ratings it finds the true half-life, so the method works; the ratings just carry little information."
