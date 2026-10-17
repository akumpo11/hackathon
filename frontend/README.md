# Frontend

Mobile-first web app: plain HTML, CSS and JavaScript, no build step. On a phone it fills the screen; on a laptop it sits in a phone frame.

One page per model layer (PLAN.md section 1). Swipe, or tap the bar at the bottom. Layers 1, 2 and 3 are built so far.

## Run it

From the **repo root** (the page loads Python files from `model/`):

```bash
python -m http.server 5500
```

Then open http://localhost:5500/frontend/. A phone on the same Wi-Fi can open `http://<laptop IP>:5500/frontend/`.

The first load takes about 10 to 15 seconds while the browser downloads Pyodide and numpy. Later loads are cached.

## How the layer pages run Python

The math lives only in `model/`, the same files the optimizer imports. The browser runs them with [Pyodide](https://pyodide.org) (Python compiled to WebAssembly):

1. `python.js` loads Pyodide and numpy once, then copies the `model/` files and the `py/*_bridge.py` files into Pyodide's virtual disk. Every page shares that one Python. A new model file has to be added to its `FILES` list.
2. On every input change, a page calls `compute()` in its bridge: `layer1_bridge.py` calls `model/pk.py`, `layer2_bridge.py` calls `model/sleep.py`, `layer3_bridge.py` calls `model/alertness.py`.
3. The page writes the numbers back and redraws its chart.

Layer 3's sliders stand in for the outputs of layers 1, 2 and 4 until the pages are joined.

## Files

- `index.html`: the five layer pages and the bottom slider.
- `styles.css`: colors and layout. Colors are variables at the top.
- `app.js`: page switching, then starts each page.
- `python.js`: loads Pyodide once and puts the model files on its disk.
- `layer1.js`, `py/layer1_bridge.py`: layer 1 drinks and body inputs, the call into `model/pk.py`, the caffeine curve and the sleep check.
- `layer2.js`, `sleepcal.js`, `py/layer2_bridge.py`: layer 2 sleep calendar, the call into `model/sleep.py`, and the sleep pressure chart.
- `layer3.js`, `py/layer3_bridge.py`: layer 3 sliders, the call into `model/alertness.py`, and the outputs.
- `charts.js`: hand-written SVG charts.
- `api.js` and `mock/`: not used right now. The JSON contract client and sample responses for when `api.py` exists.
