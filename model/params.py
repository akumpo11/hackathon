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
TOLERANCE_GAIN_PER_MG_L = 0.23  # R_target = 1 + gain * average caffeine; 300 mg/day -> R ~ 1.5
RESET_TARGET_R = 1.1            # a reset counts as done when receptors are within 10% of baseline
TAPER_OPTIONS_DAYS = (0, 3, 5)  # reset plans the planner compares: cold turkey, or cut down over 3 or 5 days

# Shared time grid for every curve
STEP_H = 0.1

# Safety limits
DAILY_LIMIT_MG = 400
SINGLE_LIMIT_MG = 200
BEDTIME_LIMIT_MG = 50   # caffeine left in the body at bedtime; roughly the "no coffee 6 hours before bed" rule

# Caffeine per drink in mg
DRINKS = {
    "espresso": 63,
    "drip coffee (8 oz)": 95,
    "black tea": 47,
    "green tea": 28,
    "Diet Coke": 46,
    "Red Bull": 80,
    "Monster": 160,
    "Celsius": 200,
    "5-hour Energy": 200,
    "dark chocolate (1 oz)": 20,
}
