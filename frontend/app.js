// Page navigation for the five layer pages and the learning page, then each page's own code.

import { loadPython } from "./python.js";
import { initSettings } from "./settings.js";
import { initInfo } from "./info.js";
import { startLayer1 } from "./layer1.js";
import { startLayer2 } from "./layer2.js";
import { startLayer3 } from "./layer3.js";
import { startLayer4 } from "./layer4.js";
import { startLayer5 } from "./layer5.js";

const pager = document.getElementById("pager");
const pill = document.getElementById("tabPill");
const tabs = [...document.querySelectorAll(".tab")];
const pages = [...pager.querySelectorAll(".page")];
let shownPage = null;      // the page you're on, so arriving on a new one is noticed once

// While you swipe, the pill follows: scroll position / page width = how many pages across.
pager.addEventListener("scroll", () => {
  const pagesAcross = pager.scrollLeft / pager.clientWidth;
  pill.style.transform = `translateX(${pagesAcross * 100}%)`;
  const current = Math.round(pagesAcross);
  tabs.forEach((t, i) => t.classList.toggle("on", i === current));
  // A page fully out of view goes back to its top, so every page you switch to starts there.
  // Waiting until it's out of view means you never see it jump.
  pages.forEach((p, i) => { if (Math.abs(pagesAcross - i) >= 1 && p.scrollTop) p.scrollTop = 0; });
  // Tell the pages when you arrive on a new one (layer 4 jumps back to right now).
  if (current !== shownPage) {
    shownPage = current;
    document.dispatchEvent(new CustomEvent("pageshown", { detail: current }));
  }
}, { passive: true });

// The gear belongs to the page header, so it fades out once you scroll past it (styles.css .scrolled)
// instead of sitting on top of charts and numbers.
const device = document.querySelector(".device");
const markScrolled = () => device.classList.toggle("scrolled", (pages[shownPage]?.scrollTop ?? 0) > 40);
pages.forEach((p) => p.addEventListener("scroll", markScrolled, { passive: true }));
document.addEventListener("pageshown", markScrolled);

tabs.forEach((tab, i) => tab.addEventListener("click", () => {
  pager.scrollTo({ left: i * pager.clientWidth, behavior: "smooth" });
}));

// Opens on layer 1. index.html#layer4 etc. pick a different page.
const fromHash = Number(location.hash.replace("#layer", "")) - 1;
const startPage = fromHash >= 0 && fromHash < tabs.length ? fromHash : 0;
pager.scrollLeft = startPage * pager.clientWidth;
pager.dispatchEvent(new Event("scroll"));

// The (i) buttons that show each card's longer explanation.
initInfo();

// Personal settings first: layers 1 to 3 read them as soon as they start.
initSettings();

// A thin bar across the top while Python downloads (styles.css .loading). The pages
// start the download themselves; this only watches for it to finish.
document.documentElement.classList.add("loading");
loadPython().finally(() => document.documentElement.classList.remove("loading"));

startLayer1().catch((err) => {
  console.error(err);
  document.getElementById("pkReadout").textContent = "Couldn't load";
});

startLayer2().catch((err) => {
  console.error(err);
  document.getElementById("pressureNow").textContent = "Couldn't load";
});

startLayer3().catch((err) => {
  console.error(err);
  document.getElementById("tolEquation").textContent = "Couldn't load. Check your connection and reload.";
});

startLayer4().catch((err) => {
  console.error(err);
  document.getElementById("alertReadout").textContent = "Couldn't load";
});

startLayer5().catch((err) => {
  console.error(err);
  document.getElementById("planEquation").textContent = "Couldn't load. Check your connection and reload.";
});
