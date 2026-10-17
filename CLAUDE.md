# MathHacks Hackathon Project

Our team's project for MathHacks (submission deadline: 1:00 PM, Sunday, October 18, 2026).

## Project idea: Caffeine optimizer

A pharmacokinetic model of caffeine that accounts for half-life and tolerance. It plans when to drink coffee and how much so you're alert for an event like an exam, without wrecking your sleep. Everyone in the room will try it.

### Inputs

Required:

- **Event time**: when you need to be alert, e.g. an exam at 9:00 AM Sunday.
- **Event length**: how long you need to stay alert, e.g. 2 hours.
- **Sleep schedule**: usual bedtime and wake time.
- **Usual daily caffeine**: e.g. 2 coffees a day (~190 mg). Drives the tolerance model.

Optional:

- **Last night's sleep**: decides whether a nap is worth suggesting.
- **Free time slots**: when a nap could fit before the event.
- **Drinks already taken or planned**: added to the caffeine curve.
- **Body weight**: turns mg into a concentration.
- **Half-life adjustments**: smoking speeds up clearance, oral contraceptives slow it down (stretch).
- **Alertness ratings (1 to 5)**: entered after drinks, for the learning loop (Tier 3).

### Outputs

Tier 1 (core demo):

- **Caffeine plan**: when to drink and how much, e.g. "190 mg at 8:15 AM, 95 mg at 9:45 AM."
- **Caffeine curve graph**: caffeine level over time (half-life decay), with the event window and bedtime shaded and planned drinks marked.
- **Sleep check**: caffeine left at bedtime, with a warning if it's over the cutoff.

Tier 2:

- **Tolerance estimate**: how much usual intake weakens each dose, e.g. "your coffee feels like 60% strength."
- **Reset plan**: whether to take a break or taper before the event, and for how many days.
- **Nap plan**: whether to nap, when, and for how long, or a coffee nap, e.g. "coffee at 1:30 PM, nap 1:30 to 1:50 PM." No nap if it would be too late or isn't needed.

Tier 3 (stretch):

- **Personalized model**: fitted half-life and sensitivity, learned from alertness ratings.

## Idea generation

Before brainstorming, evaluating, or refining project ideas, read `judging.md`. It has the official judging criteria, demo format, and submission rules. Score every idea against its four weighted criteria:

1. **Learning & Understanding (30%)**: can every team member explain the code and the reasoning behind it?
2. **Application of Mathematics (25%)**: is math central to the project rather than decoration?
3. **Technical Implementation (25%)**: can we get it working within the time limit?
4. **Creativity & Originality (20%)**: is it a clever take rather than a copy of an existing product?

Prefer simple ideas executed well over complex ones. Judges reward understanding over complexity, and every member should expect to be asked a question.

## Working on code

- Keep the code readable and explainable. Judges may ask anyone on the team to walk through any part of it.
- When you write something non-obvious, especially math, explain what it does and why so the team can present it.
- The project must be built during the event. Don't pull in pre-existing project code. Open-source libraries, frameworks, and APIs are fine.
