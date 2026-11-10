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
        <div class="modal-body text-prewrap" data-modal-body></div>
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

// رسالة فيها أكتر من اختيار. بترجع value بتاع الاختيار، أو null لو رجع
let choiceEl = null;

function ensureChoiceModal() {
  if (choiceEl) return;
  choiceEl = document.createElement("div");
  choiceEl.className = "modal fade";
  choiceEl.tabIndex = -1;
  choiceEl.setAttribute("aria-hidden", "true");
  choiceEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title h5" data-choice-title></h2>
          <button type="button" class="btn-close ms-0 me-auto" data-bs-dismiss="modal" aria-label="إغلاق"></button>
        </div>
        <div class="modal-body text-prewrap" data-choice-body></div>
        <div class="modal-footer flex-column align-items-stretch gap-2" data-choice-buttons></div>
      </div>
    </div>`;
  document.body.appendChild(choiceEl);
}

export function choiceDialog({ title, message, choices }) {
  ensureChoiceModal();
  choiceEl.querySelector("[data-choice-title]").textContent = title;
  choiceEl.querySelector("[data-choice-body]").textContent = message;
  const buttons = choiceEl.querySelector("[data-choice-buttons]");
  buttons.innerHTML = "";

  return new Promise((resolve) => {
    const modal = bootstrap.Modal.getOrCreateInstance(choiceEl);
    let picked = null;

    [...choices, { label: "رجوع", value: null, style: "btn-outline-secondary" }].forEach((choice) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `btn ${choice.style || "btn-primary"}`;
      btn.textContent = choice.label;
      btn.addEventListener("click", () => {
        picked = choice.value;
        modal.hide();
      });
      buttons.appendChild(btn);
    });

    choiceEl.addEventListener("hidden.bs.modal", () => resolve(picked), { once: true });
    modal.show();
  });
}

// رسالة فيها خانة نص إجبارية (زي سبب الاعتذار). بترجع النص أو null لو رجع
let promptEl = null;

export function promptDialog({ title, message, label, confirmText = "إرسال", danger = false }) {
  if (!promptEl) {
    promptEl = document.createElement("div");
    promptEl.className = "modal fade";
    promptEl.tabIndex = -1;
    promptEl.setAttribute("aria-hidden", "true");
    promptEl.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title h5" data-prompt-title></h2>
            <button type="button" class="btn-close ms-0 me-auto" data-bs-dismiss="modal" aria-label="إغلاق"></button>
          </div>
          <div class="modal-body">
            <p class="text-prewrap" data-prompt-message></p>
            <label class="form-label fw-semibold" for="prompt-input" data-prompt-label></label>
            <textarea class="form-control" id="prompt-input" rows="3" maxlength="300" data-prompt-input></textarea>
            <div class="invalid-feedback">الخانة دي مطلوبة</div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">رجوع</button>
            <button type="button" class="btn" data-prompt-confirm></button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(promptEl);
  }

  const input = promptEl.querySelector("[data-prompt-input]");
  const confirmBtn = promptEl.querySelector("[data-prompt-confirm]");
  promptEl.querySelector("[data-prompt-title]").textContent = title;
  promptEl.querySelector("[data-prompt-message]").textContent = message;
  promptEl.querySelector("[data-prompt-label]").textContent = label;
  input.value = "";
  input.classList.remove("is-invalid");
  confirmBtn.textContent = confirmText;
  confirmBtn.className = `btn ${danger ? "btn-danger" : "btn-primary"}`;

  return new Promise((resolve) => {
    const modal = bootstrap.Modal.getOrCreateInstance(promptEl);
    let result = null;
    const onConfirm = () => {
      const value = input.value.trim();
      if (!value) {
        input.classList.add("is-invalid");
        return;
      }
      result = value;
      modal.hide();
    };
    confirmBtn.addEventListener("click", onConfirm);
    promptEl.addEventListener("shown.bs.modal", () => input.focus(), { once: true });
    promptEl.addEventListener("hidden.bs.modal", () => {
      confirmBtn.removeEventListener("click", onConfirm);
      resolve(result);
    }, { once: true });
    modal.show();
  });
}

// إظهار محتوى الصفحة بعد ما بيانات الجلسة تحمل
export function revealPage() {
  document.getElementById("page-loader")?.classList.add("d-none");
  document.getElementById("page-content")?.classList.remove("d-none");
}
