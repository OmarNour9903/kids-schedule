// تفاصيل موعد في يوم معين، ومنه التعديل والإلغاء
import { db, doc, updateDoc, setDoc, serverTimestamp } from "../firebase.js";
import { requireSession } from "../session.js";
import { renderNav } from "../nav.js";
import { escapeHtml, showAlert, hideAlert, confirmDialog, choiceDialog, revealPage } from "../ui.js";
import { watchFamilyData, childNames } from "../data.js";
import { occurrencesInRange, exceptionId } from "../schedule.js";
import { addDays, formatDayLong, formatTime, weekdayName } from "../dates.js";
import { showPlacesMap, mapsLink } from "../map-picker.js";
import { APPOINTMENT_TYPES, EDIT_SCOPES, MANAGER_ROLES, errorMessage } from "../strings.js";

const session = await requireSession();
renderNav(session);
const { familyId, member, user } = session;
const canManage = MANAGER_ROLES.includes(member.role);

const params = new URLSearchParams(location.search);
const id = params.get("id");
const date = params.get("date");

const alertBox = document.getElementById("details-alert");
const card = document.getElementById("details");
const actions = document.getElementById("details-actions");
const cancelBtn = document.getElementById("cancel-btn");
const restoreBtn = document.getElementById("restore-btn");
const editBtn = document.getElementById("edit-btn");
document.getElementById("back-link").href = `dashboard.html?date=${encodeURIComponent(date || "")}`;

const appointmentRef = doc(db, "families", familyId, "appointments", id || "_");
const exceptionRef = doc(db, "families", familyId, "occurrences", exceptionId(id, date));

let current = null;
let mapView = null;
let mapKey = "";

function placeHtml(place) {
  if (!place) return "-";
  return `${escapeHtml(place.name)} <a class="small" href="${mapsLink(place)}" target="_blank" rel="noopener">(افتح الخريطة)</a>`;
}

function render(state) {
  const appointment = state.appointments.find((a) => a.id === id);
  const occ = appointment ? occurrencesInRange([appointment], state.exceptions, date, date)[0] : null;
  if (!occ) {
    card.classList.add("d-none");
    showAlert(alertBox, "الموعد ده مش موجود في اليوم ده. ممكن يكون اتلغى بالكامل أو اتعدل من يوم قبله.", "warning");
    return;
  }
  hideAlert(alertBox);
  current = occ;
  const d = occ.data;

  document.getElementById("details-children").textContent = childNames(d.childIds, state.children);
  document.getElementById("details-day").textContent = formatDayLong(date);

  const badges = [];
  if (occ.cancelled) badges.push('<span class="badge text-bg-secondary">ملغي اليوم ده</span>');
  if (d.type === "extra") badges.push(`<span class="badge text-bg-warning">${APPOINTMENT_TYPES.extra}</span>`);
  if (appointment.repeatWeekly) badges.push(`<span class="badge text-bg-light"><i class="bi bi-arrow-repeat"></i> كل ${weekdayName(appointment.date)}</span>`);
  if (occ.exception?.overrides && !occ.cancelled) badges.push('<span class="badge text-bg-info">متعدّل اليوم ده</span>');
  document.getElementById("details-badges").innerHTML = badges.join("");

  const rows = [
    ["معاد الذهاب", formatTime(d.startTime)],
    ["معاد الرجوع", d.returnTime ? formatTime(d.returnTime) : "-"],
    ["مكان الاستلام", placeHtml(d.pickup)],
    ["مكان التوصيل", placeHtml(d.dropoff)]
  ];
  if (appointment.repeatWeekly && appointment.repeatUntil) rows.push(["آخر يوم في التكرار", formatDayLong(appointment.repeatUntil)]);
  if (d.notes) rows.push(["ملاحظات", escapeHtml(d.notes)]);
  document.getElementById("details-list").innerHTML = rows.map(([label, value]) => `
    <dt class="col-5 col-sm-3 text-muted fw-normal">${label}</dt>
    <dd class="col-7 col-sm-9">${value}</dd>`).join("");

  card.classList.remove("d-none");

  const newMapKey = JSON.stringify([d.pickup, d.dropoff]);
  if (newMapKey !== mapKey) {
    mapKey = newMapKey;
    if (mapView) mapView.remove();
    mapView = showPlacesMap(document.getElementById("details-map"), [
      d.pickup && { ...d.pickup, label: `الاستلام: ${d.pickup.name}` },
      d.dropoff && { ...d.dropoff, label: `التوصيل: ${d.dropoff.name}` }
    ]);
  }

  actions.classList.toggle("d-none", !canManage);
  editBtn.classList.toggle("d-none", occ.cancelled);
  cancelBtn.classList.toggle("d-none", occ.cancelled);
  restoreBtn.classList.toggle("d-none", !occ.cancelled);
}

function goToForm(scope) {
  location.href = `appointment-form.html?id=${encodeURIComponent(id)}&date=${date}&scope=${scope}`;
}

editBtn.addEventListener("click", async () => {
  if (!current.appointment.repeatWeekly) {
    goToForm("all");
    return;
  }
  const scope = await choiceDialog({
    title: "تعديل موعد متكرر",
    message: `الموعد ده بيتكرر كل ${weekdayName(current.appointment.date)}. عايز التعديل يبقى على أنهي أيام؟`,
    choices: [
      { label: EDIT_SCOPES.this, value: "this", style: "btn-primary" },
      { label: EDIT_SCOPES.future, value: "future", style: "btn-outline-primary" }
    ]
  });
  if (scope) goToForm(scope);
});

cancelBtn.addEventListener("click", async () => {
  const stamp = { updatedBy: user.uid, updatedAt: serverTimestamp() };
  const who = document.getElementById("details-children").textContent;
  const what = `${who}، ${formatDayLong(date)} الساعة ${formatTime(current.data.startTime)}`;
  let scope = "all";

  if (current.appointment.repeatWeekly) {
    scope = await choiceDialog({
      title: "إلغاء موعد متكرر",
      message: `إلغاء موعد ${what}؟`,
      choices: [
        { label: `إلغاء ${EDIT_SCOPES.this}`, value: "this", style: "btn-danger" },
        { label: `إلغاء ${EDIT_SCOPES.future}`, value: "future", style: "btn-outline-danger" }
      ]
    });
    if (!scope) return;
  } else {
    const confirmed = await confirmDialog({
      title: "إلغاء الموعد",
      message: `إلغاء موعد ${what}؟`,
      confirmText: "إلغاء الموعد",
      danger: true
    });
    if (!confirmed) return;
  }

  hideAlert(alertBox);
  try {
    if (scope === "this") {
      await setDoc(exceptionRef, { appointmentId: id, date, cancelled: true, ...stamp }, { merge: true });
    } else if (scope === "future" && date !== current.appointment.date) {
      await updateDoc(appointmentRef, { repeatUntil: addDays(date, -1), ...stamp });
      location.href = `dashboard.html?date=${date}`;
    } else {
      await updateDoc(appointmentRef, { cancelled: true, ...stamp });
      location.href = `dashboard.html?date=${date}`;
    }
  } catch (error) {
    showAlert(alertBox, errorMessage(error));
  }
});

restoreBtn.addEventListener("click", async () => {
  const confirmed = await confirmDialog({
    title: "رجوع الموعد",
    message: `ترجّع موعد ${formatDayLong(date)} تاني؟`,
    confirmText: "رجّعه"
  });
  if (!confirmed) return;
  try {
    await updateDoc(exceptionRef, { cancelled: false, updatedBy: user.uid, updatedAt: serverTimestamp() });
  } catch (error) {
    showAlert(alertBox, errorMessage(error));
  }
});

if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
  showAlert(alertBox, "اللينك ده ناقص. ارجع للتقويم واختار الموعد من هناك.");
  revealPage();
} else {
  let first = true;
  watchFamilyData(familyId, (state) => {
    // الصفحة لازم تبقى ظاهرة قبل رسم الخريطة عشان Leaflet يعرف مقاسها
    if (first) { first = false; revealPage(); }
    render(state);
  }, (error) => {
    showAlert(alertBox, errorMessage(error));
    revealPage();
  });
}
