# مواعيد الأولاد

سيستم لإدارة مواعيد مشاوير الأولاد بين أولياء الأمر والسواق.
الواجهة HTML/CSS/JS + Bootstrap، والـ backend على Firebase (Auth + Firestore).

## المرحلة الأولى (الموجودة دلوقتي)

- تسجيل دخول بالإيميل والباسورد، ونسيت الباسورد.
- إنشاء عيلة جديدة (اللي بيعملها بيبقى المالك).
- دعوة أعضاء بلينك يستخدم مرة واحدة وصالح 7 أيام: ولي أمر، مشاهد، سواق.
- صفحة الأعضاء: المالك يغير الأدوار ويوقف/يفعّل، وولي الأمر يوقف/يفعّل السواقين.
- الصلاحيات كلها متطبقة في `firestore.rules`.

## المرحلة التانية والتالتة

- الأولاد (`children.html`) والأماكن المحفوظة من الخريطة (`places.html`).
- إضافة موعد عادي أو إضافي، مرة واحدة أو متكرر كل أسبوع (`appointment-form.html`).
- فحص التعارض قبل الحفظ، ورسالة تأكيد فيها ملخص الموعد.
- تفاصيل الموعد (`appointment.html`): تعديل أو إلغاء اليوم ده بس، أو من اليوم ده ولكل اللي جاي، ورجوع يوم ملغي.
- التقويم الشهري في `dashboard.html`، والأسبوع بيبدأ السبت.
- منطق التكرار والتعارض في `js/schedule.js` منفصل عن Firebase عشان يتختبر لوحده.

## الملفات

```
index.html          تسجيل الدخول
signup.html         التسجيل (بدعوة أو عيلة جديدة)
dashboard.html      الرئيسية
members.html        الأعضاء والدعوات
css/style.css
js/firebase-config.js   إعدادات مشروع Firebase (إنت بتملاها)
js/firebase.js          تشغيل Firebase
js/session.js           تحميل المستخدم ودوره وحماية الصفحات
js/nav.js               شريط التنقل
js/ui.js                أدوات الواجهة ورسالة التأكيد
js/strings.js           نصوص الواجهة
js/pages/*.js           كود كل صفحة
firestore.rules         صلاحيات قاعدة البيانات
```

## خطوات التشغيل

### 1. عمل مشروع Firebase

1. ادخل [console.firebase.google.com](https://console.firebase.google.com) بحسابك، واعمل مشروع جديد (Google Analytics مش محتاجينه).
2. **Authentication** ← Get started ← Sign-in method ← فعّل **Email/Password**.
3. **Firestore Database** ← Create database ← اختار **Production mode** ← المكان: `europe-west` (أقرب لمصر).
4. في Firestore ← تبويب **Rules** ← امسح الموجود والصق محتوى ملف `firestore.rules` ← **Publish**.
5. **Project settings** (الترس) ← Your apps ← أيقونة الويب `</>` ← سجل app باسم مثلاً `kids-schedule` (من غير Hosting).
6. انسخ القيم اللي في `firebaseConfig` وحطها في `js/firebase-config.js`.

### 2. التجربة على جهازك

الكود بيستخدم ES Modules، فلازم يتفتح من server مش بدبل كليك على الملف.
أسهل طريقة: إضافة **Live Server** في VS Code، كليك يمين على `index.html` ← Open with Live Server.

### 3. الرفع على GitHub Pages

1. اعمل repo جديد وارفع الفولدر.
2. Settings ← Pages ← Source: `Deploy from a branch` ← Branch: `main` / `root` ← Save.
3. في Firebase ← Authentication ← Settings ← **Authorized domains** ← ضيف `omarnour9903.github.io`.

### 4. أول استخدام

1. افتح `signup.html` واعمل العيلة (إنت أو دكتور وائل، اللي هيبقى المالك).
2. من صفحة **الأعضاء** اعمل لينك دعوة لكل شخص بدوره، وابعته واتساب.

## ملاحظات

- الـ repo هيبقى public، فماتحطش فيه أي بيانات حقيقية. إعدادات Firebase نفسها مش سرية، والحماية في الـ Rules.
- لما ننقل الاستضافة لـ Firebase Hosting، الكود مش هيتغير.
