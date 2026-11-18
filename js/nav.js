// شريط التنقل العلوي، بيتغير حسب دور المستخدم، وفيه جرس الإشعارات
import { db, collection, query, where, onSnapshot } from "./firebase.js";
import { escapeHtml } from "./ui.js";
import { ROLE_LABELS } from "./strings.js";
import { logout, switchFamily } from "./session.js";
import { showWhatsNew } from "./whats-new.js";

export function renderNav(session) {
  const nav = document.getElementById("app-nav");
  const { member, family, user } = session;
  const canManageMembers = ["owner", "parent"].includes(member.role);
  const isDriver = member.role === "driver";
  const families = session.families || [];
  // سواق في أي أسرة من أسره: صفحة "مشاويري" بتجمع مشاوير كل الأسر
  const drivesAny = families.some((f) => f.member.role === "driver");
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
          ${drivesAny ? link("driver.html", "مشاويري") : ""}
          ${link(isDriver ? "dashboard.html?calendar=1" : "dashboard.html", "التقويم")}
          ${canManageMembers ? link("children.html", "الأولاد") : ""}
          ${canManageMembers ? link("places.html", "الأماكن") : ""}
          ${canManageMembers ? link("members.html", "الأعضاء") : ""}
          ${session.isAdmin ? link("admin.html", "لوحة التحكم") : ""}
          ${families.length > 1 ? `
          <li class="nav-item dropdown">
            <button type="button" class="nav-link dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">
              <i class="bi bi-arrow-left-right"></i> تغيير الأسرة
            </button>
            <ul class="dropdown-menu">
              ${families.map((f) => `
                <li>
                  <button type="button" class="dropdown-item d-flex justify-content-between gap-3${f.id === session.familyId ? " active" : ""}" data-switch-family="${escapeHtml(f.id)}">
                    <span>${escapeHtml(f.family.name)}</span>
                    <span class="small opacity-75">${ROLE_LABELS[f.member.role]}</span>
                  </button>
                </li>`).join("")}
            </ul>
          </li>` : ""}
          <li class="nav-item">
            <button type="button" class="nav-link install-app-btn" data-install-app>
              <i class="bi bi-download"></i> تحميل الأبلكيشن
            </button>
          </li>
          <li class="nav-item">
            <button type="button" class="nav-link" data-theme-toggle>
              <span class="theme-to-light"><i class="bi bi-sun"></i> الوضع الفاتح</span>
              <span class="theme-to-dark"><i class="bi bi-moon-stars"></i> الوضع الغامق</span>
            </button>
          </li>
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
  nav.querySelectorAll("[data-switch-family]").forEach((button) => {
    button.addEventListener("click", () => switchFamily(session, button.dataset.switchFamily));
  });

  // تنبيه التحديثات الجديدة: مرة واحدة لكل مستخدم
  showWhatsNew(session);

  const countEl = document.getElementById("nav-bell-count");
  const unread = query(collection(db, "users", user.uid, "notifications"), where("read", "==", false));
  onSnapshot(unread, (snapshot) => {
    const count = snapshot.docs.length;
    countEl.textContent = count > 99 ? "99+" : String(count);
    countEl.classList.toggle("d-none", count === 0);
  }, () => countEl.classList.add("d-none"));
}
