// منطق المواعيد: تحويل الموعد الأصلي (ممكن يكون متكرر) لمواعيد فعلية في أيام محددة،
// مع تطبيق التعديلات والإلغاءات الخاصة بيوم معين، وفحص التعارض.
// الملف ده مش بيستخدم Firebase عشان يبقى سهل نختبره لوحده.
import { addDays, weekdayOf, daysBetween } from "./dates.js";

export function exceptionId(appointmentId, date) {
  return `${appointmentId}_${date}`;
}

// الأيام اللي الموعد بيحصل فيها بين from و to (الاتنين داخلين)
export function isTravel(appointment) {
  return appointment.type === "travel" && Boolean(appointment.travel?.returnDate);
}

export function datesInRange(appointment, from, to) {
  if (appointment.cancelled) return [];
  const start = appointment.date;

  // السفر بيظهر في كل يوم من يوم التحرك لحد يوم الرجوع
  if (isTravel(appointment)) {
    const last = appointment.travel.returnDate < to ? appointment.travel.returnDate : to;
    const dates = [];
    for (let d = start > from ? start : from; d <= last; d = addDays(d, 1)) dates.push(d);
    return dates;
  }

  if (!appointment.repeatWeekly) {
    return start >= from && start <= to ? [start] : [];
  }

  const end = appointment.repeatUntil && appointment.repeatUntil < to ? appointment.repeatUntil : to;
  let first = start > from ? start : from;
  const shift = (weekdayOf(start) - weekdayOf(first) + 7) % 7;
  first = addDays(first, shift);

  const dates = [];
  for (let d = first; d <= end; d = addDays(d, 7)) dates.push(d);
  return dates;
}

// exceptions: Map من exceptionId للتعديل أو الإلغاء الخاص بيوم
export function occurrencesInRange(appointments, exceptions, from, to) {
  const list = [];
  appointments.forEach((appointment) => {
    datesInRange(appointment, from, to).forEach((date) => {
      const exception = exceptions.get(exceptionId(appointment.id, date)) || null;
      const overrides = exception && exception.overrides ? exception.overrides : {};
      const travel = isTravel(appointment)
        ? { day: daysBetween(appointment.date, date) + 1, total: daysBetween(appointment.date, appointment.travel.returnDate) + 1 }
        : null;
      list.push({
        appointment,
        date,
        exception,
        travel,
        status: (exception && exception.status) || "scheduled",
        cancelled: Boolean(exception && exception.cancelled),
        data: { ...appointment, ...overrides, date }
      });
    });
  });
  return list.sort((a, b) =>
    a.date.localeCompare(b.date) || a.data.startTime.localeCompare(b.data.startTime)
  );
}

// المعاد بيبقى مشوار ذهاب (startTime من pickup لـ dropoff)
// ومشوار عودة اختياري (returnTime من dropoff لـ returnPlace، ولو مفيش returnPlace يبقى pickup)
function legTimes(data) {
  return [data.startTime, data.returnTime].filter(Boolean);
}

// التعارض = مشوار في نفس المعاد بالظبط في نفس اليوم.
// السفر بياخد اليوم كله، فأي موعد في أيامه بيتعارض معاه
export function overlaps(a, b) {
  if (a.type === "travel" || b.type === "travel") return true;
  const bTimes = legTimes(b);
  return legTimes(a).some((t) => bTimes.includes(t));
}

// مشاوير اليوم لموعد معين: الذهاب، والعودة لو ليها معاد.
// كل مشوار ليه حالته وسببه والسواق المعيّن ليه
export function legsOf(occ) {
  const d = occ.data;
  const ex = occ.exception || {};
  const go = {
    occ,
    leg: "go",
    time: d.startTime,
    from: d.pickup,
    to: d.dropoff,
    status: ex.status || "scheduled",
    declineReason: ex.declineReason || null,
    driverId: ex.driverId || null
  };
  if (d.type === "travel" || !d.returnTime) return [go];
  return [go, {
    occ,
    leg: "return",
    time: d.returnTime,
    from: d.dropoff,
    to: d.returnPlace || d.pickup,
    status: ex.returnStatus || "scheduled",
    declineReason: ex.returnDeclineReason || null,
    driverId: ex.returnDriverId || null
  }];
}

// كل مشاوير الفترة مترتبة باليوم والمعاد
export function legsInRange(appointments, exceptions, from, to) {
  return occurrencesInRange(appointments, exceptions, from, to)
    .flatMap(legsOf)
    .sort((a, b) => a.occ.date.localeCompare(b.occ.date) || a.time.localeCompare(b.time));
}

// candidate: بيانات الموعد الجديد أو المعدّل (date, startTime, returnTime, childIds, repeatWeekly, repeatUntil)
// ignore: دالة بترجع true للمواعيد اللي مش لازم نقارن بيها (زي الموعد نفسه وهو بيتعدل)
// بيفحص لحد 8 أسابيع قدام لو الموعد متكرر
export function findConflicts(candidate, appointments, exceptions, ignore = () => false) {
  const horizon = candidate.repeatWeekly ? 56 : (isTravel(candidate) ? daysBetween(candidate.date, candidate.travel.returnDate) : 0);
  const candidateDates = datesInRange(
    { ...candidate, id: "__candidate", cancelled: false },
    candidate.date,
    addDays(candidate.date, horizon)
  );
  if (!candidateDates.length) return [];

  const from = candidateDates[0];
  const to = candidateDates[candidateDates.length - 1];
  const existing = occurrencesInRange(appointments, exceptions, from, to)
    .filter((occ) => !occ.cancelled && !ignore(occ));

  const conflicts = [];
  candidateDates.forEach((date) => {
    existing
      .filter((occ) => occ.date === date && overlaps(candidate, occ.data))
      .forEach((occ) => {
        const sharedChildren = (occ.data.childIds || []).filter((id) => (candidate.childIds || []).includes(id));
        conflicts.push({ date, occurrence: occ, sameChild: sharedChildren.length > 0 });
      });
  });
  return conflicts;
}

// أول يوم في الأسبوع اللي بيبدأ من start لكل يوم من الأيام المختارة (0 = الأحد)
export function datesForWeekdays(start, weekdays) {
  return weekdays
    .map((w) => addDays(start, (w - weekdayOf(start) + 7) % 7))
    .sort();
}

// خطة تعديل أو إلغاء كل مواعيد المجموعة من يوم معين (from).
// بترجع لكل موعد: update (يتعدل كله)، split (يتقفل قبل from ويبدأ موعد جديد من nextDate)،
// cut (يتقفل قبل from بس)، أو skip (خلص قبل from، مايتلمسش)
export function planGroupChange(members, from) {
  return members.filter((m) => !m.cancelled).map((m) => {
    if (m.date >= from) return { appointment: m, action: "update" };
    if (!m.repeatWeekly) return { appointment: m, action: "skip" };
    if (m.repeatUntil && m.repeatUntil < from) return { appointment: m, action: "skip" };
    const next = datesInRange(m, from, addDays(from, 6))[0] || null;
    return next
      ? { appointment: m, action: "split", nextDate: next }
      : { appointment: m, action: "cut" };
  });
}

export function isPast(date, today) {
  return daysBetween(today, date) < 0;
}
