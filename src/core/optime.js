// The sheet's operational timeline. One sheet is one working day that starts in the morning and ends the
// next morning, so after-midnight times belong to the END of that day whatever date was written next to them
// (operators write the start date, or the calendar date; both appear on real sheets). Every record becomes
// "minutes since 04:00 of the sheet's day", and each sheet gets its own block of minutes (PAGE_SPAN), so two
// sheets are never compared with each other and a date typo can never create a conflict.
export const OP_ORIGIN = 4 * 60;   // 04:00: the day starts here on the timeline
export const PAGE_SPAN = 4000;     // each sheet owns this many minutes (more than a day and a half)

// clock minutes (0–1439) of a record + its shift → minutes since the origin
export function opMinute(clockMin, shift, nextDay = false) {
  if (nextDay) return clockMin + 1440 - OP_ORIGIN; // the row carries the next calendar day: it is the end of the sheet's day
  if (shift === '2') return clockMin >= 12 * 60 ? clockMin - OP_ORIGIN : clockMin + 1440 - OP_ORIGIN; // night shift: the morning part is the end of the day
  return clockMin >= OP_ORIGIN ? clockMin - OP_ORIGIN : clockMin + 1440 - OP_ORIGIN;
}
export const clockMin = (abs) => ((((abs % PAGE_SPAN) + PAGE_SPAN) % PAGE_SPAN) + OP_ORIGIN) % 1440;
export const clockOf = (abs) => { const m = clockMin(abs); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
