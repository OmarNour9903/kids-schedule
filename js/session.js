// تحميل بيانات المستخدم الحالي: حسابه، عضويته في العيلة، دوره
import { auth, db, onAuthStateChanged, signOut, doc, getDoc } from "./firebase.js";

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

async function loadSession(user) {
  const profileSnap = await getDoc(doc(db, "users", user.uid));
  if (!profileSnap.exists()) return { user };

  const profile = profileSnap.data();
  const familyId = profile.familyId;
  const memberSnap = await getDoc(doc(db, "families", familyId, "members", user.uid));
  if (!memberSnap.exists()) return { user, profile };

  const member = memberSnap.data();
  if (member.status !== "active") return { user, profile, member, suspended: true };

  const familySnap = await getDoc(doc(db, "families", familyId));
  return { user, profile, member, familyId, family: familySnap.data() };
}

// كل صفحة جوه السيستم بتبدأ بالدالة دي. roles اختيارية لتحديد مين يدخل الصفحة
export async function requireSession({ roles } = {}) {
  const user = await waitForUser();
  if (!user) {
    location.replace("index.html");
    return stop();
  }

  const session = await loadSession(user);

  if (!session.member) {
    await signOut(auth);
    location.replace("index.html?error=no-family");
    return stop();
  }

  if (session.suspended) {
    await signOut(auth);
    location.replace("index.html?error=suspended");
    return stop();
  }

  if (roles && !roles.includes(session.member.role)) {
    location.replace("dashboard.html");
    return stop();
  }

  return session;
}

export async function logout() {
  await signOut(auth);
  location.replace("index.html");
}
