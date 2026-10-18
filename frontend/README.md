# Frontend

Mobile-first web app: plain HTML, CSS and JavaScript, no build step. On a phone it fills the screen; on a laptop it sits in a phone frame.

One page per model layer (PLAN.md section 1). Swipe, or tap the bar at the bottom. All five layers are built. The app opens on the Plan page (the answer); `index.html#layer1` opens a different page.

## The look

The design is an exam desk, so every color means one thing: blue pen for caffeine and anything you can act on (the curve, planned drinks, buttons), a yellow highlighter over the exam window, red pen only for "now" and warnings, slate for sleep, and a cool grey page. White appears only behind things you can change (input groups, the drink sheet); results sit straight on the page. One typeface (Schibsted Grotesk), light and dark only (`[data-theme]` in `styles.css`, following the phone by default).

The Plan page leads with the answer as a sentence ("Drink 150 mg at 8:30 AM"), then the exam day as an itinerary: waking up, drinks, the exam (highlighted), each time half the caffeine is gone, and bed with the sleep check. The half-life stops come from `py/layer5_bridge.py`, so the math stays in Python.

## Run it

From the **repo root** (the page loads Python files from `model/`):

```bash
python3 serve.py
```

It prints two addresses: http://localhost:5500/frontend/ for the laptop, and `http://<laptop IP>:5500/frontend/` for a phone on the same Wi-Fi. `serve.py` is `python3 -m http.server 5500` plus a header that stops the browser from running stale copies of the JavaScript after an edit.

To use it like an app, open that address on the phone and pick **Share → Add to Home Screen** (iPhone Safari) or **⋮ → Add to Home screen** (Android Chrome). The home screen icon opens it full screen, with no browser bars.

The first load takes about 10 to 15 seconds while the browser downloads Pyodide and numpy. Later loads are cached.

## How the layer pages run Python

The math lives only in `model/`, the same files the optimizer imports. The browser runs them with [Pyodide](https://pyodide.org) (Python compiled to WebAssembly):

1. `python.js` loads Pyodide and numpy once, then copies the `model/` files and the `py/*_bridge.py` files into Pyodide's virtual disk. Every page shares that one Python. A new model file has to be added to its `FILES` list.
2. On every input change, a page calls `compute()` in its bridge: `layer1_bridge.py` calls `model/pk.py`, `layer2_bridge.py` calls `model/sleep.py`, `layer3_bridge.py` calls `model/tolerance.py`, `layer4_bridge.py` calls `model/alertness.py`, `layer5_bridge.py` calls `model/optimizer.py` and `model/learn.py`.
3. The page writes the numbers back and redraws its chart.

Layer 4 builds on the pages before it. Layers 1, 2 and 3 publish what they decided through `shared.js` (your drinks and body, your sleep calendar and body clock, your tolerance), and layer 4 reads them, so changing a drink, a night of sleep or your caffeine habit changes the alertness curve. It has no inputs of its own: Kd is the population average from `Profile`.

Layer 5 reads the same three pages plus your event and runs the optimizer on them, so a change on any layer changes the plan. It publishes the event, which layer 2 shades on the sleep calendar. Its 1-to-5 ratings and the drinks around them are saved in local storage (`caffeineRatings`); the learned half-life and Kd (`caffeineLearned`) are used for the plan only when you tick "Plan with my learned numbers".

## Files

- `index.html`: the five layer pages, the learning page (layer 5's ratings) and the bottom slider.
- `styles.css`: colors and layout. Colors are variables at the top; dark mode only changes those variables. `.block` is a result section on the page, `.group` a white list of inputs, `.timeline` the plan's itinerary.
- `app.js`: page switching, then starts each page.
- `python.js`: loads Pyodide once and puts the model files on its disk.
- `layer1.js`, `py/layer1_bridge.py`: layer 1 drinks and body inputs, the call into `model/pk.py`, the caffeine curve, the sleep check and the previous days' curves.
- `history.js`: saves each day's drinks, bedtime and body in local storage (`caffeineHistory`, the last week), so today's drinks survive a reload and layer 1 can redraw earlier days.
- `layer2.js`, `sleepcal.js`, `py/layer2_bridge.py`: layer 2 sleep calendar, the call into `model/sleep.py`, and the sleep pressure chart.
- `settings.js`: personal settings (frame 6), opened from the gear in the top right. Saves your body, body clock, habit and color theme on this device and publishes them for layers 1 to 3.
- `shared.js`: what personal settings and layers 1, 2 and 3 publish for later pages to read.
- `layer3.js`, `py/layer3_bridge.py`: layer 3 habit and exam inputs, the call into `model/tolerance.py`, coffee strength, the reset plan and its day-by-day chart. Publishes your tolerance for layer 4.
- `layer4.js`, `py/layer4_bridge.py`: layer 4 reads layers 1, 2 and 3, calls `model/alertness.py`, and draws the alertness curve and its breakdown.
- `layer5.js`, `py/layer5_bridge.py`: layer 5 event inputs, the call into `model/optimizer.py` (the plan, its chart and sleep check), and the ratings, heatmap and uncertainty band from `model/learn.py`.
- `charts.js`: hand-written SVG charts.
- `time.js`: the time convention, clock times to model hours and back.
- `manifest.json`, `icons/`: what lets "Add to Home Screen" open the page full screen with its own icon. `icons/make_icons.py` draws the icons.
