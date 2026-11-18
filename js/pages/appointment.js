// تفاصيل موعد في يوم معين: البيانات، حالة المشوار، أزرار السواق، التعديل والإلغاء، والتعليقات
import {
  db, doc, collection, getDocs, addDoc, updateDoc, setDoc, writeBatch,
  query, where, onSnapshot, arrayUnion, serverTimestamp
} from "../firebase.js";
import { requireSession } from "../session.js";
import { renderNav } from "../nav.js";
import { escapeHtml, showAlert, hideAlert, confirmDialog, choiceDialog, revealPage, pendingBadge } from "../ui.js";
import { watchFamilyData, childNames, isLegPending, legStatusLabel } from "../data.js";
import { isPendingDoc } from "../offline.js";
import { occurrencesInRange, exceptionId, planGroupChange, legsOf } from "../schedule.js";
import { addDays, daysBetween, formatDayLong, formatTime, weekdayName } from "../dates.js";
import { mapsLink } from "../map-picker.js";
import { actionButtonsHtml, runDriverAction, isAssignedTo } from "../driver-actions.js";
import { notify } from "../notify.js";
import { APPOINTMENT_TYPES, EDIT_SCOPES, MANAGER_ROLES, TRIP_STATUS, LEG_LABELS, errorMessage, statusText } from "../strings.js";

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
const legsStatus = document.getElementById("legs-status");
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
let currentLegs = [];
let children = [];
let groupMembers = [];

const whoText = () => document.getElementById("details-children").textContent;
const whenText = () => `${formatDayLong(date)} الساعة ${formatTime(current.data.startTime)}`;

function placeHtml(place) {
  if (!place) return "-";
  const link = mapsLink(place);
  if (!link) return escapeHtml(place.name);
  return `${escapeHtml(place.name)} <a class="small" href="${escapeHtml(link)}" target="_blank" rel="noopener">(افتح الخريطة)</a>`;
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
  if (groupMembers.length > 1) badges.push(`<span class="badge text-bg-light"><i class="bi bi-collection"></i> ضمن مجموعة ${groupMembers.length} أيام</span>`);
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
      ["الذهاب", `الساعة ${formatTime(d.startTime)}: ${placeHtml(d.pickup)} ← ${placeHtml(d.dropoff)}`],
      ["العودة", d.returnTime
        ? `الساعة ${formatTime(d.returnTime)}: ${placeHtml(d.dropoff)} ← ${placeHtml(d.returnPlace || d.pickup)}`
        : "من غير عودة"]
    ];
  if (appointment.repeatWeekly && appointment.repeatUntil) rows.push(["آخر يوم في التكرار", formatDayLong(appointment.repeatUntil)]);
  if (d.notes) rows.push(["ملاحظات", escapeHtml(d.notes)]);
  document.getElementById("details-list").innerHTML = rows.map(([label, value]) => `
    <dt class="col-5 col-sm-3 text-muted fw-normal">${label}</dt>
    <dd class="col-7 col-sm-9">${value}</dd>`).join("");

  card.classList.remove("d-none");

  actions.classList.toggle("d-none", !canManage);
  editBtn.classList.toggle("d-none", occ.cancelled);
  cancelBtn.classList.toggle("d-none", occ.cancelled);
  restoreBtn.classList.toggle("d-none", !occ.cancelled);
}

// حالة كل مشوار (ذهاب وعودة) لوحده: الحالة، سبب الاعتذار، أزرار السواق، وتعيين سواق
function legStatusHtml(leg) {
  const status = TRIP_STATUS[leg.status];
  const declined = leg.status === "declined";
  const title = leg.occ.data.type === "travel" ? APPOINTMENT_TYPES.travel : LEG_LABELS[leg.leg];
  const canAssign = canManage && (declined || leg.driverId);
  return `
    <div class="leg-status">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-1">
        <span class="fw-semibold">${title} <bdi>${formatTime(leg.time)}</bdi></span>
        <span class="d-flex flex-wrap gap-1">${isLegPending(leg, familyState) ? pendingBadge() : ""}<span class="badge ${status.badge}">${escapeHtml(legStatusLabel(leg, familyState))}</span></span>
      </div>
      <div class="small text-muted mb-2">${escapeHtml(leg.from?.name || "")} ← ${escapeHtml(leg.to?.name || "")}${leg.driverId ? ` · السواق: ${escapeHtml(driverName(leg.driverId))}` : ""}</div>
      ${declined ? `<div class="alert alert-danger py-2 mb-2"><strong>السواق اعتذر.</strong> السبب: ${escapeHtml(leg.declineReason || "-")}${canManage ? "<br>تقدر تعدّل الموعد، أو تلغيه، أو تعيّن سواق تاني للمشوار ده." : ""}</div>` : ""}
      <div class="d-flex flex-wrap gap-2">
        ${isDriver && isAssignedTo(leg, user.uid) ? actionButtonsHtml(leg, whoText()) : ""}
        ${canAssign ? `<button type="button" class="btn btn-sm btn-outline-primary" data-assign-leg="${leg.leg}"><i class="bi bi-person-gear"></i> تعيين سواق للمشوار ده</button>` : ""}
      </div>
    </div>`;
}

let driverNames = new Map();
const driverName = (uid) => driverNames.get(uid) || "سواق";

function renderStatus(occ) {
  statusCard.classList.toggle("d-none", occ.cancelled);
  if (occ.cancelled) return;
  currentLegs = legsOf(occ);
  legsStatus.innerHTML = currentLegs.map(legStatusHtml).join("");

  const log = (occ.exception?.statusLog || []).slice().sort((a, b) => a.at.localeCompare(b.at));
  document.getElementById("status-log").innerHTML = log.map((entry) => `
    <li>
      ${entry.leg && currentLegs.length > 1 ? `<span class="badge text-bg-light">${LEG_LABELS[entry.leg]}</span>` : ""}
      ${["confirmed", "arrived", "declined"].includes(entry.status) && entry.byName
        ? `<span class="fw-semibold">${escapeHtml(statusText(entry.status, { by: entry.byName }))}</span>`
        : `<span class="fw-semibold">${escapeHtml(statusText(entry.status, { kids: entry.status === "picked" ? whoText() : "" }))}</span>
      · ${escapeHtml(entry.byName || "")}`} · ${formatStamp(entry.at)}
      ${entry.reason ? `<span class="d-block">${escapeHtml(entry.reason)}</span>` : ""}
    </li>`).join("");
}

let familyState = {};

function render(state) {
  familyState = state;
  children = state.children;
  const appointment = state.appointments.find((a) => a.id === id);
  groupMembers = appointment?.groupId
    ? state.appointments.filter((a) => a.groupId === appointment.groupId && !a.cancelled)
    : [];
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

const inGroup = () => groupMembers.length > 1;
const groupDays = () => groupMembers.map((m) => weekdayName(m.date)).join(" و");

editBtn.addEventListener("click", async () => {
  const repeating = current.appointment.repeatWeekly;
  if (!repeating && !inGroup()) {
    goToForm("all");
    return;
  }
  const choices = repeating
    ? [
      { label: EDIT_SCOPES.this, value: "this", style: "btn-primary" },
      { label: EDIT_SCOPES.future, value: "future", style: "btn-outline-primary" }
    ]
    : [{ label: "الموعد ده بس", value: "all", style: "btn-primary" }];
  if (inGroup()) choices.push({ label: `${EDIT_SCOPES.group} (${groupDays()})`, value: "group", style: "btn-outline-primary" });

  const scope = await choiceDialog({
    title: "تعديل الموعد",
    message: repeating
      ? `الموعد ده بيتكرر كل ${weekdayName(current.appointment.date)}${inGroup() ? `، ومعموله مع أيام تانية (${groupDays()})` : ""}. عايز التعديل يبقى على أنهي أيام؟`
      : `الموعد ده معموله مع أيام تانية (${groupDays()}). عايز تعدّل أنهي؟`,
    choices
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

  if (current.appointment.repeatWeekly || inGroup()) {
    const choices = current.appointment.repeatWeekly
      ? [
        { label: `إلغاء ${EDIT_SCOPES.this}`, value: "this", style: "btn-danger" },
        { label: `إلغاء ${EDIT_SCOPES.future}`, value: "future", style: "btn-outline-danger" }
      ]
      : [{ label: "إلغاء الموعد ده بس", value: "all", style: "btn-danger" }];
    if (inGroup()) choices.push({ label: `إلغاء ${EDIT_SCOPES.group} (${groupDays()})`, value: "group", style: "btn-outline-danger" });
    scope = await choiceDialog({
      title: "إلغاء موعد",
      message: `إلغاء موعد ${what}؟`,
      choices
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
    const text = `لغى ${travel ? "" : "موعد "}${what}${["this", "future", "group"].includes(scope) ? ` (${EDIT_SCOPES[scope]})` : ""}`;
    // repeatUntilBefore و endedByCancel بيخلّوا صاحب السيستم يقدر يرجّع الإلغاء
    const cutAt = (a) => ({ repeatUntil: addDays(date, -1), repeatUntilBefore: a.repeatUntil || null, endedByCancel: true, ...stamp });
    if (scope === "group") {
      const batch = writeBatch(db);
      planGroupChange(groupMembers, date).forEach((p) => {
        const ref = doc(db, "families", familyId, "appointments", p.appointment.id);
        if (p.action === "update") batch.update(ref, { cancelled: true, ...stamp });
        else if (p.action === "split" || p.action === "cut") batch.update(ref, cutAt(p.appointment));
      });
      await batch.commit();
      await notify(session, { text });
      location.href = `dashboard.html?date=${date}`;
    } else if (scope === "this") {
      await setDoc(exceptionRef, { appointmentId: id, date, cancelled: true, ...stamp }, { merge: true });
      await notify(session, { text, appointmentId: id, date });
    } else if (scope === "future" && date !== current.appointment.date) {
      await updateDoc(appointmentRef, cutAt(current.appointment));
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

const LEG_FIELDS = {
  go: { driver: "driverId", status: "status", reason: "declineReason" },
  return: { driver: "returnDriverId", status: "returnStatus", reason: "returnDeclineReason" }
};

legsStatus.addEventListener("click", async (event) => {
  const actionBtn = event.target.closest("[data-driver-action]");
  const assignBtn = event.target.closest("[data-assign-leg]");
  if (!current || (!actionBtn && !assignBtn)) return;
  hideAlert(alertBox);

  if (actionBtn) {
    const leg = currentLegs.find((l) => l.leg === actionBtn.dataset.leg);
    actionBtn.disabled = true;
    try {
      await runDriverAction(session, leg, actionBtn.dataset.driverAction, whoText());
    } catch (error) {
      showAlert(alertBox, errorMessage(error));
    }
    actionBtn.disabled = false;
    return;
  }

  // ولي الأمر يعيّن سواق لمشوار معين (مثلاً بعد اعتذار السواق الأساسي)
  const leg = currentLegs.find((l) => l.leg === assignBtn.dataset.assignLeg);
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

  const legText = `${LEG_LABELS[leg.leg]} ${whoText()}، ${formatDayLong(date)} الساعة ${formatTime(leg.time)}`;
  const driverId = await choiceDialog({
    title: "تعيين سواق",
    message: `مين يعمل مشوار ${legText}؟\nالسواق اللي هتختاره هيوصله إشعار ولازم يأكد المشوار.`,
    choices: drivers.map((dr) => ({ label: dr.name, value: dr.id, style: "btn-outline-primary" }))
  });
  if (!driverId) return;
  const driver = drivers.find((dr) => dr.id === driverId);
  const f = LEG_FIELDS[leg.leg];

  try {
    await setDoc(exceptionRef, {
      appointmentId: id,
      date,
      [f.driver]: driverId,
      [f.status]: "scheduled",
      [f.reason]: null,
      statusLog: arrayUnion({
        leg: leg.leg, status: "scheduled", at: new Date().toISOString(), by: user.uid, byName: member.name, reason: `اتعيّن ${driver.name}`
      }),
      updatedBy: user.uid,
      updatedAt: serverTimestamp()
    }, { merge: true });
    await notify(session, {
      audience: [driverId],
      text: `اتعيّنت لمشوار ${legText}. أكّد المشوار من مشاويرك.`,
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
        <span class="text-muted">${c.pending ? pendingBadge() : ""} ${formatStamp(c.clientAt)}
          ${mine ? `<button type="button" class="btn btn-link btn-sm p-0 text-danger ms-1" data-delete-comment="${c.id}" aria-label="مسح التعليق"><i class="bi bi-trash"></i></button>` : ""}
        </span>
      </div>
      <div class="text-prewrap">${escapeHtml(c.text)}</div>
    </li>`;
}

let comments = [];

function watchComments() {
  const q = query(commentsRef, where("appointmentId", "==", id), where("date", "==", date));
  onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
    comments = snapshot.docs.map((d) => ({ id: d.id, ...d.data(), pending: isPendingDoc(d) }))
      .filter((c) => !c.deleted)
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
      deleted: false,
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
    await updateDoc(doc(commentsRef, button.dataset.deleteComment), {
      deleted: true, deletedAt: serverTimestamp(), deletedBy: user.uid
    });
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
  // أسماء السواقين عشان نكتب مين المعيّن لكل مشوار
  getDocs(collection(db, "families", familyId, "members")).then((snapshot) => {
    driverNames = new Map(snapshot.docs.map((d) => [d.id, d.data().name]));
    if (current) renderStatus(current);
  }).catch(() => {});
}
