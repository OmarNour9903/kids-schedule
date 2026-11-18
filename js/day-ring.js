// الدايرة: يوم واحد من 6 الصبح لـ 12 بالليل، بتبيّن مين مشغول إمتى.
// - الموعد مشغول من معاد الذهاب لمعاد العودة (ولو مالوش عودة: ساعة)، والسفر بياخد اليوم.
// - لو أكتر من ولد في نفس الوقت (موعد واحد أو مواعيد متداخلة) الجزء ده "مشترك".
// - كل ولد ليه لون ثابت، والمشترك لونه بنفسجي، والفاضي لونه هادي.
// - الدوس على أي جزء بيعرض تفاصيله، ومن التفاصيل تدخل على صفحة الموعد.
import { escapeHtml } from "./ui.js";
import { timeToMinutes, formatTime, todayKey } from "./dates.js";
import { APPOINTMENT_TYPES } from "./strings.js";

export const RING_START = 6 * 60;
export const RING_END = 24 * 60;
const NO_RETURN_MINUTES = 60;

// ألوان الأولاد: واضحة على الخلفية الغامقة والفاتحة، والكلام عليها غامق
export const CHILD_COLORS = ["#5B91A3", "#E0A458", "#C77D9B", "#7FB685", "#8FA8F0", "#E07A5F", "#C9B458", "#6CC3C8"];
export const SHARED_COLOR = "#9B7FD4";

const pad = (n) => String(n).padStart(2, "0");

export function minutesToTime(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export const formatMinutes = (minutes) => formatTime(minutesToTime(minutes));

// لون كل ولد بترتيب إضافته، فاللون مايتغيرش من يوم ليوم
export function childColorMap(families) {
  const map = new Map();
  let index = 0;
  families.forEach(({ familyId, children }) => {
    [...children]
      .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0) || a.id.localeCompare(b.id))
      .forEach((child) => {
        map.set(`${familyId}:${child.id}`, CHILD_COLORS[index % CHILD_COLORS.length]);
        index += 1;
      });
  });
  return map;
}

// من وإلى (بالدقايق) للموعد في اليوم ده، أو null لو برا الدايرة
function occurrenceSpan(occ) {
  const d = occ.data;
  let start = timeToMinutes(d.startTime || "00:00");
  let end;
  if (occ.travel) {
    const last = occ.travel.day === occ.travel.total;
    if (occ.travel.day > 1) start = RING_START;
    end = last && d.travel?.returnTime ? timeToMinutes(d.travel.returnTime) : RING_END;
  } else {
    end = d.returnTime ? timeToMinutes(d.returnTime) : start + NO_RETURN_MINUTES;
    if (end <= start) end = start + NO_RETURN_MINUTES;
  }
  start = Math.max(start, RING_START);
  end = Math.min(end, RING_END);
  return end > start ? { start, end } : null;
}

// occurrences: مواعيد اليوم من occurrencesInRange، لأسرة واحدة
export function ringItems(occurrences, { familyId, familyName = "", children }) {
  const names = new Map(children.map((c) => [c.id, c.name]));
  return occurrences
    .filter((occ) => !occ.cancelled)
    .map((occ) => {
      const span = occurrenceSpan(occ);
      if (!span) return null;
      const d = occ.data;
      const people = (d.childIds || []).map((id) => ({ key: `${familyId}:${id}`, name: names.get(id) || "ولد" }));
      return {
        key: `${familyId}:${occ.appointment.id}`,
        ...span,
        people,
        familyId,
        familyName,
        appointmentId: occ.appointment.id,
        date: occ.date,
        type: d.type,
        place: d.dropoff?.name || "",
        startTime: d.startTime,
        returnTime: d.type === "travel" ? d.travel?.returnTime || "" : d.returnTime || ""
      };
    })
    .filter(Boolean);
}

// تقسيم اليوم لأجزاء: كل جزء فيه نفس المواعيد شغالة
export function buildSegments(items) {
  const points = [...new Set([RING_START, RING_END, ...items.flatMap((i) => [i.start, i.end])])]
    .filter((p) => p >= RING_START && p <= RING_END)
    .sort((a, b) => a - b);

  const segments = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    const active = items.filter((item) => item.start < end && item.end > start);
    const signature = active.map((a) => a.key).sort().join("|");
    const prev = segments[segments.length - 1];
    if (prev && prev.signature === signature) {
      prev.end = end;
      continue;
    }
    const people = [];
    active.forEach((item) => item.people.forEach((p) => {
      if (!people.some((x) => x.key === p.key)) people.push(p);
    }));
    segments.push({ start, end, items: active, people, signature });
  }
  return segments;
}

export function segmentLabel(segment) {
  if (!segment.people.length) return "فاضي";
  if (segment.people.length === 1) return segment.people[0].name;
  return `معاد ${segment.people.map((p) => p.name).join(" و")}`;
}

function segmentColor(segment, colors) {
  if (!segment.people.length) return null;
  if (segment.people.length > 1) return SHARED_COLOR;
  return colors.get(segment.people[0].key) || CHILD_COLORS[0];
}

// ---------- الرسم ----------
const CX = 160;
const CY = 160;
const R_OUT = 132;
const R_IN = 84;
const R_MID = (R_OUT + R_IN) / 2;

// الزاوية بالدرجات من فوق ومع عقارب الساعة
const angleOf = (minutes) => ((minutes - RING_START) / (RING_END - RING_START)) * 360;

function point(angle, radius) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return [CX + radius * Math.cos(rad), CY + radius * Math.sin(rad)];
}

function arcPath(a0, a1) {
  // الدايرة الكاملة بتترسم نصين عشان القوس مايختفيش
  if (a1 - a0 >= 359.99) return `${arcPath(0, 180)} ${arcPath(180, 360)}`;
  const large = a1 - a0 > 180 ? 1 : 0;
  const f = (n) => n.toFixed(2);
  const [x0, y0] = point(a0, R_OUT);
  const [x1, y1] = point(a1, R_OUT);
  const [x2, y2] = point(a1, R_IN);
  const [x3, y3] = point(a0, R_IN);
  return `M${f(x0)} ${f(y0)} A${R_OUT} ${R_OUT} 0 ${large} 1 ${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)} A${R_IN} ${R_IN} 0 ${large} 0 ${f(x3)} ${f(y3)}Z`;
}

// الاسم بيتكتب جوه الجزء لو المساحة تكفي، وبيتلف مع الدايرة ومايبقاش مقلوب
function labelSvg(segment, label) {
  const a0 = angleOf(segment.start);
  const a1 = angleOf(segment.end);
  const arcLength = ((a1 - a0) * Math.PI / 180) * R_MID;
  const width = label.length * 6.4 + 10;
  if (arcLength < width) return "";
  const mid = (a0 + a1) / 2;
  const [x, y] = point(mid, R_MID);
  const rotate = mid > 90 && mid < 270 ? mid + 180 : mid;
  return `<text class="ring-label${segment.people.length ? "" : " ring-label-free"}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" transform="rotate(${rotate.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})" text-anchor="middle" dominant-baseline="central">${escapeHtml(label)}</text>`;
}

function ticksSvg() {
  let html = "";
  for (let m = RING_START; m < RING_END; m += 120) {
    const a = angleOf(m);
    const [x1, y1] = point(a, R_OUT + 2);
    const [x2, y2] = point(a, R_OUT + 7);
    const [tx, ty] = point(a, R_OUT + 17);
    const h = (m / 60) % 24;
    const text = `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "ص" : "م"}`;
    html += `<line class="ring-tick" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"></line>`;
    html += `<text class="ring-hour" x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" dominant-baseline="central">${text}</text>`;
  }
  return html;
}

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function centerSvg(segments, date, isToday) {
  const now = nowMinutes();
  if (isToday && now >= RING_START && now < RING_END) {
    const seg = segments.find((s) => s.start <= now && s.end > now);
    const next = segments.find((s) => s.start > now && s.people.length);
    return `
      <text class="ring-center-small" x="${CX}" y="${CY - 30}" text-anchor="middle">دلوقتي</text>
      <text class="ring-center-big" x="${CX}" y="${CY - 6}" text-anchor="middle" dominant-baseline="central">${formatMinutes(now)}</text>
      <text class="ring-center-small" x="${CX}" y="${CY + 20}" text-anchor="middle">${escapeHtml(seg ? segmentLabel(seg) : "")}</text>
      ${next ? `<text class="ring-center-muted" x="${CX}" y="${CY + 40}" text-anchor="middle">الجاي ${formatMinutes(next.start)}</text>` : ""}`;
  }
  const busy = segments.filter((s) => s.people.length).reduce((sum, s) => sum + (s.end - s.start), 0);
  const hours = Math.round((busy / 60) * 10) / 10;
  return `
    <text class="ring-center-small" x="${CX}" y="${CY - 14}" text-anchor="middle">${busy ? "مشغول" : "اليوم"}</text>
    <text class="ring-center-big" x="${CX}" y="${CY + 12}" text-anchor="middle" dominant-baseline="central">${busy ? `${hours} ساعة` : "فاضي"}</text>`;
}

function itemTitle(item) {
  const type = item.type && item.type !== "regular" ? ` (${APPOINTMENT_TYPES[item.type]})` : "";
  return `${item.place || "موعد"}${type}`;
}

function detailsHtml(segment, { multiFamily }) {
  const range = `من ${formatMinutes(segment.start)} لـ ${formatMinutes(segment.end)}`;
  if (!segment.people.length) {
    return `<div class="fw-semibold">فاضي</div><div class="small text-muted">${range}، مفيش مواعيد.</div>`;
  }
  const rows = segment.items.map((item) => `
    <li class="ring-detail-item">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <div class="fw-semibold">${escapeHtml(item.people.map((p) => p.name).join(" و"))} · ${escapeHtml(itemTitle(item))}</div>
          <div class="small text-muted">
            ذهاب <bdi>${formatTime(item.startTime)}</bdi>${item.returnTime ? ` · عودة <bdi>${formatTime(item.returnTime)}</bdi>` : " · من غير عودة"}
            ${multiFamily ? ` · ${escapeHtml(item.familyName)}` : ""}
          </div>
        </div>
        <a class="btn btn-sm btn-outline-primary" href="appointment.html?id=${encodeURIComponent(item.appointmentId)}&date=${item.date}&family=${encodeURIComponent(item.familyId)}">
          التفاصيل <i class="bi bi-chevron-left"></i>
        </a>
      </div>
    </li>`).join("");
  return `
    <div class="fw-semibold">${escapeHtml(segmentLabel(segment))}</div>
    <div class="small text-muted mb-2">${range}</div>
    <ul class="list-unstyled d-grid gap-2 mb-0">${rows}</ul>`;
}

function swatch(color, extraClass = "") {
  return `<svg class="ring-swatch ${extraClass}" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="3"${color ? ` fill="${color}"` : ""}></rect></svg>`;
}

function legendHtml(families, colors, multiFamily) {
  const groups = families.map(({ familyId, familyName, children }) => {
    const items = children.map((c) => `<li>${swatch(colors.get(`${familyId}:${c.id}`))} ${escapeHtml(c.name)}</li>`).join("");
    return `
      ${multiFamily ? `<div class="ring-legend-family">${escapeHtml(familyName)}</div>` : ""}
      <ul class="ring-legend-list">${items || '<li class="text-muted">مفيش أولاد متسجلين</li>'}</ul>`;
  }).join("");
  return `
    <div class="ring-legend">
      <div class="ring-legend-title">الألوان معناها إيه؟</div>
      ${groups}
      <ul class="ring-legend-list">
        <li>${swatch(SHARED_COLOR)} معاد مشترك (أكتر من ولد في نفس الوقت)</li>
        <li>${swatch(null, "ring-swatch-free")} فاضي</li>
      </ul>
      <div class="small text-muted mt-1">الدايرة من 6 الصبح لـ 12 بالليل. دوس على أي لون تشوف تفاصيله.</div>
    </div>`;
}

// families: [{ familyId, familyName, children, occurrences }] لليوم ده
export function renderDayRing(container, { date, families }) {
  const multiFamily = families.length > 1;
  const colors = childColorMap(families);
  const items = families.flatMap((f) => ringItems(f.occurrences, f));
  const segments = buildSegments(items);
  const isToday = date === todayKey();

  const paths = segments.map((segment, index) => {
    const label = segmentLabel(segment);
    const color = segmentColor(segment, colors);
    const aria = `${label}، من ${formatMinutes(segment.start)} لـ ${formatMinutes(segment.end)}`;
    return `
      <g class="ring-seg${segment.people.length ? "" : " ring-seg-free"}" data-seg="${index}" tabindex="0" role="button" aria-label="${escapeHtml(aria)}">
        <path d="${arcPath(angleOf(segment.start), angleOf(segment.end))}"${color ? ` fill="${color}"` : ""}></path>
        ${labelSvg(segment, label)}
      </g>`;
  }).join("");

  let needle = "";
  const now = nowMinutes();
  if (isToday && now >= RING_START && now < RING_END) {
    const [x1, y1] = point(angleOf(now), R_IN - 6);
    const [x2, y2] = point(angleOf(now), R_OUT + 4);
    needle = `<line class="ring-now" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"></line>`;
  }

  container.innerHTML = `
    <div class="day-ring-layout">
      <div class="day-ring-chart">
        <svg class="day-ring" viewBox="-14 -14 348 348" role="group" aria-label="مواعيد اليوم من 6 الصبح لـ 12 بالليل">
          ${ticksSvg()}
          ${paths}
          ${needle}
          ${centerSvg(segments, date, isToday)}
        </svg>
      </div>
      <div class="day-ring-side">
        <div class="ring-details" aria-live="polite" data-ring-details>
          <div class="small text-muted">دوس على أي جزء في الدايرة تشوف مين عنده إيه.</div>
        </div>
        ${legendHtml(families, colors, multiFamily)}
      </div>
    </div>`;

  const details = container.querySelector("[data-ring-details]");
  const select = (group) => {
    container.querySelectorAll(".ring-seg.is-selected").forEach((g) => g.classList.remove("is-selected"));
    group.classList.add("is-selected");
    details.innerHTML = detailsHtml(segments[Number(group.dataset.seg)], { multiFamily });
  };
  container.querySelectorAll(".ring-seg").forEach((group) => {
    group.addEventListener("click", () => select(group));
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select(group);
      }
    });
  });
  return segments;
}
