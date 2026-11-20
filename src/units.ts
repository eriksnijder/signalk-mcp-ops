// Display conversions for common Signal K SI units. The native value and units
// are always returned alongside; this is presentation only, never a correction.
export type Display = { value: number; units: string }

const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits
const isDistance = (path: string) => /(^|\.)(log|distance|range|trip)(\.|$)/i.test(path)
const isEnvironmentPressure = (path: string) => path.startsWith('environment.')

/** Returns a human-friendly marine display value, or null when no conversion applies. */
export function toDisplay(path: string, value: unknown, units: string | null): Display | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || !units) return null
  switch (units) {
    case 'm/s': return { value: round(value * 3600 / 1852), units: 'kn' }
    case 'K': return { value: round(value - 273.15, 1), units: '°C' }
    case 'rad': return { value: round(value * 180 / Math.PI, 1), units: '°' }
    case 'rad/s': return { value: round(value * 180 / Math.PI * 60, 1), units: '°/min' }
    case 'ratio': return { value: round(value * 100, 1), units: '%' }
    case 'Pa': return isEnvironmentPressure(path)
      ? { value: round(value / 100, 1), units: 'hPa' } : { value: round(value / 100000, 2), units: 'bar' }
    case 'm3': return { value: round(value * 1000, 1), units: 'L' }
    case 'm3/s': return { value: round(value * 3600000, 2), units: 'L/h' }
    case 'Hz': return path.startsWith('propulsion.') ? { value: round(value * 60, 0), units: 'rpm' } : null
    case 'C': return { value: round(value / 3600, 1), units: 'Ah' }
    case 'J': return { value: round(value / 3600, 1), units: 'Wh' }
    case 'm': return isDistance(path) ? { value: round(value / 1852, 2), units: 'nm' } : null
    case 's': return value >= 3600 ? { value: round(value / 3600, 1), units: 'h' } : null
    default: return null
  }
}
