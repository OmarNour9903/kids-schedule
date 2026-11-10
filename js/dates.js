// التعامل مع التواريخ كنص "YYYY-MM-DD" بتوقيت الجهاز (المستخدمين في مصر)
// عشان نتجنب مشاكل فروق التوقيت.

const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

const pad = (n) => String(n).padStart(2, "0");

export function toKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

export function todayKey() {
  return toKey(new Date());
}

export function addDays(key, days) {
  const date = fromKey(key);
  date.setDate(date.getDate() + days);
  return toKey(date);
}

export function weekdayOf(key) {
  return fromKey(key).getDay();
}

export function daysBetween(fromKeyValue, toKeyValue) {
  return Math.round((fromKey(toKeyValue) - fromKey(fromKeyValue)) / 86400000);
}

export function weekdayName(key) {
  return WEEKDAYS[weekdayOf(key)];
}

export function formatDayLong(key) {
  const date = fromKey(key);
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function monthTitle(year, monthIndex) {
  return `${MONTHS[monthIndex]} ${year}`;
}

export function timeToMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function formatTime(time) {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const period = h < 12 ? "ص" : "م";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${pad(m)} ${period}`;
}

export { WEEKDAYS };
