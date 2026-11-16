// تنبيه "الجديد في السيستم": بيظهر مرة واحدة لكل مستخدم بعد كل تحديث.
// المرة دي بتتحفظ في حسابه (users/{uid}.seenVersion)، فلو شافه على جهاز مش هيظهرله على جهاز تاني.
// لو المستخدم فاته أكتر من تحديث، بيشوفهم كلهم مرة واحدة.
// عند أي تحديث جديد: ضيف إصدار جديد في آخر RELEASES (رقم الإصدار لازم يبقى أكبر من اللي قبله).
import { db, doc, updateDoc } from "./firebase.js";
import { escapeHtml } from "./ui.js";

const RELEASES = [
  {
    version: "2026-11-16",
    title: "مشاوير الذهاب والعودة",
    sections: [{
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
    }]
  },
  {
    version: "2026-11-17",
    title: "السيستم بقى أبلكيشن وبيشتغل من غير نت",
    sections: [
      {
        all: [
          "تقدر تحمّل السيستم كأبلكيشن على الموبايل: افتح القايمة ودوس <strong>تحميل الأبلكيشن</strong>، وهتلاقي أيقونة \"مواعيد الأولاد\" على الشاشة الرئيسية.",
          "على <strong>الآيفون</strong>: الزرار بيوريك الخطوات (من Safari: زرار المشاركة ← إضافة إلى الشاشة الرئيسية). أبل مش بتسمح بالتحميل بضغطة واحدة.",
          "الأبلكيشن بيفتح ويشتغل <strong>من غير نت</strong> بآخر بيانات اتحملت على موبايلك، وأي حاجة تعملها بتتبعت لوحدها أول ما النت يرجع.",
          "وإنت أوفلاين هيظهر تحت شريط أسود فيه \"إنت أوفلاين\"، وأي حاجة لسه ماتبعتتش هيبان جنبها <strong>لسه ماتبعتش</strong>."
        ],
        managers: [
          "إضافة مكان بقت أسهل: تكتب اسم المكان، و<strong>اللوكيشن اختياري</strong>. لو عايز تحطه، افتح Google Maps وانسخ لينك المكان والصقه."
        ]
      },
      {
        title: "قيود الشغل من غير نت (مهم تقراها)",
        ordered: true,
        all: [
          "<strong>أول مرة لازم نت:</strong> تسجيل الدخول محتاج نت، ولازم تفتح الأبلكيشن مرة وإنت متصل عشان البيانات تتحمل على موبايلك. لو سجلت خروج، هتحتاج نت تاني عشان تدخل.",
          "<strong>اللي بيعمله غيرك مش هيوصلك وإنت أوفلاين:</strong> بتشوف آخر نسخة اتحملت عندك. أي موعد جديد أو تعديل أو إلغاء أو تعليق من حد تاني مش هيظهرلك غير لما النت يرجع.",
          "<strong>اللي بتعمله إنت مش هيوصل لغيرك وإنت أوفلاين:</strong> بيتحفظ على موبايلك بس، ومحدش هيشوفه ولا هيوصله إشعار بيه غير لما النت يرجع عندك.",
          "<strong>الإرسال بيحصل والأبلكيشن مفتوح:</strong> لما النت يرجع، افتح الأبلكيشن عشان التعديلات تتبعت. مش بتتبعت في الخلفية وهو مقفول.",
          "<strong>ماتمسحش بيانات المتصفح ولا تشيل الأبلكيشن</strong> قبل ما التعديلات تتبعت، وإلا هتضيع.",
          "<strong>الأيام المضمونة:</strong> من أسبوع فات لحد شهر قدام. لو فتحت يوم بعد كده وإنت أوفلاين، هيظهرلك تنبيه إن المواعيد ممكن تكون اتغيرت.",
          "<strong>الخريطة اللي في صفحة الموعد محتاجة نت.</strong> اسم المكان بيفضل ظاهر، ولينك Google Maps بيفتح في أبلكيشن الخرايط. وإضافة مكان جديد شغالة أوفلاين.",
          "<strong>لو اتنين عدّلوا نفس الحاجة وهما أوفلاين،</strong> آخر تعديل يوصل السيرفر هو اللي بيفضل.",
          "<strong>لو حاجة عملتها أوفلاين اترفضت لما اتبعتت</strong> (مثلاً صلاحيتك اتغيرت أو الموعد اتمسح)، هيظهرلك تنبيه أحمر فوق.",
          "<strong>على الآيفون:</strong> افتح السيستم من الأيقونة، مش من Safari. لو فتحته من Safari وماستخدمتوش فترة، الآيفون ممكن يمسح البيانات المحفوظة وهتحتاج نت."
        ],
        managers: [
          "<strong>فحص التعارض وإنت أوفلاين ناقص:</strong> بيشوف المواعيد اللي على موبايلك بس، فممكن مايشوفش موعد ضافه حد تاني وهو أوفلاين برضو. هيظهرلك تنبيه بده وإنت بتحفظ.",
          "<strong>لينك الدعوة</strong> اللي تعمله وإنت أوفلاين مش هيشتغل مع الشخص التاني غير لما النت يرجع عندك."
        ],
        driver: [
          "<strong>أزرار المشوار شغالة أوفلاين</strong> (تأكيد، وصلت، استلمت، وصّلته، اعتذار)، والوقت بيتسجل بوقت ما دوست، مش بوقت ما النت رجع. بس ولي الأمر مش هيعرف غير لما النت يرجع عندك."
        ]
      }
    ]
  }
];

export const APP_VERSION = RELEASES[RELEASES.length - 1].version;

function itemsFor(section, role) {
  return [
    ...(section.all || []),
    ...(["owner", "parent"].includes(role) ? section.managers || [] : []),
    ...(role === "driver" ? section.driver || [] : [])
  ];
}

function sectionHtml(section, role) {
  const items = itemsFor(section, role);
  if (!items.length) return "";
  const tag = section.ordered ? "ol" : "ul";
  return `
    <div class="whats-new-section">
      ${section.title ? `<h4 class="h6 fw-bold"><i class="bi bi-wifi-off"></i> ${section.title}</h4>` : ""}
      <${tag} class="whats-new-list mb-0">${items.map((t) => `<li>${t}</li>`).join("")}</${tag}>
    </div>`;
}

export function showWhatsNew(session) {
  const { user, profile, member } = session;
  if (!profile || profile.seenVersion === APP_VERSION) return;

  const seen = profile.seenVersion || "";
  const releases = RELEASES.filter((r) => r.version > seen);
  const role = member?.role;

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
          <p class="mb-3">أهلاً ${escapeHtml(member?.name || "")}، ده الجديد في السيستم:</p>
          ${releases.map((r) => `
            <section class="whats-new-section">
              <h3 class="h6 fw-bold text-primary">${r.title}</h3>
              ${r.sections.map((s) => sectionHtml(s, role)).join("")}
            </section>`).join("")}
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
