// التسجيل بطريقتين:
// 1. بلينك دعوة (signup.html?invite=CODE): بينضم للعيلة بالدور اللي في الدعوة.
//    لو عنده حساب ومسجل دخول، بينضم بنفس الحساب (الحساب الواحد ممكن يبقى في أكتر من أسرة، زي سواق شغال مع أسرتين)
// 2. من غير دعوة: بيعمل عيلة جديدة ويبقى المالك
import {
  auth, db, isConfigured, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, updateProfile, deleteUser,
  doc, collection, getDoc, writeBatch, serverTimestamp, arrayUnion
} from "../firebase.js";
import { familyIdsOf, rememberFamily } from "../session.js";
import { escapeHtml, showAlert, hideAlert, setLoading } from "../ui.js";
import { ROLE_LABELS, errorMessage } from "../strings.js";
import { APP_VERSION } from "../whats-new.js";

const form = document.getElementById("signup-form");
const alertBox = document.getElementById("signup-alert");
const intro = document.getElementById("signup-intro");
const familyField = document.getElementById("family-name-field");
const submitBtn = document.getElementById("signup-submit");
const joinBox = document.getElementById("join-existing");
const joinText = document.getElementById("join-existing-text");
const joinBtn = document.getElementById("join-submit");
const haveAccount = document.getElementById("have-account");

const inviteCode = new URLSearchParams(location.search).get("invite");
let invite = null;

async function init() {
  if (!isConfigured) {
    showAlert(alertBox, "لسه إعدادات Firebase مش متحطة في js/firebase-config.js", "warning");
  }

  if (!inviteCode) {
    familyField.classList.remove("d-none");
    form.familyName.required = true;
    intro.textContent = "هتعمل عيلة جديدة، وهتبقى إنت ولي الأمر المالك اللي بيدعي باقي الأعضاء.";
    form.classList.remove("d-none");
    return;
  }

  try {
    const snap = await getDoc(doc(db, "invites", inviteCode));
    const data = snap.exists() ? snap.data() : null;
    const expired = data && data.expiresAt.toDate() < new Date();

    if (!data || data.usedBy || expired) {
      showAlert(alertBox, "لينك الدعوة ده مش شغال: يا اتستخدم قبل كده، يا انتهت صلاحيته. اطلب لينك جديد من ولي الأمر.");
      return;
    }

    invite = data;
    intro.innerHTML = `اتدعيت تنضم لـ <strong>${escapeHtml(data.familyName)}</strong> كـ <strong>${ROLE_LABELS[data.role]}</strong>.`;

    const current = await currentUser();
    if (current) {
      joinText.innerHTML = `إنت داخل بحساب <strong dir="ltr">${escapeHtml(current.email || "")}</strong>. هتنضم للأسرة دي بنفس الحساب، وهتقدر تتنقل بين أسرك من القايمة.`;
      joinBox.classList.remove("d-none");
      return;
    }
    document.getElementById("login-with-invite").href = `index.html?invite=${encodeURIComponent(inviteCode)}`;
    haveAccount.classList.remove("d-none");
    form.classList.remove("d-none");
  } catch (error) {
    showAlert(alertBox, errorMessage(error));
  }
}

function currentUser() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

// الحساب موجود: نضيفه عضو في الأسرة الجديدة ونزود الأسرة في familyIds بتاعته
async function joinWithExistingAccount() {
  hideAlert(alertBox);
  setLoading(joinBtn, true);
  try {
    const uid = auth.currentUser.uid;
    const profileSnap = await getDoc(doc(db, "users", uid));
    if (!profileSnap.exists()) throw { code: "no-profile" };
    const profile = profileSnap.data();

    const memberSnap = await getDoc(doc(db, "families", invite.familyId, "members", uid));
    if (memberSnap.exists()) {
      showAlert(alertBox, "إنت عضو في الأسرة دي بالفعل. لو عضويتك موقوفة، كلّم ولي الأمر.", "warning");
      setLoading(joinBtn, false);
      return;
    }

    const person = { name: profile.name || "", email: profile.email || "", phone: profile.phone || "" };
    const batch = writeBatch(db);
    batch.set(doc(db, "families", invite.familyId, "members", uid), {
      ...person, role: invite.role, status: "active", inviteCode, joinedAt: serverTimestamp()
    });
    batch.update(doc(db, "users", uid), { familyIds: arrayUnion(...familyIdsOf(profile), invite.familyId) });
    batch.update(doc(db, "invites", inviteCode), { usedBy: uid, usedAt: serverTimestamp() });
    await batch.commit();

    rememberFamily(invite.familyId);
    location.replace(invite.role === "driver" ? "driver.html" : "dashboard.html");
  } catch (error) {
    showAlert(alertBox, error?.code === "no-profile"
      ? "الحساب ده مش مكتمل. سجّل خروج واعمل حساب جديد باللينك."
      : errorMessage(error));
    setLoading(joinBtn, false);
  }
}

joinBtn.addEventListener("click", joinWithExistingAccount);
document.getElementById("join-logout").addEventListener("click", async () => {
  await signOut(auth);
  location.reload();
});

function buildNewFamilyBatch(uid, person, familyName) {
  const batch = writeBatch(db);
  const familyRef = doc(collection(db, "families"));

  batch.set(familyRef, { name: familyName, ownerId: uid, createdAt: serverTimestamp() });
  batch.set(doc(db, "families", familyRef.id, "members", uid), {
    ...person, role: "owner", status: "active", joinedAt: serverTimestamp()
  });
  batch.set(doc(db, "users", uid), { ...person, familyId: familyRef.id, familyIds: [familyRef.id], seenVersion: APP_VERSION, createdAt: serverTimestamp() });
  return batch;
}

function buildInviteBatch(uid, person) {
  const batch = writeBatch(db);

  batch.set(doc(db, "families", invite.familyId, "members", uid), {
    ...person, role: invite.role, status: "active", inviteCode, joinedAt: serverTimestamp()
  });
  batch.set(doc(db, "users", uid), { ...person, familyId: invite.familyId, familyIds: [invite.familyId], seenVersion: APP_VERSION, createdAt: serverTimestamp() });
  batch.update(doc(db, "invites", inviteCode), { usedBy: uid, usedAt: serverTimestamp() });
  return batch;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideAlert(alertBox);

  if (form.password.value !== form.passwordConfirm.value) {
    form.passwordConfirm.setCustomValidity("mismatch");
  } else {
    form.passwordConfirm.setCustomValidity("");
  }

  if (!form.checkValidity()) {
    form.classList.add("was-validated");
    return;
  }

  const person = {
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim()
  };

  setLoading(submitBtn, true);
  let createdUser = null;

  try {
    const credential = await createUserWithEmailAndPassword(auth, person.email, form.password.value);
    createdUser = credential.user;
    await updateProfile(createdUser, { displayName: person.name });

    const batch = invite
      ? buildInviteBatch(createdUser.uid, person)
      : buildNewFamilyBatch(createdUser.uid, person, form.familyName.value.trim());
    await batch.commit();

    location.replace("dashboard.html");
  } catch (error) {
    // لو الحساب اتعمل بس الربط بالعيلة فشل، نمسح الحساب عشان مايفضلش معلق
    if (createdUser) {
      try { await deleteUser(createdUser); } catch (cleanupError) { /* مفيش حاجة نعملها */ }
    }
    showAlert(alertBox, error?.code === "auth/email-already-in-use" && invite
      ? "الإيميل ده عنده حساب قبل كده. سجّل دخول بيه من اللينك اللي فوق، وهتنضم للأسرة بنفس الحساب."
      : errorMessage(error));
    setLoading(submitBtn, false);
  }
});

init();
