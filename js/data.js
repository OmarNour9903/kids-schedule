// قراءة بيانات العيلة: الأولاد، الأماكن، المواعيد، والتعديلات الخاصة بأيام معينة
import { db, collection, onSnapshot, getDocs } from "./firebase.js";
import { exceptionId } from "./schedule.js";

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

// متابعة لحظية: أي تغيير من أي حد بيظهر على طول
export function watchFamilyData(familyId, onChange, onError) {
  const state = { children: [], places: [], appointments: [], exceptions: new Map() };
  const loaded = new Set();
  const emit = (key) => {
    loaded.add(key);
    if (loaded.size === 4) onChange(state);
  };

  const unsubscribers = [
    onSnapshot(ref(familyId, "children"), (s) => { state.children = toList(s); emit("children"); }, onError),
    onSnapshot(ref(familyId, "places"), (s) => { state.places = toList(s); emit("places"); }, onError),
    onSnapshot(ref(familyId, "appointments"), (s) => { state.appointments = toList(s); emit("appointments"); }, onError),
    onSnapshot(ref(familyId, "occurrences"), (s) => { state.exceptions = toExceptionMap(toList(s)); emit("occurrences"); }, onError)
  ];
  return () => unsubscribers.forEach((u) => u());
}

export function childNames(childIds, children) {
  const byId = new Map(children.map((c) => [c.id, c.name]));
  return (childIds || []).map((id) => byId.get(id) || "ولد اتمسح").join(" و");
}
