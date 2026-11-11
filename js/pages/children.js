import { db, doc, collection, addDoc, updateDoc, onSnapshot, serverTimestamp } from "../firebase.js";
import { requireSession } from "../session.js";
import { renderNav } from "../nav.js";
import { escapeHtml, showAlert, hideAlert, setLoading, confirmDialog, revealPage } from "../ui.js";
import { MANAGER_ROLES, errorMessage } from "../strings.js";

const session = await requireSession({ roles: MANAGER_ROLES });
renderNav(session);
const { familyId, user } = session;

const form = document.getElementById("child-form");
const formTitle = document.getElementById("child-form-title");
const submitBtn = document.getElementById("child-submit");
const cancelEditBtn = document.getElementById("child-cancel-edit");
const list = document.getElementById("children-list");
const alertBox = document.getElementById("children-alert");
const childrenRef = collection(db, "families", familyId, "children");

let children = [];
let editingId = null;

function itemHtml(child) {
  const details = [child.birthYear ? `مواليد ${child.birthYear}` : "", child.notes || ""].filter(Boolean).join(" · ");
  return `
    <li class="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2">
      <div>
        <div class="fw-semibold">${escapeHtml(child.name)}</div>
        ${details ? `<div class="small text-muted">${escapeHtml(details)}</div>` : ""}
      </div>
      <div class="d-flex gap-2">
        <button type="button" class="btn btn-sm btn-outline-primary" data-action="edit" data-id="${child.id}">تعديل</button>
        <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${child.id}">مسح</button>
      </div>
    </li>`;
}

onSnapshot(childrenRef, (snapshot) => {
  children = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => !c.deleted);
  children.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  list.innerHTML = children.length
    ? children.map(itemHtml).join("")
    : '<li class="list-group-item text-muted">لسه مفيش أولاد. ضيف أول ولد من فوق.</li>';
}, (error) => showAlert(alertBox, errorMessage(error)));

function resetForm() {
  editingId = null;
  form.reset();
  form.classList.remove("was-validated");
  formTitle.textContent = "إضافة ولد";
  submitBtn.textContent = "إضافة";
  cancelEditBtn.classList.add("d-none");
}

cancelEditBtn.addEventListener("click", resetForm);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideAlert(alertBox);
  if (!form.checkValidity()) {
    form.classList.add("was-validated");
    return;
  }

  const data = {
    name: form.name.value.trim(),
    birthYear: form.birthYear.value ? Number(form.birthYear.value) : null,
    notes: form.notes.value.trim()
  };

  const confirmed = await confirmDialog({
    title: editingId ? "تعديل بيانات ولد" : "إضافة ولد",
    message: editingId ? `حفظ التعديل على بيانات ${data.name}؟` : `إضافة ${data.name}؟`,
    confirmText: editingId ? "حفظ" : "إضافة"
  });
  if (!confirmed) return;

  setLoading(submitBtn, true);
  try {
    if (editingId) {
      await updateDoc(doc(childrenRef, editingId), { ...data, updatedAt: serverTimestamp() });
    } else {
      await addDoc(childrenRef, { ...data, deleted: false, createdAt: serverTimestamp() });
    }
    setLoading(submitBtn, false);
    resetForm();
  } catch (error) {
    setLoading(submitBtn, false);
    showAlert(alertBox, errorMessage(error));
  }
});

list.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const child = children.find((c) => c.id === button.dataset.id);
  if (!child) return;

  if (button.dataset.action === "edit") {
    editingId = child.id;
    form.name.value = child.name;
    form.birthYear.value = child.birthYear || "";
    form.notes.value = child.notes || "";
    formTitle.textContent = `تعديل: ${child.name}`;
    submitBtn.textContent = "حفظ";
    cancelEditBtn.classList.remove("d-none");
    form.scrollIntoView({ behavior: "smooth" });
    return;
  }

  const confirmed = await confirmDialog({
    title: "مسح ولد",
    message: `مسح ${child.name}؟ مش هيظهر في اختيار الأولاد في المواعيد الجديدة، والمواعيد القديمة هتفضل باسمه. صاحب السيستم يقدر يرجّعه لو اتمسح بالغلط.`,
    confirmText: "مسح",
    danger: true
  });
  if (!confirmed) return;
  try {
    await updateDoc(doc(childrenRef, child.id), { deleted: true, deletedAt: serverTimestamp(), deletedBy: user.uid });
  } catch (error) {
    showAlert(alertBox, errorMessage(error));
  }
});

revealPage();
