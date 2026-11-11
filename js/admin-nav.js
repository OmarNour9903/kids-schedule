// شريط التنقل في صفحات صاحب السيستم
import { logout } from "./session.js";

export function renderAdminNav(active) {
  const nav = document.getElementById("app-nav");
  const link = (href, label) => `<li class="nav-item"><a class="nav-link${active === href ? " active" : ""}" href="${href}">${label}</a></li>`;
  nav.innerHTML = `
    <div class="container">
      <a class="navbar-brand fw-bold" href="admin.html"><i class="bi bi-shield-lock"></i> لوحة التحكم</a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#admin-nav"
        aria-controls="admin-nav" aria-expanded="false" aria-label="القائمة">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="admin-nav">
        <ul class="navbar-nav me-auto">
          ${link("admin.html", "العائلات والمستخدمين")}
          ${link("dashboard.html", "تطبيق العيلة")}
        </ul>
        <button class="btn btn-sm btn-outline-light my-2 my-md-0" type="button" id="logout-btn">خروج</button>
      </div>
    </div>`;
  document.getElementById("logout-btn").addEventListener("click", logout);
}

export function notAdminHtml(uid) {
  return `
    <div class="card shadow-sm">
      <div class="card-body">
        <h1 class="h5 fw-bold">الحساب ده مش حساب إدارة</h1>
        <p class="mb-2">لو ده حساب صاحب السيستم، صلاحية الأدمن لسه ماتفعّلتش. ابعت الكود ده عشان تتفعّل:</p>
        <code class="d-block p-2 bg-body-tertiary rounded-2 user-select-all" dir="ltr">${uid}</code>
      </div>
    </div>`;
}

export function formatDate(value) {
  if (!value) return "-";
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ar-EG", { timeZone: "Africa/Cairo", day: "numeric", month: "short", year: "numeric" }).format(date);
}
