// اختيار مكان: اسم المكان (إجباري) + لوكيشن من Google Maps (اختياري).
// اللوكيشن بيتجاب بلصق لينك المكان أو الإحداثيات من Google Maps.
// openMapPicker بترجع { name, lat, lng, mapsUrl, save } أو null لو المستخدم رجع.
// lat/lng/mapsUrl بيبقوا null لو المكان اتحفظ بالاسم بس، أو lat/lng بس null لو اللينك مختصر.
// createMap وshowPlacesMap لسه مستخدمين في عرض المكان في صفحة الموعد.
import { escapeHtml } from "./ui.js";
import { parseLocation } from "./maps-link.js";

function baseLayers() {
  return {
    "خريطة": L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      maxZoom: 20, subdomains: "abcd",
      attribution: "&copy; OpenStreetMap &copy; CARTO"
    }),
    "قمر صناعي": L.layerGroup([
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 20, maxNativeZoom: 19, attribution: "&copy; Esri"
      }),
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 20, maxNativeZoom: 19
      })
    ]),
    "OpenStreetMap": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "&copy; OpenStreetMap"
    })
  };
}

function createMap(container, options = {}) {
  const layers = baseLayers();
  const view = L.map(container, { zoomControl: true, ...options });
  layers["خريطة"].addTo(view);
  L.control.layers(layers, null, { position: "topright" }).addTo(view);
  return view;
}

let modalEl = null;
let picked = null;
let pickedUrl = null;

function ensureModal() {
  if (modalEl) return;
  modalEl = document.createElement("div");
  modalEl.className = "modal fade";
  modalEl.tabIndex = -1;
  modalEl.setAttribute("aria-hidden", "true");
  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-fullscreen-sm-down">
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title h5">المكان</h2>
          <button type="button" class="btn-close ms-0 me-auto" data-bs-dismiss="modal" aria-label="إغلاق"></button>
        </div>
        <div class="modal-body d-grid gap-3 align-content-start">

          <div>
            <label class="form-label fw-semibold" for="map-place-name">اسم المكان</label>
            <input type="text" class="form-control" id="map-place-name" maxlength="60" placeholder="مثلاً: نادي الصيد" data-name>
            <div class="invalid-feedback" data-error-name></div>
          </div>

          <div class="border border-primary-subtle rounded-3 p-3 bg-primary-subtle bg-opacity-25">
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
              <span class="fw-semibold">اللوكيشن من Google Maps <span class="fw-normal text-muted small">(اختياري)</span></span>
              <a class="btn btn-sm btn-success" href="https://www.google.com/maps" target="_blank" rel="noopener" data-gmaps>
                <i class="bi bi-box-arrow-up-left"></i> افتح Google Maps
              </a>
            </div>
            <ol class="small mb-2 ps-3">
              <li>في Google Maps ابحث عن المكان، أو دوس مطوّل على النقطة بالظبط.</li>
              <li>دوس <strong>مشاركة (Share)</strong> ← <strong>نسخ الرابط</strong>، أو انسخ الأرقام اللي بتظهر فوق زي 30.0444, 31.2357.</li>
              <li>ارجع هنا ودوس <strong>لصق</strong>.</li>
            </ol>
            <div class="input-group">
              <label class="visually-hidden" for="map-paste">لينك Google Maps أو الإحداثيات</label>
              <input type="text" class="form-control" id="map-paste" dir="ltr" placeholder="https://maps.app.goo.gl/... أو 30.0444, 31.2357" data-paste>
              <button type="button" class="btn btn-outline-primary" data-clipboard-btn><i class="bi bi-clipboard"></i> لصق</button>
              <button type="button" class="btn btn-primary" data-paste-btn>استخدم</button>
            </div>
            <div class="text-danger small mt-1 d-none" data-error-paste></div>
          </div>

          <div class="alert alert-light border py-2 mb-0 small" data-picked></div>

          <div class="form-check" data-save-wrap>
            <input class="form-check-input" type="checkbox" id="map-place-save" data-save checked>
            <label class="form-check-label" for="map-place-save">احفظه في الأماكن المحفوظة</label>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">رجوع</button>
          <button type="button" class="btn btn-primary" data-done>تم</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modalEl);
}

function el(name) {
  return modalEl.querySelector(`[data-${name}]`);
}

// كل رسالة خطأ بتظهر تحت الخانة اللي فيها المشكلة، والشاشة بتنزل لحدها
function showError(field, message) {
  const box = el(`error-${field}`);
  box.textContent = message || "";
  if (field === "name") {
    el("name").classList.toggle("is-invalid", Boolean(message));
  } else {
    box.classList.toggle("d-none", !message);
  }
  if (message) box.scrollIntoView({ behavior: "smooth", block: "center" });
}

function clearErrors() {
  ["paste", "name"].forEach((f) => showError(f, ""));
}

// زرار Google Maps بيفتح على اسم المكان لو مكتوب، أو على اللوكيشن اللي اتحدد
function updateGoogleLink() {
  const q = el("name").value.trim();
  let href = "https://www.google.com/maps/@30.0444,31.2357,12z";
  if (picked) href = `https://www.google.com/maps/search/?api=1&query=${picked.lat},${picked.lng}`;
  else if (q) href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  el("gmaps").href = href;
}

function updatePickedText() {
  let text = "من غير لوكيشن: المكان هيتحفظ بالاسم بس.";
  if (picked) text = `فيه لوكيشن: (${picked.lat.toFixed(5)}, ${picked.lng.toFixed(5)})`;
  else if (pickedUrl) text = "فيه لوكيشن: لينك Google Maps، السواق هيفتحه في Google Maps على طول.";
  el("picked").textContent = text;
  updateGoogleLink();
}

function usePasted() {
  const parsed = parseLocation(el("paste").value);
  if (!parsed) {
    showError("paste", "ماقدرناش نقرا اللينك ده. انسخ لينك المكان من Google Maps (مشاركة ← نسخ الرابط) أو الأرقام زي 30.0444, 31.2357");
    return;
  }
  pickedUrl = parsed.url || null;
  picked = parsed.lat != null ? { lat: Number(parsed.lat.toFixed(6)), lng: Number(parsed.lng.toFixed(6)) } : null;
  showError("paste", "");
  updatePickedText();
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) throw new Error("empty");
    el("paste").value = text.trim();
    usePasted();
  } catch (error) {
    el("paste").focus();
    showError("paste", "ماقدرناش نقرا اللي انت ناسخه. دوس مطوّل في الخانة واختار لصق (Paste)، وبعدين دوس استخدم.");
  }
}

export function openMapPicker({ lat, lng, name = "", mapsUrl = null, showSave = true } = {}) {
  ensureModal();
  el("name").value = name;
  el("save").checked = true;
  el("save-wrap").classList.toggle("d-none", !showSave);
  el("paste").value = mapsUrl || "";
  picked = lat != null ? { lat, lng } : null;
  pickedUrl = mapsUrl || null;
  clearErrors();
  updatePickedText();

  return new Promise((resolve) => {
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    let result = null;

    const onPasteKey = (e) => { if (e.key === "Enter") { e.preventDefault(); usePasted(); } };
    const onNameInput = () => {
      if (el("name").value.trim()) showError("name", "");
      updateGoogleLink();
    };

    // اللوكيشن اختياري، الاسم بس اللي لازم
    const onDone = () => {
      const placeName = el("name").value.trim();
      if (!placeName) {
        el("name").focus();
        return showError("name", "اكتب اسم المكان.");
      }
      result = {
        name: placeName,
        lat: picked ? picked.lat : null,
        lng: picked ? picked.lng : null,
        mapsUrl: pickedUrl,
        save: showSave && el("save").checked
      };
      modal.hide();
    };

    const bindings = [
      [el("done"), "click", onDone],
      [el("paste-btn"), "click", usePasted],
      [el("paste"), "keydown", onPasteKey],
      [el("clipboard-btn"), "click", pasteFromClipboard],
      [el("name"), "input", onNameInput]
    ];
    bindings.forEach(([node, type, fn]) => node.addEventListener(type, fn));

    modalEl.addEventListener("hidden.bs.modal", () => {
      bindings.forEach(([node, type, fn]) => node.removeEventListener(type, fn));
      resolve(result);
    }, { once: true });

    modal.show();
  });
}

// خريطة صغيرة للعرض بس
export function showPlacesMap(container, places) {
  const valid = places.filter((p) => p && p.lat != null);
  if (!valid.length) return null;
  // من غير نت الخريطة مش هتحمّل، فبنكتب ده بدل مساحة فاضية
  if (!navigator.onLine) {
    container.innerHTML = '<div class="map-offline small text-muted"><i class="bi bi-wifi-off"></i> الخريطة محتاجة نت. لينكات Google Maps شغالة وبتفتح في أبلكيشن الخرايط.</div>';
    return null;
  }
  container.querySelector(".map-offline")?.remove();
  const view = createMap(container, { scrollWheelZoom: false });
  const markers = valid.map((p) => L.marker([p.lat, p.lng]).addTo(view).bindPopup(escapeHtml(p.label || p.name)));
  if (markers.length === 1) view.setView(markers[0].getLatLng(), 16);
  else view.fitBounds(L.featureGroup(markers).getBounds().pad(0.3));
  return view;
}

// لينك يفتح المكان في Google Maps: اللينك الأصلي لو موجود، غير كده بالإحداثيات.
// بترجع null لو المكان متسجل بالاسم بس.
export function mapsLink(place) {
  if (place.mapsUrl) return place.mapsUrl;
  if (place.lat == null) return null;
  return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
}
