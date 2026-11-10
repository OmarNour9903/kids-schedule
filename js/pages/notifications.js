import {
  db, doc, collection, query, orderBy, limit, onSnapshot, updateDoc, writeBatch
} from "../firebase.js";
import { requireSession } from "../session.js";
import { renderNav } from "../nav.js";
import { escapeHtml, showAlert, revealPage } from "../ui.js";
import { errorMessage } from "../strings.js";

const session = await requireSession();
renderNav(session);
const { user } = session;

const list = document.getElementById("notifications-list");
const alertBox = document.getElementById("notifications-alert");
const markAllBtn = document.getElementById("mark-all");
const notificationsRef = collection(db, "users", user.uid, "notifications");
let items = [];

function timeAgo(value) {
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo", day: "numeric", month: "short", hour: "numeric", minute: "2-digit"
  }).format(date);
}

function itemHtml(n) {
  return `
    <li class="list-group-item p-0">
      <button type="button" class="notification-item${n.read ? "" : " unread"}" data-id="${n.id}">
        <span class="d-flex justify-content-between gap-2">
          <span class="fw-semibold">${escapeHtml(n.actorName || "")}</span>
          <span class="small text-muted">${timeAgo(n.createdAt)}</span>
        </span>
        <span class="d-block">${escapeHtml(n.text)}</span>
      </button>
    </li>`;
}

onSnapshot(query(notificationsRef, orderBy("createdAt", "desc"), limit(50)), (snapshot) => {
  items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  list.innerHTML = items.length
    ? items.map(itemHtml).join("")
    : '<li class="list-group-item text-muted">مفيش إشعارات.</li>';
  markAllBtn.disabled = !items.some((n) => !n.read);
}, (error) => showAlert(alertBox, errorMessage(error)));

list.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-id]");
  if (!button) return;
  const n = items.find((i) => i.id === button.dataset.id);
  if (!n) return;
  try {
    if (!n.read) await updateDoc(doc(notificationsRef, n.id), { read: true });
  } catch (error) {
    // حتى لو التعليم كمقروء فشل، نفتح الموعد
  }
  if (n.appointmentId && n.date) {
    location.href = `appointment.html?id=${encodeURIComponent(n.appointmentId)}&date=${n.date}`;
  }
});

markAllBtn.addEventListener("click", async () => {
  const unread = items.filter((n) => !n.read);
  if (!unread.length) return;
  const batch = writeBatch(db);
  unread.forEach((n) => batch.update(doc(notificationsRef, n.id), { read: true }));
  try {
    await batch.commit();
  } catch (error) {
    showAlert(alertBox, errorMessage(error));
  }
});

revealPage();
