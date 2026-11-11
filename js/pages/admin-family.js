// تفاصيل عيلة لصاحب السيستم: الأعضاء، الأرقام، واستعادة الحاجات الممسوحة أو الملغية
import { db, collection, doc, getDoc, getDocs, updateDoc, serverTimestamp } from "../firebase.js";
import { requireAdmin } from "../session.js";
import { renderAdminNav, notAdminHtml, formatDate } from "../admin-nav.js";
import { escapeHtml, showAlert, hideAlert, confirmDialog, revealPage } from "../ui.js";
import { childNames } from "../data.js";
import { formatDayLong, formatTime } from "../dates.js";
import { ROLE_LABELS, STATUS_LABELS, APPOINTMENT_TYPES, errorMessage } from "../strings.js";

renderAdminNav("");
const { user, notAdmin } = await requireAdmin();
const alertBox = document.getElementById("family-alert");
const body = document.getElementById("family-body");

if (notAdmin) {
  body.innerHTML = notAdminHtml(user.uid);
  revealPage();
  await new Promise(() => {}); // نوقف الصفحة هنا من غير خطأ
}

const familyId = new URLSearchParams(location.search).get("id");
const sub = (name) => collection(db, "families", familyId, name);
const list = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

let state = null;

async function load() {
  const familySnap = await getDoc(doc(db, "families", familyId));
  if (!familySnap.exists()) throw { code: "not-found" };
  const [members, children, places, appointments, comments] = await Promise.all(
    ["members", "children", "places", "appointments", "comments"].map(async (n) => list(await getDocs(sub(n))))
  );
  state = { family: familySnap.data(), members, children, places, appointments, comments };
}

function apptLabel(a) {
  const type = a.type !== "regular" ? ` (${APPOINTMENT_TYPES[a.type]})` : "";
  return `${childNames(a.childIds, state.children)}${type}: ${formatDayLong(a.date)} الساعة ${formatTime(a.startTime)}${a.repeatWeekly ? " · متكرر" : ""}`;
}

// كل نوع ليه: عنوان، العناصر، وصف كل عنصر، والتعديل اللي بيرجّعه
function restoreGroups() {
  const undelete = { deleted: false, deletedAt: null, deletedBy: null, restoredAt: serverTimestamp(), restoredBy: user.uid };
  return [
    {
      key: "appointments-cancelled",
      title: "مواعيد اتلغت بالكامل",
      items: state.appointments.filter((a) => a.cancelled),
      describe: apptLabel,
      collection: "appointments",
      patch: () => ({ cancelled: false, updatedBy: user.uid, updatedAt: serverTimestamp() })
    },
    {
      key: "appointments-cut",
      title: "مواعيد متكررة اتلغت من يوم معين",
      items: state.appointments.filter((a) => !a.cancelled && a.endedByCancel),
      describe: (a) => `${apptLabel(a)} · اتلغت بعد ${formatDayLong(a.repeatUntil)}`,
      collection: "appointments",
      patch: (a) => ({ repeatUntil: a.repeatUntilBefore || null, repeatUntilBefore: null, endedByCancel: false, updatedBy: user.uid, updatedAt: serverTimestamp() })
    },
    {
      key: "children",
      title: "أولاد اتمسحوا",
      items: state.children.filter((c) => c.deleted),
      describe: (c) => `${c.name} · اتمسح ${formatDate(c.deletedAt)}`,
      collection: "children",
      patch: () => undelete
    },
    {
      key: "places",
      title: "أماكن اتمسحت",
      items: state.places.filter((p) => p.deleted),
      describe: (p) => `${p.name} · اتمسح ${formatDate(p.deletedAt)}`,
      collection: "places",
      patch: () => undelete
    },
    {
      key: "comments",
      title: "تعليقات اتمسحت",
      items: state.comments.filter((c) => c.deleted),
      describe: (c) => `${c.authorName}: "${c.text}" · ${formatDayLong(c.date)}`,
      collection: "comments",
      patch: () => undelete
    }
  ];
}

function render() {
  const { family, members, children, places, appointments } = state;
  document.title = `${family.name} | لوحة التحكم`;
  document.getElementById("family-name").textContent = family.name;
  document.getElementById("family-status").innerHTML = family.suspended
    ? '<span class="badge text-bg-danger">العيلة متوقفة</span>'
    : '<span class="badge text-bg-success">العيلة شغالة</span>';

  const stats = [
    ["الأعضاء", members.length],
    ["الأولاد", children.filter((c) => !c.deleted).length],
    ["الأماكن", places.filter((p) => !p.deleted).length],
    ["المواعيد الشغالة", appointments.filter((a) => !a.cancelled).length]
  ];
  document.getElementById("family-stats").innerHTML = stats.map(([label, value]) => `
    <div class="col-6 col-lg-3"><div class="card shadow-sm h-100"><div class="card-body">
      <div class="small text-muted">${label}</div><div class="fs-3 fw-bold">${value}</div>
    </div></div></div>`).join("");

  document.getElementById("family-members").innerHTML = members.map((m) => `
    <li class="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2">
      <div>
        <div class="fw-semibold">${escapeHtml(m.name)}</div>
        <div class="small text-muted" dir="ltr">${escapeHtml(m.email || "")}${m.phone ? ` · ${escapeHtml(m.phone)}` : ""}</div>
      </div>
      <div class="d-flex gap-1">
        <span class="badge text-bg-primary">${ROLE_LABELS[m.role] || m.role}</span>
        <span class="badge ${m.status === "active" ? "text-bg-success" : "text-bg-secondary"}">${STATUS_LABELS[m.status] || m.status}</span>
      </div>
    </li>`).join("");

  const groups = restoreGroups();
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  document.getElementById("restore-sections").innerHTML = total === 0
    ? '<div class="text-muted">مفيش حاجة ممسوحة أو ملغية في العيلة دي.</div>'
    : groups.filter((g) => g.items.length).map((g) => `
      <div>
        <h3 class="h6 fw-semibold">${g.title} <span class="badge text-bg-light">${g.items.length}</span></h3>
        <ul class="list-group">
          ${g.items.map((item) => `
            <li class="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2">
              <span class="small">${escapeHtml(g.describe(item))}</span>
              <button type="button" class="btn btn-sm btn-outline-success" data-restore="${g.key}" data-id="${item.id}">
                <i class="bi bi-arrow-counterclockwise"></i> استعادة
              </button>
            </li>`).join("")}
        </ul>
      </div>`).join("");
}

document.getElementById("restore-sections").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-restore]");
  if (!button) return;
  const group = restoreGroups().find((g) => g.key === button.dataset.restore);
  const item = group?.items.find((i) => i.id === button.dataset.id);
  if (!item) return;

  const confirmed = await confirmDialog({
    title: "استعادة",
    message: `ترجّع ده؟\n${group.describe(item)}`,
    confirmText: "استعادة"
  });
  if (!confirmed) return;

  hideAlert(alertBox);
  try {
    await updateDoc(doc(db, "families", familyId, group.collection, item.id), group.patch(item));
    await load();
    render();
    showAlert(alertBox, "اترجّع بنجاح.", "success");
  } catch (error) {
    showAlert(alertBox, errorMessage(error));
  }
});

try {
  if (!familyId) throw { code: "not-found" };
  await load();
  render();
} catch (error) {
  body.classList.add("d-none");
  showAlert(alertBox, error.code === "not-found" ? "العيلة دي مش موجودة." : errorMessage(error));
}
revealPage();
