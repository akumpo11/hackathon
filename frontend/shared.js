// What each earlier page has decided, so later pages can build on it.
// Layer 1 publishes your drinks and body, layer 2 publishes your sleep, and
// layer 3 reads both. Pages call onShared() to hear about changes.

export const shared = { layer1: null, layer2: null };

const listeners = new Set();

export function publish(key, value) {
  shared[key] = value;
  listeners.forEach((listener) => listener());
}

export function onShared(listener) {
  listeners.add(listener);
}
