// الأبلكيشن على الموبايل: تشغيل الشغل من غير نت (service worker)، زرار "تحميل الأبلكيشن"،
// وشريط تحت بيقول لو إنت أوفلاين أو فيه تعديلات لسه ماتبعتتش.
// الملف ده متضاف في كل الصفحات.
import { syncState, onSyncChange, onSyncFailure } from "./offline.js";
import { escapeHtml } from "./ui.js";
import { errorMessage } from "./strings.js";

// ---------- الشغل من غير نت ----------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {
    // لو التسجيل فشل السيستم بيشتغل عادي بس محتاج نت
  });
}

// ---------- زرار تحميل الأبلكيشن ----------
// أي عنصر عليه data-install-app بيظهر بس لو التحميل متاح (التحكم من css عن طريق html[data-install])
const root = document.documentElement;
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
let installPrompt = null;

function setInstallMode(mode) {
  if (mode) root.dataset.install = mode;
  else delete root.dataset.install;
}

if (!isStandalone()) {
  // الآيفون مافيهوش تحميل بضغطة، فالزرار بيشرح الخطوات
  if (isIos) setInstallMode("ios");
  // أندرويد (Chrome وSamsung Internet): المتصفح بيدينا التحميل بضغطة
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    setInstallMode("prompt");
  });
}

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  setInstallMode(null);
});

let iosModalEl = null;

function showIosHelp() {
  if (!iosModalEl) {
    const notSafari = /crios|fxios|edgios/i.test(navigator.userAgent);
    iosModalEl = document.createElement("div");
    iosModalEl.className = "modal fade";
    iosModalEl.tabIndex = -1;
    iosModalEl.setAttribute("aria-hidden", "true");
    iosModalEl.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title h5"><i class="bi bi-phone"></i> تحميل الأبلكيشن على الآيفون</h2>
            <button type="button" class="btn-close ms-0 me-auto" data-bs-dismiss="modal" aria-label="إغلاق"></button>
          </div>
          <div class="modal-body">
            ${notSafari ? '<div class="alert alert-warning small">الأسهل تفتح اللينك ده من <strong>Safari</strong>.</div>' : ""}
            <ol class="install-steps mb-3">
              <li>دوس على زرار <strong>المشاركة</strong> <i class="bi bi-box-arrow-up"></i> (المربع اللي طالع منه سهم)${notSafari ? "" : " تحت الشاشة"}.</li>
              <li>انزل في القايمة واختار <strong>إضافة إلى الشاشة الرئيسية</strong> (Add to Home Screen).</li>
              <li>دوس <strong>إضافة</strong>، وأيقونة "مواعيد الأولاد" هتظهر على الشاشة.</li>
            </ol>
            <p class="small text-muted mb-0">بعد كده افتح السيستم من الأيقونة على طول، مش من Safari، عشان البيانات المحفوظة على الموبايل تفضل موجودة.</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-primary" data-bs-dismiss="modal">تمام</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(iosModalEl);
  }
  bootstrap.Modal.getOrCreateInstance(iosModalEl).show();
}

document.addEventListener("click", async (event) => {
  if (!event.target.closest("[data-install-app]")) return;
  if (installPrompt) {
    const prompt = installPrompt;
    installPrompt = null;
    setInstallMode(null);
    prompt.prompt();
    await prompt.userChoice;
    return;
  }
  if (isIos) showIosHelp();
});

// ---------- الإضاءة (غامق / فاتح) ----------
// الاختيار الأول بيتعمل في theme.js، وهنا التبديل من زرار القايمة
document.addEventListener("click", (event) => {
  if (!event.target.closest("[data-theme-toggle]")) return;
  const next = root.getAttribute("data-bs-theme") === "light" ? "dark" : "light";
  root.setAttribute("data-bs-theme", next);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#131B2B" : "#0d6efd");
  try {
    localStorage.setItem("theme", next);
  } catch (error) {
    // التخزين مش متاح: الاختيار هيفضل لحد ما الصفحة تتقفل بس
  }
});

// ---------- شريط حالة النت والإرسال ----------
const banner = document.createElement("div");
banner.className = "sync-banner d-none";
banner.setAttribute("role", "status");
banner.setAttribute("aria-live", "polite");
document.body.appendChild(banner);

// فيه تعديلات اتعملت وإحنا أوفلاين ولسه بنتابع إرسالها
let queuedOffline = false;
let doneTimer = null;

function showBanner(kind, html) {
  banner.className = `sync-banner sync-banner-${kind}`;
  banner.innerHTML = html;
}

function renderBanner() {
  const { pending, offline } = syncState();
  clearTimeout(doneTimer);

  if (offline) {
    if (pending) queuedOffline = true;
    const waiting = pending ? " <strong>(فيه تعديلات مستنية النت)</strong>" : "";
    showBanner("offline", `<i class="bi bi-wifi-off"></i> إنت أوفلاين: بتشوف آخر بيانات اتحملت، وأي حاجة هتعملها هتتحفظ على موبايلك وتتبعت أول ما النت يرجع.${waiting}`);
    return;
  }

  if (queuedOffline && pending) {
    showBanner("syncing", `<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> النت رجع، جاري إرسال التعديلات...`);
    return;
  }

  if (queuedOffline) {
    queuedOffline = false;
    showBanner("done", '<i class="bi bi-check2-circle"></i> كل التعديلات اتبعتت للباقيين.');
    doneTimer = setTimeout(() => banner.classList.add("d-none"), 4000);
    return;
  }

  banner.classList.add("d-none");
}

window.addEventListener("online", renderBanner);
window.addEventListener("offline", renderBanner);
onSyncChange(renderBanner);
renderBanner();

// تعديل اتعمل أوفلاين والسيرفر رفضه لما اتبعت (مثلاً الصلاحيات اتغيرت)
const failBox = document.createElement("div");
failBox.className = "sync-failure d-none";
document.body.appendChild(failBox);

onSyncFailure((error) => {
  failBox.innerHTML = `
    <div class="alert alert-danger alert-dismissible mb-0 shadow" role="alert">
      <strong>تعديل ماتبعتش:</strong> حاجة عملتها وإنت أوفلاين اترفضت لما النت رجع (${escapeHtml(errorMessage(error))}).
      افتح الصفحة تاني واتأكد من البيانات.
      <button type="button" class="btn-close" data-close-failure aria-label="إغلاق"></button>
    </div>`;
  failBox.classList.remove("d-none");
});

failBox.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-failure]")) failBox.classList.add("d-none");
});
