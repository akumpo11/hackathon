# MathHacks Hackathon Project

Our team's project for MathHacks (submission deadline: 1:00 PM, Sunday, October 18, 2026).

## Project idea: Caffeine optimizer

A pharmacokinetic model of caffeine that accounts for half-life and tolerance. You enter an event (e.g. an exam time), your caffeine dose, and your sleep schedule, and it tells you when to drink coffee and how much. Everyone in the room will try it.

Planned features:

- **Half-life calculation**: model how caffeine levels in the body decay over time.
- **Dose timing**: recommend when and how much caffeine to take so you peak at the event.
- **Sleep correlation**: relate sleep patterns to caffeine intake.
- **Nap scheduling**: suggest when to nap (open question: the team noted naps may be bad for you).
- **Alertness feedback loop**: users rate their alertness, and the app learns and optimizes its recommendations over time.
- **Tolerance and caffeine reset**: the more caffeine you use, the more your body gets used to it, so the app schedules a caffeine reset.

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
