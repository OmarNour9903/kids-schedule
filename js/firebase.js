// تشغيل Firebase وتجميع كل الدوال اللي بنستخدمها في مكان واحد
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  setDoc as rawSetDoc,
  updateDoc as rawUpdateDoc,
  deleteDoc as rawDeleteDoc,
  writeBatch as rawWriteBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { wrapWrites } from "./offline.js";

export const isConfigured = !String(firebaseConfig.apiKey || "").startsWith("PASTE_");

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// البيانات بتتخزن على الجهاز، فالأبلكيشن بيشتغل من غير نت والتعديلات بتتبعت لما النت يرجع
function createDb() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
  } catch (error) {
    // متصفح مش بيدعم التخزين: يشتغل عادي بس محتاج نت
    return getFirestore(app);
  }
}
export const db = createDb();

// الكتابة مابتستناش السيرفر وإحنا أوفلاين (التفاصيل في offline.js)
export const { setDoc, updateDoc, deleteDoc, addDoc, writeBatch } = wrapWrites({
  setDoc: rawSetDoc,
  updateDoc: rawUpdateDoc,
  deleteDoc: rawDeleteDoc,
  writeBatch: rawWriteBatch,
  doc
});

export {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  deleteUser,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export {
  doc,
  collection,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  arrayUnion,
  onSnapshot,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
