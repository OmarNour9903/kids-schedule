// الشغل من غير نت: حالة الإرسال، والكتابة اللي ماتستناش السيرفر، وحدود الأيام المضمونة أوفلاين.
// Firestore بيحفظ أي تعديل على الموبايل على طول، بس الـ promise بتاعه مابيخلصش غير لما السيرفر يرد.
// لو الصفحة استنته وإحنا أوفلاين هتفضل واقفة، فبنعتبر التعديل خلص أول ما يتحفظ على الموبايل،
// ونتابع إرساله في الخلفية: لو اتبعت العداد بيقل، ولو السيرفر رفضه بيظهر تنبيه.
import { todayKey, addDays } from "./dates.js";

// لو النت شغال بس بطيء، بنستنى السيرفر المدة دي وبعدها نكمّل والإرسال يفضل شغال في الخلفية
const ONLINE_WAIT_MS = 6000;

// الأيام المضمونة وإنت أوفلاين: من أسبوع فات لحد شهر قدام
export const OFFLINE_DAYS_BACK = 7;
export const OFFLINE_DAYS_AHEAD = 30;

let pending = 0;
const changeListeners = new Set();
const failureListeners = new Set();

export function isOffline() {
  return !navigator.onLine;
}

export function syncState() {
  return { pending, offline: isOffline() };
}

export function onSyncChange(fn) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

// تعديل اتعمل أوفلاين والسيرفر رفضه لما النت رجع
export function onSyncFailure(fn) {
  failureListeners.add(fn);
  return () => failureListeners.delete(fn);
}

function emitChange() {
  changeListeners.forEach((fn) => fn(syncState()));
}

function settle(serverPromise) {
  let detached = false;
  pending += 1;
  emitChange();

  const result = Promise.resolve(serverPromise).then(
    (value) => { pending -= 1; emitChange(); return value; },
    (error) => {
      pending -= 1;
      emitChange();
      if (detached) failureListeners.forEach((fn) => fn(error));
      throw error;
    }
  );

  const detach = () => {
    detached = true;
    result.catch(() => {});
  };

  if (isOffline()) {
    detach();
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { detach(); resolve(); }, ONLINE_WAIT_MS);
    result.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); if (!detached) reject(error); }
    );
  });
}

// بتلف دوال الكتابة بتاعة Firestore عشان ماتوقفش الصفحة وإحنا أوفلاين
export function wrapWrites({ setDoc, updateDoc, deleteDoc, writeBatch, doc }) {
  return {
    setDoc: (...args) => settle(setDoc(...args)),
    updateDoc: (...args) => settle(updateDoc(...args)),
    deleteDoc: (...args) => settle(deleteDoc(...args)),
    // الـ id بيتعمل على الموبايل، فبيرجع على طول حتى من غير نت
    addDoc: async (collectionRef, data) => {
      const ref = doc(collectionRef);
      await settle(setDoc(ref, data));
      return ref;
    },
    writeBatch: (...args) => {
      const batch = writeBatch(...args);
      const commit = batch.commit.bind(batch);
      batch.commit = () => settle(commit());
      return batch;
    }
  };
}

// تعديل لسه على الموبايل وماوصلش السيرفر
export function isPendingDoc(snapshotDoc) {
  return Boolean(snapshotDoc.metadata && snapshotDoc.metadata.hasPendingWrites);
}

// لو أوفلاين واليوم برا الأيام المضمونة، بترجع رسالة تنبيه
export function offlineRangeNote(dateKey, today = todayKey()) {
  if (!isOffline()) return "";
  if (dateKey > addDays(today, OFFLINE_DAYS_AHEAD)) {
    return "إنت أوفلاين، واليوم ده بعد أكتر من شهر من النهارده. المواعيد اللي ظاهرة ممكن تكون اتغيرت، اتأكد منها لما النت يرجع.";
  }
  if (dateKey < addDays(today, -OFFLINE_DAYS_BACK)) {
    return "إنت أوفلاين، واليوم ده قبل أكتر من أسبوع. الحالات اللي ظاهرة ممكن تكون مش آخر حاجة، اتأكد منها لما النت يرجع.";
  }
  return "";
}
