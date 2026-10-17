# Layer 1: Pharmacokinetics (where caffeine is in your blood)

One-compartment model with first-order absorption and elimination. Code: `model/pk.py`. Constants: `model/params.py`.

Inputs: each drink (time and mg), body weight, and half-life (after the smoker / contraceptive adjustments).

## 1. Elimination rate from half-life

    ke = ln(2) / t_half

- ke: elimination rate, per hour (0.139 /h for a 5 h half-life)
- t_half: caffeine half-life, hours (population average ~5 h, healthy adults ~2.5 to 10 h)

Where it comes from: first-order kinetics means the rate caffeine leaves is proportional to how much is there, dA/dt = -ke * A. The solution is A(t) = A0 * exp(-ke t). Half is left when exp(-ke t) = 1/2, so t_half = ln(2) / ke.

Plain English: every hour, the same fraction of what's left gets cleared by the liver (enzyme CYP1A2), about 13% per hour.

Code: `eliminationRate(p)`. We store the half-life and derive ke, so the two can't disagree.

## 2. Volume of distribution

    V = 0.6 L/kg * weight

- V: litres of body water the caffeine spreads through (42 L at 70 kg)

Plain English: the same coffee gives a lighter person a higher blood level. Dividing mg by V turns an amount into a concentration (mg/L).

Code: `volumeL(p)`, constant `VD_L_PER_KG`.

## 3. One drink: the Bateman function

    C(t) = (D / V) * ka / (ka - ke) * ( exp(-ke t) - exp(-ka t) )        for t >= 0, and 0 before

- C: blood concentration, mg/L
- D: dose, mg
- t: hours since the drink
- ka = 4 /h: absorption rate from the gut (absorption half-life ln(2)/4 ≈ 10 min)
- ke: elimination rate from equation 1

Where it comes from: two linked first-order ODEs.

    gut:    dG/dt = -ka * G                 G(0) = D      =>  G(t) = D * exp(-ka t)
    blood:  dA/dt =  ka * G  -  ke * A      A(0) = 0

Substitute G(t) into the blood equation and solve it with an integrating factor, multiplying both sides by exp(ke t):

    d/dt [ A * exp(ke t) ] = ka * D * exp((ke - ka) t)
    A(t) = D * ka / (ka - ke) * ( exp(-ke t) - exp(-ka t) )

Divide by V to get the concentration.

Plain English: the curve is the difference of two exponentials. The fast one, exp(-ka t), is the gut emptying, so the level climbs. The slow one, exp(-ke t), is the liver clearing it, so the level falls. Once the gut is empty (after about an hour), only the slow decay is left.

Caveat: the formula divides by (ka - ke). Those would only be equal for a 10-minute half-life, which no person has.

Code: `_bateman(dt, mg, p)`.

## 4. Time of the peak

    t_max = ln(ka / ke) / (ka - ke)        ≈ 0.87 h ≈ 52 min at default values

Where it comes from: set dC/dt = 0.

    dC/dt ∝ -ke * exp(-ke t) + ka * exp(-ka t) = 0
    ka * exp(-ka t) = ke * exp(-ke t)
    ln(ka) - ka t = ln(ke) - ke t
    t = ln(ka / ke) / (ka - ke)

Plain English: the peak comes when the gut is pushing caffeine in exactly as fast as the liver is taking it out. It doesn't depend on the dose or your weight, only on the two rates. This is why the optimizer puts a drink about 50 minutes before the event.

Code: `peakTimeH(p)`. `peakConcentration(mg, p)` is C(t_max): about 2.1 mg/L for 100 mg at 70 kg.

## 5. Several drinks: superposition

    C_total(t) = sum over drinks i of C_i(t - t_i)

- t_i: time of drink i, each with its own dose D_i

Where it comes from: both ODEs are linear (no squares, no products of unknowns), so the sum of two solutions is also a solution. Each drink can be computed on its own and added.

Plain English: a second coffee stacks on what's left of the first. This also keeps the optimizer cheap, because each candidate schedule is just a sum of closed-form curves.

Code: `concentration(t, doses, p)`.

## 6. Caffeine left in the body (sleep check)

    body mg(t) = C_total(t) * V

Plain English: the bedtime check compares this with the 50 mg cutoff (`BEDTIME_LIMIT_MG`). It counts caffeine already in the blood; by bedtime the amount still in the gut is negligible.

Code: `bodyCaffeineMg(t, doses, p)`.

## 7. Half-life adjustments

    t_half = t_half_base * (0.5 if smoker) * (2 if on oral contraceptives)

Plain English: smoking speeds up CYP1A2, and estrogen slows it down. Both act on the same enzyme, so the factors multiply.

Code: `adjustedHalfLifeH(base, smoker, oralContraceptives)`, constants `SMOKER_HALF_LIFE_FACTOR` and `CONTRACEPTIVE_HALF_LIFE_FACTOR`.

## Worked example (70 kg, 5 h half-life, two 95 mg coffees at 8 AM and 1 PM)

| Time | Blood level | In the body |
|---|---|---|
| 8:54 AM (first peak) | 2.0 mg/L | 84 mg |
| 1:54 PM (second peak, stacked on the first) | 3.0 mg/L | 128 mg |
| 5:00 PM | 2.0 mg/L | 85 mg |
| 11:00 PM (bedtime) | 0.9 mg/L | 37 mg, under the 50 mg cutoff |

## Checked by tests (`tests/test_pk.py`)

- The level is 0 before a drink.
- A fine scan finds the peak where equation 4 says it is.
- 100 mg at 70 kg peaks between 1.5 and 2.5 mg/L, in line with published values.
- Once absorbed, the level halves every half-life exactly. Measured from the peak it's only about half, because absorption hasn't quite finished.
- Two drinks together equal the sum of each alone (superposition), and twice the dose gives twice the level.
