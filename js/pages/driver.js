// شاشة السواق: مشاوير يوم واحد (النهارده افتراضياً) وأزرار الحالة لكل مشوار
import { requireSession } from "../session.js";
import { renderNav } from "../nav.js";
import { escapeHtml, showAlert, hideAlert, revealPage } from "../ui.js";
import { watchFamilyData, childNames } from "../data.js";
import { occurrencesInRange } from "../schedule.js";
import { todayKey, addDays, formatDayLong, formatTime } from "../dates.js";
import { mapsLink } from "../map-picker.js";
import { actionButtonsHtml, runDriverAction, isAssignedTo } from "../driver-actions.js";
import { TRIP_STATUS, APPOINTMENT_TYPES, errorMessage } from "../strings.js";

const session = await requireSession();
renderNav(session);
const { familyId, user } = session;

const listEl = document.getElementById("driver-list");
const titleEl = document.getElementById("driver-title");
const dateEl = document.getElementById("driver-date");
const todayBtn = document.getElementById("go-today");
const alertBox = document.getElementById("driver-alert");

let day = /^\d{4}-\d{2}-\d{2}$/.test(new URLSearchParams(location.search).get("date") || "")
  ? new URLSearchParams(location.search).get("date")
  : todayKey();
let data = null;
let current = [];

function placeLine(icon, label, place) {
  if (!place) return "";
  return `
    <div class="d-flex align-items-center gap-2">
      <i class="bi ${icon} text-primary"></i>
      <span class="text-muted small">${label}</span>
      <a href="${mapsLink(place)}" target="_blank" rel="noopener" class="fw-semibold">${escapeHtml(place.name)}</a>
    </div>`;
}

function cardHtml(occ) {
  const d = occ.data;
  const status = occ.cancelled ? { label: "ملغي", badge: "text-bg-secondary" } : TRIP_STATUS[occ.status];
  const travelLine = occ.travel
    ? `<div class="small"><span class="badge text-bg-dark">${APPOINTMENT_TYPES.travel}</span> يوم ${occ.travel.day} من ${occ.travel.total}${d.travel?.stay ? ` · المبيت: ${escapeHtml(d.travel.stay)}` : ""}</div>`
    : "";
  const reason = occ.status === "declined" && occ.exception?.declineReason
    ? `<div class="small text-danger">سبب الاعتذار: ${escapeHtml(occ.exception.declineReason)}</div>`
    : "";

  return `
    <article class="card shadow-sm driver-card${occ.cancelled ? " cancelled" : ""}">
      <div class="card-body d-grid gap-2">
        <div class="d-flex justify-content-between align-items-center gap-2">
          <span class="fs-5 fw-bold"><bdi>${formatTime(d.startTime)}</bdi>${d.returnTime ? ` <span class="fw-normal text-muted small">لحد</span> <bdi>${formatTime(d.returnTime)}</bdi>` : ""}</span>
          <span class="badge ${status.badge}">${status.label}</span>
        </div>
        <div class="fw-semibold">${escapeHtml(childNames(d.childIds, data.children))}${d.type === "extra" ? ` <span class="badge text-bg-warning">${APPOINTMENT_TYPES.extra}</span>` : ""}</div>
        ${travelLine}
        ${placeLine("bi-house", "استلام:", d.pickup)}
        ${placeLine("bi-flag", d.type === "travel" ? "الوجهة:" : "توصيل:", d.dropoff)}
        ${d.notes ? `<div class="small text-muted"><i class="bi bi-chat-left-text"></i> ${escapeHtml(d.notes)}</div>` : ""}
        ${reason}
        <div class="d-flex flex-wrap gap-2 mt-1">
          ${actionButtonsHtml(occ)}
          <a class="btn btn-sm btn-outline-secondary" href="appointment.html?id=${encodeURIComponent(occ.appointment.id)}&date=${occ.date}">التفاصيل والتعليقات</a>
        </div>
      </div>
    </article>`;
}

function render() {
  const isToday = day === todayKey();
  titleEl.textContent = isToday ? "مشاوير النهارده" : "مشاوير يوم";
  dateEl.textContent = formatDayLong(day);
  todayBtn.classList.toggle("d-none", isToday);

  current = occurrencesInRange(data.appointments, data.exceptions, day, day)
    .filter((occ) => isAssignedTo(occ, user.uid));
  listEl.innerHTML = current.length
    ? current.map(cardHtml).join("")
    : '<div class="card shadow-sm"><div class="card-body text-center text-muted py-5">مفيش مشاوير اليوم ده.</div></div>';
}

function goTo(newDay) {
  day = newDay;
  history.replaceState(null, "", `?date=${day}`);
  render();
}

document.getElementById("prev-day").addEventListener("click", () => goTo(addDays(day, -1)));
document.getElementById("next-day").addEventListener("click", () => goTo(addDays(day, 1)));
todayBtn.addEventListener("click", () => goTo(todayKey()));

listEl.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-driver-action]");
  if (!button) return;
  const occ = current.find((o) => o.appointment.id === decodeURIComponent(button.dataset.id) && o.date === button.dataset.date);
  if (!occ) return;
  hideAlert(alertBox);
  button.disabled = true;
  try {
    await runDriverAction(session, occ, button.dataset.driverAction, childNames(occ.data.childIds, data.children));
  } catch (error) {
    showAlert(alertBox, errorMessage(error));
  }
  button.disabled = false;
});

watchFamilyData(familyId, (state) => {
  const first = !data;
  data = state;
  render();
  if (first) revealPage();
}, (error) => {
  showAlert(alertBox, errorMessage(error));
  revealPage();
});
