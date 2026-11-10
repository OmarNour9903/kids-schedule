// تفاصيل موعد في يوم معين: البيانات، حالة المشوار، أزرار السواق، التعديل والإلغاء، والتعليقات
import {
  db, doc, collection, getDocs, addDoc, deleteDoc, updateDoc, setDoc,
  query, where, onSnapshot, arrayUnion, serverTimestamp
} from "../firebase.js";
import { requireSession } from "../session.js";
import { renderNav } from "../nav.js";
import { escapeHtml, showAlert, hideAlert, confirmDialog, choiceDialog, revealPage } from "../ui.js";
import { watchFamilyData, childNames } from "../data.js";
import { occurrencesInRange, exceptionId } from "../schedule.js";
import { addDays, daysBetween, formatDayLong, formatTime, weekdayName } from "../dates.js";
import { showPlacesMap, mapsLink } from "../map-picker.js";
import { actionButtonsHtml, runDriverAction, isAssignedTo } from "../driver-actions.js";
import { notify } from "../notify.js";
import { APPOINTMENT_TYPES, EDIT_SCOPES, MANAGER_ROLES, TRIP_STATUS, errorMessage } from "../strings.js";

const session = await requireSession();
renderNav(session);
const { familyId, member, user } = session;
const canManage = MANAGER_ROLES.includes(member.role);
const isDriver = member.role === "driver";

const params = new URLSearchParams(location.search);
const id = params.get("id");
const date = params.get("date");

const alertBox = document.getElementById("details-alert");
const card = document.getElementById("details");
const actions = document.getElementById("details-actions");
const cancelBtn = document.getElementById("cancel-btn");
const restoreBtn = document.getElementById("restore-btn");
const editBtn = document.getElementById("edit-btn");
const statusCard = document.getElementById("status-card");
const driverButtons = document.getElementById("driver-buttons");
const assignBtn = document.getElementById("assign-btn");
const commentsCard = document.getElementById("comments-card");
const commentsList = document.getElementById("comments-list");
const commentForm = document.getElementById("comment-form");
const commentInput = document.getElementById("comment-text");
document.getElementById("back-link").href = isDriver
  ? `driver.html?date=${encodeURIComponent(date || "")}`
  : `dashboard.html?date=${encodeURIComponent(date || "")}`;
if (isDriver) document.getElementById("back-link").lastChild.textContent = " رجوع لمشاويري";

const appointmentRef = doc(db, "families", familyId, "appointments", id || "_");
const exceptionRef = doc(db, "families", familyId, "occurrences", exceptionId(id, date));
const commentsRef = collection(db, "families", familyId, "comments");

let current = null;
let children = [];
let mapView = null;
let mapKey = "";

const whoText = () => document.getElementById("details-children").textContent;
const whenText = () => `${formatDayLong(date)} الساعة ${formatTime(current.data.startTime)}`;

function placeHtml(place) {
  if (!place) return "-";
  return `${escapeHtml(place.name)} <a class="small" href="${mapsLink(place)}" target="_blank" rel="noopener">(افتح الخريطة)</a>`;
}

function formatStamp(iso) {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "";
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo", day: "numeric", month: "short", hour: "numeric", minute: "2-digit"
  }).format(value);
}

function renderDetails(appointment, occ) {
  const d = occ.data;
  document.getElementById("details-children").textContent = childNames(d.childIds, children);
  document.getElementById("details-day").textContent = formatDayLong(date);

  const badges = [];
  if (occ.cancelled) badges.push('<span class="badge text-bg-secondary">ملغي اليوم ده</span>');
  if (d.type === "extra") badges.push(`<span class="badge text-bg-warning">${APPOINTMENT_TYPES.extra}</span>`);
  if (d.type === "travel") badges.push(`<span class="badge text-bg-dark">${APPOINTMENT_TYPES.travel}${occ.travel ? `: يوم ${occ.travel.day} من ${occ.travel.total}` : ""}</span>`);
  if (appointment.repeatWeekly) badges.push(`<span class="badge text-bg-light"><i class="bi bi-arrow-repeat"></i> كل ${weekdayName(appointment.date)}</span>`);
  if (occ.exception?.overrides && !occ.cancelled) badges.push('<span class="badge text-bg-info">متعدّل اليوم ده</span>');
  document.getElementById("details-badges").innerHTML = badges.join("");

  const rows = d.type === "travel" && d.travel
    ? [
      ["يوم السفر", `${formatDayLong(appointment.date)} الساعة ${formatTime(d.startTime)}`],
      ["الرجوع المتوقع", `${formatDayLong(d.travel.returnDate)}${d.travel.returnTime ? ` الساعة ${formatTime(d.travel.returnTime)}` : ""}`],
      ["المدة", `${daysBetween(appointment.date, d.travel.returnDate) + 1} يوم`],
      ["مكان التحرك", placeHtml(d.pickup)],
      ["الوجهة", placeHtml(d.dropoff)],
      ["المبيت", escapeHtml(d.travel.stay || "-")]
    ]
    : [
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
      d.pickup && { ...d.pickup, label: `${d.type === "travel" ? "التحرك" : "الاستلام"}: ${d.pickup.name}` },
      d.dropoff && { ...d.dropoff, label: `${d.type === "travel" ? "الوجهة" : "التوصيل"}: ${d.dropoff.name}` }
    ]);
  }

  actions.classList.toggle("d-none", !canManage);
  editBtn.classList.toggle("d-none", occ.cancelled);
  cancelBtn.classList.toggle("d-none", occ.cancelled);
  restoreBtn.classList.toggle("d-none", !occ.cancelled);
}

function renderStatus(occ) {
  statusCard.classList.toggle("d-none", occ.cancelled);
  if (occ.cancelled) return;

  const status = TRIP_STATUS[occ.status];
  const badge = document.getElementById("status-badge");
  badge.className = `badge ${status.badge}`;
  badge.textContent = status.label;

  const declineBox = document.getElementById("decline-box");
  const declined = occ.status === "declined";
  declineBox.classList.toggle("d-none", !declined);
  if (declined) {
    declineBox.innerHTML = `<strong>السواق اعتذر.</strong> السبب: ${escapeHtml(occ.exception?.declineReason || "-")}`
      + (canManage ? "<br>تقدر تعدّل الموعد، أو تلغيه، أو تعيّن سواق تاني." : "");
  }

  driverButtons.innerHTML = isDriver && isAssignedTo(occ, user.uid) ? actionButtonsHtml(occ) : "";
  assignBtn.classList.toggle("d-none", !(canManage && (declined || occ.exception?.driverId)));

  const log = (occ.exception?.statusLog || []).slice().sort((a, b) => a.at.localeCompare(b.at));
  document.getElementById("status-log").innerHTML = log.map((entry) => `
    <li>
      <span class="fw-semibold">${TRIP_STATUS[entry.status]?.label || entry.status}</span>
      · ${escapeHtml(entry.byName || "")} · ${formatStamp(entry.at)}
      ${entry.reason ? `<span class="d-block">${escapeHtml(entry.reason)}</span>` : ""}
    </li>`).join("");
}

function render(state) {
  children = state.children;
  const appointment = state.appointments.find((a) => a.id === id);
  const occ = appointment ? occurrencesInRange([appointment], state.exceptions, date, date)[0] : null;
  if (!occ) {
    card.classList.add("d-none");
    statusCard.classList.add("d-none");
    showAlert(alertBox, "الموعد ده مش موجود في اليوم ده. ممكن يكون اتلغى بالكامل أو اتعدل من يوم قبله.", "warning");
    return;
  }
  hideAlert(alertBox);
  current = occ;
  renderDetails(appointment, occ);
  renderStatus(occ);
  commentsCard.classList.remove("d-none");
}

// ---------- التعديل والإلغاء (أولياء الأمر) ----------

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
  const travel = current.appointment.type === "travel";
  const what = travel
    ? `سفر ${whoText()} (${formatDayLong(current.appointment.date)}، كل أيام السفر)`
    : `${whoText()}، ${whenText()}`;
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
      title: travel ? "إلغاء السفر" : "إلغاء الموعد",
      message: `إلغاء ${travel ? "" : "موعد "}${what}؟`,
      confirmText: travel ? "إلغاء السفر" : "إلغاء الموعد",
      danger: true
    });
    if (!confirmed) return;
  }

  hideAlert(alertBox);
  try {
    const text = `لغى ${travel ? "" : "موعد "}${what}${scope === "this" ? ` (${EDIT_SCOPES.this})` : scope === "future" ? ` (${EDIT_SCOPES.future})` : ""}`;
    if (scope === "this") {
      await setDoc(exceptionRef, { appointmentId: id, date, cancelled: true, ...stamp }, { merge: true });
      await notify(session, { text, appointmentId: id, date });
    } else if (scope === "future" && date !== current.appointment.date) {
      await updateDoc(appointmentRef, { repeatUntil: addDays(date, -1), ...stamp });
      await notify(session, { text, appointmentId: id, date: current.appointment.date });
      location.href = `dashboard.html?date=${date}`;
    } else {
      await updateDoc(appointmentRef, { cancelled: true, ...stamp });
      await notify(session, { text });
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
    await notify(session, { text: `رجّع موعد ${whoText()}، ${whenText()}`, appointmentId: id, date });
  } catch (error) {
    showAlert(alertBox, errorMessage(error));
  }
});

// ---------- السواق ----------

driverButtons.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-driver-action]");
  if (!button || !current) return;
  hideAlert(alertBox);
  button.disabled = true;
  try {
    await runDriverAction(session, current, button.dataset.driverAction, whoText());
  } catch (error) {
    showAlert(alertBox, errorMessage(error));
  }
  button.disabled = false;
});

// ولي الأمر يعيّن سواق للموعد ده (مثلاً بعد اعتذار السواق الأساسي)
assignBtn.addEventListener("click", async () => {
  hideAlert(alertBox);
  let drivers = [];
  try {
    const snapshot = await getDocs(collection(db, "families", familyId, "members"));
    drivers = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((m) => m.role === "driver" && m.status === "active");
  } catch (error) {
    showAlert(alertBox, errorMessage(error));
    return;
  }
  if (!drivers.length) {
    showAlert(alertBox, "مفيش سواق مفعّل دلوقتي. فعّل سواق أو ادعي سواق جديد من صفحة الأعضاء.", "warning");
    return;
  }

  const driverId = await choiceDialog({
    title: "تعيين سواق",
    message: `مين يعمل مشوار ${whoText()}، ${whenText()}؟\nالسواق اللي هتختاره هيوصله إشعار ولازم يأكد الموعد.`,
    choices: drivers.map((dr) => ({ label: dr.name, value: dr.id, style: "btn-outline-primary" }))
  });
  if (!driverId) return;
  const driver = drivers.find((dr) => dr.id === driverId);

  try {
    await setDoc(exceptionRef, {
      appointmentId: id,
      date,
      driverId,
      status: "scheduled",
      declineReason: null,
      statusLog: arrayUnion({
        status: "scheduled", at: new Date().toISOString(), by: user.uid, byName: member.name, reason: `اتعيّن ${driver.name}`
      }),
      updatedBy: user.uid,
      updatedAt: serverTimestamp()
    }, { merge: true });
    await notify(session, {
      audience: [driverId],
      text: `اتعيّنت لمشوار ${whoText()}، ${whenText()}. أكّد الموعد من مشاويرك.`,
      appointmentId: id,
      date
    });
  } catch (error) {
    showAlert(alertBox, errorMessage(error));
  }
});

// ---------- التعليقات ----------

function commentHtml(c) {
  const mine = c.authorId === user.uid;
  return `
    <li class="comment${mine ? " mine" : ""}">
      <div class="d-flex justify-content-between gap-2 small">
        <span class="fw-semibold">${escapeHtml(c.authorName)}</span>
        <span class="text-muted">${formatStamp(c.clientAt)}
          ${mine ? `<button type="button" class="btn btn-link btn-sm p-0 text-danger ms-1" data-delete-comment="${c.id}" aria-label="مسح التعليق"><i class="bi bi-trash"></i></button>` : ""}
        </span>
      </div>
      <div class="text-prewrap">${escapeHtml(c.text)}</div>
    </li>`;
}

let comments = [];

function watchComments() {
  const q = query(commentsRef, where("appointmentId", "==", id), where("date", "==", date));
  onSnapshot(q, (snapshot) => {
    comments = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.clientAt || "").localeCompare(b.clientAt || ""));
    commentsList.innerHTML = comments.length
      ? comments.map(commentHtml).join("")
      : '<li class="text-muted small">مفيش تعليقات لسه.</li>';
  }, (error) => showAlert(alertBox, errorMessage(error)));
}

commentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = commentInput.value.trim();
  if (!text) return;
  const submit = document.getElementById("comment-submit");
  submit.disabled = true;
  try {
    await addDoc(commentsRef, {
      appointmentId: id,
      date,
      text,
      authorId: user.uid,
      authorName: member.name,
      clientAt: new Date().toISOString(),
      createdAt: serverTimestamp()
    });
    commentInput.value = "";
    await notify(session, { text: `علّق على موعد ${whoText()} (${formatDayLong(date)}): ${text}`, appointmentId: id, date });
  } catch (error) {
    showAlert(alertBox, errorMessage(error));
  }
  submit.disabled = false;
});

commentsList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-comment]");
  if (!button) return;
  const confirmed = await confirmDialog({ title: "مسح تعليق", message: "تمسح التعليق ده؟", confirmText: "مسح", danger: true });
  if (!confirmed) return;
  try {
    await deleteDoc(doc(commentsRef, button.dataset.deleteComment));
  } catch (error) {
    showAlert(alertBox, errorMessage(error));
  }
});

// ---------- التشغيل ----------

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
  watchComments();
}
