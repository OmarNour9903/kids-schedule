// تنبيه "الجديد في السيستم": بيظهر مرة واحدة لكل مستخدم بعد كل تحديث.
// المرة دي بتتحفظ في حسابه (users/{uid}.seenVersion)، فلو شافه على جهاز مش هيظهرله على جهاز تاني.
// عند أي تحديث جديد: غيّر APP_VERSION واكتب الجديد في UPDATES.
import { db, doc, updateDoc } from "./firebase.js";
import { escapeHtml } from "./ui.js";

export const APP_VERSION = "2026-11-16";

const UPDATES = {
  all: [
    "كل موعد بقى مشوارين: <strong>ذهاب</strong> و<strong>عودة</strong>، وكل مشوار بيظهر لوحده بمعاده ومكانه.",
    "الملاحظات وتعليقات الأعضاء بقت بتظهر تحت كل مشوار في التقويم."
  ],
  managers: [
    "لما تحط <strong>معاد عودة</strong>، السيستم هيسألك: رايحين على فين؟ تختار البيت أو النادي أو أي مكان محفوظ، أو تضيف مكان جديد.",
    "المواعيد القديمة اللي كان ليها معاد رجوع، العودة فيها اتحسبت على مكان الاستلام. تقدر تعدّلها من صفحة الموعد.",
    "التعارض بقى بيظهر بس لو فيه مشوارين في نفس المعاد بالظبط، وتختار تحفظ برضو أو ترجع تعدّل."
  ],
  driver: [
    "مشوار الذهاب ومشوار العودة كل واحد ليه أزراره لوحده: تأكيد، وصلت، استلمت، وصّلته، أو اعتذار.",
    "تقدر تعتذر عن مشوار واحد بس، مثلاً تعمل الذهاب وتعتذر عن العودة."
  ]
};

export function showWhatsNew(session) {
  const { user, profile, member } = session;
  if (!profile || profile.seenVersion === APP_VERSION) return;

  const items = [
    ...UPDATES.all,
    ...(["owner", "parent"].includes(member?.role) ? UPDATES.managers : []),
    ...(member?.role === "driver" ? UPDATES.driver : [])
  ];

  const el = document.createElement("div");
  el.className = "modal fade";
  el.tabIndex = -1;
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title h5"><i class="bi bi-stars text-warning"></i> فيه تحديثات جديدة</h2>
          <button type="button" class="btn-close ms-0 me-auto" data-bs-dismiss="modal" aria-label="إغلاق"></button>
        </div>
        <div class="modal-body">
          <p class="mb-2">أهلاً ${escapeHtml(member?.name || "")}، ده الجديد في السيستم:</p>
          <ul class="whats-new-list mb-0">${items.map((t) => `<li>${t}</li>`).join("")}</ul>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-primary" data-bs-dismiss="modal">تمام، فهمت</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);

  // أول ما يقفل التنبيه بنسجل إنه شافه، عشان مايظهرش تاني
  el.addEventListener("hidden.bs.modal", async () => {
    profile.seenVersion = APP_VERSION;
    try {
      await updateDoc(doc(db, "users", user.uid), { seenVersion: APP_VERSION });
    } catch (error) {
      // لو الحفظ فشل، التنبيه هيظهر تاني المرة الجاية بس
    }
    el.remove();
  }, { once: true });

  bootstrap.Modal.getOrCreateInstance(el).show();
}
