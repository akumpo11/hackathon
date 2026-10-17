# Frontend

Mobile-first web app: plain HTML, CSS and JavaScript, no build step. On a phone it fills the screen; on a laptop it sits in a phone frame.

One page per model layer (PLAN.md section 1). Swipe, or tap the bar at the bottom. Only layer 3 is built so far.

## Run it

From the **repo root** (the page loads Python files from `model/`):

```bash
python -m http.server 5500
```

Then open http://localhost:5500/frontend/. A phone on the same Wi-Fi can open `http://<laptop IP>:5500/frontend/`.

The first load takes about 10 to 15 seconds while the browser downloads Pyodide and numpy. Later loads are cached.

## How layer 3 works

The math lives only in `model/alertness.py`, the same file the optimizer imports. The browser runs it with [Pyodide](https://pyodide.org) (Python compiled to WebAssembly):

1. `layer3.js` loads Pyodide and numpy, then copies `model/alertness.py` and `py/layer3_bridge.py` into Pyodide's virtual disk.
2. On every slider move, it calls `compute()` in `layer3_bridge.py`, which calls `occupancy`, `felt_pressure`, `inertia` and `alertness_from`.
3. It writes the numbers back into the page and redraws the chart.

The sliders stand in for the outputs of layers 1, 2 and 4 until those exist.

## Files

- `index.html`: the five layer pages and the bottom slider.
- `styles.css`: colors and layout. Colors are variables at the top.
- `app.js`: page switching.
- `layer3.js`: layer 3 inputs, the call into Python, and the outputs.
- `py/layer3_bridge.py`: turns slider values into arguments for `model/alertness.py`.
- `charts.js`: hand-written SVG charts.
- `api.js` and `mock/`: not used right now. The JSON contract client and sample responses for when `api.py` exists.
