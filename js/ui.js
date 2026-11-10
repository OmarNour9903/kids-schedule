// أدوات واجهة مشتركة: حماية النصوص، التنبيهات، رسالة التأكيد، حالة التحميل

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function showAlert(container, message, type = "danger") {
  container.innerHTML = `<div class="alert alert-${type} mb-0" role="alert">${escapeHtml(message)}</div>`;
  container.classList.remove("d-none");
}

export function hideAlert(container) {
  container.innerHTML = "";
  container.classList.add("d-none");
}

export function setLoading(button, loading, loadingText = "استنى...") {
  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

export function formatDate(date) {
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

// رسالة تأكيد قبل أي عملية. بترجع true لو المستخدم أكد
let modalEl = null;

function ensureModal() {
  if (modalEl) return;
  modalEl = document.createElement("div");
  modalEl.className = "modal fade";
  modalEl.tabIndex = -1;
  modalEl.setAttribute("aria-hidden", "true");
  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title h5" data-modal-title></h2>
          <button type="button" class="btn-close ms-0 me-auto" data-bs-dismiss="modal" aria-label="إغلاق"></button>
        </div>
        <div class="modal-body" data-modal-body></div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">رجوع</button>
          <button type="button" class="btn btn-primary" data-modal-confirm>تأكيد</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modalEl);
}

export function confirmDialog({ title, message, confirmText = "تأكيد", danger = false }) {
  ensureModal();
  modalEl.querySelector("[data-modal-title]").textContent = title;
  modalEl.querySelector("[data-modal-body]").textContent = message;
  const confirmBtn = modalEl.querySelector("[data-modal-confirm]");
  confirmBtn.textContent = confirmText;
  confirmBtn.className = `btn ${danger ? "btn-danger" : "btn-primary"}`;

  return new Promise((resolve) => {
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    let confirmed = false;
    const onConfirm = () => {
      confirmed = true;
      modal.hide();
    };
    confirmBtn.addEventListener("click", onConfirm);
    modalEl.addEventListener("hidden.bs.modal", () => {
      confirmBtn.removeEventListener("click", onConfirm);
      resolve(confirmed);
    }, { once: true });
    modal.show();
  });
}

// إظهار محتوى الصفحة بعد ما بيانات الجلسة تحمل
export function revealPage() {
  document.getElementById("page-loader")?.classList.add("d-none");
  document.getElementById("page-content")?.classList.remove("d-none");
}
