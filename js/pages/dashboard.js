// التقويم الشهري: كل يوم عليه عدد مواعيده، ولما تدوس على يوم تظهر مواعيده
import { db, collection, onSnapshot } from "../firebase.js";
import { requireSession } from "../session.js";
import { renderNav } from "../nav.js";
import { escapeHtml, showAlert, revealPage, pendingBadge } from "../ui.js";
import { watchFamilyData, childNames, isLegPending } from "../data.js";
import { offlineRangeNote } from "../offline.js";
import { legsInRange, exceptionId } from "../schedule.js";
import { toKey, todayKey, formatDayLong, formatTime, monthTitle } from "../dates.js";
import { APPOINTMENT_TYPES, TRIP_STATUS, LEG_LABELS, MANAGER_ROLES, errorMessage } from "../strings.js";

const session = await requireSession();
const { familyId, member } = session;

// السواق بيفتح على مشاويره، والتقويم من القايمة
const startParams = new URLSearchParams(location.search);
if (member.role === "driver" && !startParams.has("calendar") && !startParams.has("date")) {
  location.replace("driver.html");
  await new Promise(() => {});
}
renderNav(session);
const canManage = MANAGER_ROLES.includes(member.role);

const monthTitleEl = document.getElementById("month-title");
const headEl = document.getElementById("calendar-head");
const daysEl = document.getElementById("calendar-days");
const dayTitleEl = document.getElementById("day-title");
const dayListEl = document.getElementById("day-list");
const addBtn = document.getElementById("add-appointment");
const hintEl = document.getElementById("setup-hint");
const alertBox = document.getElementById("calendar-alert");

// الأسبوع في مصر بيبدأ يوم السبت
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];
const SHORT_DAYS = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

const params = new URLSearchParams(location.search);
let selected = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") || "") ? params.get("date") : todayKey();
let viewYear = Number(selected.slice(0, 4));
let viewMonth = Number(selected.slice(5, 7)) - 1;
let data = null;

headEl.innerHTML = WEEK_ORDER.map((d) => `<div class="calendar-head-cell">${SHORT_DAYS[d]}</div>`).join("");
addBtn.classList.toggle("d-none", !canManage);

function monthRange() {
  const first = new Date(viewYear, viewMonth, 1, 12);
  const last = new Date(viewYear, viewMonth + 1, 0, 12);
  return { first, last, from: toKey(first), to: toKey(last) };
}

function renderCalendar() {
  const { first, last, from, to } = monthRange();
  monthTitleEl.textContent = monthTitle(viewYear, viewMonth);

  const counts = new Map();
  legsInRange(data.appointments, data.exceptions, from, to)
    .filter((leg) => !leg.occ.cancelled)
    .forEach((leg) => counts.set(leg.occ.date, (counts.get(leg.occ.date) || 0) + 1));

  const leading = WEEK_ORDER.indexOf(first.getDay());
  const cells = Array.from({ length: leading }, () => '<div class="calendar-cell empty"></div>');
  const today = todayKey();

  for (let day = 1; day <= last.getDate(); day++) {
    const key = toKey(new Date(viewYear, viewMonth, day, 12));
    const count = counts.get(key) || 0;
    const classes = ["calendar-cell"];
    if (key === today) classes.push("today");
    if (key === selected) classes.push("selected");
    if (key < today) classes.push("past");
    cells.push(`
      <button type="button" class="${classes.join(" ")}" data-date="${key}" aria-label="${formatDayLong(key)}، ${count} مشاوير">
        <span class="calendar-day-number">${day}</span>
        ${count ? `<span class="calendar-count">${count}</span>` : ""}
      </button>`);
  }
  daysEl.innerHTML = cells.join("");
}

// كل مشوار (ذهاب أو عودة) بيظهر كبند لوحده في مواعيد اليوم
function legItem(leg) {
  const { occ } = leg;
  const d = occ.data;
  const legBadge = d.type === "travel"
    ? `<span class="badge text-bg-dark">${APPOINTMENT_TYPES.travel}${occ.travel ? ` ${occ.travel.day}/${occ.travel.total}` : ""}</span>`
    : `<span class="badge ${leg.leg === "go" ? "text-bg-primary" : "text-bg-secondary"}">${LEG_LABELS[leg.leg]}</span>`;
  const typeBadge = d.type === "extra" ? `<span class="badge text-bg-warning">${APPOINTMENT_TYPES.extra}</span>` : "";
  const repeatIcon = occ.appointment.repeatWeekly ? '<i class="bi bi-arrow-repeat text-muted" title="متكرر كل أسبوع"></i>' : "";
  const editedBadge = occ.exception && occ.exception.overrides ? '<span class="badge text-bg-info">متعدّل اليوم ده</span>' : "";
  const cancelledBadge = occ.cancelled ? '<span class="badge text-bg-secondary">ملغي</span>' : "";
  const pending = isLegPending(leg, data) ? pendingBadge() : "";
  const statusBadge = !occ.cancelled && leg.status !== "scheduled"
    ? `<span class="badge ${TRIP_STATUS[leg.status].badge}">${TRIP_STATUS[leg.status].label}</span>`
    : "";

  return `
    <li class="list-group-item p-0">
      <a class="appointment-item${occ.cancelled ? " cancelled" : ""}" href="appointment.html?id=${encodeURIComponent(occ.appointment.id)}&date=${occ.date}">
        <div class="d-flex justify-content-between align-items-center gap-2">
          <span class="d-flex align-items-center gap-2"><bdi class="fw-bold">${formatTime(leg.time)}</bdi>${legBadge}</span>
          <span class="d-flex flex-wrap justify-content-end gap-1 align-items-center">${repeatIcon}${typeBadge}${statusBadge}${editedBadge}${cancelledBadge}${pending}</span>
        </div>
        <div class="fw-semibold">${escapeHtml(childNames(d.childIds, data.children))}</div>
        <div class="small text-muted">
          <i class="bi bi-geo-alt"></i> ${escapeHtml(leg.from?.name || "")} ← ${escapeHtml(leg.to?.name || "")}
        </div>
        ${d.notes ? `<div class="appointment-note small mt-1"><i class="bi bi-sticky"></i> ${escapeHtml(d.notes)}</div>` : ""}
        ${commentsHtml(occ)}
      </a>
    </li>`;
}

// تعليقات الأعضاء على الموعد في اليوم ده: آخر 3، والباقي عدد
const MAX_COMMENTS = 3;
let commentsByOccurrence = new Map();

function commentsHtml(occ) {
  const list = commentsByOccurrence.get(exceptionId(occ.appointment.id, occ.date)) || [];
  if (!list.length) return "";
  const shown = list.slice(-MAX_COMMENTS);
  const more = list.length - shown.length;
  return `
    <div class="appointment-comments small mt-1">
      ${more ? `<div class="text-muted">و${more} تعليقات أقدم</div>` : ""}
      ${shown.map((c) => `<div><i class="bi bi-chat-left-text"></i> <strong>${escapeHtml(c.authorName)}:</strong> ${escapeHtml(c.text)}</div>`).join("")}
    </div>`;
}

function renderDay() {
  dayTitleEl.textContent = formatDayLong(selected);
  addBtn.href = `appointment-form.html?date=${selected}`;
  const list = legsInRange(data.appointments, data.exceptions, selected, selected);
  const note = offlineRangeNote(selected);
  dayListEl.innerHTML = (note ? `<li class="list-group-item list-group-item-warning small">${note}</li>` : "")
    + (list.length
      ? list.map(legItem).join("")
      : '<li class="list-group-item text-muted">مفيش مواعيد اليوم ده.</li>');
}

// النت قطع أو رجع: نحدّث تنبيه الأيام المضمونة أوفلاين
["online", "offline"].forEach((name) => window.addEventListener(name, () => { if (data) renderDay(); }));

function renderHint() {
  if (!canManage) return;
  let message = "";
  if (!data.children.some((c) => !c.deleted)) message = 'ابدأ بإضافة الأولاد من صفحة <a href="children.html">الأولاد</a>، وبعدين ضيف المواعيد.';
  else if (!data.places.some((p) => !p.deleted)) message = 'ضيف الأماكن اللي بتتكرر (البيت، المدرسة، النادي) من صفحة <a href="places.html">الأماكن</a> عشان إضافة المواعيد تبقى أسرع.';
  hintEl.innerHTML = message;
  hintEl.classList.toggle("d-none", !message);
}

function render() {
  renderCalendar();
  renderDay();
  renderHint();
}

function shiftMonth(delta) {
  viewMonth += delta;
  if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
  if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
  renderCalendar();
}

document.getElementById("prev-month").addEventListener("click", () => shiftMonth(-1));
document.getElementById("next-month").addEventListener("click", () => shiftMonth(1));
document.getElementById("go-today").addEventListener("click", () => {
  selected = todayKey();
  viewYear = Number(selected.slice(0, 4));
  viewMonth = Number(selected.slice(5, 7)) - 1;
  render();
});

daysEl.addEventListener("click", (event) => {
  const cell = event.target.closest("[data-date]");
  if (!cell) return;
  selected = cell.dataset.date;
  history.replaceState(null, "", `?date=${selected}`);
  renderCalendar();
  renderDay();
  dayTitleEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

onSnapshot(collection(db, "families", familyId, "comments"), (snapshot) => {
  const map = new Map();
  snapshot.docs.map((d) => d.data()).filter((c) => !c.deleted)
    .sort((a, b) => (a.clientAt || "").localeCompare(b.clientAt || ""))
    .forEach((c) => {
      const key = exceptionId(c.appointmentId, c.date);
      map.set(key, [...(map.get(key) || []), c]);
    });
  commentsByOccurrence = map;
  if (data) renderDay();
}, () => {});

watchFamilyData(familyId, (state) => {
  const first = !data;
  data = state;
  render();
  if (first) revealPage();
}, (error) => {
  showAlert(alertBox, errorMessage(error));
  revealPage();
});
