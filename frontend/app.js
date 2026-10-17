// Wires the page together: read the form, ask the model (or the mock) for a
// plan, and draw each page. Nothing here does the math; that lives in model/.

import { getPlan, getReset, getLearn, buildPlanRequest, hoursToClock, usingMock } from "./api.js";
import { areaChart, lineChart, heatmap } from "./charts.js";

const $ = (id) => document.getElementById(id);
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const DRIP_COFFEE_MG = 95;
const BEDTIME_LIMIT_MG = 50;

const state = {
  form: null,        // current inputs from the sheet
  req: null,         // last /api/plan request
  plan: null,        // last /api/plan response
  reset: null,       // last /api/reset response
  learn: null,       // last /api/learn response
  ratings: [],       // [{t, score}]
  curveSeries: "caffeine",
  resetSeries: "R",
};

// ---------------------------------------------------------------- inputs

function readForm() {
  const f = Object.fromEntries(new FormData($("sheet")));
  f.allowNap = $("sheet").elements.allowNap.checked;
  f.halfLife = state.form?.halfLife;     // set by "Use my half-life" on the Learn page
  return f;
}

async function refresh() {
  state.form = readForm();
  state.req = buildPlanRequest(state.form);
  const examInDays = Math.floor(state.req.event.start_h / 24);
  [state.plan, state.reset] = await Promise.all([
    getPlan(state.req),
    getReset({ profile: state.req.profile, exam_in_days: examInDays }),
  ]);
  drawPlanPage();
  drawTolerancePage();
  await updateLearn();
}

// ---------------------------------------------------------------- page 1: plan

function drawPlanPage() {
  const { req, plan, form } = state;
  const { start_h, end_h } = req.event;

  $("eventName").textContent = form.eventName || "Your event";
  $("eventWhen").textContent = `${hoursToClock(start_h, true)} to ${hoursToClock(end_h)}`;
  $("score").textContent = (plan.score * 10).toFixed(1);

  const doses = [...plan.doses].sort((a, b) => a.time_h - b.time_h);
  const first = doses[0];
  $("firstDrink").textContent = first ? `${first.mg} mg` : "None";
  $("firstDrinkWhen").textContent = first
    ? `at ${hoursToClock(first.time_h)}, about ${(first.mg / DRIP_COFFEE_MG).toFixed(1)} coffees`
    : "You're alert enough without caffeine.";

  drawCurve();
  drawTimeline(doses);
  drawSleepCheck();
  $("dataSource").textContent = usingMock ? "Showing sample data until the model is connected." : "";
}

function drawCurve() {
  const { req, plan } = state;
  const c = plan.curve;
  const volumeL = 0.6 * req.profile.weight_kg;

  // The model returns concentration in mg/L; mg in the body = concentration x volume.
  const caffeine = state.curveSeries === "caffeine";
  const ys = caffeine ? c.conc.map((v) => v * volumeL) : c.alertness.map((v) => v * 10);
  const yMax = caffeine ? Math.ceil((Math.max(...ys) * 1.15) / 25) * 25 : 10;

  const bands = [
    ...req.sleep.map((b) => ({ from: b.start_h, to: b.end_h, color: cssVar("--night") })),
    ...(plan.nap ? [{ from: plan.nap.start_h, to: plan.nap.end_h, color: cssVar("--night") }] : []),
    { from: req.event.start_h, to: req.event.end_h, color: cssVar("--coral-soft") },
  ];

  areaChart($("curveChart"), {
    xs: c.t, ys, yMax, bands,
    markers: plan.doses.map((d) => ({ x: d.time_h, label: `${d.mg} mg` })),
    formatTick: (h) => hoursToClock(h).replace(":00", ""),
    startX: req.event.start_h,
    onScrub: (i) => {
      $("readoutValue").textContent = caffeine ? `${Math.round(ys[i])} mg` : `${ys[i].toFixed(1)} / 10`;
      $("readoutTime").textContent = `at ${hoursToClock(c.t[i])}`;
    },
  });
}

function drawTimeline(doses) {
  const { req, plan } = state;
  const items = [
    ...doses.map((d) => ({ t: d.time_h, what: `${d.mg} mg of caffeine`,
                           sub: `about ${(d.mg / DRIP_COFFEE_MG).toFixed(1)} drip coffees`, tag: "Drink", cls: "" })),
    { t: req.event.start_h, what: state.form.eventName || "Your event",
      sub: `until ${hoursToClock(req.event.end_h)}`, tag: "Event", cls: "event" },
  ];
  if (plan.nap) {
    const mins = Math.round((plan.nap.end_h - plan.nap.start_h) * 60);
    items.push({ t: plan.nap.start_h, what: `${mins}-minute nap`, sub: `wake up at ${hoursToClock(plan.nap.end_h)}`, tag: "Nap", cls: "nap" });
  }
  items.sort((a, b) => a.t - b.t);

  $("planList").replaceChildren(...items.map((it) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="when">${hoursToClock(it.t)}</span>
      <span class="what">${it.what}<small>${it.sub}</small></span>
      <span class="tag ${it.cls}">${it.tag}</span>`;
    return li;
  }));
}

function drawSleepCheck() {
  const mg = state.plan.bedtime_caffeine_mg;
  const ok = mg <= BEDTIME_LIMIT_MG;
  const bedtime = state.req.sleep[1].start_h;
  const meterMax = BEDTIME_LIMIT_MG * 2;

  $("bedMg").textContent = Math.round(mg);
  $("sleepChip").textContent = ok ? "Fine for sleep" : "Too much";
  $("sleepChip").className = `chip ${ok ? "ok" : "bad"}`;
  $("bedMeter").style.width = `${Math.min(100, (mg / meterMax) * 100)}%`;
  $("bedMeter").classList.toggle("bad", !ok);
  $("bedLimit").style.left = `${(BEDTIME_LIMIT_MG / meterMax) * 100}%`;
  $("sleepNote").textContent = ok
    ? `At your ${hoursToClock(bedtime)} bedtime you'll be under the ${BEDTIME_LIMIT_MG} mg cutoff.`
    : `That's over the ${BEDTIME_LIMIT_MG} mg cutoff for ${hoursToClock(bedtime)}. Move your last drink earlier or make it smaller.`;
}

// ---------------------------------------------------------------- page 2: tolerance

function drawTolerancePage() {
  const { plan, reset, form } = state;
  const pct = Math.round(plan.strength_percent);
  $("strength").textContent = `${pct}%`;
  $("strengthNote").textContent =
    `At ${form.habitualMg} mg a day, a ${DRIP_COFFEE_MG} mg coffee works like ${Math.round((DRIP_COFFEE_MG * pct) / 100)} mg would for a non-drinker.`;

  $("resetReason").textContent = reset.reason;
  drawResetChart();

  if (plan.nap) {
    const mins = Math.round((plan.nap.end_h - plan.nap.start_h) * 60);
    $("napTitle").innerHTML = `<strong>${mins} min</strong> at ${hoursToClock(plan.nap.start_h)}`;
    $("napNote").textContent = mins <= 25
      ? "Short enough that you wake up before deep sleep, so you won't feel groggy."
      : "Long enough for a full sleep cycle. Leave time to shake off grogginess.";
  } else {
    $("napTitle").innerHTML = "<strong>No nap</strong>";
    $("napNote").textContent = "You slept enough last night, or a nap would land too close to bedtime.";
  }
}

function drawResetChart() {
  const { reset } = state;
  const key = state.resetSeries;
  const series = [
    { data: reset.cold_turkey, color: cssVar("--muted"), dash: "5 4" },
    { data: reset.taper, color: cssVar("--mint") },
  ].map(({ data, color, dash }) => ({ xs: data.map((d) => d.day), ys: data.map((d) => d[key]), color, dash }));

  // Sample data assumes the event is 10 days out; the real API uses your event date.
  const examDay = usingMock ? 10 : Math.floor(state.req.event.start_h / 24);
  const today = new Date();
  lineChart($("resetChart"), {
    series,
    yMin: key === "R" ? 1 : 0,
    yMax: key === "R" ? 1.6 : Math.max(...series.flatMap((s) => s.ys)) * 1.15,
    vline: { x: examDay, label: "Event" },
    tickStep: 2,
    formatTick: (day) => {
      const d = new Date(today); d.setDate(d.getDate() + day);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    },
  });
}

// ---------------------------------------------------------------- page 3: learn

async function updateLearn() {
  state.learn = await getLearn({
    ratings: state.ratings, doses: state.plan.doses, sleep: state.req.sleep, profile: state.req.profile,
  });
  const L = state.learn;
  $("meanHalfLife").textContent = L.mean_half_life.toFixed(1);
  $("meanKd").textContent = L.mean_kd.toFixed(1);
  heatmap($("heatmap"), { prob: L.prob, xs: L.kds, ys: L.half_lives, mark: { x: L.mean_kd, y: L.mean_half_life } });

  const n = state.ratings.length;
  $("ratingCount").textContent = n === 0
    ? "No ratings yet. Each one sharpens the model."
    : `${n} rating${n === 1 ? "" : "s"} so far.`;
}

function nowInModelHours() {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

$("ratingButtons").addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  document.querySelectorAll("#ratingButtons button").forEach((b) => b.classList.toggle("picked", b === btn));
  state.ratings.push({ t: nowInModelHours(), score: Number(btn.dataset.score) });
  await updateLearn();
});

$("simulateBtn").addEventListener("click", async () => {
  // Demo shortcut: a week of made-up ratings, so the heatmap sharpens on stage.
  for (let i = 0; i < 12; i++) state.ratings.push({ t: 9 + (i % 4) * 3, score: 2 + (i % 3) });
  await updateLearn();
});

$("useLearnedBtn").addEventListener("click", async () => {
  state.form.halfLife = state.learn.mean_half_life;
  $("useLearnedBtn").textContent = `Using ${state.learn.mean_half_life.toFixed(1)} h`;
  await refresh();
});

// ---------------------------------------------------------------- toggles

function wireToggle(id, key, redraw) {
  $(id).addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    $(id).querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === btn));
    state[key] = btn.dataset.series;
    redraw();
  });
}
wireToggle("curveToggle", "curveSeries", drawCurve);
wireToggle("resetToggle", "resetSeries", drawResetChart);

// ---------------------------------------------------------------- bottom slider

const pager = $("pager");
const tabs = [...document.querySelectorAll(".tab")];

// While you swipe, the pill follows: scroll position / page width = how many pages across.
pager.addEventListener("scroll", () => {
  const pagesAcross = pager.scrollLeft / pager.clientWidth;
  $("tabPill").style.transform = `translateX(${pagesAcross * 100}%)`;
  const current = Math.round(pagesAcross);
  tabs.forEach((t, i) => t.classList.toggle("on", i === current));
}, { passive: true });

tabs.forEach((tab, i) => tab.addEventListener("click", () => {
  pager.scrollTo({ left: i * pager.clientWidth, behavior: "smooth" });
}));

// Links like index.html#learn open straight onto that page.
const startPage = ["#plan", "#tolerance", "#learn"].indexOf(location.hash);
if (startPage > 0) pager.scrollLeft = startPage * pager.clientWidth;

// ---------------------------------------------------------------- input sheet

function openSheet(open) {
  $("sheet").hidden = !open;
  $("scrim").hidden = !open;
}
$("editBtn").addEventListener("click", () => openSheet(true));
$("scrim").addEventListener("click", () => openSheet(false));
$("sheet").addEventListener("submit", async (e) => {
  e.preventDefault();
  openSheet(false);
  await refresh();
});

window.addEventListener("resize", () => {
  if (!state.plan) return;
  drawCurve();
  drawResetChart();
  updateLearn();
});

refresh();
