// أزرار السواق على كل مشوار (ذهاب أو عودة): تأكيد، اعتذار بسبب، وصلت، استلمت، وصّلته.
// كل مشوار ليه حالته لوحده، وكل خطوة بتتسجل بوقتها في statusLog، وبتبعت إشعار لأولياء الأمر.
import { db, doc, setDoc, arrayUnion, serverTimestamp } from "./firebase.js";
import { confirmDialog, promptDialog } from "./ui.js";
import { notify } from "./notify.js";
import { exceptionId } from "./schedule.js";
import { formatDayLong, formatTime } from "./dates.js";
import { TRIP_STATUS, LEG_LABELS } from "./strings.js";

const NEXT = {
  scheduled: [{ to: "confirmed", label: "تأكيد", icon: "bi-check2", style: "btn-primary" }],
  confirmed: [{ to: "arrived", label: "وصلت", icon: "bi-geo-alt", style: "btn-primary" }],
  arrived: [{ to: "picked", label: "استلمت الولد", icon: "bi-person-check", style: "btn-primary" }],
  picked: [{ to: "done", label: "وصّلته", icon: "bi-flag", style: "btn-success" }]
};

// الاعتذار متاح قبل ما السواق يوصل بس
const CAN_DECLINE = ["scheduled", "confirmed"];

// أسماء الحقول في الـ occurrence لكل مشوار
const FIELDS = {
  go: { status: "status", reason: "declineReason" },
  return: { status: "returnStatus", reason: "returnDeclineReason" }
};

export function driverActionsFor(leg) {
  if (leg.occ.cancelled) return [];
  if (leg.occ.travel && leg.occ.travel.day > 1) return [];
  const actions = [...(NEXT[leg.status] || [])];
  if (CAN_DECLINE.includes(leg.status)) {
    actions.push({ to: "declined", label: "اعتذار", icon: "bi-x-lg", style: "btn-outline-danger" });
  }
  return actions;
}

export function isAssignedTo(leg, uid) {
  return !leg.driverId || leg.driverId === uid;
}

export function actionButtonsHtml(leg) {
  return driverActionsFor(leg).map((a) => `
    <button type="button" class="btn btn-sm ${a.style}" data-driver-action="${a.to}" data-leg="${leg.leg}"
      data-id="${encodeURIComponent(leg.occ.appointment.id)}" data-date="${leg.occ.date}">
      <i class="bi ${a.icon}"></i> ${a.label}
    </button>`).join("");
}

// بترجع true لو الحالة اتحفظت
export async function runDriverAction(session, leg, to, who) {
  const { familyId, user, member } = session;
  const { occ } = leg;
  const legName = LEG_LABELS[leg.leg];
  const when = `${legName} ${formatDayLong(occ.date)} الساعة ${formatTime(leg.time)}`;
  let reason = null;

  if (to === "declined") {
    reason = await promptDialog({
      title: `اعتذار عن مشوار ${legName}`,
      message: `اعتذار عن مشوار ${who}، ${when}. ولي الأمر هيوصله إشعار بالسبب.`,
      label: "سبب الاعتذار",
      confirmText: "إرسال الاعتذار",
      danger: true
    });
    if (!reason) return false;
  } else {
    const confirmed = await confirmDialog({
      title: `${TRIP_STATUS[to].label} (${legName})`,
      message: `${TRIP_STATUS[to].label}: ${who}، ${when}؟`,
      confirmText: "تأكيد"
    });
    if (!confirmed) return false;
  }

  const f = FIELDS[leg.leg];
  await setDoc(doc(db, "families", familyId, "occurrences", exceptionId(occ.appointment.id, occ.date)), {
    appointmentId: occ.appointment.id,
    date: occ.date,
    [f.status]: to,
    [f.reason]: reason,
    statusLog: arrayUnion({ leg: leg.leg, status: to, at: new Date().toISOString(), by: user.uid, byName: member.name, reason }),
    updatedBy: user.uid,
    updatedAt: serverTimestamp()
  }, { merge: true });

  const text = to === "declined"
    ? `${member.name} اعتذر عن مشوار ${who} (${when}). السبب: ${reason}`
    : `${member.name}: ${TRIP_STATUS[to].label}، مشوار ${who} (${when})`;
  await notify(session, { audience: "managers", text, appointmentId: occ.appointment.id, date: occ.date });
  return true;
}
