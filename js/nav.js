// شريط التنقل العلوي، بيتغير حسب دور المستخدم، وفيه جرس الإشعارات
import { db, collection, query, where, onSnapshot } from "./firebase.js";
import { escapeHtml } from "./ui.js";
import { ROLE_LABELS } from "./strings.js";
import { logout } from "./session.js";

export function renderNav(session) {
  const nav = document.getElementById("app-nav");
  const { member, family, user } = session;
  const canManageMembers = ["owner", "parent"].includes(member.role);
  const isDriver = member.role === "driver";
  const current = location.pathname.split("/").pop() || "dashboard.html";

  const link = (href, label) => {
    const file = href.split("?")[0];
    const active = current === file ? " active" : "";
    const aria = active ? ' aria-current="page"' : "";
    return `<li class="nav-item"><a class="nav-link${active}" href="${href}"${aria}>${label}</a></li>`;
  };

  nav.innerHTML = `
    <div class="container">
      <a class="navbar-brand fw-bold" href="${isDriver ? "driver.html" : "dashboard.html"}">
        <i class="bi bi-calendar-week"></i>
        <span>${escapeHtml(family.name)}</span>
      </a>
      <div class="d-flex align-items-center gap-2 order-md-last">
        <a class="btn btn-sm btn-outline-light position-relative" href="notifications.html" id="nav-bell" aria-label="الإشعارات">
          <i class="bi bi-bell"></i>
          <span class="position-absolute top-0 start-0 translate-middle badge rounded-pill text-bg-danger d-none" id="nav-bell-count"></span>
        </a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#main-nav"
          aria-controls="main-nav" aria-expanded="false" aria-label="القائمة">
          <span class="navbar-toggler-icon"></span>
        </button>
      </div>
      <div class="collapse navbar-collapse" id="main-nav">
        <ul class="navbar-nav me-auto">
          ${isDriver ? link("driver.html", "مشاويري") : ""}
          ${link(isDriver ? "dashboard.html?calendar=1" : "dashboard.html", "التقويم")}
          ${canManageMembers ? link("children.html", "الأولاد") : ""}
          ${canManageMembers ? link("places.html", "الأماكن") : ""}
          ${canManageMembers ? link("members.html", "الأعضاء") : ""}
        </ul>
        <div class="d-flex align-items-center gap-2 py-2 py-md-0 ms-md-2">
          <span class="navbar-text small">
            ${escapeHtml(member.name)}
            <span class="badge text-bg-light">${ROLE_LABELS[member.role]}</span>
          </span>
          <button class="btn btn-sm btn-outline-light" type="button" id="logout-btn">خروج</button>
        </div>
      </div>
    </div>`;

  document.getElementById("logout-btn").addEventListener("click", logout);

  const countEl = document.getElementById("nav-bell-count");
  const unread = query(collection(db, "users", user.uid, "notifications"), where("read", "==", false));
  onSnapshot(unread, (snapshot) => {
    const count = snapshot.docs.length;
    countEl.textContent = count > 99 ? "99+" : String(count);
    countEl.classList.toggle("d-none", count === 0);
  }, () => countEl.classList.add("d-none"));
}
