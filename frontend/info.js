// The (i) buttons. Captions on screen stay short; the longer explanation sits in a
// hidden .info-pop next to it, and tapping the button shows or hides it.
// Each button points at its text with aria-controls. No math here.

export function initInfo() {
  // One listener for the whole page, so buttons on every layer and in settings all work.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".info-btn");
    if (!btn) return;
    const pop = document.getElementById(btn.getAttribute("aria-controls"));
    const open = btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", String(open));
    pop.hidden = !open;
  });
}
