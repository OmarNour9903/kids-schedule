// اختيار مكان: خريطة واضحة (عادية أو قمر صناعي)، بحث بالاسم،
// أو لصق لينك/إحداثيات من Google Maps.
// openMapPicker بترجع { name, lat, lng, mapsUrl, save } أو null لو المستخدم رجع.
// lat/lng ممكن يبقوا null لو المستخدم لصق لينك مختصر من غير ما يحدد نقطة.
import { escapeHtml } from "./ui.js";
import { parseLocation } from "./maps-link.js";

const DEFAULT_CENTER = [30.0444, 31.2357]; // القاهرة
const SEARCH_URL = "https://nominatim.openstreetmap.org/search";

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
let map = null;
let marker = null;
let picked = null;
let pickedUrl = null;

function ensureModal() {
  if (modalEl) return;
  modalEl = document.createElement("div");
  modalEl.className = "modal fade";
  modalEl.tabIndex = -1;
  modalEl.setAttribute("aria-hidden", "true");
  modalEl.innerHTML = `
    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable modal-fullscreen-sm-down">
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title h5">حدد المكان</h2>
          <button type="button" class="btn-close ms-0 me-auto" data-bs-dismiss="modal" aria-label="إغلاق"></button>
        </div>
        <div class="modal-body d-grid gap-3">

          <p class="small mb-0">
            3 طرق: <strong>ابحث بالاسم</strong>، أو <strong>دوس على الخريطة</strong>،
            أو <strong>هات اللينك من Google Maps</strong> (تحت الخريطة).
          </p>

          <div>
            <label class="form-label fw-semibold" for="map-search">1. ابحث بالاسم</label>
            <div class="input-group">
              <input type="search" class="form-control" id="map-search" placeholder="مثلاً: نادي الصيد الدقي" data-search>
              <button type="button" class="btn btn-outline-primary" data-search-btn><i class="bi bi-search"></i> بحث</button>
            </div>
            <div class="list-group mt-1 map-search-results" data-results></div>
          </div>

          <div>
            <div class="form-label fw-semibold">2. أو دوس على الخريطة في مكان النقطة بالظبط</div>
            <div class="map-picker-map" data-map></div>
            <div class="d-flex justify-content-between align-items-center gap-2 mt-1">
              <span class="small text-muted">"قمر صناعي" من فوق الخريطة = تفاصيل أكتر.</span>
              <button type="button" class="btn btn-sm btn-outline-secondary text-nowrap" data-locate>
                <i class="bi bi-crosshair"></i> موقعي الحالي
              </button>
            </div>
          </div>

          <div class="border border-primary-subtle rounded-3 p-3 bg-primary-subtle bg-opacity-25">
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
              <span class="fw-semibold">3. أو هات المكان من Google Maps</span>
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

          <div>
            <div class="alert alert-light border py-2 mb-0 small" data-picked>لسه ماحددتش مكان.</div>
            <div class="alert alert-danger py-2 mt-2 mb-0 small d-none" data-error-place></div>
          </div>

          <div>
            <label class="form-label fw-semibold" for="map-place-name">اسم المكان</label>
            <input type="text" class="form-control" id="map-place-name" maxlength="60" placeholder="مثلاً: نادي الصيد" data-name>
            <div class="invalid-feedback" data-error-name></div>
          </div>
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
  ["paste", "place", "name"].forEach((f) => showError(f, ""));
}

// زرار Google Maps بيفتح على اللي المستخدم كتبه في البحث، أو على النقطة اللي حددها
function updateGoogleLink() {
  const q = el("search").value.trim();
  let href = "https://www.google.com/maps/@30.0444,31.2357,12z";
  if (q) href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  else if (picked) href = `https://www.google.com/maps/search/?api=1&query=${picked.lat},${picked.lng}`;
  el("gmaps").href = href;
}

function updatePickedText() {
  const box = el("picked");
  if (picked) {
    box.textContent = `المكان المحدد: نقطة على الخريطة (${picked.lat.toFixed(5)}, ${picked.lng.toFixed(5)})${pickedUrl ? " + لينك Google Maps" : ""}`;
  } else if (pickedUrl) {
    box.textContent = "المكان المحدد: لينك Google Maps. السواق هيفتحه في Google Maps على طول. لو عايز يظهر على خريطة السيستم كمان، دوس على مكانه في الخريطة.";
  } else {
    box.textContent = "لسه ماحددتش مكان.";
  }
}

function setMarker(lat, lng, zoom) {
  picked = { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
  if (marker) marker.setLatLng([lat, lng]);
  else marker = L.marker([lat, lng]).addTo(map);
  if (zoom) map.setView([lat, lng], zoom);
  updatePickedText();
  updateGoogleLink();
  showError("place", "");
}

async function search() {
  const q = el("search").value.trim();
  const results = el("results");
  if (!q) return;
  results.innerHTML = '<div class="list-group-item small text-muted">بيدوّر...</div>';
  try {
    const params = new URLSearchParams({ format: "jsonv2", q, countrycodes: "eg", "accept-language": "ar", limit: "6" });
    const response = await fetch(`${SEARCH_URL}?${params}`, { headers: { Accept: "application/json" } });
    const items = await response.json();
    if (!items.length) {
      results.innerHTML = '<div class="list-group-item small text-muted">مالقيناش نتايج. جرب اسم تاني، أو حدد من الخريطة، أو الصق لينك من Google Maps.</div>';
      return;
    }
    results.innerHTML = items.map((item, i) => `
      <button type="button" class="list-group-item list-group-item-action small" data-result="${i}">
        <span class="fw-semibold d-block">${escapeHtml(item.name || item.display_name.split(",")[0])}</span>
        <span class="text-muted">${escapeHtml(item.display_name)}</span>
      </button>`).join("");
    results.querySelectorAll("[data-result]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = items[Number(btn.dataset.result)];
        setMarker(Number(item.lat), Number(item.lon), 17);
        if (!el("name").value.trim()) el("name").value = item.name || item.display_name.split(",")[0];
        results.innerHTML = "";
      });
    });
  } catch (error) {
    results.innerHTML = '<div class="list-group-item small text-danger">البحث مش شغال دلوقتي. حدد من الخريطة أو الصق لينك.</div>';
  }
}

function usePasted() {
  const parsed = parseLocation(el("paste").value);
  if (!parsed) {
    showError("paste", "ماقدرناش نقرا اللينك ده. انسخ لينك المكان من Google Maps (مشاركة ← نسخ الرابط) أو الأرقام زي 30.0444, 31.2357");
    return;
  }
  pickedUrl = parsed.url || null;
  showError("paste", "");
  if (parsed.lat != null) {
    setMarker(parsed.lat, parsed.lng, 17);
  } else {
    updatePickedText();
    showError("place", "");
  }
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
  el("search").value = "";
  el("results").innerHTML = "";
  el("paste").value = mapsUrl || "";
  picked = lat != null ? { lat, lng } : null;
  pickedUrl = mapsUrl || null;
  clearErrors();
  updatePickedText();
  updateGoogleLink();

  return new Promise((resolve) => {
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    let result = null;

    const onShown = () => {
      const start = lat != null ? [lat, lng] : DEFAULT_CENTER;
      const zoom = lat != null ? 17 : 11;
      if (!map) {
        map = createMap(el("map"));
        map.on("click", (e) => setMarker(e.latlng.lat, e.latlng.lng));
      }
      map.setView(start, zoom);
      map.invalidateSize();
      if (marker) { marker.remove(); marker = null; }
      if (lat != null) marker = L.marker([lat, lng]).addTo(map);
    };

    const onLocate = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => setMarker(pos.coords.latitude, pos.coords.longitude, 17),
        () => showError("place", "ماقدرناش نوصل لموقعك. اسمح للمتصفح بالموقع، أو اختار من الخريطة.")
      );
    };
    const onSearchKey = (e) => { if (e.key === "Enter") { e.preventDefault(); search(); } };
    const onPasteKey = (e) => { if (e.key === "Enter") { e.preventDefault(); usePasted(); } };
    const onNameInput = () => { if (el("name").value.trim()) showError("name", ""); };

    const onDone = () => {
      const placeName = el("name").value.trim();
      if (!picked && !pickedUrl) return showError("place", "لسه ماحددتش المكان: ابحث بالاسم، أو دوس على الخريطة، أو هات اللينك من Google Maps.");
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
      [el("locate"), "click", onLocate],
      [el("done"), "click", onDone],
      [el("search-btn"), "click", search],
      [el("search"), "keydown", onSearchKey],
      [el("paste-btn"), "click", usePasted],
      [el("paste"), "keydown", onPasteKey],
      [el("clipboard-btn"), "click", pasteFromClipboard],
      [el("search"), "input", updateGoogleLink],
      [el("name"), "input", onNameInput]
    ];
    bindings.forEach(([node, type, fn]) => node.addEventListener(type, fn));

    modalEl.addEventListener("shown.bs.modal", onShown, { once: true });
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
  const view = createMap(container, { scrollWheelZoom: false });
  const markers = valid.map((p) => L.marker([p.lat, p.lng]).addTo(view).bindPopup(escapeHtml(p.label || p.name)));
  if (markers.length === 1) view.setView(markers[0].getLatLng(), 16);
  else view.fitBounds(L.featureGroup(markers).getBounds().pad(0.3));
  return view;
}

// لينك يفتح المكان في Google Maps: اللينك الأصلي لو موجود، غير كده بالإحداثيات
export function mapsLink(place) {
  if (place.mapsUrl) return place.mapsUrl;
  return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
}
