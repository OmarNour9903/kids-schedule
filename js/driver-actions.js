// أزرار السواق على المشوار: تأكيد، اعتذار بسبب، وصلت، استلمت، وصّلته.
// كل خطوة بتتسجل بوقتها في statusLog، وبتبعت إشعار لأولياء الأمر.
import { db, doc, setDoc, arrayUnion, serverTimestamp } from "./firebase.js";
import { confirmDialog, promptDialog } from "./ui.js";
import { notify } from "./notify.js";
import { exceptionId } from "./schedule.js";
import { formatDayLong, formatTime } from "./dates.js";
import { TRIP_STATUS } from "./strings.js";

const NEXT = {
  scheduled: [{ to: "confirmed", label: "تأكيد الموعد", icon: "bi-check2", style: "btn-primary" }],
  confirmed: [{ to: "arrived", label: "وصلت", icon: "bi-geo-alt", style: "btn-primary" }],
  arrived: [{ to: "picked", label: "استلمت الولد", icon: "bi-person-check", style: "btn-primary" }],
  picked: [{ to: "done", label: "وصّلته", icon: "bi-flag", style: "btn-success" }]
};

// الاعتذار متاح قبل ما السواق يوصل بس
const CAN_DECLINE = ["scheduled", "confirmed"];

export function driverActionsFor(occ) {
  if (occ.cancelled) return [];
  if (occ.travel && occ.travel.day > 1) return [];
  const actions = [...(NEXT[occ.status] || [])];
  if (CAN_DECLINE.includes(occ.status)) {
    actions.push({ to: "declined", label: "اعتذار", icon: "bi-x-lg", style: "btn-outline-danger" });
  }
  return actions;
}

export function isAssignedTo(occ, uid) {
  const assigned = occ.exception?.driverId;
  return !assigned || assigned === uid;
}

export function actionButtonsHtml(occ) {
  return driverActionsFor(occ).map((a) => `
    <button type="button" class="btn btn-sm ${a.style}" data-driver-action="${a.to}"
      data-id="${encodeURIComponent(occ.appointment.id)}" data-date="${occ.date}">
      <i class="bi ${a.icon}"></i> ${a.label}
    </button>`).join("");
}

// بترجع true لو الحالة اتحفظت
export async function runDriverAction(session, occ, to, who) {
  const { familyId, user, member } = session;
  const when = `${formatDayLong(occ.date)} الساعة ${formatTime(occ.data.startTime)}`;
  let reason = null;

  if (to === "declined") {
    reason = await promptDialog({
      title: "اعتذار عن موعد",
      message: `اعتذار عن مشوار ${who}، ${when}. ولي الأمر هيوصله إشعار بالسبب.`,
      label: "سبب الاعتذار",
      confirmText: "إرسال الاعتذار",
      danger: true
    });
    if (!reason) return false;
  } else {
    const confirmed = await confirmDialog({
      title: TRIP_STATUS[to].label,
      message: `${TRIP_STATUS[to].label}: ${who}، ${when}؟`,
      confirmText: "تأكيد"
    });
    if (!confirmed) return false;
  }

  await setDoc(doc(db, "families", familyId, "occurrences", exceptionId(occ.appointment.id, occ.date)), {
    appointmentId: occ.appointment.id,
    date: occ.date,
    status: to,
    declineReason: reason,
    statusLog: arrayUnion({ status: to, at: new Date().toISOString(), by: user.uid, byName: member.name, reason }),
    updatedBy: user.uid,
    updatedAt: serverTimestamp()
  }, { merge: true });

  const text = to === "declined"
    ? `${member.name} اعتذر عن مشوار ${who} (${when}). السبب: ${reason}`
    : `${member.name}: ${TRIP_STATUS[to].label}، مشوار ${who} (${when})`;
  await notify(session, { audience: "managers", text, appointmentId: occ.appointment.id, date: occ.date });
  return true;
}
