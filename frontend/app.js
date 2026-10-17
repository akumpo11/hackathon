// Page navigation for the five layer pages, then each page's own code.

import { startLayer1 } from "./layer1.js";
import { startLayer2 } from "./layer2.js";
import { startLayer3 } from "./layer3.js";
import { startLayer4 } from "./layer4.js";

const pager = document.getElementById("pager");
const pill = document.getElementById("tabPill");
const tabs = [...document.querySelectorAll(".tab")];

// While you swipe, the pill follows: scroll position / page width = how many pages across.
pager.addEventListener("scroll", () => {
  const pagesAcross = pager.scrollLeft / pager.clientWidth;
  pill.style.transform = `translateX(${pagesAcross * 100}%)`;
  const current = Math.round(pagesAcross);
  tabs.forEach((t, i) => t.classList.toggle("on", i === current));
}, { passive: true });

tabs.forEach((tab, i) => tab.addEventListener("click", () => {
  pager.scrollTo({ left: i * pager.clientWidth, behavior: "smooth" });
}));

// Opens on layer 1. index.html#layer4 etc. pick a different page.
const fromHash = Number(location.hash.replace("#layer", "")) - 1;
const startPage = fromHash >= 0 && fromHash < tabs.length ? fromHash : 0;
pager.scrollLeft = startPage * pager.clientWidth;
pager.dispatchEvent(new Event("scroll"));

startLayer1().catch((err) => {
  console.error(err);
  document.getElementById("pkEquation").textContent = `Couldn't load the Python model. ${err?.message ?? err}`;
});

startLayer2().catch((err) => {
  console.error(err);
  document.getElementById("pressureNow").textContent = "Python didn't load";
});

startLayer3().catch((err) => {
  console.error(err);
  document.getElementById("tolEquation").textContent = `Couldn't load the Python model. ${err?.message ?? err}`;
});

startLayer4().catch((err) => {
  console.error(err);
  document.getElementById("equation").textContent = `Couldn't load the Python model. ${err?.message ?? err}`;
});
