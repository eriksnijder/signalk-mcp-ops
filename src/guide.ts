// Static usage guidance for MCP clients. Kept under the 4,096-character string
// bound so the tool result passes the normal safeCopy projection.
export const SERVER_INSTRUCTIONS = 'Read-only Signal K vessel data. Start with get_vessel_overview, use search_paths to find ' +
  'paths by name, read_paths for several values at once, and list_alarms for active notifications. ' +
  'Read get_usage_guide before interpreting values. Values are native SI units; never give navigation or ' +
  'safety-critical advice based on this data alone.'

export const USAGE_GUIDE = `# Signal K MCP usage guide

## Workflow
1. get_vessel_overview: position, speed, heading, wind, depth, batteries, tanks, engines and active alarms in one call.
2. search_paths: find paths by words ("battery voltage", "fresh water", "engine temp"). Matches path segments and meta labels.
3. read_paths: read up to 25 known paths at once; set convertUnits for knots, degrees, Celsius, percent, litres.
4. list_alarms: notifications by severity (emergency > alarm > warn > alert).
5. diagnose_missing_path / inspect_path_sources: why a value is missing, stale or comes from several sources.

## Units
Signal K stores SI units. The native value and units are always returned; any "display" field is a convenience conversion.
- m/s: speed (1 m/s = 1.944 kn)
- rad: angles and headings (radians; multiply by 57.2958 for degrees)
- K: temperature (subtract 273.15 for Celsius)
- ratio: 0..1 fractions such as state of charge and tank level (x100 for percent)
- Pa: pressure (environment pressure shown as hPa, engine pressures as bar)
- m3: volume (x1000 for litres); Hz: engine revolutions (x60 for rpm); C: charge (/3600 for Ah)
- navigation.position is an object {latitude, longitude} in decimal degrees.

## Freshness
Every reading has timestamp, ageSeconds and stale. Stale uses the operator threshold (default 300 s). A stale or missing
value does not prove a sensor is broken: the boat may be powered down, the instrument bus asleep or the source disabled.
Always mention the age when it is more than a minute old.

## Angles and references
- headingTrue / courseOverGroundTrue are relative to true north; *Magnetic to magnetic north.
- wind.angleApparent is relative to the bow, -pi..pi (negative = port). directionTrue is relative to true north.
- depth.belowTransducer, belowKeel and belowSurface differ by offsets configured on the server.

## Access and errors
- PATH_NOT_ALLOWED: outside the operator's configured prefixes.
- PATH_UNAVAILABLE: absent or not permitted for this user (deliberately indistinguishable).
- NOT_FOUND: no data at that path. ADMIN_REQUIRED: tool needs a Signal K admin token.
- Results are bounded; on RESULT_TOO_LARGE use a narrower prefix or smaller page.

## Safety
This server is read-only and cannot change the vessel. Do not present derived values as navigation instructions,
collision avoidance or weather routing. Recommend checking primary instruments for anything safety-critical.
`
