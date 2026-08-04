// Single source of truth for launch-time math across the web client.
//
//   Launch = targetHitTime + sequenceOffset − marchTime − rallyDuration
//
// Keep this identical in spirit to the Android calculators
// (DashboardActivity.getUserStartTimeForTarget / OfflineActivity.performLaunchCalculations)
// so the web app and the companion app never quote the same player two different times.

export const DEFAULT_RALLY_SEC = 300;

// If an "HH:MM:SS" time is more than this far in the past, treat it as tomorrow's occurrence.
const ROLLOVER_BUFFER_MS = 600 * 1000;

export interface LaunchParams {
  marchSec: number | null | undefined;
  rallySec?: number;
  offsetSec?: number;
}

/** Parse an "HH:MM:SS" (UTC) string into an epoch-ms target for today (or tomorrow). Null if unparseable. */
export function parseLandingToTargetMs(landingTime: string, nowMs: number = Date.now()): number | null {
  if (!landingTime) return null;
  const parts = landingTime.split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;

  const hh = parts[0] || 0;
  const mm = parts[1] || 0;
  const ss = parts[2] || 0;

  const now = new Date(nowMs);
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, ss));

  if (target.getTime() < nowMs - ROLLOVER_BUFFER_MS) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return target.getTime();
}

/**
 * Launch epoch-ms from an absolute target hit time.
 * Returns null when the march time is missing or non-positive — callers must treat that as
 * "march time not set" rather than silently computing a (wrong) launch time from 0.
 */
export function launchMsFromTarget(
  targetMs: number,
  { marchSec, rallySec = DEFAULT_RALLY_SEC, offsetSec = 0 }: LaunchParams
): number | null {
  if (marchSec == null || marchSec <= 0) return null;
  return targetMs + offsetSec * 1000 - marchSec * 1000 - rallySec * 1000;
}

/** Launch epoch-ms from an "HH:MM:SS" landing string. Null if the time is unparseable or march time missing. */
export function launchMsFromLanding(
  landingTime: string,
  params: LaunchParams,
  nowMs: number = Date.now()
): number | null {
  const targetMs = parseLandingToTargetMs(landingTime, nowMs);
  if (targetMs == null) return null;
  return launchMsFromTarget(targetMs, params);
}

/** Format an epoch-ms value as "HH:MM:SS" in UTC. */
export function formatUtcHMS(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/** Convenience: launch time as "HH:MM:SS" from a landing string, or null when it can't be computed. */
export function launchStrFromLanding(
  landingTime: string,
  params: LaunchParams,
  nowMs: number = Date.now()
): string | null {
  const ms = launchMsFromLanding(landingTime, params, nowMs);
  return ms == null ? null : formatUtcHMS(ms);
}
