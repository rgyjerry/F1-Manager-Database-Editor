import { combined_dict, names_full, races_names } from "./config.js";

const setupFieldOrder = ["frontWing", "rearWing", "antiRollBars", "camber", "toe"];

let lastSetupData = null;

function setupPercent(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return "-";
  return `${Math.round(numberValue * 1000) / 10}%`;
}

function confidenceText(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return "-";
  return `${Math.round(numberValue * 10) / 10}%`;
}

function trackDisplayName(weekend) {
  const code = races_names?.[Number(weekend?.trackId)];
  if (code && names_full?.[code]) {
    return names_full[code];
  }
  return weekend?.trackName || "Current race";
}

function teamDisplayName(teamId) {
  return combined_dict?.[Number(teamId)] || "Player team";
}

function setText(id, text) {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}

function clearSetupCars() {
  const container = document.getElementById("setupCars");
  if (container) container.innerHTML = "";
}

function renderSetupValueRow(value) {
  const current = Number(value?.current);
  const perfect = Number(value?.perfect);
  const hasBoth = Number.isFinite(current) && Number.isFinite(perfect);
  const delta = hasBoth ? Math.abs(current - perfect) : null;
  const closeness = delta === null ? 0 : Math.max(0, 1 - delta) * 100;

  const row = document.createElement("div");
  row.className = "setup-value-row";

  const label = document.createElement("div");
  label.className = "setup-value-label bold-font";
  label.textContent = value?.label || "";

  const bar = document.createElement("div");
  bar.className = "setup-value-bar";
  const fill = document.createElement("div");
  fill.className = "setup-value-bar-fill";
  fill.style.width = `${Math.max(0, Math.min(100, closeness))}%`;
  bar.appendChild(fill);

  const numbers = document.createElement("div");
  numbers.className = "setup-value-numbers";

  const currentValue = document.createElement("span");
  currentValue.textContent = setupPercent(value?.current);

  const arrow = document.createElement("i");
  arrow.className = "bi bi-arrow-right-short";

  const perfectValue = document.createElement("span");
  perfectValue.className = "setup-perfect-value bold-font";
  perfectValue.textContent = setupPercent(value?.perfect);

  numbers.append(currentValue, arrow, perfectValue);
  row.append(label, bar, numbers);
  return row;
}

function renderSetupCar(car) {
  const card = document.createElement("div");
  card.className = "setup-car";

  const header = document.createElement("div");
  header.className = "setup-car-header";

  const title = document.createElement("div");
  title.className = "setup-car-title";

  const carLabel = document.createElement("div");
  carLabel.className = "setup-car-number bold-font";
  carLabel.textContent = `Car ${car.carNumber}`;

  const driverName = document.createElement("div");
  driverName.className = "setup-car-driver";
  driverName.textContent = car.driverName || `Car ${car.carNumber}`;

  title.append(carLabel, driverName);

  const confidence = document.createElement("div");
  confidence.className = "setup-confidence";
  confidence.innerHTML = `
    <span>Setup confidence</span>
    <strong>${confidenceText(car.confidencePercent)}</strong>
  `;

  header.append(title, confidence);

  const values = document.createElement("div");
  values.className = "setup-values";
  setupFieldOrder.forEach((key) => {
    if (car.values?.[key]) {
      values.appendChild(renderSetupValueRow(car.values[key]));
    }
  });

  card.append(header, values);
  return card;
}

function setAvailability(data) {
  const unavailable = document.getElementById("setupUnavailable");
  const content = document.getElementById("setupContent");
  const button = document.getElementById("optimiseSetupButton");

  if (!unavailable || !content || !button) return;

  const available = !!data?.available;
  unavailable.classList.toggle("d-none", available);
  content.classList.toggle("d-none", !available);
  button.classList.toggle("d-none", !available);
  button.classList.toggle("disabled", !available);
  button.setAttribute("aria-disabled", available ? "false" : "true");
  setText("setupUnavailableReason", data?.reason || "No active setup data is available.");
}

export function loadSetupPage(data) {
  lastSetupData = data || null;
  setAvailability(lastSetupData);
  clearSetupCars();

  const weekend = lastSetupData?.weekend || {};
  setText("setupTrackName", trackDisplayName(weekend));
  setText("setupWeekendMeta", `${weekend.season || "-"} · ${weekend.weekendTypeLabel || "Weekend"}`);
  setText("setupTeamName", teamDisplayName(lastSetupData?.teamId));

  const cars = Array.isArray(lastSetupData?.cars) ? lastSetupData.cars : [];
  const container = document.getElementById("setupCars");
  if (container) {
    cars.forEach((car) => container.appendChild(renderSetupCar(car)));
  }
}

export function initSetupPage() {
  const button = document.getElementById("optimiseSetupButton");
  if (!button || button.dataset.setupInit === "1") return;
  button.dataset.setupInit = "1";

  button.addEventListener("click", () => {
    if (!lastSetupData?.available || button.classList.contains("disabled")) return;
    document.dispatchEvent(new CustomEvent("optimiseSetupRequested"));
  });
}
