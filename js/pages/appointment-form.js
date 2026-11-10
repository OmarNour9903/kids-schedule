// إضافة موعد جديد، أو تعديل موعد موجود بنطاق:
// this = اليوم ده بس، future = من اليوم ده ولكل اللي جاي، all = الموعد كله (للموعد اللي مش متكرر)
import {
  db, doc, collection, addDoc, updateDoc, setDoc, writeBatch, serverTimestamp
} from "../firebase.js";
import { requireSession } from "../session.js";
import { renderNav } from "../nav.js";
import { escapeHtml, showAlert, hideAlert, setLoading, confirmDialog, choiceDialog, revealPage } from "../ui.js";
import { loadFamilyData, childNames } from "../data.js";
import { openMapPicker } from "../map-picker.js";
import { findConflicts, exceptionId } from "../schedule.js";
import { todayKey, addDays, daysBetween, formatDayLong, formatTime, weekdayName, timeToMinutes } from "../dates.js";
import { notify } from "../notify.js";
import { APPOINTMENT_TYPES, EDIT_SCOPES, MANAGER_ROLES, errorMessage } from "../strings.js";

const session = await requireSession({ roles: MANAGER_ROLES });
renderNav(session);
const { familyId, user } = session;

const form = document.getElementById("appointment-form");
const alertBox = document.getElementById("form-alert");
const submitBtn = document.getElementById("form-submit");
const childrenBox = document.getElementById("children-options");
const childrenError = document.getElementById("children-error");
const pickupSelect = document.getElementById("pickup");
const dropoffSelect = document.getElementById("dropoff");
const repeatHint = document.getElementById("repeat-hint");

const appointmentsRef = collection(db, "families", familyId, "appointments");
const placesRef = collection(db, "families", familyId, "places");

const params = new URLSearchParams(location.search);
const editId = params.get("id");
const paramDate = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") || "") ? params.get("date") : null;
const scope = editId ? (params.get("scope") || "all") : "new";

const data = await loadFamilyData(familyId);
const original = editId ? data.appointments.find((a) => a.id === editId) : null;

if (editId && (!original || !paramDate || !["this", "future", "all"].includes(scope))) {
  showAlert(alertBox, "الموعد ده مش موجود أو اتمسح.");
  form.classList.add("d-none");
  revealPage();
  throw new Error("appointment not found");
}

// ---------- تجهيز الفورم حسب النوع ----------

const occurrenceDate = paramDate || todayKey();
const exception = editId ? data.exceptions.get(exceptionId(editId, occurrenceDate)) : null;
const initial = original
  ? { ...original, ...(scope === "this" && exception?.overrides ? exception.overrides : {}) }
  : { type: "regular", childIds: [], date: occurrenceDate, startTime: "", returnTime: "", repeatWeekly: false, notes: "" };

const titles = {
  new: ["موعد جديد", "ضيف موعد للأولاد. هتظهرلك رسالة تأكيد قبل الحفظ."],
  all: ["تعديل الموعد", ""],
  this: ["تعديل الموعد", `التعديل هيبقى ${EDIT_SCOPES.this}: ${formatDayLong(occurrenceDate)}. باقي الأسابيع مش هتتغير.`],
  future: ["تعديل الموعد", `التعديل هيبقى ${EDIT_SCOPES.future}، من ${formatDayLong(occurrenceDate)}. الأسابيع اللي فاتت مش هتتغير.`]
};
document.getElementById("form-title").textContent = titles[scope][0];
document.getElementById("form-subtitle").textContent = titles[scope][1];
if (editId) {
  document.getElementById("back-link").href = `appointment.html?id=${encodeURIComponent(editId)}&date=${occurrenceDate}`;
  document.getElementById("back-link").lastChild.textContent = " رجوع للموعد";
}

// التاريخ والتكرار والنوع بيتغيروا في الموعد الجديد أو الموعد الكامل بس
const lockDate = scope === "this" || scope === "future";
document.getElementById("date-field").classList.toggle("d-none", lockDate);
document.getElementById("repeat-field").classList.toggle("d-none", scope !== "new" && scope !== "all");
document.getElementById("type-field").classList.toggle("d-none", scope === "this");

form.date.value = lockDate ? occurrenceDate : initial.date;
form.startTime.value = initial.startTime || "";
form.returnTime.value = initial.returnTime || "";
form.repeatWeekly.checked = Boolean(initial.repeatWeekly);
form.notes.value = initial.notes || "";
form.querySelector(`input[name="type"][value="${["extra", "travel"].includes(initial.type) ? initial.type : "regular"}"]`).checked = true;
form.travelReturnDate.value = initial.travel?.returnDate || "";
form.travelReturnTime.value = initial.travel?.returnTime || "";
form.travelStay.value = initial.travel?.stay || "";

const selectedType = () => form.querySelector('input[name="type"]:checked').value;

function updateRepeatHint() {
  repeatHint.textContent = form.date.value ? `(كل يوم ${weekdayName(form.date.value)})` : "";
}

function updateTravelDays() {
  const el = document.getElementById("travel-days");
  const start = lockDate ? occurrenceDate : form.date.value;
  const end = form.travelReturnDate.value;
  el.textContent = start && end && end >= start ? `مدة السفر: ${daysBetween(start, end) + 1} يوم` : "";
}

// السفر ليه حقول خاصة، ومابيتكررش
function applyTypeUI() {
  const travel = selectedType() === "travel";
  document.getElementById("travel-fields").classList.toggle("d-none", !travel);
  document.getElementById("return-time-field").classList.toggle("d-none", travel);
  document.getElementById("repeat-field").classList.toggle("d-none", travel || (scope !== "new" && scope !== "all"));
  document.getElementById("date-label").textContent = travel ? "يوم السفر" : "التاريخ";
  document.getElementById("start-label").textContent = travel ? "معاد التحرك" : "معاد الذهاب";
  document.getElementById("pickup-label").textContent = travel ? "مكان التحرك" : "مكان الاستلام";
  document.getElementById("dropoff-label").textContent = travel ? "الوجهة" : "مكان التوصيل";
  form.travelReturnDate.required = travel;
  form.travelStay.required = travel;
  updateTravelDays();
}

form.date.addEventListener("change", () => { updateRepeatHint(); updateTravelDays(); });
form.travelReturnDate.addEventListener("change", updateTravelDays);
form.querySelectorAll('input[name="type"]').forEach((r) => r.addEventListener("change", applyTypeUI));
updateRepeatHint();
applyTypeUI();

// ---------- الأولاد ----------

if (!data.children.length) {
  childrenBox.innerHTML = '<div class="text-muted small">لسه مفيش أولاد. <a href="children.html">ضيف الأولاد الأول</a>.</div>';
} else {
  childrenBox.innerHTML = data.children.map((child) => `
    <input type="checkbox" class="btn-check" id="child-${child.id}" value="${child.id}" name="childIds"
      ${(initial.childIds || []).includes(child.id) ? "checked" : ""}>
    <label class="btn btn-outline-primary" for="child-${child.id}">${escapeHtml(child.name)}</label>
  `).join("");
}

// ---------- الأماكن ----------

const MAP_VALUE = "__map";
const placeChoices = { pickup: initial.pickup || null, dropoff: initial.dropoff || null };
const placeById = new Map(data.places.map((p) => [p.id, p]));

function placeValue(place) {
  if (!place) return "";
  return place.placeId && placeById.has(place.placeId) ? `saved:${place.placeId}` : "current";
}

function fillPlaceSelect(select, key) {
  const current = placeChoices[key];
  const options = ['<option value="">اختار...</option>'];
  data.places
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "ar"))
    .forEach((p) => options.push(`<option value="saved:${p.id}">${escapeHtml(p.name)}</option>`));
  if (current && placeValue(current) === "current") {
    options.push(`<option value="current">${escapeHtml(current.name)} (مكان مش محفوظ)</option>`);
  }
  options.push(`<option value="${MAP_VALUE}">+ مكان جديد من الخريطة...</option>`);
  select.innerHTML = options.join("");
  select.value = placeValue(current);
  select.dataset.previous = select.value;
}

async function onPlaceChange(select, key) {
  if (select.value !== MAP_VALUE) {
    if (select.value.startsWith("saved:")) {
      const p = placeById.get(select.value.slice(6));
      placeChoices[key] = { placeId: p.id, name: p.name, lat: p.lat, lng: p.lng };
    } else if (!select.value) {
      placeChoices[key] = null;
    }
    select.dataset.previous = select.value;
    return;
  }

  const result = await openMapPicker();
  if (!result) {
    select.value = select.dataset.previous || "";
    return;
  }

  let placeId = null;
  if (result.save) {
    try {
      const created = await addDoc(placesRef, { name: result.name, lat: result.lat, lng: result.lng, createdAt: serverTimestamp() });
      placeId = created.id;
      const saved = { id: placeId, name: result.name, lat: result.lat, lng: result.lng };
      data.places.push(saved);
      placeById.set(placeId, saved);
    } catch (error) {
      showAlert(alertBox, `المكان ماتحفظش في الأماكن المحفوظة: ${errorMessage(error)}`, "warning");
    }
  }
  placeChoices[key] = { placeId, name: result.name, lat: result.lat, lng: result.lng };
  fillPlaceSelect(pickupSelect, "pickup");
  fillPlaceSelect(dropoffSelect, "dropoff");
}

fillPlaceSelect(pickupSelect, "pickup");
fillPlaceSelect(dropoffSelect, "dropoff");
pickupSelect.addEventListener("change", () => onPlaceChange(pickupSelect, "pickup"));
dropoffSelect.addEventListener("change", () => onPlaceChange(dropoffSelect, "dropoff"));

// ---------- الحفظ ----------

function readForm() {
  const type = selectedType();
  const travel = type === "travel";
  return {
    type,
    childIds: [...form.querySelectorAll('input[name="childIds"]:checked')].map((i) => i.value),
    date: lockDate ? occurrenceDate : form.date.value,
    startTime: form.startTime.value,
    returnTime: travel ? null : (form.returnTime.value || null),
    repeatWeekly: travel ? false : (scope === "new" || scope === "all" ? form.repeatWeekly.checked : Boolean(original?.repeatWeekly)),
    pickup: placeChoices.pickup,
    dropoff: placeChoices.dropoff,
    notes: form.notes.value.trim(),
    travel: travel
      ? { returnDate: form.travelReturnDate.value, returnTime: form.travelReturnTime.value || null, stay: form.travelStay.value.trim() }
      : null
  };
}

// الأخطاء الخاصة لازم تتحدث الأول، وبعدين checkValidity، عشان الغلط اللي اتصلح مايفضلش مانع الحفظ
function validate(values) {
  const badReturn = values.returnTime && values.startTime
    && timeToMinutes(values.returnTime) <= timeToMinutes(values.startTime);
  form.returnTime.setCustomValidity(badReturn ? "before-start" : "");

  const badTravelDate = values.travel && values.travel.returnDate && values.travel.returnDate < values.date;
  form.travelReturnDate.setCustomValidity(badTravelDate ? "before-start" : "");

  pickupSelect.setCustomValidity(values.pickup ? "" : "required");
  dropoffSelect.setCustomValidity(values.dropoff ? "" : "required");

  childrenError.classList.toggle("d-none", values.childIds.length > 0);

  form.classList.add("was-validated");
  return form.checkValidity() && values.childIds.length > 0;
}

function summary(values) {
  const lines = values.travel
    ? [
      `الأولاد: ${childNames(values.childIds, data.children)}`,
      `السفر: ${formatDayLong(values.date)} الساعة ${formatTime(values.startTime)}`,
      `الرجوع المتوقع: ${formatDayLong(values.travel.returnDate)}${values.travel.returnTime ? ` الساعة ${formatTime(values.travel.returnTime)}` : ""} (${daysBetween(values.date, values.travel.returnDate) + 1} يوم)`,
      `من: ${values.pickup.name} ← الوجهة: ${values.dropoff.name}`,
      `المبيت: ${values.travel.stay}`
    ]
    : [
      `الأولاد: ${childNames(values.childIds, data.children)}`,
      `اليوم: ${formatDayLong(values.date)}${values.repeatWeekly ? ` (ويتكرر كل ${weekdayName(values.date)})` : ""}`,
      `الذهاب: ${formatTime(values.startTime)}${values.returnTime ? ` · الرجوع: ${formatTime(values.returnTime)}` : ""}`,
      `من: ${values.pickup.name} ← إلى: ${values.dropoff.name}`
    ];
  if (scope !== "this") lines.unshift(`النوع: ${APPOINTMENT_TYPES[values.type]}`);
  if (scope === "this") lines.push(`\nالتعديل ده ${EDIT_SCOPES.this}.`);
  if (scope === "future") lines.push(`\nالتعديل ده ${EDIT_SCOPES.future}.`);
  return lines.join("\n");
}

function conflictLines(conflicts) {
  const shown = conflicts.slice(0, 5).map((c) => {
    const d = c.occurrence.data;
    const who = childNames(d.childIds, data.children);
    return `• ${formatDayLong(c.date)} ${formatTime(d.startTime)}: ${who}${c.sameChild ? " (نفس الولد)" : ""}`;
  });
  if (conflicts.length > 5) shown.push(`• و${conflicts.length - 5} مواعيد تانية`);
  return shown.join("\n");
}

function ignoreFor(values) {
  if (scope === "new") return () => false;
  if (scope === "this") return (occ) => occ.appointment.id === editId && occ.date === values.date;
  return (occ) => occ.appointment.id === editId;
}

async function askToSave(values) {
  const candidate = { ...values, repeatUntil: scope === "future" ? original.repeatUntil || null : null };
  if (scope === "this") candidate.repeatWeekly = false;
  const conflicts = findConflicts(candidate, data.appointments, data.exceptions, ignoreFor(values));

  if (conflicts.length) {
    const choice = await choiceDialog({
      title: "فيه تعارض مع مواعيد تانية",
      message: `${summary(values)}\n\nالموعد ده بيتعارض مع:\n${conflictLines(conflicts)}`,
      choices: [{ label: "احفظ برضو", value: "save", style: "btn-warning" }]
    });
    return choice === "save";
  }

  return confirmDialog({
    title: scope === "new" ? "تأكيد إضافة الموعد" : "تأكيد تعديل الموعد",
    message: summary(values),
    confirmText: scope === "new" ? "إضافة" : "حفظ التعديل"
  });
}

function appointmentFields(values) {
  return {
    type: values.type,
    childIds: values.childIds,
    startTime: values.startTime,
    returnTime: values.returnTime,
    pickup: values.pickup,
    dropoff: values.dropoff,
    notes: values.notes,
    travel: values.travel
  };
}

async function save(values) {
  const stamp = { updatedBy: user.uid, updatedAt: serverTimestamp() };

  if (scope === "new") {
    const created = await addDoc(appointmentsRef, {
      ...appointmentFields(values),
      date: values.date,
      repeatWeekly: values.repeatWeekly,
      repeatUntil: null,
      cancelled: false,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      ...stamp
    });
    return { id: created.id, date: values.date };
  }

  if (scope === "all") {
    await updateDoc(doc(appointmentsRef, editId), {
      ...appointmentFields(values),
      date: values.date,
      repeatWeekly: values.repeatWeekly,
      ...stamp
    });
    return { id: editId, date: values.date };
  }

  if (scope === "this") {
    const { type, travel, ...overrides } = appointmentFields(values);
    // لو السواق كان أكد أو اعتذر، التعديل بيرجّع الموعد "مجدول" عشان يأكده من جديد
    const resetStatus = ["confirmed", "declined"].includes(exception?.status)
      ? { status: "scheduled", declineReason: null }
      : {};
    await setDoc(doc(db, "families", familyId, "occurrences", exceptionId(editId, occurrenceDate)), {
      appointmentId: editId,
      date: occurrenceDate,
      overrides,
      cancelled: false,
      ...resetStatus,
      ...stamp
    }, { merge: true });
    return { id: editId, date: occurrenceDate };
  }

  // future: لو ده أول يوم في الموعد يبقى بنعدل الموعد كله،
  // غير كده بنقفل الموعد القديم قبل اليوم ده ونبدأ موعد جديد منه
  if (occurrenceDate === original.date) {
    await updateDoc(doc(appointmentsRef, editId), { ...appointmentFields(values), ...stamp });
    return { id: editId, date: occurrenceDate };
  }

  const batch = writeBatch(db);
  const newRef = doc(appointmentsRef);
  batch.update(doc(appointmentsRef, editId), { repeatUntil: addDays(occurrenceDate, -1), ...stamp });
  batch.set(newRef, {
    ...appointmentFields(values),
    date: occurrenceDate,
    repeatWeekly: true,
    repeatUntil: original.repeatUntil || null,
    cancelled: false,
    splitFrom: editId,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    ...stamp
  });
  await batch.commit();
  return { id: newRef.id, date: occurrenceDate };
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideAlert(alertBox);
  const values = readForm();
  if (!validate(values)) return;
  if (!(await askToSave(values))) return;

  setLoading(submitBtn, true, "بيتحفظ...");
  try {
    const result = await save(values);
    const who = childNames(values.childIds, data.children);
    const label = values.travel ? `سفر ${who}` : `موعد ${who}`;
    const when = `${formatDayLong(result.date)} الساعة ${formatTime(values.startTime)}`;
    const text = scope === "new"
      ? `ضاف ${label}: ${when}${values.repeatWeekly ? ` ويتكرر كل ${weekdayName(result.date)}` : ""}`
      : `عدّل ${label} (${EDIT_SCOPES[scope]}): ${when}`;
    await notify(session, { audience: "all", text, appointmentId: result.id, date: result.date });
    location.href = `appointment.html?id=${encodeURIComponent(result.id)}&date=${result.date}`;
  } catch (error) {
    setLoading(submitBtn, false);
    showAlert(alertBox, errorMessage(error));
  }
});

revealPage();
