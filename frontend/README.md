# Frontend

Mobile-first web app: plain HTML, CSS and JavaScript, no build step. On a phone it fills the screen; on a laptop it sits in a phone frame.

One page per model layer (PLAN.md section 1). Swipe, or tap the bar at the bottom. Layers 1 to 4 are built so far.

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
2. On every input change, a page calls `compute()` in its bridge: `layer1_bridge.py` calls `model/pk.py`, `layer2_bridge.py` calls `model/sleep.py`, `layer3_bridge.py` calls `model/tolerance.py`, `layer4_bridge.py` calls `model/alertness.py`.
3. The page writes the numbers back and redraws its chart.

Layer 4 builds on the pages before it. Layers 1, 2 and 3 publish what they decided through `shared.js` (your drinks and body, your sleep calendar and body clock, your tolerance), and layer 4 reads them, so changing a drink, a night of sleep or your caffeine habit changes the alertness curve. It has no inputs of its own: Kd is the population average from `Profile` until layer 5 learns yours.

## Files

- `index.html`: the five layer pages and the bottom slider.
- `styles.css`: colors and layout. Colors are variables at the top; each theme (`:root[data-theme="..."]`) only changes those variables.
- `app.js`: page switching, then starts each page.
- `python.js`: loads Pyodide once and puts the model files on its disk.
- `layer1.js`, `py/layer1_bridge.py`: layer 1 drinks and body inputs, the call into `model/pk.py`, the caffeine curve and the sleep check.
- `layer2.js`, `sleepcal.js`, `py/layer2_bridge.py`: layer 2 sleep calendar, the call into `model/sleep.py`, and the sleep pressure chart.
- `settings.js`: personal settings (frame 6), opened from the gear in the top right. Saves your body, body clock, habit and color theme on this device and publishes them for layers 1 to 3.
- `shared.js`: what personal settings and layers 1, 2 and 3 publish for later pages to read.
- `layer3.js`, `py/layer3_bridge.py`: layer 3 habit and exam inputs, the call into `model/tolerance.py`, coffee strength, the reset plan and its day-by-day chart. Publishes your tolerance for layer 4.
- `layer4.js`, `py/layer4_bridge.py`: layer 4 reads layers 1, 2 and 3, calls `model/alertness.py`, and draws the alertness curve and its breakdown.
- `charts.js`: hand-written SVG charts.
- `manifest.json`, `icons/`: what lets "Add to Home Screen" open the page full screen with its own icon. `icons/make_icons.py` draws the icons.
- `api.js` and `mock/`: not used right now. The JSON contract client and sample responses for when `api.py` exists.
