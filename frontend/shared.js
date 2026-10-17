// What each earlier page has decided, so later pages can build on it.
// Layer 1 publishes your drinks and body, layer 2 publishes your sleep, layer 3
// publishes your tolerance, and layer 4 reads them. Pages call onShared() to hear about changes.

export const shared = { layer1: null, layer2: null, layer3: null };

const listeners = new Set();

export function publish(key, value) {
  shared[key] = value;
  listeners.forEach((listener) => listener());
}

export function onShared(listener) {
  listeners.add(listener);
}

// Runs fn at most once per screen frame, however often it's asked. Dragging a slider
// fires several input events per frame, and one change on layer 1 reaches layer 4 through
// several publishes. This way the Python runs once for all of them, which phones need.
export function perFrame(fn) {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(); });
  };
}

// Calls fn only when the screen's width changes, since that's all the charts care about.
// Phones fire "resize" over and over while you scroll (the browser bar slides in and out,
// which changes only the height), and redrawing every page on each one made scrolling lag.
export function onWidthChange(fn) {
  let width = window.innerWidth;
  window.addEventListener("resize", () => {
    if (window.innerWidth === width) return;
    width = window.innerWidth;
    fn();
  });
}
