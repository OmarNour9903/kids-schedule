// تحميل بيانات المستخدم الحالي: حسابه، عضوياته في الأسر (ممكن أكتر من أسرة)، دوره في الأسرة المفتوحة، وهل هو صاحب السيستم (أدمن)
import { auth, db, onAuthStateChanged, signOut, doc, getDoc } from "./firebase.js";
import { isOffline } from "./offline.js";

function waitForUser() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

// بيرجع promise مابتخلصش، عشان الصفحة ماتكملش بعد التحويل
function stop() {
  return new Promise(() => {});
}

export async function checkAdmin(uid) {
  try {
    return (await getDoc(doc(db, "admins", uid))).exists();
  } catch (error) {
    return false;
  }
}

// الأسرة اللي المستخدم فاتحها حالياً بتتحفظ على الجهاز، عشان اللي في أكتر من أسرة (زي سواق شغال مع أسرتين)
const ACTIVE_FAMILY_KEY = "active-family";

function storedFamily() {
  try {
    return localStorage.getItem(ACTIVE_FAMILY_KEY);
  } catch (error) {
    return null;
  }
}

export function rememberFamily(familyId) {
  try {
    localStorage.setItem(ACTIVE_FAMILY_KEY, familyId);
  } catch (error) {
    // التخزين مش متاح: هيفتح على أول أسرة المرة الجاية بس
  }
}

// كل الأسر اللي المستخدم عضو فيها: familyIds (الجديد) + familyId (الحسابات القديمة)
export function familyIdsOf(profile) {
  return [...new Set([...(profile.familyIds || []), profile.familyId].filter(Boolean))];
}

// عضوية المستخدم في أسرة واحدة: { id, member, family } أو سبب إنها مش شغالة
async function loadMembership(uid, familyId) {
  const memberSnap = await getDoc(doc(db, "families", familyId, "members", uid));
  if (!memberSnap.exists()) return { id: familyId, missing: true };

  const member = memberSnap.data();
  if (member.status !== "active") return { id: familyId, member, suspended: true };

  // لو صاحب السيستم وقّف العيلة، قراية بياناتها بتترفض
  let familySnap;
  try {
    familySnap = await getDoc(doc(db, "families", familyId));
  } catch (error) {
    return { id: familyId, member, familySuspended: true };
  }
  if (familySnap.data()?.suspended) return { id: familyId, member, familySuspended: true };

  return { id: familyId, member, family: familySnap.data() };
}

async function loadSession(user) {
  const isAdmin = await checkAdmin(user.uid);
  const profileSnap = await getDoc(doc(db, "users", user.uid));
  if (!profileSnap.exists()) return { user, isAdmin };

  const profile = profileSnap.data();
  if (profile.disabled) return { user, profile, isAdmin, disabled: true };

  const ids = familyIdsOf(profile);
  if (!ids.length) return { user, profile, isAdmin };

  const memberships = await Promise.all(ids.map((id) => loadMembership(user.uid, id)));
  const families = memberships.filter((m) => m.family);

  if (!families.length) {
    const any = memberships.find((m) => m.member);
    if (!any) return { user, profile, isAdmin };
    if (memberships.some((m) => m.suspended)) return { user, profile, member: any.member, isAdmin, suspended: true };
    return { user, profile, member: any.member, isAdmin, familySuspended: true };
  }

  // الأسرة الحالية: من اللينك (?family=)، أو آخر واحدة اتفتحت على الجهاز، أو الأساسية
  const fromUrl = new URLSearchParams(location.search).get("family");
  const active = [fromUrl, storedFamily(), profile.familyId]
    .map((id) => families.find((f) => f.id === id))
    .find(Boolean) || families[0];
  if (fromUrl === active.id) rememberFamily(active.id);

  return {
    user, profile, isAdmin,
    member: active.member,
    familyId: active.id,
    family: active.family,
    families
  };
}

async function leave(error) {
  await signOut(auth);
  location.replace(`index.html?error=${error}`);
  return stop();
}

// كل صفحة جوه السيستم بتبدأ بالدالة دي. roles اختيارية لتحديد مين يدخل الصفحة
export async function requireSession({ roles } = {}) {
  const user = await waitForUser();
  if (!user) {
    location.replace("index.html");
    return stop();
  }

  let session;
  try {
    session = await loadSession(user);
  } catch (error) {
    // أوفلاين ومفيش بيانات متخزنة على الجهاز لسه
    if (isOffline() || error?.code === "unavailable") {
      location.replace("offline.html");
      return stop();
    }
    throw error;
  }

  if (session.disabled) return leave("disabled");
  if (session.familySuspended) return leave("family-suspended");
  if (session.suspended) return leave("suspended");

  if (!session.member) {
    // صاحب السيستم من غير عيلة بيروح على لوحة التحكم
    if (session.isAdmin) {
      location.replace("admin.html");
      return stop();
    }
    return leave("no-family");
  }

  if (roles && !roles.includes(session.member.role)) {
    location.replace("dashboard.html");
    return stop();
  }

  return session;
}

// صفحات صاحب السيستم بس: أي حد تاني بيرجع لصفحته العادية من غير ما يشوف أي حاجة من اللوحة
export async function requireAdmin() {
  const user = await waitForUser();
  if (!user) {
    location.replace("index.html");
    return stop();
  }
  if (!(await checkAdmin(user.uid))) {
    location.replace("dashboard.html");
    return stop();
  }
  return { user };
}

// التنقل لأسرة تانية من الأسر اللي المستخدم عضو فيها
export function switchFamily(session, familyId) {
  const target = session.families.find((f) => f.id === familyId);
  if (!target) return;
  rememberFamily(familyId);
  location.href = target.member.role === "driver" ? "driver.html" : "dashboard.html";
}

export async function logout() {
  await signOut(auth);
  location.replace("index.html");
}
