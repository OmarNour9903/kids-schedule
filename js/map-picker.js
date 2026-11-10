// اختيار مكان من الخريطة (Leaflet + OpenStreetMap، مجاني ومن غير مفتاح)
// openMapPicker بترجع { name, lat, lng, save } أو null لو المستخدم رجع
import { escapeHtml } from "./ui.js";

const DEFAULT_CENTER = [30.0444, 31.2357]; // القاهرة
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = "&copy; OpenStreetMap";

let modalEl = null;
let map = null;
let marker = null;
let picked = null;

function ensureModal() {
  if (modalEl) return;
  modalEl = document.createElement("div");
  modalEl.className = "modal fade";
  modalEl.tabIndex = -1;
  modalEl.setAttribute("aria-hidden", "true");
  modalEl.innerHTML = `
    <div class="modal-dialog modal-lg modal-dialog-centered modal-fullscreen-sm-down">
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title h5">اختار المكان من الخريطة</h2>
          <button type="button" class="btn-close ms-0 me-auto" data-bs-dismiss="modal" aria-label="إغلاق"></button>
        </div>
        <div class="modal-body">
          <p class="small text-muted mb-2">دوس على الخريطة في مكان النقطة بالظبط، أو استخدم موقعك الحالي.</p>
          <div class="map-picker-map" data-map></div>
          <button type="button" class="btn btn-sm btn-outline-secondary mt-2" data-locate>
            <i class="bi bi-crosshair"></i> موقعي الحالي
          </button>
          <div class="mt-3">
            <label class="form-label" for="map-place-name">اسم المكان</label>
            <input type="text" class="form-control" id="map-place-name" maxlength="60" placeholder="مثلاً: نادي الصيد" data-name>
          </div>
          <div class="form-check mt-2" data-save-wrap>
            <input class="form-check-input" type="checkbox" id="map-place-save" data-save checked>
            <label class="form-check-label" for="map-place-save">احفظه في الأماكن المحفوظة</label>
          </div>
          <div class="text-danger small mt-2 d-none" data-error></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">رجوع</button>
          <button type="button" class="btn btn-primary" data-done>تم</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modalEl);
}

function setMarker(latlng) {
  picked = latlng;
  if (marker) marker.setLatLng(latlng);
  else marker = L.marker(latlng).addTo(map);
}

export function openMapPicker({ lat, lng, name = "", showSave = true } = {}) {
  ensureModal();
  const nameInput = modalEl.querySelector("[data-name]");
  const saveInput = modalEl.querySelector("[data-save]");
  const errorBox = modalEl.querySelector("[data-error]");
  const doneBtn = modalEl.querySelector("[data-done]");
  const locateBtn = modalEl.querySelector("[data-locate]");

  nameInput.value = name;
  saveInput.checked = true;
  modalEl.querySelector("[data-save-wrap]").classList.toggle("d-none", !showSave);
  errorBox.classList.add("d-none");
  picked = null;

  return new Promise((resolve) => {
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    let result = null;

    const onShown = () => {
      const start = lat != null ? [lat, lng] : DEFAULT_CENTER;
      if (!map) {
        map = L.map(modalEl.querySelector("[data-map]")).setView(start, lat != null ? 16 : 11);
        L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);
        map.on("click", (e) => setMarker(e.latlng));
      } else {
        map.setView(start, lat != null ? 16 : 11);
        map.invalidateSize();
      }
      if (marker) {
        marker.remove();
        marker = null;
      }
      if (lat != null) setMarker(L.latLng(lat, lng));
    };

    const onLocate = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const here = L.latLng(pos.coords.latitude, pos.coords.longitude);
          map.setView(here, 16);
          setMarker(here);
        },
        () => {
          errorBox.textContent = "ماقدرناش نوصل لموقعك. اسمح للمتصفح بالموقع أو اختار من الخريطة.";
          errorBox.classList.remove("d-none");
        }
      );
    };

    const onDone = () => {
      const placeName = nameInput.value.trim();
      if (!picked || !placeName) {
        errorBox.textContent = !picked ? "دوس على الخريطة عشان تحدد المكان." : "اكتب اسم المكان.";
        errorBox.classList.remove("d-none");
        return;
      }
      result = {
        name: placeName,
        lat: Number(picked.lat.toFixed(6)),
        lng: Number(picked.lng.toFixed(6)),
        save: showSave && saveInput.checked
      };
      modal.hide();
    };

    modalEl.addEventListener("shown.bs.modal", onShown, { once: true });
    locateBtn.addEventListener("click", onLocate);
    doneBtn.addEventListener("click", onDone);
    modalEl.addEventListener("hidden.bs.modal", () => {
      locateBtn.removeEventListener("click", onLocate);
      doneBtn.removeEventListener("click", onDone);
      resolve(result);
    }, { once: true });

    modal.show();
  });
}

// خريطة صغيرة للعرض بس
export function showPlacesMap(container, places) {
  const valid = places.filter((p) => p && p.lat != null);
  if (!valid.length) return null;
  const view = L.map(container, { scrollWheelZoom: false });
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(view);
  const markers = valid.map((p) => L.marker([p.lat, p.lng]).addTo(view).bindPopup(escapeHtml(p.label || p.name)));
  if (markers.length === 1) view.setView(markers[0].getLatLng(), 15);
  else view.fitBounds(L.featureGroup(markers).getBounds().pad(0.3));
  return view;
}

export function mapsLink(place) {
  return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
}
