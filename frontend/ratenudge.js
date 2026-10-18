// The "How alert are you?" tab on the home page. Learning your half-life needs ratings
// spread through the day, so once an hour without a rating this pops up above the tab
// bar and one tap takes you to the rating buttons on the Learn page. No math here.
//
// It pops up as soon as the app opens (or right after the first-run survey), and again
// whenever an hour passes. × hides it for an hour; rating on the Learn page does too.

import { lastRatingMs } from "./layer5.js";

const $ = (id) => document.getElementById(id);
const HOUR_MS = 3.6e6;
const CHECK_EVERY_MS = 60e3;      // looks once a minute whether an hour has passed
const POP_DELAY_MS = 700;         // a beat after the app (or survey) appears, so you see it arrive

// due: no rating in the last hour, and not hidden with × in the last hour.
export function initRateNudge({ surveyOpen, onHome, goToLearn }) {
  const nudge = $("rateNudge");
  let started = !surveyOpen;      // stays quiet while the first-run survey is on screen
  let snoozedUntilMs = 0;

  const due = () => Date.now() - (lastRatingMs() ?? 0) >= HOUR_MS && Date.now() >= snoozedUntilMs;
  const refresh = () => { nudge.hidden = !(started && onHome && due()); };

  $("rateNudgeGo").addEventListener("click", () => {
    snoozedUntilMs = Date.now() + HOUR_MS;    // you're on your way to rate; don't ask again right after
    refresh();
    goToLearn();
  });
  $("rateNudgeClose").addEventListener("click", () => {
    snoozedUntilMs = Date.now() + HOUR_MS;
    refresh();
  });

  // Only on the home page: leaving hides it, coming back shows it again if still due.
  document.addEventListener("pageshown", (e) => { onHome = e.detail === 0; refresh(); });
  document.addEventListener("surveydone", () => { started = true; setTimeout(refresh, POP_DELAY_MS); });
  setInterval(refresh, CHECK_EVERY_MS);
  if (started) setTimeout(refresh, POP_DELAY_MS);
}
