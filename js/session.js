// تحميل بيانات المستخدم الحالي: حسابه، عضويته في العيلة، دوره، وهل هو صاحب السيستم (أدمن)
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

export async function checkAdmin(uid) {
  try {
    return (await getDoc(doc(db, "admins", uid))).exists();
  } catch (error) {
    return false;
  }
}

async function loadSession(user) {
  const isAdmin = await checkAdmin(user.uid);
  const profileSnap = await getDoc(doc(db, "users", user.uid));
  if (!profileSnap.exists()) return { user, isAdmin };

  const profile = profileSnap.data();
  if (profile.disabled) return { user, profile, isAdmin, disabled: true };

  const familyId = profile.familyId;
  if (!familyId) return { user, profile, isAdmin };

  const memberSnap = await getDoc(doc(db, "families", familyId, "members", user.uid));
  if (!memberSnap.exists()) return { user, profile, isAdmin };

  const member = memberSnap.data();
  if (member.status !== "active") return { user, profile, member, isAdmin, suspended: true };

  // لو صاحب السيستم وقّف العيلة، قراية بياناتها بتترفض
  let familySnap;
  try {
    familySnap = await getDoc(doc(db, "families", familyId));
  } catch (error) {
    return { user, profile, member, isAdmin, familySuspended: true };
  }
  if (familySnap.data()?.suspended) return { user, profile, member, isAdmin, familySuspended: true };

  return { user, profile, member, familyId, family: familySnap.data(), isAdmin };
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

  const session = await loadSession(user);

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

export async function logout() {
  await signOut(auth);
  location.replace("index.html");
}
