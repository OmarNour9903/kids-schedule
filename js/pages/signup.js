// التسجيل بطريقتين:
// 1. بلينك دعوة (signup.html?invite=CODE): بينضم للعيلة بالدور اللي في الدعوة
// 2. من غير دعوة: بيعمل عيلة جديدة ويبقى المالك
import {
  auth, db, isConfigured,
  createUserWithEmailAndPassword, updateProfile, deleteUser,
  doc, collection, getDoc, writeBatch, serverTimestamp
} from "../firebase.js";
import { escapeHtml, showAlert, hideAlert, setLoading } from "../ui.js";
import { ROLE_LABELS, errorMessage } from "../strings.js";

const form = document.getElementById("signup-form");
const alertBox = document.getElementById("signup-alert");
const intro = document.getElementById("signup-intro");
const familyField = document.getElementById("family-name-field");
const submitBtn = document.getElementById("signup-submit");

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
    form.classList.remove("d-none");
  } catch (error) {
    showAlert(alertBox, errorMessage(error));
  }
}

function buildNewFamilyBatch(uid, person, familyName) {
  const batch = writeBatch(db);
  const familyRef = doc(collection(db, "families"));

  batch.set(familyRef, { name: familyName, ownerId: uid, createdAt: serverTimestamp() });
  batch.set(doc(db, "families", familyRef.id, "members", uid), {
    ...person, role: "owner", status: "active", joinedAt: serverTimestamp()
  });
  batch.set(doc(db, "users", uid), { ...person, familyId: familyRef.id, createdAt: serverTimestamp() });
  return batch;
}

function buildInviteBatch(uid, person) {
  const batch = writeBatch(db);

  batch.set(doc(db, "families", invite.familyId, "members", uid), {
    ...person, role: invite.role, status: "active", inviteCode, joinedAt: serverTimestamp()
  });
  batch.set(doc(db, "users", uid), { ...person, familyId: invite.familyId, createdAt: serverTimestamp() });
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
    showAlert(alertBox, errorMessage(error));
    setLoading(submitBtn, false);
  }
});

init();
