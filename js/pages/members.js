// إدارة الأعضاء: المالك يدعي ويغير الأدوار ويوقف/يفعّل،
// وولي الأمر يوقف/يفعّل السواقين بس
import {
  db, doc, collection, setDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, serverTimestamp, Timestamp
} from "../firebase.js";
import { requireSession } from "../session.js";
import { renderNav } from "../nav.js";
import { escapeHtml, showAlert, hideAlert, setLoading, confirmDialog, formatDate, revealPage } from "../ui.js";
import { ROLE_LABELS, STATUS_LABELS, INVITABLE_ROLES, INVITE_DAYS_VALID, errorMessage } from "../strings.js";

const session = await requireSession({ roles: ["owner", "parent"] });
renderNav(session);

const { user, member: me, familyId, family } = session;
const isOwner = me.role === "owner";

const membersList = document.getElementById("members-list");
const membersAlert = document.getElementById("members-alert");
const inviteSection = document.getElementById("invite-section");
const inviteForm = document.getElementById("invite-form");
const inviteSubmit = document.getElementById("invite-submit");
const inviteResult = document.getElementById("invite-result");
const inviteLinkInput = document.getElementById("invite-link");
const inviteWhatsapp = document.getElementById("invite-whatsapp");
const invitesList = document.getElementById("invites-list");
const invitesAlert = document.getElementById("invites-alert");

let membersById = new Map();

// ---------- الأعضاء ----------

function canChangeStatus(target) {
  if (target.id === user.uid || target.role === "owner") return false;
  return isOwner || target.role === "driver";
}

function roleSelectHtml(target) {
  const options = INVITABLE_ROLES.map((role) =>
    `<option value="${role}"${role === target.role ? " selected" : ""}>${ROLE_LABELS[role]}</option>`
  ).join("");
  return `<select class="form-select form-select-sm member-role-select" data-action="role" data-id="${target.id}" aria-label="تغيير الدور">${options}</select>`;
}

function memberItemHtml(target) {
  const isMe = target.id === user.uid;
  const suspended = target.status === "suspended";
  const showRoleSelect = isOwner && !isMe && target.role !== "owner";
  const statusBadge = suspended ? "text-bg-secondary" : "text-bg-success";

  const roleControl = showRoleSelect
    ? roleSelectHtml(target)
    : `<span class="badge text-bg-primary">${ROLE_LABELS[target.role]}</span>`;

  const statusButton = canChangeStatus(target)
    ? `<button type="button" class="btn btn-sm ${suspended ? "btn-outline-success" : "btn-outline-danger"}"
         data-action="status" data-id="${target.id}">${suspended ? "تفعيل" : "إيقاف"}</button>`
    : "";

  return `
    <li class="list-group-item${suspended ? " member-suspended" : ""}">
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div>
          <div class="fw-semibold">
            ${escapeHtml(target.name)}${isMe ? ' <span class="text-muted small">(إنت)</span>' : ""}
          </div>
          <div class="small text-muted" dir="ltr">${escapeHtml(target.email)}${target.phone ? " · " + escapeHtml(target.phone) : ""}</div>
        </div>
        <div class="d-flex flex-wrap align-items-center gap-2">
          ${roleControl}
          <span class="badge ${statusBadge}">${STATUS_LABELS[target.status]}</span>
          ${statusButton}
        </div>
      </div>
    </li>`;
}

const ROLE_ORDER = { owner: 0, parent: 1, driver: 2, viewer: 3 };

onSnapshot(collection(db, "families", familyId, "members"), (snapshot) => {
  const members = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  members.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name, "ar"));
  membersById = new Map(members.map((m) => [m.id, m]));
  membersList.innerHTML = members.map(memberItemHtml).join("");
}, (error) => showAlert(membersAlert, errorMessage(error)));

membersList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action='status']");
  if (!button) return;
  const target = membersById.get(button.dataset.id);
  if (!target) return;

  const suspending = target.status === "active";
  const confirmed = await confirmDialog({
    title: suspending ? "إيقاف عضو" : "تفعيل عضو",
    message: suspending
      ? `إيقاف ${target.name}؟ مش هيقدر يدخل السيستم لحد ما يتفعّل تاني، وكل بياناته ومشاويره القديمة هتفضل محفوظة.`
      : `تفعيل ${target.name}؟ هيقدر يدخل السيستم تاني بنفس دوره (${ROLE_LABELS[target.role]}).`,
    confirmText: suspending ? "إيقاف" : "تفعيل",
    danger: suspending
  });
  if (!confirmed) return;

  hideAlert(membersAlert);
  try {
    await updateDoc(doc(db, "families", familyId, "members", target.id), {
      status: suspending ? "suspended" : "active",
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    showAlert(membersAlert, errorMessage(error));
  }
});

membersList.addEventListener("change", async (event) => {
  const select = event.target.closest("[data-action='role']");
  if (!select) return;
  const target = membersById.get(select.dataset.id);
  if (!target) return;

  const newRole = select.value;
  const confirmed = await confirmDialog({
    title: "تغيير الدور",
    message: `تغيير دور ${target.name} من "${ROLE_LABELS[target.role]}" لـ "${ROLE_LABELS[newRole]}"؟`
  });
  if (!confirmed) {
    select.value = target.role;
    return;
  }

  hideAlert(membersAlert);
  try {
    await updateDoc(doc(db, "families", familyId, "members", target.id), {
      role: newRole,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    select.value = target.role;
    showAlert(membersAlert, errorMessage(error));
  }
});

// ---------- الدعوات (للمالك بس) ----------

function randomCode() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function inviteLink(code) {
  const base = location.href.replace(/[^/]*$/, "");
  return `${base}signup.html?invite=${code}`;
}

function showInviteLink(code, role) {
  const link = inviteLink(code);
  inviteLinkInput.value = link;
  const text = `اتدعيت تنضم لـ ${family.name} كـ ${ROLE_LABELS[role]} في سيستم مواعيد الأولاد. سجّل من هنا:\n${link}`;
  inviteWhatsapp.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  inviteResult.classList.remove("d-none");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    return false;
  }
}

function inviteItemHtml(invite) {
  const expires = invite.expiresAt.toDate();
  const expired = expires < new Date();
  const expiryText = expired
    ? '<span class="badge text-bg-secondary">منتهية</span>'
    : `<span class="small text-muted">صالحة لحد ${formatDate(expires)}</span>`;

  return `
    <li class="list-group-item d-flex flex-wrap align-items-center justify-content-between gap-2">
      <div>
        <span class="badge text-bg-primary">${ROLE_LABELS[invite.role]}</span>
        ${expiryText}
      </div>
      <div class="d-flex gap-2">
        ${expired ? "" : `<button type="button" class="btn btn-sm btn-outline-primary" data-action="copy" data-code="${invite.id}">نسخ اللينك</button>`}
        <button type="button" class="btn btn-sm btn-outline-danger" data-action="revoke" data-code="${invite.id}">إلغاء</button>
      </div>
    </li>`;
}

if (isOwner) {
  inviteSection.classList.remove("d-none");

  const invitesQuery = query(
    collection(db, "invites"),
    where("familyId", "==", familyId),
    where("usedBy", "==", null)
  );

  onSnapshot(invitesQuery, (snapshot) => {
    const invites = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    invites.sort((a, b) => b.expiresAt.toMillis() - a.expiresAt.toMillis());
    invitesList.innerHTML = invites.length
      ? invites.map(inviteItemHtml).join("")
      : '<li class="list-group-item text-muted small">مفيش دعوات لسه ماتستخدمتش</li>';
  }, (error) => showAlert(invitesAlert, errorMessage(error)));

  inviteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideAlert(invitesAlert);
    const role = inviteForm.role.value;
    const code = randomCode();
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + INVITE_DAYS_VALID * 24 * 60 * 60 * 1000));

    setLoading(inviteSubmit, true);
    try {
      await setDoc(doc(db, "invites", code), {
        familyId,
        familyName: family.name,
        role,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        expiresAt,
        usedBy: null
      });
      showInviteLink(code, role);
    } catch (error) {
      showAlert(invitesAlert, errorMessage(error));
    }
    setLoading(inviteSubmit, false);
  });

  document.getElementById("invite-copy").addEventListener("click", async () => {
    const copied = await copyText(inviteLinkInput.value);
    if (!copied) inviteLinkInput.select();
    showAlert(invitesAlert, copied ? "اللينك اتنسخ" : "انسخ اللينك يدوي من الخانة", copied ? "success" : "warning");
  });

  invitesList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const code = button.dataset.code;
    hideAlert(invitesAlert);

    if (button.dataset.action === "copy") {
      const copied = await copyText(inviteLink(code));
      showAlert(invitesAlert, copied ? "اللينك اتنسخ" : "النسخ مش متاح في المتصفح ده", copied ? "success" : "warning");
      return;
    }

    const confirmed = await confirmDialog({
      title: "إلغاء الدعوة",
      message: "إلغاء الدعوة دي؟ اللينك مش هيشتغل تاني لو حد حاول يسجل بيه.",
      confirmText: "إلغاء الدعوة",
      danger: true
    });
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "invites", code));
    } catch (error) {
      showAlert(invitesAlert, errorMessage(error));
    }
  });
}

revealPage();
