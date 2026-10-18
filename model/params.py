"""Model constants in one place. Per-person values (half-life, weight, Kd, ...) live in schema.Profile.

Sources to cite in the README: Borbely 1982 / Daan et al. 1984 for the two-process time constants,
FDA and EFSA guidance for the caffeine limits, the FDA caffeine page for the drink table.
"""

# Layer 1: pharmacokinetics (population values; half-life and weight are per person, in Profile)
KA_PER_H = 4.0          # absorption rate from the gut; absorption half-life ~10 min, peak ~50 min after a drink
VD_L_PER_KG = 0.6       # volume of distribution: caffeine spreads through ~0.6 L per kg of body weight
SMOKER_HALF_LIFE_FACTOR = 0.5          # smoking speeds up the liver enzyme CYP1A2, roughly halving the half-life
CONTRACEPTIVE_HALF_LIFE_FACTOR = 2.0   # estrogen slows CYP1A2, roughly doubling the half-life

# Layer 2: two-process sleep model (normalized sleep pressure S in 0..1)
TAU_WAKE_H = 18.2       # S rises toward 1 with this time constant while awake
TAU_SLEEP_H = 4.2       # S falls toward 0 with this time constant while asleep
CIRCADIAN_AMP = 0.15    # circadian swing: +0.15 at the peak, -0.15 twelve hours later
BURN_IN_H = 48          # sleepPressure starts this long before the first time asked for, so its starting guess washes out

# Layer 3: tolerance (adenosine receptor upregulation)
TAU_TOLERANCE_DAYS = 4.0        # receptors relax toward their target with this time constant
TOLERANCE_GAIN_PER_MG_L = 0.23  # R_target = 1 + gain * average caffeine; 300 mg/day -> R ~ 1.5. Tuned, not measured (research.md)
RESET_TARGET_R = 1.1            # a reset counts as done when receptors are within 10% of baseline
TAPER_OPTIONS_DAYS = (0, 3, 5)  # reset plans the planner compares: cold turkey, or cut down over 3 or 5 days

# Shared time grid for every curve
STEP_H = 0.1

# Safety limits
DAILY_LIMIT_MG = 400
SINGLE_LIMIT_MG = 200
BEDTIME_LIMIT_MG = 50   # caffeine left in the body at bedtime; roughly the "no coffee 6 hours before bed" rule

# Layer 5a: the optimizer's search grid
DOSE_STEP_H = 0.25                  # dose times are tried every 15 minutes
DOSE_SIZES_MG = (50, 100, 150, 200)  # dose sizes tried; 200 is the single-dose limit
DOSE_MIN_GAP_H = 1.0                # doses at least an hour apart, so two can't add up to one oversized dose
EVENT_SAMPLE_H = 0.25               # alertness is scored every 15 minutes across the event
MG_COST = 0.0005                    # each 50 mg must raise mean alertness by 0.025 (0.25 out of 10) to be worth it
NAP_LENGTH_H = 20 / 60              # naps tried are 20 minutes: short enough to wake before deep sleep
NAP_STEP_H = 0.5                    # nap start times are tried every 30 minutes
NAP_EARLIEST_AFTER_WAKE_H = 2       # no nap in the first 2 h after waking up
NAP_LATEST_BEFORE_EVENT_H = 1       # and none in the last hour before the event (too groggy)
NAP_IF_SLEPT_UNDER_H = 7            # a nap is only considered after a night shorter than this
NAP_COST = 0.01                     # a nap must raise mean alertness by 0.01 (0.1 out of 10) to be worth it

# Layer 5b: learning your half-life and sensitivity from 1-to-5 ratings
LEARN_HALF_LIVES_H = (2.0, 10.0)    # half-lives the grid covers (smokers can be near 2.5 h, the pill near 10 h)
LEARN_KDS_MG_L = (1.0, 6.0)         # sensitivities (Kd) the grid covers
LEARN_GRID_POINTS = 20              # 20 x 20 = 400 guesses
PRIOR_SD_HALF_LIFE_H = 1.5          # how far from your settings we think your real half-life could be
PRIOR_SD_KD_MG_L = 1.5
RATING_SD = 0.15                    # how noisy one rating is, on the 0..1 alertness scale
MIN_RATING_SPREAD = 0.01            # below this, the 400 guesses predict the same alertness, so a rating teaches nothing

# Caffeine per drink in mg
DRINKS = {
    "espresso": 63,
    "coffee (8 oz)": 95,
    "black coffee (8 oz)": 95,
    "black tea": 47,
    "green tea": 28,
    "Diet Coke": 46,
    "Red Bull": 80,
    "Monster": 160,
    "Celsius": 200,
    "5-hour Energy": 200,
    "dark chocolate (1 oz)": 20,
}
