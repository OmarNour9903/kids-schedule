// تفاصيل عيلة لصاحب السيستم: كل بياناتها للعرض (أعضاء، أولاد، أماكن، مواعيد، جدول، تعليقات، دعوات)،
// واستعادة الحاجات الممسوحة أو الملغية
import {
  db, collection, doc, getDoc, getDocs, updateDoc, query, where, serverTimestamp
} from "../firebase.js";
import { requireAdmin } from "../session.js";
import { renderAdminNav, notAdminHtml, formatDate } from "../admin-nav.js";
import { escapeHtml, showAlert, hideAlert, confirmDialog, revealPage } from "../ui.js";
import { childNames } from "../data.js";
import { occurrencesInRange, exceptionId } from "../schedule.js";
import { todayKey, addDays, formatDayLong, formatTime, weekdayName } from "../dates.js";
import { mapsLink } from "../map-picker.js";
import { ROLE_LABELS, STATUS_LABELS, APPOINTMENT_TYPES, TRIP_STATUS, errorMessage } from "../strings.js";

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
const $ = (id) => document.getElementById(id);

let state = null;
let appointmentFilter = "active";

async function load() {
  const familySnap = await getDoc(doc(db, "families", familyId));
  if (!familySnap.exists()) throw { code: "not-found" };
  const [members, children, places, appointments, comments, occurrences] = await Promise.all(
    ["members", "children", "places", "appointments", "comments", "occurrences"].map(async (n) => list(await getDocs(sub(n))))
  );
  const [invites, users] = await Promise.all([
    getDocs(query(collection(db, "invites"), where("familyId", "==", familyId))).then(list).catch(() => []),
    Promise.all(members.map((m) => getDoc(doc(db, "users", m.id)).then((s) => [m.id, s.exists() ? s.data() : {}]).catch(() => [m.id, {}])))
  ]);
  state = {
    family: familySnap.data(),
    members, children, places, appointments, comments, invites,
    users: new Map(users),
    exceptions: new Map(occurrences.map((e) => [exceptionId(e.appointmentId, e.date), e]))
  };
}

const nameOf = (uid) => state.members.find((m) => m.id === uid)?.name || state.users.get(uid)?.name || "-";
const badge = (text, style) => `<span class="badge ${style}">${text}</span>`;
const empty = (cols, text) => `<tr><td colspan="${cols}" class="text-muted">${text}</td></tr>`;

function appointmentState(a) {
  if (a.cancelled) return "cancelled";
  const today = todayKey();
  const last = a.type === "travel" ? a.travel?.returnDate : (a.repeatWeekly ? a.repeatUntil : a.date);
  return last && last < today ? "ended" : "active";
}

function apptLabel(a) {
  const type = a.type !== "regular" ? ` (${APPOINTMENT_TYPES[a.type]})` : "";
  return `${childNames(a.childIds, state.children)}${type}: ${formatDayLong(a.date)} الساعة ${formatTime(a.startTime)}${a.repeatWeekly ? " · متكرر" : ""}`;
}

function placeLink(place) {
  if (!place) return "-";
  return `<a href="${escapeHtml(mapsLink(place))}" target="_blank" rel="noopener">${escapeHtml(place.name)}</a>`;
}

// ---------- نظرة عامة ----------

function renderOverview() {
  const { family, members, children, places, appointments, comments } = state;
  const owner = state.users.get(family.ownerId) || {};
  const active = appointments.filter((a) => appointmentState(a) === "active");
  const stats = [
    ["الأعضاء", members.length, `${members.filter((m) => m.role === "driver" && m.status === "active").length} سواق مفعّل`],
    ["الأولاد", children.filter((c) => !c.deleted).length, ""],
    ["المواعيد الشغالة", active.length, `${active.filter((a) => a.repeatWeekly).length} متكررة`],
    ["التعليقات", comments.filter((c) => !c.deleted).length, ""]
  ];
  $("family-stats").innerHTML = stats.map(([label, value, note]) => `
    <div class="col-6 col-lg-3"><div class="card shadow-sm h-100"><div class="card-body">
      <div class="small text-muted">${label}</div><div class="fs-3 fw-bold">${value}</div>
      ${note ? `<div class="small text-muted">${note}</div>` : ""}
    </div></div></div>`).join("");

  const rows = [
    ["اسم العيلة", escapeHtml(family.name)],
    ["المالك", escapeHtml(owner.name || nameOf(family.ownerId))],
    ["إيميل المالك", `<span dir="ltr">${escapeHtml(owner.email || "-")}</span>`],
    ["موبايل المالك", `<span dir="ltr">${escapeHtml(owner.phone || "-")}</span>`],
    ["اتعملت", formatDate(family.createdAt)],
    ["الحالة", family.suspended ? `${badge("متوقفة", "text-bg-danger")} من ${formatDate(family.suspendedAt)}` : badge("شغالة", "text-bg-success")],
    ["الأماكن المحفوظة", places.filter((p) => !p.deleted).length],
    ["الدعوات اللي لسه ماتستخدمتش", state.invites.filter((i) => !i.usedBy && i.expiresAt?.toDate?.() > new Date()).length],
    ["كود العيلة", `<code dir="ltr">${escapeHtml(familyId)}</code>`]
  ];
  $("family-info").innerHTML = rows.map(([label, value]) => `
    <dt class="col-5 col-sm-3 text-muted fw-normal">${label}</dt><dd class="col-7 col-sm-9">${value}</dd>`).join("");
}

// ---------- الأعضاء والأولاد والأماكن ----------

function renderMembers() {
  const order = { owner: 0, parent: 1, driver: 2, viewer: 3 };
  const members = state.members.slice().sort((a, b) => order[a.role] - order[b.role]);
  $("members-table").innerHTML = members.length ? members.map((m) => {
    const account = state.users.get(m.id) || {};
    return `
      <tr>
        <td class="fw-semibold">${escapeHtml(m.name)}</td>
        <td>${badge(ROLE_LABELS[m.role] || m.role, "text-bg-primary")}</td>
        <td>${badge(STATUS_LABELS[m.status] || m.status, m.status === "active" ? "text-bg-success" : "text-bg-secondary")}</td>
        <td>${account.disabled ? badge("متوقف من الإدارة", "text-bg-danger") : badge("شغال", "text-bg-light")}</td>
        <td class="small" dir="ltr">${escapeHtml(m.email || account.email || "")}<br>${escapeHtml(m.phone || account.phone || "")}</td>
        <td class="small text-nowrap">${formatDate(m.joinedAt)}</td>
      </tr>`;
  }).join("") : empty(6, "مفيش أعضاء.");
}

function renderChildren() {
  const active = state.appointments.filter((a) => appointmentState(a) === "active");
  $("children-table").innerHTML = state.children.length ? state.children.map((c) => `
    <tr class="${c.deleted ? "text-muted" : ""}">
      <td class="fw-semibold">${escapeHtml(c.name)}</td>
      <td>${c.birthYear || "-"}</td>
      <td class="small">${escapeHtml(c.notes || "-")}</td>
      <td>${active.filter((a) => (a.childIds || []).includes(c.id)).length}</td>
      <td>${c.deleted ? badge("ممسوح", "text-bg-secondary") : badge("موجود", "text-bg-success")}</td>
    </tr>`).join("") : empty(5, "مفيش أولاد.");
}

function renderPlaces() {
  $("places-table").innerHTML = state.places.length ? state.places.map((p) => `
    <tr class="${p.deleted ? "text-muted" : ""}">
      <td class="fw-semibold">${placeLink(p)}</td>
      <td class="small" dir="ltr">${p.lat != null ? `${p.lat}, ${p.lng}` : "لينك Google Maps بس"}</td>
      <td class="small text-nowrap">${formatDate(p.createdAt)}</td>
      <td>${p.deleted ? badge("ممسوح", "text-bg-secondary") : badge("موجود", "text-bg-success")}</td>
    </tr>`).join("") : empty(4, "مفيش أماكن.");
}

// ---------- المواعيد ----------

function appointmentCard(a) {
  const st = appointmentState(a);
  const stateBadge = { active: badge("شغال", "text-bg-success"), ended: badge("خلص", "text-bg-light"), cancelled: badge("ملغي", "text-bg-secondary") }[st];
  const type = a.type === "extra" ? badge(APPOINTMENT_TYPES.extra, "text-bg-warning")
    : a.type === "travel" ? badge(APPOINTMENT_TYPES.travel, "text-bg-dark") : "";
  const groupSize = a.groupId ? state.appointments.filter((g) => g.groupId === a.groupId && !g.cancelled).length : 0;

  let when;
  if (a.type === "travel" && a.travel) {
    when = `من ${formatDayLong(a.date)} لـ ${formatDayLong(a.travel.returnDate)} · المبيت: ${escapeHtml(a.travel.stay || "-")}`;
  } else if (a.repeatWeekly) {
    when = `كل ${weekdayName(a.date)} من ${formatDayLong(a.date)}${a.repeatUntil ? ` لحد ${formatDayLong(a.repeatUntil)}` : ""}`;
  } else {
    when = formatDayLong(a.date);
  }
  const time = `<bdi>${formatTime(a.startTime)}</bdi>${a.returnTime ? ` لحد <bdi>${formatTime(a.returnTime)}</bdi>` : ""}`;

  return `
    <div class="card shadow-sm${st !== "active" ? " opacity-75" : ""}">
      <div class="card-body py-2">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <span class="fw-semibold">${escapeHtml(childNames(a.childIds, state.children))}</span>
          <span class="d-flex flex-wrap gap-1">${type}${groupSize > 1 ? badge(`مجموعة ${groupSize} أيام`, "text-bg-light") : ""}${stateBadge}</span>
        </div>
        <div class="small">${when} · ${time}</div>
        <div class="small">${placeLink(a.pickup)} ← ${placeLink(a.dropoff)}</div>
        ${a.notes ? `<div class="small text-muted">${escapeHtml(a.notes)}</div>` : ""}
        <div class="small text-muted">أضافه ${escapeHtml(nameOf(a.createdBy))} · ${formatDate(a.createdAt)}${a.updatedBy && a.updatedBy !== a.createdBy ? ` · آخر تعديل ${escapeHtml(nameOf(a.updatedBy))}` : ""}</div>
      </div>
    </div>`;
}

function renderAppointments() {
  const shown = state.appointments
    .filter((a) => appointmentFilter === "all" || appointmentState(a) === appointmentFilter)
    .sort((a, b) => b.date.localeCompare(a.date) || a.startTime.localeCompare(b.startTime));
  $("appointments-list").innerHTML = shown.length
    ? shown.map(appointmentCard).join("")
    : '<div class="text-muted">مفيش مواعيد هنا.</div>';
  document.querySelectorAll("#appointments-filter [data-filter]").forEach((btn) => {
    btn.className = `btn btn-sm ${btn.dataset.filter === appointmentFilter ? "btn-primary" : "btn-outline-primary"}`;
  });
}

$("appointments-filter").addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  appointmentFilter = button.dataset.filter;
  renderAppointments();
});

// ---------- الجدول ----------

function renderSchedule() {
  const today = todayKey();
  const from = addDays(today, -7);
  const to = addDays(today, 14);
  const occurrences = occurrencesInRange(state.appointments, state.exceptions, from, to);
  const days = [...new Set(occurrences.map((o) => o.date))];

  $("schedule-list").innerHTML = days.length ? days.map((day) => `
    <div>
      <h3 class="h6 fw-semibold mb-2">${formatDayLong(day)}${day === today ? ` ${badge("النهارده", "text-bg-primary")}` : ""}</h3>
      <ul class="list-group shadow-sm">
        ${occurrences.filter((o) => o.date === day).map((o) => {
          const d = o.data;
          const status = o.cancelled ? badge("ملغي", "text-bg-secondary") : badge(TRIP_STATUS[o.status].label, TRIP_STATUS[o.status].badge);
          const driver = o.exception?.driverId ? ` · السواق: ${escapeHtml(nameOf(o.exception.driverId))}` : "";
          const reason = o.status === "declined" && o.exception?.declineReason ? `<div class="small text-danger">سبب الاعتذار: ${escapeHtml(o.exception.declineReason)}</div>` : "";
          const travel = o.travel ? ` · سفر يوم ${o.travel.day} من ${o.travel.total}` : "";
          return `
            <li class="list-group-item${o.cancelled ? " text-muted" : ""}">
              <div class="d-flex flex-wrap justify-content-between gap-2">
                <span><bdi class="fw-bold">${formatTime(d.startTime)}</bdi> · ${escapeHtml(childNames(d.childIds, state.children))}${travel}</span>
                ${status}
              </div>
              <div class="small">${placeLink(d.pickup)} ← ${placeLink(d.dropoff)}${driver}</div>
              ${reason}
            </li>`;
        }).join("")}
      </ul>
    </div>`).join("") : '<div class="text-muted">مفيش مشاوير في الفترة دي.</div>';
}

// ---------- التعليقات والدعوات ----------

function renderComments() {
  const comments = state.comments.filter((c) => !c.deleted)
    .sort((a, b) => (b.clientAt || "").localeCompare(a.clientAt || ""));
  $("comments-list").innerHTML = comments.length ? comments.map((c) => {
    const appt = state.appointments.find((a) => a.id === c.appointmentId);
    return `
      <li class="list-group-item">
        <div class="d-flex flex-wrap justify-content-between gap-2 small">
          <span class="fw-semibold">${escapeHtml(c.authorName)}</span>
          <span class="text-muted">${formatDate(c.clientAt)}</span>
        </div>
        <div class="text-prewrap">${escapeHtml(c.text)}</div>
        <div class="small text-muted">على موعد ${escapeHtml(appt ? childNames(appt.childIds, state.children) : "-")} · ${formatDayLong(c.date)}</div>
      </li>`;
  }).join("") : '<li class="list-group-item text-muted">مفيش تعليقات.</li>';
}

function renderInvites() {
  const invites = state.invites.slice().sort((a, b) => (b.expiresAt?.toMillis?.() || 0) - (a.expiresAt?.toMillis?.() || 0));
  $("invites-table").innerHTML = invites.length ? invites.map((i) => {
    const expires = i.expiresAt?.toDate?.();
    const status = i.usedBy
      ? badge(`اتستخدمت: ${escapeHtml(nameOf(i.usedBy))}`, "text-bg-success")
      : (expires && expires < new Date() ? badge("انتهت", "text-bg-secondary") : badge("مستنية", "text-bg-warning"));
    return `
      <tr>
        <td>${badge(ROLE_LABELS[i.role] || i.role, "text-bg-primary")}</td>
        <td class="small text-nowrap">${formatDate(i.createdAt)}</td>
        <td class="small text-nowrap">${formatDate(expires)}</td>
        <td>${status}</td>
      </tr>`;
  }).join("") : empty(4, "مفيش دعوات.");
}

// ---------- الاستعادة ----------

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

function renderRestore() {
  const groups = restoreGroups();
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  document.querySelector('[data-count="restore"]').textContent = total || "";
  $("restore-sections").innerHTML = total === 0
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

$("restore-sections").addEventListener("click", async (event) => {
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

// ---------- التشغيل ----------

function render() {
  const { family } = state;
  document.title = `${family.name} | لوحة التحكم`;
  $("family-name").textContent = family.name;
  $("family-status").innerHTML = family.suspended ? badge("العيلة متوقفة", "text-bg-danger") : badge("العيلة شغالة", "text-bg-success");

  const counts = {
    members: state.members.length,
    children: state.children.filter((c) => !c.deleted).length,
    places: state.places.filter((p) => !p.deleted).length,
    appointments: state.appointments.filter((a) => appointmentState(a) === "active").length,
    comments: state.comments.filter((c) => !c.deleted).length,
    invites: state.invites.length
  };
  Object.entries(counts).forEach(([key, n]) => {
    document.querySelector(`[data-count="${key}"]`).textContent = n || "";
  });

  renderOverview();
  renderMembers();
  renderChildren();
  renderPlaces();
  renderAppointments();
  renderSchedule();
  renderComments();
  renderInvites();
  renderRestore();
}

try {
  if (!familyId) throw { code: "not-found" };
  await load();
  render();
} catch (error) {
  body.classList.add("d-none");
  showAlert(alertBox, error.code === "not-found" ? "العيلة دي مش موجودة." : errorMessage(error));
}
revealPage();
