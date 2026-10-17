// What each earlier page has decided, so later pages can build on it.
// Personal settings (settings.js) publish your body, body clock and habit; layer 1
// publishes your drinks and body, layer 2 your sleep, layer 3 your tolerance, and
// layer 4 reads them. Pages call onShared() to hear about changes.

export const shared = { settings: null, layer1: null, layer2: null, layer3: null };

const listeners = new Set();

export function publish(key, value) {
  shared[key] = value;
  listeners.forEach((listener) => listener());
}

export function onShared(listener) {
  listeners.add(listener);
}
