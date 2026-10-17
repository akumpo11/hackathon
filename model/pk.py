"""
Layer 1: pharmacokinetics, where caffeine is in your blood (owner: Andrew).

One-compartment model with first-order absorption and elimination. Caffeine
moves gut -> blood at rate ka and blood -> out at rate ke, each proportional to
how much is there. Solving those two linear ODEs gives the Bateman function:

    C(t) = (D / V) * ka / (ka - ke) * (exp(-ke t) - exp(-ka t))      t = hours since the drink

Because the ODEs are linear, several drinks just add up (superposition).
Equations with derivations: equations/layer-1-pk.md.
"""

import numpy as np

from .params import CONTRACEPTIVE_HALF_LIFE_FACTOR, KA_PER_H, SMOKER_HALF_LIFE_FACTOR, VD_L_PER_KG


def adjustedHalfLifeH(baseHalfLifeH, smoker=False, oralContraceptives=False):
    """Half-life after the CLAUDE.md adjustments: smoking about halves it, the pill about doubles it.

    Both act on the same liver enzyme (CYP1A2), so the factors multiply.
    The frontend sends the result as Profile.halfLifeH.
    """
    h = baseHalfLifeH
    if smoker:
        h *= SMOKER_HALF_LIFE_FACTOR
    if oralContraceptives:
        h *= CONTRACEPTIVE_HALF_LIFE_FACTOR
    return h


def eliminationRate(p):
    """ke = ln(2) / half-life, in 1/h.

    First-order kinetics: dA/dt = -ke * A, so A(t) = A0 * exp(-ke t). The half-life
    is when exp(-ke t) = 1/2, which gives t = ln(2) / ke. We store the half-life
    (the intuitive number) and derive ke, so the two can never disagree.
    """
    return np.log(2) / p.halfLifeH


def volumeL(p):
    """Volume of distribution in litres: how much "water" the caffeine spreads through.

    Dividing mg by this gives mg/L. ~0.6 L/kg, so 42 L for 70 kg.
    """
    return VD_L_PER_KG * p.weightKg


def peakTimeH(p):
    """Hours from a drink to its peak blood level: ln(ka / ke) / (ka - ke), about 50 min.

    Calculus: dC/dt is proportional to -ke*exp(-ke t) + ka*exp(-ka t). Setting it to 0
    gives ka*exp(-ka t) = ke*exp(-ke t). Take logs and solve for t.
    It does not depend on the dose or body weight, only on the two rates.
    """
    ka, ke = KA_PER_H, eliminationRate(p)
    return np.log(ka / ke) / (ka - ke)


def _bateman(dt, mg, p):
    """Blood level (mg/L) from one drink, dt hours after taking it (dt >= 0).

    ka must differ from ke or the formula divides by zero. That would need a
    half-life of ln(2)/4 = 10 minutes, far outside the human range (2 to 10 h).
    """
    ka, ke = KA_PER_H, eliminationRate(p)
    return (mg / volumeL(p)) * ka / (ka - ke) * (np.exp(-ke * dt) - np.exp(-ka * dt))


def concentration(t, doses, p):
    """Blood caffeine in mg/L at times t (a number or numpy array of hours since midnight, day 0).

    Each dose contributes a Bateman curve starting at its own time, and the curves
    add (superposition: the ODEs are linear). A dose adds nothing before it is taken.
    """
    t = np.asarray(t, dtype=float)
    total = np.zeros_like(t)
    for d in doses:
        dt = t - d.timeH
        # np.maximum keeps exp() away from huge values before the dose; np.where then zeroes those times.
        total += np.where(dt >= 0, _bateman(np.maximum(dt, 0), d.mg, p), 0.0)
    return total


def peakConcentration(mg, p):
    """Highest blood level one drink of `mg` reaches, in mg/L. About 2.1 mg/L for 100 mg at 70 kg.

    Proportional to the dose, so tolerance.py can convert mg <-> mg/L with one ratio.
    """
    return float(_bateman(peakTimeH(p), mg, p))


def bodyCaffeineMg(t, doses, p):
    """Caffeine in the body (mg) at times t: concentration x volume. Used for the bedtime limit.

    Counts caffeine that has reached the blood. Right after a drink some is still in
    the gut, but by bedtime that part is negligible (it absorbs with a ~10 min half-life).
    """
    return concentration(t, doses, p) * volumeL(p)
