# Layer 3: Tolerance, withdrawal and the caffeine reset

Why coffee stops working if you drink it every day, and how long a break brings it back. Code: `model/tolerance.py`. Constants: `model/params.py`.

Inputs: usual caffeine per day and for how many weeks (`Profile.habitualMgPerDay`, `Profile.habitWeeks`), days until the exam, plus half-life and weight from layer 1 and Kd from layer 4.

## 1. Average caffeine level of a daily drinker

    C_avg = D_day / (ke * V * 24)

- C_avg: average blood level, mg/L (about 2.2 mg/L at 300 mg a day)
- D_day: caffeine per day, mg
- ke * V: clearance, litres of blood cleared per hour (layer 1; 0.139 /h * 42 L = 5.8 L/h)

Where it comes from: at steady state, caffeine in equals caffeine out. Out per hour is ke * V * C, so over a day the body clears ke * V * 24 * C_avg mg. Set that equal to D_day and solve. It holds however the day's dose is split up.

Plain English: your liver clears about 140 L of blood a day, so 300 mg spread over 140 L is about 2.2 mg/L.

Code: `steadyStateConc(mgPerDay, p)`.

## 2. Receptors grow toward a target

    dR/dt = (R_target - R) / tau_R            tau_R = 4 days
    R_target = 1 + g * C_avg                  g = 0.23 per mg/L

- R: adenosine receptors relative to a non-drinker (1.0 = non-drinker)
- g: tuned so 300 mg a day gives R_target ~ 1.5, in line with the 20 to 50% receptor upregulation reported for chronic caffeine

Where it comes from: the brain adds receptors to make up for the ones caffeine keeps blocking. We model that as first-order relaxation toward a target, the same shape as the ODEs in layers 1 and 2.

Solution from R = 1 after t days of the same habit:

    R(t) = 1 + (R_target - 1) * (1 - exp(-t / tau_R))

Plain English: tolerance builds over one to two weeks, then levels off. 8 weeks at 300 mg/day gives R = 1.49.

Code: `receptorTarget`, `receptorRatioNow(p)`.

## 3. One day at a time (exact step)

    R_next = R_target + (R - R_target) * exp(-1 / tau_R)

With a fixed intake for the day, R_target is constant, so this is the exact solution of the ODE over one day. As in `sleep.py`, stepping adds no integration error. A taper changes the intake each day, so each day gets its own R_target.

Code: `simulateReset(p, quitInDays, taperDays, horizonDays)`.

## 4. Withdrawal

    withdrawal = max(0, R * (1 - occ(C_avg)) - 1)

- occ(C) = C / (C + Kd): receptor occupancy from layer 4

Where it comes from: layer 4 says felt pressure is S * R * (1 - occ). A non-drinker with no caffeine feels S * 1 * 1 = S. Divide the two and subtract 1 to get how much more you feel than they do.

Plain English: while you keep drinking, caffeine blocks enough receptors to cover the extra ones, so withdrawal is 0. On the first day with no caffeine, occ = 0 and you feel R - 1 extra: 49% sleepier at R = 1.49. It then fades as R falls. A taper lowers caffeine a step at a time, so R falls before caffeine hits 0, and the worst day is milder (29% with a 5-day taper instead of 49%).

Code: `withdrawal(R, mgPerDay, p)`.

## 5. Days needed for a reset

    t_reset = tau_R * ln( (R0 - 1) / 0.1 )

With no caffeine, R(t) = 1 + (R0 - 1) * exp(-t / tau_R). Set R = 1.1 (within 10% of a non-drinker) and solve for t. From R0 = 1.5 that is 4 * ln(5) = 6.4 days, so one week.

Code: `daysToReset(p)`.

## 6. The reset planner

Try every start day from today to the exam, with a taper of 0, 3 or 5 days (`TAPER_OPTIONS_DAYS`), finishing by exam morning. Rules, in order:

1. Receptors must be at 1.1x or below on exam morning.
2. Among those, take the gentlest plan: the smallest worst-day withdrawal. Longer tapers are gentler.
3. If two plans tie, start as late as possible, so you spend the fewest days without coffee.

If no plan passes rule 1, there isn't time. Quitting would put the withdrawal on your study days and still leave the coffee weaker on exam day, so the app says to keep your usual intake.

Plain English: with an exam in 14 days at 300 mg a day, start in 4 days, cut down over 5, then stop. Receptors are back to 1.08x by the exam.

Code: `recommendQuitDay(p, examInDays)`.

## 7. "Your coffee feels like 17% strength"

    1 - occ(c_eq) = R * (1 - occ(c))         solve for c_eq
    c_eq = Kd * occ_eq / (1 - occ_eq)         with occ_eq = 1 - R * (1 - occ(c))
    strength = 100 * mg_eq / mg

- c: peak blood level from your dose (layer 1's `peakConcentration`)
- c_eq: the level a non-drinker would need to feel the same

Where it comes from: set your felt pressure (S * R * (1 - occ(c))) equal to a non-drinker's (S * (1 - occ(c_eq))). S cancels. Invert the Langmuir equation to get c_eq. Peak level is proportional to dose, so c_eq converts back to mg with one ratio.

Plain English: at R = 1.49, a 95 mg coffee works like 17 mg does for a non-drinker. If R * (1 - occ(c)) is at least 1, the dose only cancels your extra receptors and feels like nothing: at R = 1.5 that is any dose under about 70 mg. After the reset (R = 1.08), the same coffee is back to 81%.

Code: `feelsLikeMg(doseMg, p, R)`, `strengthPercent(doseMg, p, R)`.

## Limitations

- g and tau_R are set to match reported ranges, not fitted to data.
- Withdrawal uses the day's average level, so it is a daily summary, not an hourly curve.
- Strength is compared at the dose's peak and ignores caffeine already in you from earlier drinks.
