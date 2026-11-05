/** Optional weather via Open-Meteo (free, no API key). Only used when the user sets a location. */
export async function fetchWeather(lat: number, lon: number, f: typeof fetch = fetch): Promise<{ tempC: number; code: number; updatedAt: number }> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`;
  const r = await f(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Weather service returned ${r.status}`);
  const j = (await r.json()) as { current: { temperature_2m: number; weather_code: number } };
  return { tempC: j.current.temperature_2m, code: j.current.weather_code, updatedAt: Date.now() };
}
