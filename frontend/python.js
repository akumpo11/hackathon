// Loads Python (Pyodide) once and copies our model files into its virtual disk.
// Every layer page shares this one Python, so numpy downloads only once.

// Python's working directory inside Pyodide is /home/pyodide, so files put there
// can be imported like normal: `import layer1_bridge`, `from model import pk`.
const HOME = "/home/pyodide";
const FILES = {
  "model/__init__.py": "../model/__init__.py",
  "model/schema.py": "../model/schema.py",
  "model/params.py": "../model/params.py",
  "model/pk.py": "../model/pk.py",
  "model/sleep.py": "../model/sleep.py",
  "model/alertness.py": "../model/alertness.py",
  "layer1_bridge.py": "py/layer1_bridge.py",
  "layer2_bridge.py": "py/layer2_bridge.py",
  "layer4_bridge.py": "py/layer4_bridge.py",
};

let ready = null;

async function load() {
  const pyodide = await loadPyodide();
  await pyodide.loadPackage("numpy");
  pyodide.FS.mkdirTree(`${HOME}/model`);
  for (const [dest, src] of Object.entries(FILES)) {
    pyodide.FS.writeFile(`${HOME}/${dest}`, await (await fetch(src)).text());
  }
  return pyodide;
}

// Returns the same Pyodide every time; the first call starts the download.
export function loadPython() {
  ready ??= load();
  return ready;
}

// Python dicts come back as Maps by default; this turns them into plain objects.
export const toObject = (pyResult) => pyResult.toJs({ dict_converter: Object.fromEntries });
