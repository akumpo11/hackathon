# Layer 5b: Learning your half-life and sensitivity

Two numbers in the model vary a lot between people and can't be measured at home: your caffeine half-life (how fast you clear it) and Kd (how much caffeine blocks half your receptors). Your 1-to-5 alertness ratings carry information about both. Code: `model/learn.py`. Constants: `model/params.py`.

## 1. Bayes' rule on a grid

    posterior(h, Kd)  is proportional to  prior(h, Kd) * likelihood(ratings | h, Kd)

- grid: 20 half-lives from 2 to 10 h, times 20 Kd values from 1 to 6 mg/L: 400 guesses about you
- each guess gets a probability; they add up to 1

Plain English: start with what we believe before seeing any ratings, then make each guess more or less likely by how well it explains your ratings.

## 2. The prior

    log prior = -0.5 * ((h - h_settings) / 1.5)^2 - 0.5 * ((Kd - 3) / 1.5)^2

Plain English: a bell curve around your settings (5 h, adjusted for smoking or the pill) and the population Kd, give or take 1.5. It stops one odd rating from dragging the estimate anywhere.

## 3. Ratings onto the model's scale

    observed = (rating - 1) / 4           1 -> 0.0, 3 -> 0.5, 5 -> 1.0

The research version is the 9-point Karolinska Sleepiness Scale; 5 buttons is what people will tap on a phone.

## 4. The likelihood

    observed_i ~ Normal( A(t_i; h, Kd), 0.15 )
    log likelihood = sum over ratings of  -0.5 * ((observed_i - A(t_i; h, Kd)) / 0.15)^2

- A(t; h, Kd): layer 4's alertness at the time of the rating, with that guess's half-life and Kd, and the drinks and sleep around it
- 0.15: how far off one rating can be by chance

Plain English: a guess that predicts your ratings closely gets a high likelihood; one that's far off gets a low one. Squared error, which is what a bell curve of noise gives.

Speed: S, the body clock and inertia don't depend on the guess, so they're computed once. Caffeine depends only on h (20 curves), and numpy spreads those across the 20 Kd values. 400 guesses cost 20 caffeine curves.

## 5. Normalize, then summarize

    prob = exp(logPost - max(logPost)),  then divide by its sum
    mean half-life = sum over the grid of prob * h
    spread         = sqrt( sum of prob * (h - mean)^2 )

We add logs instead of multiplying probabilities because multiplying many small numbers underflows to 0. Subtracting the max before exp() keeps the biggest value at exp(0) = 1.

## 6. Uncertainty band

    draw 200 half-lives from the posterior; compute 200 caffeine curves; at each time take the 10th and 90th percentile

Plain English: 8 in 10 of the curves we think are plausible for you fall inside the band. More ratings, narrower band.

## What ratings can and can't tell us

Found by testing (`tests/test_learn.py`), and worth saying to the judges:

- Half-life only shows in how fast caffeine wears off. A rating 1 h after coffee says almost nothing about it; ratings 5 to 9 h after the last drink differ by 0.10 to 0.15 between a 3.5 h and a 7 h half-life. So the app asks for ratings a few hours after coffee too.
- A longer half-life (more caffeine left) and a higher Kd (each mg blocks less) predict nearly the same ratings. The posterior becomes a diagonal ridge in the heatmap: the ratings pin down a combination of the two before either one.
- One step on the 1-to-5 scale is 0.25 of alertness, larger than most of the differences we're trying to detect. A week of ratings (28) narrows the half-life from about ±1.5 h to about ±1.1 h. With perfect, noise-free ratings the most likely guess lands on the true half-life (a test checks this), so the method is right; the data is just weak.
