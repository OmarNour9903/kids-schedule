// إضافة موعد جديد، أو تعديل موعد موجود بنطاق:
// this = اليوم ده بس، future = من اليوم ده ولكل اللي جاي، all = الموعد كله (للموعد اللي مش متكرر)،
// group = كل مواعيد المجموعة (اللي اتعملت مع بعض لأكتر من يوم) من اليوم ده
import {
  db, doc, collection, addDoc, updateDoc, setDoc, writeBatch, serverTimestamp
} from "../firebase.js";
import { requireSession } from "../session.js";
import { renderNav } from "../nav.js";
import { escapeHtml, showAlert, hideAlert, setLoading, confirmDialog, choiceDialog, revealPage } from "../ui.js";
import { loadFamilyData, childNames } from "../data.js";
import { openMapPicker } from "../map-picker.js";
import { findConflicts, exceptionId, datesForWeekdays, planGroupChange } from "../schedule.js";
import { todayKey, addDays, daysBetween, formatDayLong, formatTime, weekdayName, weekdayOf, timeToMinutes, WEEKDAYS } from "../dates.js";
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
// الأولاد والأماكن الممسوحة مابتظهرش في الاختيارات
const activeChildren = data.children.filter((c) => !c.deleted);
data.places = data.places.filter((p) => !p.deleted);
const groupMembers = original?.groupId ? data.appointments.filter((a) => a.groupId === original.groupId) : [];

if (editId && (!original || !paramDate || !["this", "future", "all", "group"].includes(scope) || (scope === "group" && !original.groupId))) {
  showAlert(alertBox, "الموعد ده مش موجود أو اتمسح.");
  form.classList.add("d-none");
  revealPage();
  await new Promise(() => {}); // نوقف الصفحة هنا من غير خطأ
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
  future: ["تعديل الموعد", `التعديل هيبقى ${EDIT_SCOPES.future}، من ${formatDayLong(occurrenceDate)}. الأسابيع اللي فاتت مش هتتغير.`],
  group: ["تعديل كل أيام المجموعة", `التعديل هيتطبق على كل الأيام اللي اتعملت مع الموعد ده، من ${formatDayLong(occurrenceDate)}. كل يوم هيفضل في يومه، والأسابيع اللي فاتت مش هتتغير.`]
};
document.getElementById("form-title").textContent = titles[scope][0];
document.getElementById("form-subtitle").textContent = titles[scope][1];
if (editId) {
  document.getElementById("back-link").href = `appointment.html?id=${encodeURIComponent(editId)}&date=${occurrenceDate}`;
  document.getElementById("back-link").lastChild.textContent = " رجوع للموعد";
}

// التاريخ والتكرار والنوع بيتغيروا في الموعد الجديد أو الموعد الكامل بس
const lockDate = scope === "this" || scope === "future" || scope === "group";
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

// أيام الأسبوع (للموعد الجديد بس): الأسبوع بيبدأ السبت
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];
document.getElementById("weekday-options").innerHTML = WEEK_ORDER.map((d) => `
  <input type="checkbox" class="btn-check" id="weekday-${d}" value="${d}" name="weekdays">
  <label class="btn btn-sm btn-outline-primary" for="weekday-${d}">${WEEKDAYS[d]}</label>`).join("");
const selectedWeekdays = () => [...form.querySelectorAll('input[name="weekdays"]:checked')].map((i) => Number(i.value));
function checkDateWeekday() {
  if (form.date.value) form.querySelector(`#weekday-${weekdayOf(form.date.value)}`).checked = true;
}
checkDateWeekday();

function updateRepeatHint() {
  const days = scope === "new" && selectedType() !== "travel" ? selectedWeekdays() : [];
  if (days.length > 1) repeatHint.textContent = "(كل يوم من الأيام المختارة)";
  else repeatHint.textContent = form.date.value ? `(كل يوم ${weekdayName(form.date.value)})` : "";
}
document.getElementById("weekday-options").addEventListener("change", updateRepeatHint);

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
  document.getElementById("weekday-field").classList.toggle("d-none", travel || scope !== "new");
  document.getElementById("date-label").textContent = travel ? "يوم السفر" : "التاريخ";
  document.getElementById("start-label").textContent = travel ? "معاد التحرك" : "معاد الذهاب";
  document.getElementById("pickup-label").textContent = travel ? "مكان التحرك" : "مكان الاستلام";
  document.getElementById("dropoff-label").textContent = travel ? "الوجهة" : "مكان التوصيل";
  form.travelReturnDate.required = travel;
  form.travelStay.required = travel;
  updateTravelDays();
}

form.date.addEventListener("change", () => { checkDateWeekday(); updateRepeatHint(); updateTravelDays(); });
form.travelReturnDate.addEventListener("change", updateTravelDays);
form.querySelectorAll('input[name="type"]').forEach((r) => r.addEventListener("change", applyTypeUI));
updateRepeatHint();
applyTypeUI();

// ---------- الأولاد ----------

if (!activeChildren.length) {
  childrenBox.innerHTML = '<div class="text-muted small">لسه مفيش أولاد. <a href="children.html">ضيف الأولاد الأول</a>.</div>';
} else {
  childrenBox.innerHTML = activeChildren.map((child) => `
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
      placeChoices[key] = { placeId: p.id, name: p.name, lat: p.lat ?? null, lng: p.lng ?? null, mapsUrl: p.mapsUrl || null };
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
      const created = await addDoc(placesRef, { name: result.name, lat: result.lat, lng: result.lng, mapsUrl: result.mapsUrl, deleted: false, createdAt: serverTimestamp() });
      placeId = created.id;
      const saved = { id: placeId, name: result.name, lat: result.lat, lng: result.lng, mapsUrl: result.mapsUrl };
      data.places.push(saved);
      placeById.set(placeId, saved);
    } catch (error) {
      showAlert(alertBox, `المكان ماتحفظش في الأماكن المحفوظة: ${errorMessage(error)}`, "warning");
    }
  }
  placeChoices[key] = { placeId, name: result.name, lat: result.lat, lng: result.lng, mapsUrl: result.mapsUrl };
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
  const date = lockDate ? occurrenceDate : form.date.value;
  const dates = scope === "new" && !travel && date ? datesForWeekdays(date, selectedWeekdays()) : [date];
  return {
    type,
    childIds: [...form.querySelectorAll('input[name="childIds"]:checked')].map((i) => i.value),
    date: dates[0] || date,
    dates,
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
  const noDays = scope === "new" && !values.travel && values.dates.length === 0;
  document.getElementById("weekday-error").classList.toggle("d-none", !noDays);

  form.classList.add("was-validated");
  return form.checkValidity() && values.childIds.length > 0 && !noDays;
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
      values.dates.length > 1
        ? `الأيام: ${values.dates.map(formatDayLong).join("، ")}${values.repeatWeekly ? " (وكل يوم يتكرر كل أسبوع)" : ""}`
        : `اليوم: ${formatDayLong(values.date)}${values.repeatWeekly ? ` (ويتكرر كل ${weekdayName(values.date)})` : ""}`,
      `الذهاب: ${formatTime(values.startTime)}${values.returnTime ? ` · الرجوع: ${formatTime(values.returnTime)}` : ""}`,
      `من: ${values.pickup.name} ← إلى: ${values.dropoff.name}`
    ];
  if (scope !== "this") lines.unshift(`النوع: ${APPOINTMENT_TYPES[values.type]}`);
  if (scope === "this") lines.push(`\nالتعديل ده ${EDIT_SCOPES.this}.`);
  if (scope === "future") lines.push(`\nالتعديل ده ${EDIT_SCOPES.future}.`);
  if (scope === "group") lines.push(`\nالتعديل ده على ${EDIT_SCOPES.group} (${groupMembers.filter((m) => !m.cancelled).length} مواعيد).`);
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
  if (scope === "group") return (occ) => occ.appointment.groupId === original.groupId;
  return (occ) => occ.appointment.id === editId;
}

// المواعيد اللي هتتحفظ فعلاً، عشان نفحص التعارض لكل واحد فيها
function candidatesFor(values) {
  if (scope === "group") {
    return planGroupChange(groupMembers, occurrenceDate)
      .filter((p) => p.action === "update" || p.action === "split")
      .map((p) => ({
        ...values,
        date: p.action === "split" ? p.nextDate : p.appointment.date,
        repeatWeekly: p.appointment.repeatWeekly,
        repeatUntil: p.appointment.repeatUntil || null
      }));
  }
  const repeatUntil = scope === "future" ? original.repeatUntil || null : null;
  return values.dates.map((date) => ({
    ...values,
    date,
    repeatUntil,
    repeatWeekly: scope === "this" ? false : values.repeatWeekly
  }));
}

async function askToSave(values) {
  const conflicts = candidatesFor(values)
    .flatMap((candidate) => findConflicts(candidate, data.appointments, data.exceptions, ignoreFor(values)))
    .sort((a, b) => a.date.localeCompare(b.date));

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
    // يوم واحد = موعد واحد، أكتر من يوم = موعد لكل يوم مربوطين بـ groupId
    const batch = writeBatch(db);
    const refs = values.dates.map(() => doc(appointmentsRef));
    const groupId = refs.length > 1 ? refs[0].id : null;
    refs.forEach((ref, i) => {
      batch.set(ref, {
        ...appointmentFields(values),
        date: values.dates[i],
        repeatWeekly: values.repeatWeekly,
        repeatUntil: null,
        cancelled: false,
        groupId,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        ...stamp
      });
    });
    await batch.commit();
    return { id: refs[0].id, date: values.dates[0] };
  }

  if (scope === "group") {
    const batch = writeBatch(db);
    let opened = { id: editId, date: occurrenceDate };
    planGroupChange(groupMembers, occurrenceDate).forEach((p) => {
      const ref = doc(appointmentsRef, p.appointment.id);
      if (p.action === "update") {
        batch.update(ref, { ...appointmentFields(values), ...stamp });
      } else if (p.action === "split" || p.action === "cut") {
        batch.update(ref, { repeatUntil: addDays(occurrenceDate, -1), ...stamp });
      }
      if (p.action === "split") {
        const newRef = doc(appointmentsRef);
        batch.set(newRef, {
          ...appointmentFields(values),
          date: p.nextDate,
          repeatWeekly: true,
          repeatUntil: p.appointment.repeatUntil || null,
          cancelled: false,
          groupId: original.groupId,
          splitFrom: p.appointment.id,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          ...stamp
        });
        if (p.appointment.id === editId) opened = { id: newRef.id, date: p.nextDate };
      }
    });
    await batch.commit();
    return opened;
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
    groupId: original.groupId || null,
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
    const days = values.dates.length > 1 ? values.dates.map((d) => weekdayName(d)).join(" و") : formatDayLong(result.date);
    const when = `${days} الساعة ${formatTime(values.startTime)}`;
    const text = scope === "new"
      ? `ضاف ${label}: ${when}${values.repeatWeekly ? " ويتكرر كل أسبوع" : ""}`
      : `عدّل ${label} (${EDIT_SCOPES[scope]}): ${formatDayLong(result.date)} الساعة ${formatTime(values.startTime)}`;
    await notify(session, { audience: "all", text, appointmentId: result.id, date: result.date });
    location.href = `appointment.html?id=${encodeURIComponent(result.id)}&date=${result.date}`;
  } catch (error) {
    setLoading(submitBtn, false);
    showAlert(alertBox, errorMessage(error));
  }
});

revealPage();
