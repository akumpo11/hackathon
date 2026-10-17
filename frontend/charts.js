// Small hand-made SVG charts. No chart library: each chart is a linear map
// from data units to pixels, x_px = left + (x - xMin) / (xMax - xMin) * width,
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
 *       formatTick(x), onScrub(index), startX (where the dot starts)
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
  el("stop", { offset: "0%", "stop-color": css("--mint"), "stop-opacity": 0.45 }, grad);
  el("stop", { offset: "100%", "stop-color": css("--mint"), "stop-opacity": 0.02 }, grad);

  const pts = xs.map((t, i) => `${s.x(t).toFixed(1)},${s.y(ys[i]).toFixed(1)}`);
  el("path", { d: `M${s.x(xMin)},${s.bottom} L${pts.join(" L")} L${s.x(xMax)},${s.bottom} Z`,
               fill: `url(#${svg.id}-fill)`, stroke: "none" }, svg);
  el("path", { d: `M${pts.join(" L")}`, stroke: css("--mint"), "stroke-width": 2.5, fill: "none" }, svg);

  // Drinks: a dot on the curve and a label above it.
  const valueAt = (t) => {
    let i = xs.findIndex((v) => v >= t);
    return i < 0 ? ys[ys.length - 1] : ys[i];
  };
  let lastLabelX = -Infinity, row = 0;
  for (const m of [...opts.markers].sort((a, b) => a.x - b.x)) {
    const mx = s.x(m.x);
    row = mx - lastLabelX < 48 ? 1 - row : 0;     // drop a label one row if it would overlap the last one
    lastLabelX = mx;
    el("circle", { cx: mx, cy: s.y(valueAt(m.x)), r: 4.5, fill: css("--ink"), stroke: "#fff", "stroke-width": 2 }, svg);
    el("text", { x: mx, y: row ? 23 : 11, "text-anchor": "middle", "font-weight": 700, style: `fill:${css("--ink")}` }, svg)
      .textContent = m.label;
  }

  xTicks(svg, s, xMin, xMax, 3, opts.formatTick);

  // Readout: vertical line + dot that follows your finger or mouse.
  const guide = el("line", { y1: s.top, y2: s.bottom, stroke: css("--coral"), "stroke-width": 1.5, "stroke-dasharray": "3 3" }, svg);
  const dot = el("circle", { r: 6.5, fill: css("--coral"), stroke: "#fff", "stroke-width": 3 }, svg);
  const moveTo = (i) => {
    const cx = s.x(xs[i]), cy = s.y(ys[i]);
    guide.setAttribute("x1", cx); guide.setAttribute("x2", cx);
    dot.setAttribute("cx", cx); dot.setAttribute("cy", cy);
    opts.onScrub(i);
  };
  const nearest = (clientX) => {
    const r = svg.getBoundingClientRect();
    const t = xMin + ((clientX - r.left - s.left) / (s.right - s.left)) * (xMax - xMin);
    let best = 0;
    xs.forEach((v, i) => { if (Math.abs(v - t) < Math.abs(xs[best] - t)) best = i; });
    return best;
  };
  svg.onpointermove = (e) => moveTo(nearest(e.clientX));
  svg.onpointerdown = (e) => moveTo(nearest(e.clientX));
  moveTo(nearest(svg.getBoundingClientRect().left + s.x(opts.startX ?? xMin)));
}

/**
 * Plain multi-line chart (reset plan).
 * opts: series [{xs, ys, color, dash}], yMin, yMax, vline {x, label}, formatTick(x), tickStep
 */
export function lineChart(svg, opts) {
  const all = opts.series.flatMap((ser) => ser.xs);
  const xMin = Math.min(...all), xMax = Math.max(...all);
  const s = frame(svg, { xMin, xMax, yMin: opts.yMin, yMax: opts.yMax, pad: { l: 4, r: 4, t: 18, b: 22 } });

  for (const f of [0, 0.5, 1]) {
    const yy = s.top + f * (s.bottom - s.top);
    el("line", { x1: s.left, x2: s.right, y1: yy, y2: yy, stroke: css("--line") }, svg);
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

  // Each cell's color is a blend from white to mint, by its probability relative to the most likely cell.
  const mint = css("--mint").match(/\w\w/g).map((h) => parseInt(h, 16));
  const blend = (f) => `rgb(${mint.map((c) => Math.round(255 + (c - 255) * f)).join(",")})`;
  prob.forEach((row, i) => row.forEach((p, j) => {
    el("rect", { x: s.left + j * cw, y: s.bottom - (i + 1) * ch, width: cw + 0.5, height: ch + 0.5,
                 fill: blend(0.06 + 0.94 * (p / max)) }, svg);
  }));

  if (mark) {
    const mx = s.left + ((mark.x - xs[0]) / (xs[xs.length - 1] - xs[0])) * (s.right - s.left - cw) + cw / 2;
    const my = s.bottom - ((mark.y - ys[0]) / (ys[ys.length - 1] - ys[0])) * (s.bottom - s.top - ch) - ch / 2;
    el("circle", { cx: mx, cy: my, r: 6, fill: "none", stroke: css("--ink"), "stroke-width": 2.5 }, svg);
  }
  for (let v = 3; v <= 8; v++) {
    const yy = s.bottom - ((v - ys[0]) / (ys[ys.length - 1] - ys[0])) * (s.bottom - s.top - ch) - ch / 2;
    el("text", { x: 18, y: yy + 3.5, "text-anchor": "end" }, svg).textContent = `${v}h`;
  }
  for (let v = 1; v <= 6; v++) {
    const xx = s.left + ((v - xs[0]) / (xs[xs.length - 1] - xs[0])) * (s.right - s.left - cw) + cw / 2;
    el("text", { x: xx, y: s.H - 4, "text-anchor": "middle" }, svg).textContent = v;
  }
}
