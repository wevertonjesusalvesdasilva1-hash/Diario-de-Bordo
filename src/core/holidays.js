// Brazilian national holidays (the days that are not working days even when they fall from Monday to Friday).
// Fixed dates plus Good Friday (Easter - 2 days). Carnaval and Corpus Christi are "pontos facultativos" and are not counted here.
const FIXED = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'];
const names = { '01-01': 'Confraternização Universal', '04-21': 'Tiradentes', '05-01': 'Dia do Trabalho', '09-07': 'Independência', '10-12': 'Nossa Senhora Aparecida', '11-02': 'Finados', '11-15': 'Proclamação da República', '11-20': 'Consciência Negra', '12-25': 'Natal' };

// Easter Sunday (Meeus/Jones/Butcher algorithm) as 'YYYY-MM-DD'
export function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
const shift = (iso, days) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

// the name of the holiday of that day, or '' when it is not one
export function holidayName(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '';
  const md = iso.slice(5);
  if (FIXED.includes(md)) return names[md];
  return iso === shift(easter(Number(iso.slice(0, 4))), -2) ? 'Sexta-feira Santa' : '';
}
export const isHoliday = (iso) => !!holidayName(iso);
// Monday to Friday and not a holiday
export const isWorkingDay = (iso) => { const w = new Date(`${iso}T12:00:00Z`).getUTCDay(); return w >= 1 && w <= 5 && !isHoliday(iso); };
