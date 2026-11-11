// لوحة تحكم صاحب السيستم: كل العائلات وكل المستخدمين، وإيقاف وتشغيل الحسابات
import { db, collection, doc, getDocs, updateDoc, serverTimestamp } from "../firebase.js";
import { requireAdmin } from "../session.js";
import { renderAdminNav, notAdminHtml, formatDate } from "../admin-nav.js";
import { escapeHtml, showAlert, hideAlert, confirmDialog, revealPage } from "../ui.js";
import { ROLE_LABELS, errorMessage } from "../strings.js";

renderAdminNav("admin.html");
const { user, notAdmin } = await requireAdmin();
const alertBox = document.getElementById("admin-alert");
const body = document.getElementById("admin-body");

if (notAdmin) {
  body.innerHTML = notAdminHtml(user.uid);
  revealPage();
  await new Promise(() => {}); // نوقف الصفحة هنا من غير خطأ
}

const familiesTable = document.getElementById("families-table");
const usersTable = document.getElementById("users-table");
const searchInput = document.getElementById("users-search");

let families = [];
let users = [];
let membership = new Map(); // uid => [{ familyId, familyName, role, status }]

async function load() {
  const [familiesSnap, usersSnap] = await Promise.all([
    getDocs(collection(db, "families")),
    getDocs(collection(db, "users"))
  ]);
  users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const usersById = new Map(users.map((u) => [u.id, u]));
  membership = new Map();

  families = await Promise.all(familiesSnap.docs.map(async (d) => {
    const family = { id: d.id, ...d.data() };
    const [membersSnap, appointmentsSnap] = await Promise.all([
      getDocs(collection(db, "families", d.id, "members")),
      getDocs(collection(db, "families", d.id, "appointments"))
    ]);
    family.members = membersSnap.docs.map((m) => ({ id: m.id, ...m.data() }));
    family.activeAppointments = appointmentsSnap.docs.filter((a) => !a.data().cancelled).length;
    family.ownerName = usersById.get(family.ownerId)?.name || family.members.find((m) => m.role === "owner")?.name || "-";
    family.members.forEach((m) => {
      const list = membership.get(m.id) || [];
      list.push({ familyId: family.id, familyName: family.name, role: m.role, status: m.status });
      membership.set(m.id, list);
    });
    return family;
  }));
  families.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  users.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
}

function statusBadge(off, onText = "شغال", offText = "متوقف") {
  return off
    ? `<span class="badge text-bg-danger">${offText}</span>`
    : `<span class="badge text-bg-success">${onText}</span>`;
}

function renderStats() {
  const activeDrivers = families.reduce((n, f) => n + f.members.filter((m) => m.role === "driver" && m.status === "active").length, 0);
  const stats = [
    ["العائلات", families.length, `${families.filter((f) => f.suspended).length} متوقفة`],
    ["المستخدمين", users.length, `${users.filter((u) => u.disabled).length} متوقفين`],
    ["السواقين المفعّلين", activeDrivers, "في كل العائلات"],
    ["المواعيد الشغالة", families.reduce((n, f) => n + f.activeAppointments, 0), "مش ملغية"]
  ];
  document.getElementById("admin-stats").innerHTML = stats.map(([label, value, note]) => `
    <div class="col-6 col-lg-3">
      <div class="card shadow-sm h-100"><div class="card-body">
        <div class="small text-muted">${label}</div>
        <div class="fs-3 fw-bold">${value}</div>
        <div class="small text-muted">${note}</div>
      </div></div>
    </div>`).join("");
}

function renderFamilies() {
  familiesTable.innerHTML = families.length ? families.map((f) => `
    <tr>
      <td class="fw-semibold">${escapeHtml(f.name)}</td>
      <td>${escapeHtml(f.ownerName)}</td>
      <td>${f.members.length}</td>
      <td>${f.activeAppointments}</td>
      <td class="text-nowrap">${formatDate(f.createdAt)}</td>
      <td>${statusBadge(f.suspended)}</td>
      <td class="text-nowrap">
        <a class="btn btn-sm btn-outline-primary" href="admin-family.html?id=${encodeURIComponent(f.id)}">التفاصيل</a>
        <button type="button" class="btn btn-sm ${f.suspended ? "btn-outline-success" : "btn-outline-danger"}" data-family="${f.id}">
          ${f.suspended ? "تشغيل" : "إيقاف"}
        </button>
      </td>
    </tr>`).join("") : '<tr><td colspan="7" class="text-muted">مفيش عائلات لسه.</td></tr>';
}

function renderUsers() {
  const q = searchInput.value.trim().toLowerCase();
  const shown = users.filter((u) => !q || [u.name, u.email, u.phone].some((v) => (v || "").toLowerCase().includes(q)));
  usersTable.innerHTML = shown.length ? shown.map((u) => {
    const roles = (membership.get(u.id) || [])
      .map((m) => `${escapeHtml(m.familyName)} · ${ROLE_LABELS[m.role] || m.role}${m.status === "suspended" ? " (موقوف من العيلة)" : ""}`)
      .join("<br>") || '<span class="text-muted">من غير عيلة</span>';
    const isMe = u.id === user.uid;
    return `
      <tr>
        <td class="fw-semibold">${escapeHtml(u.name || "-")}${isMe ? ' <span class="text-muted small">(إنت)</span>' : ""}</td>
        <td class="small" dir="ltr">${escapeHtml(u.email || "")}<br>${escapeHtml(u.phone || "")}</td>
        <td class="small">${roles}</td>
        <td class="text-nowrap small">${formatDate(u.createdAt)}</td>
        <td>${statusBadge(u.disabled)}</td>
        <td>${isMe ? "" : `<button type="button" class="btn btn-sm ${u.disabled ? "btn-outline-success" : "btn-outline-danger"}" data-user="${u.id}">${u.disabled ? "تشغيل" : "إيقاف"}</button>`}</td>
      </tr>`;
  }).join("") : '<tr><td colspan="6" class="text-muted">مفيش نتايج.</td></tr>';
}

function render() {
  renderStats();
  renderFamilies();
  renderUsers();
}

searchInput.addEventListener("input", renderUsers);

familiesTable.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-family]");
  if (!button) return;
  const family = families.find((f) => f.id === button.dataset.family);
  const suspending = !family.suspended;
  const confirmed = await confirmDialog({
    title: suspending ? "إيقاف عيلة" : "تشغيل عيلة",
    message: suspending
      ? `إيقاف "${family.name}"؟ كل أعضاءها (${family.members.length}) مش هيقدروا يدخلوا لحد ما تشغّلها تاني. البيانات كلها هتفضل محفوظة.`
      : `تشغيل "${family.name}" تاني؟ الأعضاء هيقدروا يدخلوا عادي.`,
    confirmText: suspending ? "إيقاف" : "تشغيل",
    danger: suspending
  });
  if (!confirmed) return;
  hideAlert(alertBox);
  try {
    await updateDoc(doc(db, "families", family.id), {
      suspended: suspending, suspendedAt: serverTimestamp(), suspendedBy: user.uid
    });
    family.suspended = suspending;
    render();
  } catch (error) {
    showAlert(alertBox, errorMessage(error));
  }
});

usersTable.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-user]");
  if (!button) return;
  const target = users.find((u) => u.id === button.dataset.user);
  const disabling = !target.disabled;
  const confirmed = await confirmDialog({
    title: disabling ? "إيقاف مستخدم" : "تشغيل مستخدم",
    message: disabling
      ? `إيقاف ${target.name || target.email}؟ مش هيقدر يدخل السيستم في أي عيلة لحد ما تشغّله تاني. بياناته هتفضل محفوظة.`
      : `تشغيل ${target.name || target.email} تاني؟`,
    confirmText: disabling ? "إيقاف" : "تشغيل",
    danger: disabling
  });
  if (!confirmed) return;
  hideAlert(alertBox);
  try {
    await updateDoc(doc(db, "users", target.id), {
      disabled: disabling, disabledAt: serverTimestamp(), disabledBy: user.uid
    });
    target.disabled = disabling;
    render();
  } catch (error) {
    showAlert(alertBox, errorMessage(error));
  }
});

try {
  await load();
  render();
} catch (error) {
  showAlert(alertBox, errorMessage(error));
}
revealPage();
