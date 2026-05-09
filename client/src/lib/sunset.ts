/**
 * Approximate sunrise/sunset calculator using the NOAA solar position formula.
 * Inputs are decimal degrees and the date for which to compute. Returns Date
 * objects in the local timezone, or `null` if the sun doesn't rise/set on the
 * given day at that latitude (polar regions).
 *
 * Source-derived from NOAA's published formulas:
 *   https://gml.noaa.gov/grad/solcalc/solareqns.PDF
 *
 * Accuracy is within ~1 minute, which is more than enough for switching the
 * fridge screen between light and dark modes.
 */
export function computeSunriseSunset(
  lat: number,
  lon: number,
  date: Date = new Date()
): { sunrise: Date | null; sunset: Date | null } {
  const dayOfYear = Math.floor(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(date.getFullYear(), 0, 0)) /
      86_400_000
  );

  // Fractional year in radians (gamma)
  const gamma =
    ((2 * Math.PI) / 365) * (dayOfYear - 1 + (date.getHours() - 12) / 24);

  // Equation of time (minutes)
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  // Solar declination (radians)
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const latRad = (lat * Math.PI) / 180;

  // Hour angle (radians) for sunrise/sunset (zenith = 90.833° accounts for atmospheric refraction)
  const cosH =
    (Math.cos((90.833 * Math.PI) / 180) -
      Math.sin(latRad) * Math.sin(decl)) /
    (Math.cos(latRad) * Math.cos(decl));

  if (cosH > 1 || cosH < -1) {
    return { sunrise: null, sunset: null }; // polar day/night
  }

  const haDeg = (Math.acos(cosH) * 180) / Math.PI;

  // Times in minutes UTC
  const sunriseUTCMin = 720 - 4 * (lon + haDeg) - eqTime;
  const sunsetUTCMin = 720 - 4 * (lon - haDeg) - eqTime;

  function makeDate(utcMin: number): Date {
    const base = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    base.setUTCMinutes(base.getUTCMinutes() + utcMin);
    return base;
  }

  return {
    sunrise: makeDate(sunriseUTCMin),
    sunset: makeDate(sunsetUTCMin),
  };
}

/**
 * Decide whether a kiosk should currently be in dark mode based on local sunset.
 * Falls back to false (light) when location is unknown.
 */
export function isAfterSunset(
  lat: number | null | undefined,
  lon: number | null | undefined,
  now: Date = new Date()
): boolean {
  if (lat == null || lon == null) return false;
  const { sunrise, sunset } = computeSunriseSunset(Number(lat), Number(lon), now);
  if (!sunrise || !sunset) return false;
  return now >= sunset || now < sunrise;
}
