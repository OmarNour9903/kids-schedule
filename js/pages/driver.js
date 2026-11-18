// شاشة السواق: مشاوير كل الأسر اللي هو سواق فيها في جدول واحد،
// بفلتر للأسرة والفترة (الجاية افتراضياً، يوم، الأسبوع، اللي فاتت) والحالة، وأزرار الحالة لكل مشوار،
// وتنبيه لو فيه مشوارين في نفس المعاد (حتى لو من أسرتين مختلفتين)
import { requireSession } from "../session.js";
import { renderNav } from "../nav.js";
import { escapeHtml, showAlert, hideAlert, revealPage, pendingBadge } from "../ui.js";
import { watchFamilyData, childNames, isLegPending, legStatusLabel } from "../data.js";
import { offlineRangeNote } from "../offline.js";
import { legsInRange, occurrencesInRange, legsOf } from "../schedule.js";
import { renderDayRing, childColorIndexMap, childColorMap, childColorClass } from "../day-ring.js";
import { todayKey, addDays, formatDayLong, formatTime, daysBetween } from "../dates.js";
import { mapsLink } from "../map-picker.js";
import { actionButtonsHtml, runDriverAction, isAssignedTo } from "../driver-actions.js";
import { TRIP_STATUS, APPOINTMENT_TYPES, LEG_LABELS, errorMessage } from "../strings.js";

const session = await requireSession();
const { user } = session;

// الأسر اللي المستخدم سواق فيها
const driverFamilies = session.families.filter((f) => f.member.role === "driver");
if (!driverFamilies.length) {
  location.replace("dashboard.html");
  await new Promise(() => {});
}
renderNav(session);
const multiFamily = driverFamilies.length > 1;
const familyById = new Map(driverFamilies.map((f) => [f.id, f]));

// السيشن بتاع أسرة معينة: الأزرار والإشعارات بتتسجل في الأسرة بتاعة المشوار وباسم السواق فيها
const sessionFor = (familyId) => ({ ...session, familyId, member: familyById.get(familyId).member, family: familyById.get(familyId).family });

const listEl = document.getElementById("driver-list");
const titleEl = document.getElementById("driver-title");
const dateEl = document.getElementById("driver-date");
const todayBtn = document.getElementById("go-today");
const alertBox = document.getElementById("driver-alert");

const prevBtn = document.getElementById("prev-day");
const nextBtn = document.getElementById("next-day");
const statusSelect = document.getElementById("status-filter");
const familySelect = document.getElementById("family-filter");

// الفلتر بيتحفظ على الجهاز، ولينك فيه ?date= بيفتح اليوم ده على طول
const FILTER_KEY = "driver-filters";
const RANGES = ["upcoming", "day", "week", "past"];
const STATUS_FILTERS = ["all", "pending", "confirmed", "declined"];
// المدة اللي بنعرضها في "الجاية" و"اللي فاتت"
const RANGE_DAYS = 30;

function loadFilters() {
  try {
    return JSON.parse(localStorage.getItem(FILTER_KEY)) || {};
  } catch (error) {
    return {};
  }
}

function saveFilters() {
  try {
    localStorage.setItem(FILTER_KEY, JSON.stringify({ range, status: statusFilter, family: familyFilter }));
  } catch (error) {
    // التخزين مش متاح: الفلتر هيرجع للافتراضي المرة الجاية بس
  }
}

const saved = loadFilters();
const dateParam = new URLSearchParams(location.search).get("date") || "";
let day = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayKey();
let range = dateParam ? "day" : (RANGES.includes(saved.range) ? saved.range : "upcoming");
let statusFilter = STATUS_FILTERS.includes(saved.status) ? saved.status : "all";
let familyFilter = familyById.has(saved.family) ? saved.family : "all";
// بيانات كل أسرة: familyId => state
const states = new Map();
let loaded = false;
let current = [];

// اسم المكان + زرار يفتح اللوكيشن على Google Maps، أو زرار مقفول لو ولي الأمر ماحطش لوكيشن
function placeLine(icon, label, place) {
  if (!place) return "";
  const link = mapsLink(place);
  const button = link
    ? `<a class="btn btn-sm btn-outline-success ms-auto" href="${escapeHtml(link)}" target="_blank" rel="noopener" data-location-btn>
        <i class="bi bi-geo-alt"></i> افتح اللوكيشن
      </a>`
    : `<button type="button" class="btn btn-sm btn-outline-secondary ms-auto" disabled data-location-btn>
        <i class="bi bi-geo-alt"></i> من غير لوكيشن
      </button>`;
  return `
    <div class="d-flex flex-wrap align-items-center gap-2">
      <i class="bi ${icon} text-primary"></i>
      <span class="text-muted small">${label}</span>
      <span class="fw-semibold">${escapeHtml(place.name)}</span>
      ${button}
    </div>`;
}

// كارت لكل مشوار: الذهاب لوحده والعودة لوحدها، وكل واحد ليه حالته وأزراره
function cardHtml(leg, conflict) {
  const { occ } = leg;
  const data = states.get(leg.familyId);
  const d = occ.data;
  const travel = d.type === "travel";
  const status = occ.cancelled
    ? { label: "ملغي", badge: "text-bg-secondary" }
    : { label: legStatusLabel(leg, data), badge: TRIP_STATUS[leg.status].badge };
  const legBadge = travel
    ? `<span class="badge text-bg-dark">${APPOINTMENT_TYPES.travel}</span>`
    : `<span class="badge ${leg.leg === "go" ? "text-bg-primary" : "text-bg-secondary"}">${LEG_LABELS[leg.leg]}</span>`;
  const travelLine = occ.travel
    ? `<div class="small">يوم ${occ.travel.day} من ${occ.travel.total}${d.travel?.stay ? ` · المبيت: ${escapeHtml(d.travel.stay)}` : ""}</div>`
    : "";
  const reason = leg.status === "declined" && leg.declineReason
    ? `<div class="small text-danger">سبب الاعتذار: ${escapeHtml(leg.declineReason)}</div>`
    : "";

  return `
    <article class="card shadow-sm driver-card ${childColorClass(leg.familyId, d.childIds, childColorIndexMap(allColorFamilies()))}${occ.cancelled ? " cancelled" : ""}">
      <div class="card-body d-grid gap-2">
        <div class="d-flex justify-content-between align-items-center gap-2">
          <span class="d-flex align-items-center gap-2">
            <span class="leg-time fs-5"><bdi>${formatTime(leg.time)}</bdi></span>
            ${legBadge}
          </span>
          <span class="d-flex flex-wrap justify-content-end gap-1">
            ${isLegPending(leg, data) ? pendingBadge() : ""}
            <span class="badge ${status.badge}">${escapeHtml(status.label)}</span>
          </span>
        </div>
        ${multiFamily ? `<div><span class="badge text-bg-light border"><i class="bi bi-house-heart"></i> ${escapeHtml(familyById.get(leg.familyId).family.name)}</span></div>` : ""}
        ${conflict ? '<div class="alert alert-warning py-1 px-2 small mb-0"><i class="bi bi-exclamation-triangle"></i> فيه مشوار تاني في نفس المعاد</div>' : ""}
        <div class="leg-kids">${escapeHtml(childNames(d.childIds, data.children))}${d.type === "extra" ? ` <span class="badge text-bg-warning">${APPOINTMENT_TYPES.extra}</span>` : ""}</div>
        ${travelLine}
        <div class="route">
          ${placeLine("bi-house", "استلام من:", leg.from)}
          ${placeLine("bi-flag", travel ? "الوجهة:" : "توصيل لـ:", leg.to)}
        </div>
        ${d.notes ? `<div class="small text-muted"><i class="bi bi-sticky"></i> ${escapeHtml(d.notes)}</div>` : ""}
        ${reason}
        <div class="d-flex flex-wrap gap-2 mt-1">
          ${actionButtonsHtml(leg, childNames(d.childIds, data.children))}
          <a class="btn btn-sm btn-outline-secondary" href="appointment.html?id=${encodeURIComponent(occ.appointment.id)}&date=${occ.date}&family=${encodeURIComponent(leg.familyId)}">التفاصيل والتعليقات</a>
        </div>
      </div>
    </article>`;
}

// من لحد إيه حسب الفلتر
function rangeBounds() {
  const today = todayKey();
  if (range === "day") return { from: day, to: day };
  if (range === "week") return { from: today, to: addDays(today, 6) };
  if (range === "past") return { from: addDays(today, -RANGE_DAYS), to: addDays(today, -1) };
  return { from: today, to: addDays(today, RANGE_DAYS) };
}

function matchesStatus(leg) {
  if (statusFilter === "all") return true;
  if (leg.occ.cancelled) return false;
  if (statusFilter === "pending") return leg.status === "scheduled";
  if (statusFilter === "declined") return leg.status === "declined";
  return ["confirmed", "arrived", "picked", "done"].includes(leg.status);
}

const RANGE_TITLES = {
  upcoming: "المشاوير الجاية",
  week: "مشاوير الأسبوع",
  past: "المشاوير اللي فاتت"
};

const EMPTY_TEXT = {
  upcoming: "مفيش مشاوير جاية.",
  day: "مفيش مشاوير اليوم ده.",
  week: "مفيش مشاوير الأسبوع ده.",
  past: "مفيش مشاوير في آخر شهر."
};

function dayHeading(date) {
  const diff = daysBetween(todayKey(), date);
  const prefix = diff === 0 ? "النهارده · " : diff === 1 ? "بكرة · " : diff === -1 ? "امبارح · " : "";
  return `<h2 class="h6 fw-bold text-muted mb-0 mt-2">${prefix}${formatDayLong(date)}</h2>`;
}

// ألوان الأولاد محسوبة على كل الأسر، فمابتتغيرش لما فلتر الأسرة يتغير
function allColorFamilies() {
  return driverFamilies.map((f) => ({ familyId: f.id, children: states.get(f.id)?.children || [] }));
}

// الدايرة: يوم الفلتر لو "يوم"، والنهارده في باقي الفلاتر. فيها المواعيد اللي ليها مشوار للسواق ده، من كل الأسر
function renderRing() {
  const ringDay = range === "day" ? day : todayKey();
  document.getElementById("ring-date").textContent = ringDay === todayKey() ? `النهارده · ${formatDayLong(ringDay)}` : formatDayLong(ringDay);
  const families = [...states.entries()]
    .filter(([familyId]) => familyFilter === "all" || familyId === familyFilter)
    .map(([familyId, data]) => ({
      familyId,
      familyName: familyById.get(familyId).family.name,
      children: data.children,
      occurrences: occurrencesInRange(data.appointments, data.exceptions, ringDay, ringDay)
        .filter((occ) => legsOf(occ).some((leg) => isAssignedTo(leg, user.uid)))
    }));
  renderDayRing(document.getElementById("day-ring"), { date: ringDay, families, colors: childColorMap(allColorFamilies()) });
}

function render() {
  renderRing();
  const isDay = range === "day";
  const isToday = day === todayKey();
  const { from, to } = rangeBounds();

  titleEl.textContent = isDay ? (isToday ? "مشاوير النهارده" : "مشاوير يوم") : RANGE_TITLES[range];
  dateEl.textContent = isDay ? formatDayLong(day) : `من ${formatDayLong(from)} لـ ${formatDayLong(to)}`;
  prevBtn.classList.toggle("invisible", !isDay);
  nextBtn.classList.toggle("invisible", !isDay);
  todayBtn.classList.toggle("d-none", !isDay || isToday);
  document.querySelectorAll('input[name="range"]').forEach((input) => { input.checked = input.value === range; });
  statusSelect.value = statusFilter;
  familySelect.value = familyFilter;

  const allLegs = [...states.entries()]
    .flatMap(([familyId, data]) => legsInRange(data.appointments, data.exceptions, from, to)
      .map((leg) => Object.assign(leg, { familyId })))
    .filter((leg) => isAssignedTo(leg, user.uid))
    .sort((a, b) => a.occ.date.localeCompare(b.occ.date) || a.time.localeCompare(b.time));

  // التعارض: أكتر من مشوار شغال في نفس اليوم ونفس المعاد، من أي أسرة
  const slots = new Map();
  allLegs.filter((leg) => !leg.occ.cancelled && leg.status !== "declined").forEach((leg) => {
    const key = `${leg.occ.date} ${leg.time}`;
    slots.set(key, (slots.get(key) || 0) + 1);
  });
  const hasConflict = (leg) => !leg.occ.cancelled && leg.status !== "declined" && slots.get(`${leg.occ.date} ${leg.time}`) > 1;

  let legs = allLegs
    .filter((leg) => familyFilter === "all" || leg.familyId === familyFilter)
    .filter(matchesStatus);
  // "الجاية": اللي خلص أو اتلغى مش محتاجه
  if (range === "upcoming") legs = legs.filter((leg) => !leg.occ.cancelled && leg.status !== "done");
  // "اللي فاتت": الأحدث الأول
  if (range === "past") legs = legs.reverse();
  current = legs;

  const note = offlineRangeNote(isDay ? day : to);
  let html = "";
  let lastDate = "";
  current.forEach((leg) => {
    if (!isDay && leg.occ.date !== lastDate) {
      lastDate = leg.occ.date;
      html += dayHeading(lastDate);
    }
    html += cardHtml(leg, hasConflict(leg));
  });
  const emptyText = statusFilter === "all" ? EMPTY_TEXT[range] : "مفيش مشاوير بالحالة دي في الفترة دي.";
  listEl.innerHTML = (note ? `<div class="alert alert-warning small mb-0">${note}</div>` : "")
    + (html || `<div class="card shadow-sm"><div class="card-body text-center text-muted py-5">${emptyText}</div></div>`);
}

// النت قطع أو رجع: نحدّث تنبيه الأيام المضمونة أوفلاين
["online", "offline"].forEach((name) => window.addEventListener(name, () => { if (loaded) render(); }));

function goTo(newDay) {
  day = newDay;
  history.replaceState(null, "", `?date=${day}`);
  render();
}

function setRange(newRange) {
  range = newRange;
  // اللينك فيه اليوم بس لما الفلتر "يوم"
  history.replaceState(null, "", range === "day" ? `?date=${day}` : location.pathname);
  saveFilters();
  if (loaded) render();
}

document.querySelectorAll('input[name="range"]').forEach((input) => {
  input.addEventListener("change", () => { if (input.checked) setRange(input.value); });
});

statusSelect.addEventListener("change", () => {
  statusFilter = statusSelect.value;
  saveFilters();
  if (loaded) render();
});

// فلتر الأسرة بيظهر بس لو السواق شغال مع أكتر من أسرة
familySelect.innerHTML = '<option value="all">كل الأسر</option>'
  + driverFamilies.map((f) => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.family.name)}</option>`).join("");
familySelect.classList.toggle("d-none", !multiFamily);
familySelect.addEventListener("change", () => {
  familyFilter = familySelect.value;
  saveFilters();
  if (loaded) render();
});

document.getElementById("prev-day").addEventListener("click", () => goTo(addDays(day, -1)));
document.getElementById("next-day").addEventListener("click", () => goTo(addDays(day, 1)));
todayBtn.addEventListener("click", () => goTo(todayKey()));

listEl.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-driver-action]");
  if (!button) return;
  const leg = current.find((l) => l.occ.appointment.id === decodeURIComponent(button.dataset.id)
    && l.occ.date === button.dataset.date && l.leg === button.dataset.leg);
  if (!leg) return;
  hideAlert(alertBox);
  button.disabled = true;
  try {
    await runDriverAction(sessionFor(leg.familyId), leg, button.dataset.driverAction, childNames(leg.occ.data.childIds, states.get(leg.familyId).children));
  } catch (error) {
    showAlert(alertBox, errorMessage(error));
  }
  button.disabled = false;
});

// متابعة لحظية لكل أسرة، والصفحة بتظهر لما كل الأسر تتحمل
driverFamilies.forEach((f) => {
  watchFamilyData(f.id, (state) => {
    states.set(f.id, state);
    if (states.size < driverFamilies.length) return;
    render();
    if (!loaded) {
      loaded = true;
      revealPage();
    }
  }, (error) => {
    showAlert(alertBox, errorMessage(error));
    revealPage();
  });
});
