/**
 * Date logic for the tear-off calendar birth date picker (ui/DatePicker.jsx). Pure functions, unit-tested.
 * A month is shown on pages of 7 days in a row (1-7, 8-14, 15-21, 22-28, 29-end), so every page has each day
 * of the week exactly once.
 */
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']; // Date.getDay() order
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const PER_PAGE = 7;

export const daysInMonth = (year, month) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
export const weekdayOf = (year, month, day) => new Date(Date.UTC(year, month, day)).getUTCDay();
export const pageCount = (year, month) => Math.ceil(daysInMonth(year, month) / PER_PAGE);
export const pageOfDay = (day) => Math.floor((day - 1) / PER_PAGE);

/** The dates on one page: [{ day, weekday }] (the last page of a month can be shorter). */
export function pageDays(year, month, page) {
  const n = daysInMonth(year, month), out = [];
  for (let d = page * PER_PAGE + 1; d <= Math.min(n, (page + 1) * PER_PAGE); d++) out.push({ day: d, weekday: weekdayOf(year, month, d) });
  return out;
}

const pad = (n) => String(n).padStart(2, '0');
export const toIso = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;
/** 'YYYY-MM-DD' -> { year, month (0-11), day } or null. */
export function fromIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  const year = +m[1], month = +m[2] - 1, day = +m[3];
  if (month < 0 || month > 11 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}
/** Is the date after `today` (a birth date can't be in the future)? */
export function isFuture(year, month, day, today = new Date()) {
  return toIso(year, month, day) > toIso(today.getFullYear(), today.getMonth(), today.getDate());
}
/** "Monday, 25 March 2010" */
export const longDate = (year, month, day) => `${WEEKDAY_NAMES[weekdayOf(year, month, day)]}, ${day} ${MONTHS[month]} ${year}`;
