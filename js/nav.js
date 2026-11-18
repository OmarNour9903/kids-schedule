// شريط التنقل: فوق على الكمبيوتر، وعلى الموبايل شريط تحت (زي الأبلكيشنات) + قايمة "المزيد".
// بيتغير حسب دور المستخدم، وفيه جرس الإشعارات
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
        <a class="btn btn-sm btn-outline-light position-relative d-none d-md-inline-block" href="notifications.html" id="nav-bell" aria-label="الإشعارات">
          <i class="bi bi-bell"></i>
          <span class="position-absolute top-0 start-0 translate-middle badge rounded-pill text-bg-danger d-none" id="nav-bell-count"></span>
        </a>
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

  renderBottomNav(session, { current, canManageMembers, isDriver, drivesAny, families });

  document.querySelectorAll("#logout-btn, [data-logout]").forEach((button) => button.addEventListener("click", logout));
  document.querySelectorAll("[data-switch-family]").forEach((button) => {
    button.addEventListener("click", () => switchFamily(session, button.dataset.switchFamily));
  });

  // تنبيه التحديثات الجديدة: مرة واحدة لكل مستخدم
  showWhatsNew(session);

  const countEls = document.querySelectorAll("#nav-bell-count, #bottom-bell-count");
  const unread = query(collection(db, "users", user.uid, "notifications"), where("read", "==", false));
  onSnapshot(unread, (snapshot) => {
    const count = snapshot.docs.length;
    countEls.forEach((el) => {
      el.textContent = count > 99 ? "99+" : String(count);
      el.classList.toggle("d-none", count === 0);
    });
  }, () => countEls.forEach((el) => el.classList.add("d-none")));
}

// شريط التنقل تحت (موبايل بس) وقايمة "المزيد" اللي بتطلع من تحت
function renderBottomNav(session, { current, canManageMembers, isDriver, drivesAny, families }) {
  const { member, family } = session;
  const isActive = (href) => current === href.split("?")[0];
  const item = (href, icon, label, extra = "") => `
    <a class="bottom-nav-item${isActive(href) ? " active" : ""}" href="${href}"${isActive(href) ? ' aria-current="page"' : ""}>
      <span class="bottom-nav-icon"><i class="bi ${icon}"></i>${extra}</span>
      <span>${label}</span>
    </a>`;
  const moreLink = (href, icon, label) => `
    <a class="list-group-item list-group-item-action${isActive(href) ? " active" : ""}" href="${href}">
      <i class="bi ${icon}"></i> ${label}
    </a>`;

  const bar = document.createElement("nav");
  bar.className = "bottom-nav d-md-none";
  bar.setAttribute("aria-label", "التنقل");
  bar.innerHTML = `
    ${drivesAny ? item("driver.html", "bi-car-front", "مشاويري") : ""}
    ${item(isDriver ? "dashboard.html?calendar=1" : "dashboard.html", "bi-calendar3", "التقويم")}
    ${canManageMembers ? `
      <a class="bottom-nav-item bottom-nav-add${isActive("appointment-form.html") ? " active" : ""}" href="appointment-form.html">
        <span class="bottom-nav-add-icon"><i class="bi bi-plus-lg"></i></span>
        <span>موعد جديد</span>
      </a>` : ""}
    ${item("notifications.html", "bi-bell", "الإشعارات", '<span class="bottom-nav-badge d-none" id="bottom-bell-count"></span>')}
    <button type="button" class="bottom-nav-item" data-bs-toggle="offcanvas" data-bs-target="#more-menu" aria-controls="more-menu">
      <span class="bottom-nav-icon"><i class="bi bi-grid"></i></span>
      <span>المزيد</span>
    </button>`;

  const sheet = document.createElement("div");
  sheet.className = "offcanvas offcanvas-bottom more-menu";
  sheet.tabIndex = -1;
  sheet.id = "more-menu";
  sheet.setAttribute("aria-labelledby", "more-menu-title");
  sheet.innerHTML = `
    <div class="offcanvas-header">
      <div>
        <h2 class="offcanvas-title h6 fw-bold mb-0" id="more-menu-title">${escapeHtml(member.name)}</h2>
        <div class="small text-muted">${ROLE_LABELS[member.role]} · ${escapeHtml(family.name)}</div>
      </div>
      <button type="button" class="btn-close ms-0 me-auto" data-bs-dismiss="offcanvas" aria-label="إغلاق"></button>
    </div>
    <div class="offcanvas-body pt-0">
      <div class="list-group more-list">
        ${canManageMembers ? moreLink("children.html", "bi-emoji-smile", "الأولاد") : ""}
        ${canManageMembers ? moreLink("places.html", "bi-geo-alt", "الأماكن") : ""}
        ${canManageMembers ? moreLink("members.html", "bi-people", "الأعضاء") : ""}
        ${session.isAdmin ? moreLink("admin.html", "bi-shield-lock", "لوحة التحكم") : ""}
        ${families.length > 1 ? families.map((f) => `
          <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between${f.id === session.familyId ? " active" : ""}" data-switch-family="${escapeHtml(f.id)}">
            <span><i class="bi bi-arrow-left-right"></i> ${escapeHtml(f.family.name)}</span>
            <span class="small opacity-75">${ROLE_LABELS[f.member.role]}</span>
          </button>`).join("") : ""}
        <button type="button" class="list-group-item list-group-item-action install-app-btn" data-install-app>
          <i class="bi bi-download"></i> تحميل الأبلكيشن
        </button>
        <button type="button" class="list-group-item list-group-item-action" data-theme-toggle>
          <span class="theme-to-light"><i class="bi bi-sun"></i> الوضع الفاتح</span>
          <span class="theme-to-dark"><i class="bi bi-moon-stars"></i> الوضع الغامق</span>
        </button>
        <button type="button" class="list-group-item list-group-item-action text-danger" data-logout>
          <i class="bi bi-box-arrow-left"></i> خروج
        </button>
      </div>
    </div>`;

  document.body.append(bar, sheet);
  document.body.classList.add("has-bottom-nav");
}
