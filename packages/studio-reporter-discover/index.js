'use strict';

/**
 * Shared discover contract for Studio Reporter Desktop / GaugeStudio.
 * Plugin stdout prints: `studio-reporter websocket: ws://127.0.0.1:<port>`
 */

/** Matches plugin stdout discover line (GaugeStudio-compatible). */
const REPORTER_WS_LINE_RE =
  /studio-reporter websocket:\s*(ws:\/\/127\.0\.0\.1:\d+)/i;

/**
 * Extract the first studio-reporter WebSocket URL from text (stdout chunk or paste).
 * @param {string} text
 * @returns {string|null}
 */
function extractReporterWsUrl(text) {
  const m = String(text ?? '').match(REPORTER_WS_LINE_RE);
  return m ? m[1] : null;
}

/**
 * Normalize a user-pasted value into a ws://127.0.0.1:<port> URL when possible.
 * Accepts a bare port, a full URL, or a discover line.
 * @param {string} input
 * @returns {string|null}
 */
function normalizeWsInput(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const fromLine = extractReporterWsUrl(raw);
  if (fromLine) return fromLine;
  if (/^ws:\/\/127\.0\.0\.1:\d+$/i.test(raw)) return raw;
  if (/^\d{2,5}$/.test(raw)) return `ws://127.0.0.1:${raw}`;
  return null;
}

module.exports = {
  REPORTER_WS_LINE_RE,
  extractReporterWsUrl,
  normalizeWsInput,
};
