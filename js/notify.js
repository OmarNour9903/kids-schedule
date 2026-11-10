// الإشعارات جوه السيستم: كل إشعار بيتكتب في users/{uid}/notifications لكل عضو يهمه.
// الإشعار مش بيوقف العملية الأساسية: لو فشل، العملية نفسها بتفضل ناجحة.
import { db, collection, doc, getDocs, writeBatch, serverTimestamp } from "./firebase.js";
import { MANAGER_ROLES } from "./strings.js";

let membersCache = null;

async function activeMembers(familyId) {
  if (!membersCache) {
    const snapshot = await getDocs(collection(db, "families", familyId, "members"));
    membersCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => m.status === "active");
  }
  return membersCache;
}

// audience: "all" = كل الأعضاء، "managers" = أولياء الأمر بس، أو array فيها uids معينة
export async function notify(session, { audience = "all", text, appointmentId = null, date = null }) {
  try {
    const { familyId, user, member } = session;
    const members = await activeMembers(familyId);
    const recipients = members.filter((m) => {
      if (m.id === user.uid) return false;
      if (Array.isArray(audience)) return audience.includes(m.id);
      if (audience === "managers") return MANAGER_ROLES.includes(m.role);
      return true;
    });
    if (!recipients.length) return;

    const batch = writeBatch(db);
    recipients.forEach((m) => {
      batch.set(doc(collection(db, "users", m.id, "notifications")), {
        familyId,
        actorId: user.uid,
        actorName: member.name,
        text,
        appointmentId,
        date,
        read: false,
        createdAt: serverTimestamp()
      });
    });
    await batch.commit();
  } catch (error) {
    console.warn("notification not sent", error);
  }
}
