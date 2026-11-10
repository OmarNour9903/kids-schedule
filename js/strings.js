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
  extra: "إضافي"
};

export const EDIT_SCOPES = {
  this: "اليوم ده بس",
  future: "من اليوم ده ولكل اللي جاي",
  all: "الموعد كله"
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
