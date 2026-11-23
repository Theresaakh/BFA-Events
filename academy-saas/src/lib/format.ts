/**
 * All money, number and date formatting goes through Intl with the academy's
 * currency and time zone. Arabic uses Latin digits ("nu-latn") for clear financial tables.
 */
import type { ISODate, ISODateTime } from '@/lib/types';

export function intlLocale(locale: string): string {
  if (locale === 'ar') return 'ar-u-nu-latn';
  if (locale === 'fr') return 'fr-FR';
  return 'en-GB';
}

/** Number of decimals a currency uses (USD 2, XOF 0, …). Minor units follow this. */
export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function formatMoney(minor: number, currency: string, locale: string): string {
  const digits = currencyDigits(currency);
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(minor / 10 ** digits);
}

/** Amount without symbol, e.g. for inputs: 4000 → "40.00" */
export function minorToInput(minor: number, currency: string): string {
  const digits = currencyDigits(currency);
  return (minor / 10 ** digits).toFixed(digits);
}

export function formatNumber(n: number, locale: string, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(intlLocale(locale), opts).format(n);
}

export function formatPercent(ratio: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), { style: 'percent', maximumFractionDigits: 0 }).format(ratio);
}

/** Calendar date (no time) — formatted in UTC so it never shifts a day. */
export function formatDate(date: ISODate, locale: string, style: 'short' | 'medium' | 'long' = 'medium'): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  const opts: Intl.DateTimeFormatOptions =
    style === 'short' ? { day: '2-digit', month: '2-digit', year: 'numeric' }
      : style === 'long' ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
        : { day: 'numeric', month: 'short', year: 'numeric' };
  return new Intl.DateTimeFormat(intlLocale(locale), { ...opts, timeZone: 'UTC' }).format(d);
}

export function formatTime(dt: ISODateTime, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(dt));
}

export function formatDateTime(dt: ISODateTime, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone,
  }).format(new Date(dt));
}

export function formatMonth(month: string /* YYYY-MM */, locale: string, style: 'short' | 'long' = 'short'): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { month: style, year: style === 'long' ? 'numeric' : '2-digit', timeZone: 'UTC' })
    .format(new Date(`${month}-01T00:00:00Z`));
}

/** The calendar date "now" in a given time zone, as YYYY-MM-DD. */
export function todayIn(timeZone: string, now = new Date()): ISODate {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Calendar date of an instant in a given time zone. */
export function dateIn(dt: ISODateTime, timeZone: string): ISODate {
  return todayIn(timeZone, new Date(dt));
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekdayIndex(date: ISODate): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
}

export function ageOn(dob: ISODate | undefined, on: ISODate): number | undefined {
  if (!dob) return undefined;
  const [y, m, d] = dob.split('-').map(Number);
  const [ty, tm, td] = on.split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

/**
 * Convert a wall-clock time in a time zone into a UTC ISO instant.
 * (Small, dependency-free version of what date libraries do.)
 */
export function zonedToUtc(date: ISODate, time: string /* HH:mm */, timeZone: string): ISODateTime {
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return new Date(guess.getTime() - (asIfUtc - guess.getTime())).toISOString();
}

/** Wall-clock HH:mm of an instant in a time zone. */
export function timeIn(dt: ISODateTime, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(dt));
}
