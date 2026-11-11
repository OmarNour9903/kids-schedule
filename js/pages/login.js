import {
  auth, isConfigured, onAuthStateChanged,
  signInWithEmailAndPassword, sendPasswordResetEmail
} from "../firebase.js";
import { showAlert, hideAlert, setLoading } from "../ui.js";
import { errorMessage } from "../strings.js";

const form = document.getElementById("login-form");
const alertBox = document.getElementById("login-alert");
const submitBtn = document.getElementById("login-submit");
const resetBtn = document.getElementById("reset-password");

const URL_ERRORS = {
  "suspended": "حسابك موقوف حالياً. كلّم ولي الأمر لو محتاج تفعيله.",
  "no-family": "حسابك مش مربوط بأي عيلة. استخدم لينك الدعوة اللي وصلك.",
  "disabled": "حسابك متوقف من إدارة السيستم. تواصل معانا لو محتاج تفعيله.",
  "family-suspended": "حساب العيلة متوقف حالياً من إدارة السيستم. تواصل معانا لو محتاج تفعيله."
};

const urlError = new URLSearchParams(location.search).get("error");
if (URL_ERRORS[urlError]) showAlert(alertBox, URL_ERRORS[urlError], "warning");

if (!isConfigured) {
  showAlert(alertBox, "لسه إعدادات Firebase مش متحطة في js/firebase-config.js", "warning");
}

// لو داخل قبل كده، يروح على الرئيسية على طول
const unsubscribe = onAuthStateChanged(auth, (user) => {
  unsubscribe();
  if (user && !urlError) location.replace("dashboard.html");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideAlert(alertBox);
  if (!form.checkValidity()) {
    form.classList.add("was-validated");
    return;
  }

  setLoading(submitBtn, true);
  try {
    await signInWithEmailAndPassword(auth, form.email.value.trim(), form.password.value);
    location.replace("dashboard.html");
  } catch (error) {
    showAlert(alertBox, errorMessage(error));
    setLoading(submitBtn, false);
  }
});

resetBtn.addEventListener("click", async () => {
  hideAlert(alertBox);
  const email = form.email.value.trim();
  if (!email) {
    showAlert(alertBox, "اكتب إيميلك الأول، وبعدين دوس \"نسيت الباسورد\"", "warning");
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    showAlert(alertBox, "لو الإيميل متسجل، هيوصلك لينك تغيير الباسورد", "success");
  } catch (error) {
    showAlert(alertBox, errorMessage(error));
  }
});
