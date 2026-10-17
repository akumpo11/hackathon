// Drink picker for layer 1: tapping a drink row opens a sheet with every drink
// as a tile, like an ordering kiosk. Picking one fills the row's hidden input
// (drink0, drink1, ...), so layer1.js reads it exactly like a form field.
// No math here: the drink list and caffeine amounts come from model/params.py.

import { clockToHours, hoursToClock } from "./time.js";

const $ = (id) => document.getElementById(id);

// A simple drawing per kind of drink. Each is a 48x48 SVG on a tinted tile.
const SHAPES = {
  mug: (c) => `<path d="M12 16h20v14a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8V16Z" fill="${c}"/><path d="M32 20h3a5 5 0 0 1 0 10h-3" fill="none" stroke="${c}" stroke-width="3"/><path d="M18 8c-2 2 2 3 0 5M24 8c-2 2 2 3 0 5" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" opacity=".5"/>`,
  espresso: (c) => `<path d="M15 22h16v7a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6v-7Z" fill="${c}"/><path d="M31 24h2.5a3.5 3.5 0 0 1 0 7H31" fill="none" stroke="${c}" stroke-width="2.5"/><rect x="10" y="37" width="26" height="3" rx="1.5" fill="${c}" opacity=".45"/>`,
  teacup: (c) => `<path d="M11 20h24l-2 11a8 8 0 0 1-8 7h-4a8 8 0 0 1-8-7l-2-11Z" fill="${c}"/><path d="M27 12v8" stroke="${c}" stroke-width="2"/><rect x="24.5" y="9" width="5" height="5" rx="1" fill="${c}" opacity=".6"/><rect x="9" y="39" width="28" height="3" rx="1.5" fill="${c}" opacity=".45"/>`,
  can: (c) => `<rect x="15" y="8" width="18" height="33" rx="4" fill="${c}"/><rect x="17" y="6" width="14" height="4" rx="2" fill="${c}" opacity=".6"/><rect x="15" y="18" width="18" height="10" fill="#fff" opacity=".28"/>`,
  tallcan: (c) => `<rect x="16" y="5" width="16" height="38" rx="4" fill="${c}"/><rect x="18" y="3" width="12" height="4" rx="2" fill="${c}" opacity=".6"/><path d="M20 16l4 6-3 2 5 7" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>`,
  shot: (c) => `<rect x="18" y="14" width="12" height="26" rx="3" fill="${c}"/><rect x="20" y="8" width="8" height="7" rx="2" fill="${c}" opacity=".6"/><rect x="18" y="22" width="12" height="7" fill="#fff" opacity=".35"/>`,
  bar: (c) => `<rect x="10" y="12" width="28" height="24" rx="3" fill="${c}"/><path d="M19.3 12v24M28.6 12v24M10 24h28" stroke="#fff" stroke-width="1.6" opacity=".35"/>`,
  none: (c) => `<circle cx="24" cy="24" r="13" fill="none" stroke="${c}" stroke-width="3"/><path d="M15 33 33 15" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`,
};

// Which drawing and colors each drink gets, matched on its name in params.DRINKS.
function look(name) {
  const n = name.toLowerCase();
  if (!n) return { shape: "none", ink: "#9AA6A1", tint: "#EEF1F0" };
  if (n.includes("espresso")) return { shape: "espresso", ink: "#6B4226", tint: "#F3E7DA" };
  if (n.includes("coffee")) return { shape: "mug", ink: "#8B5A2B", tint: "#F3E7DA" };
  if (n.includes("green tea")) return { shape: "teacup", ink: "#5E9E4B", tint: "#E6F2DF" };
  if (n.includes("tea")) return { shape: "teacup", ink: "#C0812B", tint: "#FBF0DC" };
  if (n.includes("chocolate")) return { shape: "bar", ink: "#5A3A26", tint: "#EFE4DC" };
  if (n.includes("5-hour")) return { shape: "shot", ink: "#E3A21A", tint: "#FCF1D8" };
  if (n.includes("monster")) return { shape: "tallcan", ink: "#2F3B33", tint: "#E3ECE4" };
  if (n.includes("red bull")) return { shape: "can", ink: "#2F5DA8", tint: "#E1E9F6" };
  if (n.includes("celsius")) return { shape: "can", ink: "#E04E6B", tint: "#FBE3E8" };
  return { shape: "can", ink: "#8E979C", tint: "#ECEFF1" };       // Diet Coke and anything new
}

const icon = (name) => {
  const { shape, ink } = look(name);
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${SHAPES[shape](ink)}</svg>`;
};

// "drip coffee (8 oz)" -> name "Drip coffee", size "8 oz"
function split(name) {
  const m = name.match(/^(.*?)\s*\((.*)\)$/);
  const main = m ? m[1] : name;
  return { title: main.charAt(0).toUpperCase() + main.slice(1), size: m ? m[2] : "" };
}

export function initDrinkPicker(form, drinks, onChange) {
  const sheet = $("drinkSheet"), scrim = $("drinkScrim"), grid = $("drinkGrid");
  const buttons = [...form.querySelectorAll(".drink-pick")];
  let openSlot = null;       // which row the sheet is choosing for
  let opener = null;         // the button to return focus to

  // The row button shows the current pick: small drawing, name, caffeine.
  function showPick(button) {
    const value = form.elements[`drink${button.dataset.slot}`].value;
    const { title, size } = split(value);
    button.innerHTML = value
      ? `<span class="pick-icon" style="background:${look(value).tint}">${icon(value)}</span>
         <span class="pick-text"><strong>${title}</strong><small>${drinks[value]} mg${size ? `, ${size}` : ""}</small></span>`
      : `<span class="pick-icon" style="background:${look("").tint}">${icon("")}</span>
         <span class="pick-text"><strong>No drink</strong><small>Tap to add one</small></span>`;
  }

  function tile(value) {
    const { title, size } = split(value);
    const current = form.elements[`drink${openSlot}`].value === value;
    return `<button type="button" class="drink-tile${current ? " picked" : ""}" data-value="${value}" aria-pressed="${current}">
      ${value ? `<span class="tile-badge">${drinks[value]} mg</span>` : ""}
      <span class="tile-art" style="background:${look(value).tint}">${icon(value)}</span>
      <span class="tile-name">${value ? title : "No drink"}</span>
      <span class="tile-size">${value ? size || "1 serving" : "Skip this row"}</span>
    </button>`;
  }

  function open(button) {
    openSlot = Number(button.dataset.slot);
    opener = button;
    const time = hoursToClock(clockToHours(form.elements[`time${openSlot}`].value));
    $("drinkSheetNote").textContent = `For your ${time} drink.`;
    grid.innerHTML = ["", ...Object.keys(drinks)].map(tile).join("");
    sheet.hidden = false;
    scrim.hidden = false;
    (grid.querySelector(".picked") ?? grid.querySelector(".drink-tile")).focus();
  }

  function close() {
    sheet.hidden = true;
    scrim.hidden = true;
    opener?.focus();
    openSlot = null;
  }

  grid.addEventListener("click", (e) => {
    const t = e.target.closest(".drink-tile");
    if (!t || openSlot === null) return;
    form.elements[`drink${openSlot}`].value = t.dataset.value;
    showPick(opener);
    close();
    onChange();
  });
  buttons.forEach((b) => b.addEventListener("click", () => open(b)));
  $("drinkClose").addEventListener("click", close);
  scrim.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) close(); });

  buttons.forEach(showPick);
}
