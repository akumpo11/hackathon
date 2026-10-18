// Small hand-made SVG charts. No chart library: each chart is a linear map
// from data units to pixels, xPx = left + (x - xMin) / (xMax - xMin) * width,
// and the same for y (flipped, because SVG's y axis points down).

const NS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

// Sets up an empty SVG at its on-screen size and returns the two scale functions.
function frame(svg, { xMin, xMax, yMin = 0, yMax, pad }) {
  svg.replaceChildren();
  const W = svg.clientWidth, H = svg.clientHeight;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const w = W - pad.l - pad.r, h = H - pad.t - pad.b;
  const x = (v) => pad.l + ((v - xMin) / (xMax - xMin)) * w;
  const y = (v) => pad.t + h - ((v - yMin) / (yMax - yMin)) * h;
  return { x, y, W, H, top: pad.t, bottom: pad.t + h, left: pad.l, right: pad.l + w };
}

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function xTicks(svg, s, xMin, xMax, step, format) {
  for (let t = Math.ceil(xMin / step) * step; t <= xMax; t += step) {
    el("text", { x: s.x(t), y: s.H - 4, "text-anchor": "middle" }, svg).textContent = format(t);
  }
}

/**
 * Area chart with a draggable readout dot (the main caffeine curve).
 * opts: xs, ys, yMax, bands [{from, to, color}], markers [{x, label}],
 *       peaks [x] (optional amber dots), flag {x, label, ok} (optional, marked like a drink in the sleep or warning color),
 *       formatTick(x), onScrub(index, atNow),
 *       nowX() (the time now; the dot rests there when you aren't touching the chart),
 *       startX (where the dot rests instead if now is off the chart)
 */
export function areaChart(svg, opts) {
  const { xs, ys } = opts;
  const xMin = xs[0], xMax = xs[xs.length - 1];
  const s = frame(svg, { xMin, xMax, yMax: opts.yMax, pad: { l: 4, r: 4, t: 32, b: 22 } });

  // Shaded windows (sleep, nap, event) go behind everything else.
  for (const b of opts.bands) {
    const x1 = s.x(Math.max(b.from, xMin)), x2 = s.x(Math.min(b.to, xMax));
    if (x2 > x1) el("rect", { x: x1, y: s.top, width: x2 - x1, height: s.bottom - s.top, rx: 8, fill: b.color }, svg);
  }

  const grad = el("linearGradient", { id: `${svg.id}-fill`, x1: 0, x2: 0, y1: 0, y2: 1 }, el("defs", {}, svg));
  el("stop", { offset: "0%", "stop-color": css("--accent"), "stop-opacity": 0.45 }, grad);
  el("stop", { offset: "100%", "stop-color": css("--accent"), "stop-opacity": 0.02 }, grad);

  const pts = xs.map((t, i) => `${s.x(t).toFixed(1)},${s.y(ys[i]).toFixed(1)}`);
  el("path", { d: `M${s.x(xMin)},${s.bottom} L${pts.join(" L")} L${s.x(xMax)},${s.bottom} Z`,
               fill: `url(#${svg.id}-fill)`, stroke: "none" }, svg);
  el("path", { d: `M${pts.join(" L")}`, stroke: css("--accent"), "stroke-width": 2.5, fill: "none" }, svg);

  // Drinks: a dot on the curve and a label above it.
  const valueAt = (t) => {
    let i = xs.findIndex((v) => v >= t);
    return i < 0 ? ys[ys.length - 1] : ys[i];
  };
  // The value just before t: at bedtime the curve drops to "asleep", and the flag's dot
  // belongs on the top of that drop, where the day ends.
  const valueBefore = (t) => {
    const i = xs.findIndex((v) => v >= t);
    return ys[Math.max(0, (i < 0 ? xs.length : i) - 1)];
  };
  let lastLabelX = -Infinity, row = 0;
  for (const m of [...opts.markers].sort((a, b) => a.x - b.x)) {
    const mx = s.x(m.x);
    row = mx - lastLabelX < 48 ? 1 - row : 0;     // drop a label one row if it would overlap the last one
    lastLabelX = mx;
    el("circle", { cx: mx, cy: s.y(valueAt(m.x)), r: 4.5, fill: css("--ink"), stroke: css("--card"), "stroke-width": 2 }, svg);
    const label = el("text", { x: mx, y: row ? 23 : 11, "text-anchor": "middle", "font-weight": 700, style: `fill:${css("--ink")}` }, svg);
    label.textContent = m.label;
    // A drink near either edge would have half its label cut off, so slide the label inward.
    const half = label.getComputedTextLength() / 2;
    label.setAttribute("x", Math.min(Math.max(mx, half), s.W - half));
  }

  // Peaks: an amber dot on the curve where each drink tops out.
  for (const px of opts.peaks ?? []) {
    if (px > xMax) continue;
    el("circle", { cx: s.x(px), cy: s.y(valueAt(px)), r: 4.5, fill: css("--peak"), stroke: css("--card"), "stroke-width": 2 }, svg);
  }

  // Flag: a dot where the day ends (the plan chart's bedtime) with its label right beside
  // it, in slate (the sleep color) when fine and coral when not.
  if (opts.flag && opts.flag.x > xMin && opts.flag.x <= xMax) {
    const f = opts.flag, fx = s.x(f.x), fy = s.y(valueBefore(f.x));
    const color = css(f.ok ? "--night-ink" : "--coral-ink");
    el("circle", { cx: fx, cy: fy, r: 4.5, fill: color, stroke: css("--card"), "stroke-width": 2 }, svg);
    const label = el("text", { x: fx - 9, "text-anchor": "end", "font-weight": 700, style: `fill:${color}` }, svg);
    label.textContent = f.label;
    // The label sits to the left of the dot, just above the curve or, if the curve is in
    // the way there, just below it. Check the curve's height (in pixels) under the label.
    const x0 = fx - 9 - label.getComputedTextLength();
    let highest = Infinity, lowest = -Infinity;     // smallest and largest curve y under the label
    for (let px = x0; px < fx - 1; px += 2) {     // stop short of the dot: at bedtime itself you're asleep
      const cy = s.y(valueBefore(xMin + ((px - s.left) / (s.right - s.left)) * (xMax - xMin)));
      highest = Math.min(highest, cy); lowest = Math.max(lowest, cy);
    }
    const above = fy - 8, below = fy + 16;          // text baselines; the letters are about 8 px tall
    if (above + 3 < highest && above - 8 > s.top) label.setAttribute("y", above);
    else if (below - 11 > lowest && below < s.bottom - 2) label.setAttribute("y", below);
    else {   // no room by the curve: the label row, like a drink, slid inward from the edge
      const half = (fx - 9 - x0) / 2;
      label.setAttribute("y", 11); label.setAttribute("text-anchor", "middle");
      label.setAttribute("x", Math.min(Math.max(fx, half), s.W - half));
    }
  }

  xTicks(svg, s, xMin, xMax, 3, opts.formatTick);

  // Readout: vertical line + dot that follows your finger or mouse.
  const guide = el("line", { y1: s.top, y2: s.bottom, stroke: css("--coral"), "stroke-width": 1.5, "stroke-dasharray": "3 3" }, svg);
  const dot = el("circle", { r: 6.5, fill: css("--coral"), stroke: css("--card"), "stroke-width": 3 }, svg);
  const moveTo = (i, atNow = false) => {
    const cx = s.x(xs[i]), cy = s.y(ys[i]);
    guide.setAttribute("x1", cx); guide.setAttribute("x2", cx);
    dot.setAttribute("cx", cx); dot.setAttribute("cy", cy);
    opts.onScrub(i, atNow);
  };
  const nearestTo = (t) => {
    let best = 0;
    xs.forEach((v, i) => { if (Math.abs(v - t) < Math.abs(xs[best] - t)) best = i; });
    return best;
  };
  const nearest = (clientX) => {
    const r = svg.getBoundingClientRect();
    return nearestTo(xMin + ((clientX - r.left - s.left) / (s.right - s.left)) * (xMax - xMin));
  };
  // Where the dot rests: now, if it's on the chart. Charts that run past midnight count
  // 1 AM tomorrow as 25, so try that too. Otherwise startX.
  const rest = () => {
    const now = opts.nowX?.();
    const onChart = [now, now + 24].find((t) => t >= xMin && t <= xMax);
    if (onChart !== undefined) moveTo(nearestTo(onChart), true);
    else moveTo(nearestTo(opts.startX ?? xMin));
  };
  // Mouse: the dot follows the pointer and goes back to rest when it leaves.
  // Fingers are handled in addTouchScrub below.
  svg.onpointermove = (e) => { if (e.pointerType !== "touch") moveTo(nearest(e.clientX)); };
  svg.onpointerdown = (e) => { if (e.pointerType !== "touch") moveTo(nearest(e.clientX)); };
  svg.onpointerleave = (e) => { if (e.pointerType !== "touch") rest(); };
  // This chart gets redrawn on every input change, so the touch listeners are added only
  // once and always call the latest drawing's functions.
  svg.scrubTo = (clientX) => moveTo(nearest(clientX));
  svg.rest = rest;
  if (!svg.hasTouchScrub) addTouchScrub(svg);
  rest();
}

// Fingers: a sideways drag scrubs the curve, an up-and-down drag scrolls the page as usual.
// The first move decides which one it is. For a scrub, preventDefault stops the phone from
// scrolling (or swiping to the next page), so the dot follows your finger until you lift it.
function addTouchScrub(svg) {
  svg.hasTouchScrub = true;
  let startX = 0, startY = 0, mode = null;     // mode: null until the first move, then "scrub" or "scroll"
  svg.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY; mode = null;
    svg.scrubTo(t.clientX);
  }, { passive: true });
  svg.addEventListener("touchmove", (e) => {
    const t = e.touches[0];
    mode ??= Math.abs(t.clientX - startX) >= Math.abs(t.clientY - startY) ? "scrub" : "scroll";
    if (mode === "scrub") { e.preventDefault(); svg.scrubTo(t.clientX); }
  }, { passive: false });                        // passive: false is what allows preventDefault
  // Finger lifted: back to rest.
  svg.addEventListener("touchend", () => svg.rest(), { passive: true });
  svg.addEventListener("touchcancel", () => svg.rest(), { passive: true });
}

/**
 * Plain multi-line chart (reset plan, sleep pressure).
 * opts: series [{xs, ys, color, dash}], yMin, yMax, vline {x, label}, points [{x, y, label}],
 *       formatTick(x), tickStep,
 *       yTicks [{y, label}] (optional: grid lines with labels down the left side),
 *       bands [{from, to, color}] (optional: shaded windows, like sleep)
 */
export function lineChart(svg, opts) {
  const all = opts.series.flatMap((ser) => ser.xs);
  const xMin = Math.min(...all), xMax = Math.max(...all);
  const s = frame(svg, { xMin, xMax, yMin: opts.yMin, yMax: opts.yMax, pad: { l: opts.yTicks ? 32 : 4, r: 4, t: 18, b: 22 } });

  for (const b of opts.bands ?? []) {
    const x1 = s.x(Math.max(b.from, xMin)), x2 = s.x(Math.min(b.to, xMax));
    if (x2 > x1) el("rect", { x: x1, y: s.top, width: x2 - x1, height: s.bottom - s.top, fill: b.color }, svg);
  }
  // Grid lines: at the labelled values, or else at the bottom, middle and top.
  const grid = opts.yTicks ?? [0, 0.5, 1].map((f) => ({ y: opts.yMin + f * (opts.yMax - opts.yMin) }));
  for (const g of grid) {
    const yy = s.y(g.y);
    el("line", { x1: s.left, x2: s.right, y1: yy, y2: yy, stroke: css("--line") }, svg);
    if (g.label) el("text", { x: s.left - 6, y: yy + 3.5, "text-anchor": "end" }, svg).textContent = g.label;
  }
  if (opts.vline) {
    const vx = s.x(opts.vline.x);
    el("line", { x1: vx, x2: vx, y1: s.top, y2: s.bottom, stroke: css("--coral"), "stroke-width": 1.5, "stroke-dasharray": "3 3" }, svg);
    el("text", { x: vx, y: 11, "text-anchor": "middle", "font-weight": 700, style: `fill:${css("--coral")}` }, svg)
      .textContent = opts.vline.label;
  }
  for (const ser of opts.series) {
    const d = ser.xs.map((v, i) => `${i ? "L" : "M"}${s.x(v).toFixed(1)},${s.y(ser.ys[i]).toFixed(1)}`).join(" ");
    el("path", { d, stroke: ser.color, "stroke-width": 2.5, fill: "none", "stroke-dasharray": ser.dash ?? "" }, svg);
  }
  // Points sit on the plan's curve, so they take the plan's color. Coral is kept for the event
  // line alone, so a point on another day (like the worst withdrawal day) isn't mistaken for it.
  for (const p of opts.points ?? []) {
    const px = s.x(p.x), py = s.y(p.y);
    if (p.x !== opts.vline?.x) {
      el("line", { x1: px, x2: px, y1: py, y2: s.bottom, stroke: css("--muted"), "stroke-width": 1.5, "stroke-dasharray": "3 3" }, svg);
    }
    el("circle", { cx: px, cy: py, r: 6.5, fill: css("--accent"), stroke: css("--card"), "stroke-width": 3 }, svg);
    el("text", { x: px, y: py - 12, "text-anchor": "middle", "font-weight": 700, style: `fill:${css("--ink")}` }, svg)
      .textContent = p.label;
  }
  xTicks(svg, s, xMin, xMax, opts.tickStep, opts.formatTick);
}

/**
 * Heatmap of a probability grid (learned half-life vs sensitivity).
 * prob[i][j] belongs to ys[i] (half-life) and xs[j] (sensitivity).
 */
export function heatmap(svg, { prob, xs, ys, mark }) {
  const s = frame(svg, { xMin: xs[0], xMax: xs[xs.length - 1], yMin: ys[0], yMax: ys[ys.length - 1],
                         pad: { l: 26, r: 6, t: 6, b: 22 } });
  const max = Math.max(...prob.flat());
  const cw = (s.right - s.left) / xs.length, ch = (s.bottom - s.top) / ys.length;

  // Each cell's color is a blend from the card color to the accent, by its probability relative to
  // the most likely cell. Starting from the card (not white) means empty cells vanish in every theme.
  const hex = (name) => css(name).match(/\w\w/g).map((h) => parseInt(h, 16));
  const accent = hex("--accent"), card = hex("--card");
  const blend = (f) => `rgb(${accent.map((c, i) => Math.round(card[i] + (c - card[i]) * f)).join(",")})`;
  prob.forEach((row, i) => row.forEach((p, j) => {
    el("rect", { x: s.left + j * cw, y: s.bottom - (i + 1) * ch, width: cw + 0.5, height: ch + 0.5,
                 fill: blend(0.06 + 0.94 * (p / max)) }, svg);
  }));

  if (mark) {
    const mx = s.left + ((mark.x - xs[0]) / (xs[xs.length - 1] - xs[0])) * (s.right - s.left - cw) + cw / 2;
    const my = s.bottom - ((mark.y - ys[0]) / (ys[ys.length - 1] - ys[0])) * (s.bottom - s.top - ch) - ch / 2;
    el("circle", { cx: mx, cy: my, r: 6, fill: "none", stroke: css("--ink"), "stroke-width": 2.5 }, svg);
  }
  // Labels on whole numbers inside the grid's range: every 2 h up the side, every 1 mg/L along the bottom.
  for (let v = Math.ceil(ys[0]); v <= ys[ys.length - 1]; v += 2) {
    const yy = s.bottom - ((v - ys[0]) / (ys[ys.length - 1] - ys[0])) * (s.bottom - s.top - ch) - ch / 2;
    el("text", { x: 18, y: yy + 3.5, "text-anchor": "end" }, svg).textContent = `${v}h`;
  }
  for (let v = Math.ceil(xs[0]); v <= xs[xs.length - 1]; v++) {
    const xx = s.left + ((v - xs[0]) / (xs[xs.length - 1] - xs[0])) * (s.right - s.left - cw) + cw / 2;
    el("text", { x: xx, y: s.H - 4, "text-anchor": "middle" }, svg).textContent = v;
  }
}
