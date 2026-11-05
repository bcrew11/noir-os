export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';

export function dayPart(date: Date): DayPart {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
}

export function greeting(date: Date): string {
  const part = dayPart(date);
  return part === 'night' ? 'Good evening.' : `Good ${part}.`;
}

export function formatClock(date: Date, h24: boolean): { time: string; suffix: string } {
  const m = String(date.getMinutes()).padStart(2, '0');
  if (h24) return { time: `${String(date.getHours()).padStart(2, '0')}:${m}`, suffix: '' };
  const h = date.getHours() % 12 || 12;
  return { time: `${h}:${m}`, suffix: date.getHours() < 12 ? 'AM' : 'PM' };
}

export function formatLongDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/** WMO weather code → short description. */
export function weatherLabel(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code <= 48) return 'Fog';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  if (code <= 86) return 'Snow showers';
  return 'Thunderstorms';
}
