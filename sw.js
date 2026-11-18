// Service worker: بيخزن صفحات السيستم على الجهاز عشان الأبلكيشن يفتح من غير نت.
// - صفحات وملفات السيستم: من النت الأول (عشان التحديثات توصل على طول)، ولو مفيش نت من النسخة المحفوظة.
// - المكتبات (Bootstrap، Firebase، الخطوط): من النسخة المحفوظة الأول لأن روابطها فيها رقم الإصدار.
// - بيانات Firebase نفسها مش بتعدي من هنا: Firebase بيخزنها لوحده على الجهاز.
// لو ضفت صفحة أو ملف جديد: ضيفه في LOCAL وغيّر رقم CACHE.
const CACHE = "kids-schedule-v3";

const LOCAL = [
  "./",
  "index.html",
  "signup.html",
  "dashboard.html",
  "driver.html",
  "appointment.html",
  "appointment-form.html",
  "children.html",
  "places.html",
  "members.html",
  "notifications.html",
  "admin.html",
  "admin-family.html",
  "offline.html",
  "manifest.webmanifest",
  "css/style.css",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
  "js/admin-nav.js",
  "js/data.js",
  "js/dates.js",
  "js/driver-actions.js",
  "js/firebase-config.js",
  "js/firebase.js",
  "js/map-picker.js",
  "js/maps-link.js",
  "js/nav.js",
  "js/notify.js",
  "js/offline.js",
  "js/pwa.js",
  "js/schedule.js",
  "js/session.js",
  "js/strings.js",
  "js/ui.js",
  "js/whats-new.js",
  "js/pages/admin-family.js",
  "js/pages/admin.js",
  "js/pages/appointment-form.js",
  "js/pages/appointment.js",
  "js/pages/children.js",
  "js/pages/dashboard.js",
  "js/pages/driver.js",
  "js/pages/login.js",
  "js/pages/members.js",
  "js/pages/notifications.js",
  "js/pages/places.js",
  "js/pages/signup.js"
];

const LIBRARIES = [
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.rtl.min.css",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js",
  "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js",
  "https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
];

const LIBRARY_HOSTS = ["cdn.jsdelivr.net", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com", "www.gstatic.com"];

// لو النت شغال بس بطيء، بعد المدة دي بنفتح النسخة المحفوظة
const NETWORK_WAIT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(LOCAL);
    // المكتبات واحدة واحدة، عشان لو واحدة فشلت الباقي يتخزن
    await Promise.all(LIBRARIES.map((url) => cache.add(new Request(url, { mode: "cors" })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, url));
  } else if (LIBRARY_HOSTS.includes(url.hostname) && !url.pathname.includes("/__/")) {
    event.respondWith(cacheFirst(request));
  }
  // أي حاجة تانية (Firebase، الخرايط، البحث) بتروح للنت عادي
});

// المتصفح مش بيقبل رد فيه تحويل (redirect) للصفحات، فبنعمل نسخة نضيفة منه
async function clean(response) {
  if (!response.redirected) return response;
  const body = await response.blob();
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

async function networkFirst(request, url) {
  const cache = await caches.open(CACHE);
  // الصفحة بأي تاريخ في الرابط (?date=...) ليها نسخة محفوظة واحدة
  const key = url.origin + url.pathname;
  const cached = await cache.match(key);

  // no-cache: بيسأل GitHub كل مرة لو فيه نسخة أحدث (لو مفيش، الرد صغير وسريع)
  const network = fetch(request, { cache: "no-cache" }).then(async (response) => {
    const ready = await clean(response);
    if (ready.ok) await cache.put(key, ready.clone());
    return ready;
  });

  const fallback = async () => {
    if (cached) return cached;
    if (request.mode === "navigate") {
      const offline = await cache.match("offline.html");
      if (offline) return offline;
    }
    return Response.error();
  };

  if (!cached) return network.catch(fallback);

  return Promise.race([
    network.catch(fallback),
    new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_WAIT_MS))
  ]);
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}
