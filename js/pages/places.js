import { db, doc, collection, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp } from "../firebase.js";
import { requireSession } from "../session.js";
import { renderNav } from "../nav.js";
import { escapeHtml, showAlert, hideAlert, confirmDialog, revealPage } from "../ui.js";
import { openMapPicker, mapsLink } from "../map-picker.js";
import { MANAGER_ROLES, errorMessage } from "../strings.js";

const session = await requireSession({ roles: MANAGER_ROLES });
renderNav(session);
const { familyId } = session;

const list = document.getElementById("places-list");
const alertBox = document.getElementById("places-alert");
const placesRef = collection(db, "families", familyId, "places");
let places = [];

function itemHtml(place) {
  return `
    <li class="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2">
      <div>
        <div class="fw-semibold"><i class="bi bi-geo-alt-fill text-primary"></i> ${escapeHtml(place.name)}</div>
        <a class="small" href="${mapsLink(place)}" target="_blank" rel="noopener">افتح في Google Maps</a>
      </div>
      <div class="d-flex gap-2">
        <button type="button" class="btn btn-sm btn-outline-primary" data-action="edit" data-id="${place.id}">تعديل</button>
        <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${place.id}">مسح</button>
      </div>
    </li>`;
}

onSnapshot(placesRef, (snapshot) => {
  places = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  places.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  list.innerHTML = places.length
    ? places.map(itemHtml).join("")
    : '<li class="list-group-item text-muted">لسه مفيش أماكن محفوظة.</li>';
}, (error) => showAlert(alertBox, errorMessage(error)));

document.getElementById("add-place").addEventListener("click", async () => {
  hideAlert(alertBox);
  const result = await openMapPicker({ showSave: false });
  if (!result) return;
  const confirmed = await confirmDialog({
    title: "إضافة مكان",
    message: `حفظ "${result.name}" في الأماكن المحفوظة؟`,
    confirmText: "حفظ"
  });
  if (!confirmed) return;
  try {
    await addDoc(placesRef, { name: result.name, lat: result.lat, lng: result.lng, createdAt: serverTimestamp() });
  } catch (error) {
    showAlert(alertBox, errorMessage(error));
  }
});

list.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const place = places.find((p) => p.id === button.dataset.id);
  if (!place) return;
  hideAlert(alertBox);

  if (button.dataset.action === "edit") {
    const result = await openMapPicker({ lat: place.lat, lng: place.lng, name: place.name, showSave: false });
    if (!result) return;
    const confirmed = await confirmDialog({
      title: "تعديل مكان",
      message: `حفظ التعديل على "${result.name}"؟ المواعيد اللي اتعملت قبل كده هتفضل بالمكان القديم.`,
      confirmText: "حفظ"
    });
    if (!confirmed) return;
    try {
      await updateDoc(doc(placesRef, place.id), {
        name: result.name, lat: result.lat, lng: result.lng, updatedAt: serverTimestamp()
      });
    } catch (error) {
      showAlert(alertBox, errorMessage(error));
    }
    return;
  }

  const confirmed = await confirmDialog({
    title: "مسح مكان",
    message: `مسح "${place.name}" من الأماكن المحفوظة؟ المواعيد اللي فيها المكان ده مش هتتأثر.`,
    confirmText: "مسح",
    danger: true
  });
  if (!confirmed) return;
  try {
    await deleteDoc(doc(placesRef, place.id));
  } catch (error) {
    showAlert(alertBox, errorMessage(error));
  }
});

revealPage();
