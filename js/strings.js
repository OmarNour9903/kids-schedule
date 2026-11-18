// كل نصوص الواجهة الثابتة هنا عشان الترجمة بعدين تبقى سهلة

export const APP_NAME = "مواعيد الأولاد";

export const ROLE_LABELS = {
  owner: "ولي أمر (المالك)",
  parent: "ولي أمر",
  viewer: "مشاهد",
  driver: "سواق"
};

export const STATUS_LABELS = {
  active: "مفعّل",
  suspended: "موقوف"
};

// الأدوار اللي ينفع تتعمل بيها دعوة (المالك واحد بس وهو اللي عمل العيلة)
export const INVITABLE_ROLES = ["parent", "viewer", "driver"];

export const INVITE_DAYS_VALID = 7;

export const APPOINTMENT_TYPES = {
  regular: "عادي",
  extra: "إضافي",
  travel: "سفر"
};

// المشوارين في الموعد الواحد
export const LEG_LABELS = {
  go: "ذهاب",
  return: "عودة"
};

// حالات المشوار بالترتيب
export const TRIP_STATUS = {
  scheduled: { label: "مجدول", badge: "text-bg-light" },
  confirmed: { label: "مؤكد من السواق", badge: "text-bg-primary" },
  arrived: { label: "السواق وصل", badge: "text-bg-info" },
  picked: { label: "استلم الولد", badge: "text-bg-info" },
  done: { label: "وصّله", badge: "text-bg-success" },
  declined: { label: "اعتذر السواق", badge: "text-bg-danger" }
};

// نص الحالة بالأسماء: "مؤكد من أحمد" بدل "مؤكد من السواق"، و"أحمد وصل" بدل "السواق وصل"، و"تم استلام يوسف" بدل "استلم الولد".
// by: اسم اللي أكد، kids: أسماء الأولاد اللي في الموعد. لو مش موجودين بيرجع النص العام.
export function statusText(status, { by = "", kids = "" } = {}) {
  if (status === "confirmed" && by) return `مؤكد من ${by}`;
  if (status === "arrived" && by) return `${by} وصل`;
  if (status === "declined" && by) return `اعتذر ${by}`;
  if (status === "picked" && kids) return `تم استلام ${kids}`;
  return TRIP_STATUS[status]?.label || status;
}

export const EDIT_SCOPES = {
  this: "اليوم ده بس",
  future: "من اليوم ده ولكل اللي جاي",
  all: "الموعد كله",
  group: "كل أيام المجموعة من اليوم ده"
};

// الأدوار اللي تقدر تدير المواعيد والأولاد والأماكن
export const MANAGER_ROLES = ["owner", "parent"];

const AUTH_ERRORS = {
  "auth/invalid-credential": "الإيميل أو الباسورد غلط",
  "auth/wrong-password": "الإيميل أو الباسورد غلط",
  "auth/user-not-found": "الإيميل أو الباسورد غلط",
  "auth/invalid-email": "الإيميل مش مكتوب صح",
  "auth/email-already-in-use": "الإيميل ده متسجل قبل كده",
  "auth/weak-password": "الباسورد لازم يكون 6 حروف على الأقل",
  "auth/missing-password": "اكتب الباسورد",
  "auth/too-many-requests": "محاولات كتير، استنى شوية وجرب تاني",
  "auth/network-request-failed": "فيه مشكلة في الإنترنت",
  "permission-denied": "مش مسموحلك تعمل العملية دي",
  "unavailable": "فيه مشكلة في الاتصال، جرب تاني"
};

export function errorMessage(error) {
  const code = error && error.code ? error.code : "";
  return AUTH_ERRORS[code] || "حصلت مشكلة، جرب تاني";
}
