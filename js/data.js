// قراءة بيانات العيلة: الأولاد، الأماكن، المواعيد، والتعديلات الخاصة بأيام معينة
import { db, collection, onSnapshot, getDocs } from "./firebase.js";
import { exceptionId } from "./schedule.js";
import { isPendingDoc } from "./offline.js";
import { statusText } from "./strings.js";

const ref = (familyId, name) => collection(db, "families", familyId, name);
const toList = (snapshot) => snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

function toExceptionMap(list) {
  return new Map(list.map((e) => [exceptionId(e.appointmentId, e.date), e]));
}

export async function loadFamilyData(familyId) {
  const [children, places, appointments, exceptions] = await Promise.all(
    ["children", "places", "appointments", "occurrences"].map((name) => getDocs(ref(familyId, name)))
  );
  return {
    children: toList(children),
    places: toList(places),
    appointments: toList(appointments),
    exceptions: toExceptionMap(toList(exceptions))
  };
}

const pendingIds = (snapshot) => new Set(snapshot.docs.filter(isPendingDoc).map((d) => d.id));

// متابعة لحظية: أي تغيير من أي حد بيظهر على طول.
// pending فيها المواعيد والأيام اللي اتعدلت على الجهاز ولسه ماتبعتتش (أوفلاين)
export function watchFamilyData(familyId, onChange, onError) {
  const state = {
    children: [], places: [], appointments: [], exceptions: new Map(),
    pending: { appointments: new Set(), occurrences: new Set() }
  };
  const loaded = new Set();
  const emit = (key) => {
    loaded.add(key);
    if (loaded.size === 4) onChange(state);
  };

  const unsubscribers = [
    onSnapshot(ref(familyId, "children"), (s) => { state.children = toList(s); emit("children"); }, onError),
    onSnapshot(ref(familyId, "places"), (s) => { state.places = toList(s); emit("places"); }, onError),
    onSnapshot(ref(familyId, "appointments"), { includeMetadataChanges: true }, (s) => {
      state.appointments = toList(s);
      state.pending.appointments = pendingIds(s);
      emit("appointments");
    }, onError),
    onSnapshot(ref(familyId, "occurrences"), { includeMetadataChanges: true }, (s) => {
      state.exceptions = toExceptionMap(toList(s));
      state.pending.occurrences = pendingIds(s);
      emit("occurrences");
    }, onError)
  ];
  return () => unsubscribers.forEach((u) => u());
}

// المشوار ده فيه تعديل لسه ماتبعتش؟
export function isLegPending(leg, state) {
  if (!state.pending) return false;
  if (state.pending.appointments.has(leg.occ.appointment.id)) return true;
  if (!state.pending.occurrences.has(exceptionId(leg.occ.appointment.id, leg.occ.date))) return false;
  // اليوم فيه تعديل مستني: لو آخر حاجة اتعملت حالة مشوار معين، نعلّم المشوار ده بس
  const last = (leg.occ.exception?.statusLog || []).reduce((a, b) => (!a || b.at > a.at ? b : a), null);
  return !last?.leg || last.leg === leg.leg;
}

export function childNames(childIds, children) {
  const byId = new Map(children.map((c) => [c.id, c.name]));
  return (childIds || []).map((id) => byId.get(id) || "ولد اتمسح").join(" و");
}

// اسم اللي عمل آخر خطوة بالحالة دي على المشوار ده، من statusLog
// (التسجيلات القديمة اللي من غير leg بتتحسب على الذهاب)
function actorName(leg, status) {
  const entry = (leg.occ.exception?.statusLog || [])
    .filter((e) => (e.leg || "go") === leg.leg && e.status === status)
    .reduce((a, b) => (!a || b.at > a.at ? b : a), null);
  return entry?.byName || "";
}

// نص حالة المشوار بالأسماء: "مؤكد من أحمد"، "تم استلام يوسف"
export function legStatusLabel(leg, state) {
  return statusText(leg.status, {
    by: actorName(leg, leg.status),
    kids: (leg.occ.data.childIds || []).length ? childNames(leg.occ.data.childIds, state.children || []) : ""
  });
}
