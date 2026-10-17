# Frontend

Mobile-first web app: plain HTML, CSS and JavaScript, no build step. Open it on a phone and it fills the screen. On a laptop it sits in a phone frame.

## Run it

From the repo root:

```bash
python -m http.server 5500 --directory frontend
```

Then open http://localhost:5500. A phone on the same Wi-Fi can open `http://<laptop IP>:5500`.

## Files

- `index.html`: the three pages (Plan, Tolerance, Learn = Tier 1, 2, 3), the bottom slider, and the input sheet.
- `styles.css`: colors and layout. Colors are variables at the top.
- `app.js`: reads the inputs, calls the API, fills in each page.
- `api.js`: the JSON contract from TASKS.md, plus clock time to model hours conversion.
- `charts.js`: hand-written SVG charts (caffeine curve, reset plan, heatmap).
- `mock/`: fabricated responses in the exact shape of `/api/plan`, `/api/reset` and `/api/learn`.

## Connecting the real model

In `api.js`, change `const API_BASE = null;` to `const API_BASE = "http://localhost:8000";` once `api.py` is running. Nothing else changes.
