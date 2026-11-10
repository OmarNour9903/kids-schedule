// شريط التنقل العلوي، بيتغير حسب دور المستخدم
import { escapeHtml } from "./ui.js";
import { ROLE_LABELS } from "./strings.js";
import { logout } from "./session.js";

export function renderNav(session) {
  const nav = document.getElementById("app-nav");
  const { member, family } = session;
  const canManageMembers = ["owner", "parent"].includes(member.role);
  const current = location.pathname.split("/").pop() || "dashboard.html";

  const link = (href, label) => {
    const active = current === href ? " active" : "";
    const aria = active ? ' aria-current="page"' : "";
    return `<li class="nav-item"><a class="nav-link${active}" href="${href}"${aria}>${label}</a></li>`;
  };

  nav.innerHTML = `
    <div class="container">
      <a class="navbar-brand fw-bold" href="dashboard.html">
        <i class="bi bi-calendar-week"></i>
        <span>${escapeHtml(family.name)}</span>
      </a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#main-nav"
        aria-controls="main-nav" aria-expanded="false" aria-label="القائمة">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="main-nav">
        <ul class="navbar-nav me-auto">
          ${link("dashboard.html", "التقويم")}
          ${canManageMembers ? link("children.html", "الأولاد") : ""}
          ${canManageMembers ? link("places.html", "الأماكن") : ""}
          ${canManageMembers ? link("members.html", "الأعضاء") : ""}
        </ul>
        <div class="d-flex align-items-center gap-2 py-2 py-md-0">
          <span class="navbar-text small">
            ${escapeHtml(member.name)}
            <span class="badge text-bg-light">${ROLE_LABELS[member.role]}</span>
          </span>
          <button class="btn btn-sm btn-outline-light" type="button" id="logout-btn">خروج</button>
        </div>
      </div>
    </div>`;

  document.getElementById("logout-btn").addEventListener("click", logout);
}
