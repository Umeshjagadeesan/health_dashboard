/**
 * API utility – ALL API calls route through Vite's /blipproxy middleware.
 * Config is hardcoded so the user never needs to enter settings.
 *
 * Authentication:
 *   ALL requests (CloudPort v1/v2, Servo, ePub) use _blip_session cookie,
 *   managed automatically by the proxy (Devise form login, server-side).
 *
 *   The old x-user-token approach was limited to 18/42 feeds (403 errors
 *   for any feed the token didn't have access to). The session cookie
 *   has full user-level access to ALL 42 feeds.
 */

// ── Hardcoded configuration ──────────────────────────────────────────
export const CONFIG = {
  baseUrl: 'https://pocs.demo.amagi.tv',
};

// ── Core fetch helper (single, unified) ──────────────────────────────

/**
 * Fetch any API path through the session-authenticated proxy.
 *
 * - LOCAL (Vite dev server): the /blipproxy middleware in vite.config.js
 *   performs Devise login and attaches _blip_session cookie server-side.
 *   It needs x-target-base to know where to forward.
 *
 * - VERCEL: the /blipproxy route hits a serverless function
 *   (api/blipproxy.js) which also handles login + session.
 *   It does NOT need x-target-base (hardcoded in the function).
 *
 * Both environments handle auth failures + retries transparently.
 */
async function sessionFetch(path) {
  const url = `/blipproxy${path}`;
  const headers = {
    'x-target-base': CONFIG.baseUrl,   // Used by Vite proxy (ignored on Vercel)
    'Accept': 'application/json',
  };

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      // 503 = proxy couldn't authenticate at all
      if (res.status === 503) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: err.detail || 'Session unavailable', data: null };
      }
      throw new Error(`HTTP ${res.status}`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return { ok: true, data: await res.json(), status: res.status };
    }

    const text = await res.text();
    if (!text || text.trim().length === 0) {
      return { ok: false, error: 'Empty response', data: null };
    }
    // If HTML was returned despite proxy retry, auth truly failed
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      return { ok: false, error: 'Auth required (login failed)', data: null };
    }
    try {
      return { ok: true, data: JSON.parse(text), status: res.status };
    } catch {
      return { ok: true, data: text, status: res.status };
    }
  } catch (err) {
    return { ok: false, error: err.message, data: null };
  }
}

/** Fetch from CloudPort API (session-authenticated — full access to ALL feeds) */
export const apiFetch = sessionFetch;

/** Fetch from Servo/ePub API (session-authenticated) */
export const blipFetch = sessionFetch;

/**
 * Check blip auth status from the proxy.
 * Returns { hasSession, sessionAge, jwtExpiry, mode }
 */
export async function getBlipAuthStatus() {
  try {
    const res = await fetch('/blipauth/status');
    if (res.ok) return await res.json();
  } catch { /* ignore */ }
  return { hasSession: false, sessionAge: null, jwtExpiry: null, mode: null };
}

// ── Orchestration API (player start / stop / status) ────────────────
const ORC_BASE = '/orcproxy/pocs/api/v1/feeds';

/**
 * Get player status for a specific headend.
 * GET /pocs/api/v1/feeds/{feedCode}/players/{headendCode}
 */
export async function getPlayerStatus(feedCode, headendCode) {
  try {
    const res = await fetch(`${ORC_BASE}/${feedCode}/players/${headendCode}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, error: err.message, data: null };
  }
}

/**
 * Start a player (sends email notification via server).
 * POST /orcaction  { action: "start", feedCode, playerId }
 */
export async function startPlayer(feedCode, headendCode) {
  try {
    const res = await fetch('/orcaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ action: 'start', feedCode, playerId: headendCode }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, error: err.message, data: null };
  }
}

/**
 * Stop a player (sends email notification via server).
 * POST /orcaction  { action: "stop", feedCode, playerId }
 */
export async function stopPlayer(feedCode, headendCode) {
  try {
    const res = await fetch('/orcaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ action: 'stop', feedCode, playerId: headendCode }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, error: err.message, data: null };
  }
}

// ── Fetch global data (no feed needed) ───────────────────────────────
export async function fetchGlobalData() {
  const f = (path) => apiFetch(path);

  const promises = {
    status: f('/status'),
    version: f('/api/v2/status/version'),
    metricsAsset: f('/v1/api/metrics/asset'),
    metricsStatus: f('/v1/api/metrics/status'),
    devices: f('/devices.json'),
    monitor: f('/v1/api/monitor?feed_id=1'),
  };

  const keys = Object.keys(promises);
  const results = await Promise.allSettled(Object.values(promises));
  const data = {};
  keys.forEach((key, i) => {
    data[key] = results[i].status === 'fulfilled'
      ? results[i].value
      : { ok: false, error: 'Promise rejected' };
  });
  return data;
}

/**
 * Fetch all ingest data from Servo and ePub.
 */
export async function fetchIngestData() {
  const [servoRes, epubRes, templatesRes] = await Promise.allSettled([
    blipFetch('/servo/api/v2/ingests'),
    blipFetch('/epub/v1/api/ingests'),
    blipFetch('/epub/v1/api/templates'),
  ]);

  return {
    servo: servoRes.status === 'fulfilled' ? servoRes.value : { ok: false, error: 'Failed' },
    epub: epubRes.status === 'fulfilled' ? epubRes.value : { ok: false, error: 'Failed' },
    templates: templatesRes.status === 'fulfilled' ? templatesRes.value : { ok: false, error: 'Failed' },
  };
}

/**
 * Build a feedCode → numericId map from the /v1/api/monitor response.
 */
export function buildFeedIdMap(monitorResult) {
  const map = {};
  if (monitorResult?.ok && monitorResult.data?.feeds) {
    for (const feed of monitorResult.data.feeds) {
      if (feed.code && feed.id) {
        map[feed.code] = feed.id;
      }
    }
  }
  return map;
}

/**
 * Build account-to-ingest mapping from ePub templates.
 */
export function buildAccountIngestMap(templatesResult) {
  const map = {};
  if (!templatesResult?.ok || !templatesResult.data?.templates) return map;

  for (const tmpl of templatesResult.data.templates) {
    const name = (tmpl.name || '').toLowerCase();
    const labels = tmpl.ingest_labels || [];
    if (name && labels.length > 0) {
      map[name] = labels;
    }
  }
  return map;
}

/**
 * Build a lookup of servo ingest data by ingest_label.
 */
export function buildServoIngestMap(servoResult) {
  const map = {};
  if (!servoResult?.ok || !Array.isArray(servoResult.data)) return map;

  for (const item of servoResult.data) {
    const v = item.value || item;
    const label = v.ingest_label;
    if (label) {
      map[label] = v;
    }
  }
  return map;
}

/**
 * Build a lookup of epub ingest data by ingest_label.
 */
export function buildEpubIngestMap(epubResult) {
  const map = {};
  if (!epubResult?.ok || !epubResult.data?.ingests) return map;

  for (const ing of epubResult.data.ingests) {
    const label = ing.ingest_label;
    if (label) {
      map[label] = ing;
    }
  }
  return map;
}

// ── Fetch feed-specific data for a single channel ────────────────────

/**
 * Lightweight summary — only 2-3 fast endpoints needed for the home-page
 * account cards (playlist health + now_playing).
 * ~3 requests instead of ~11, so background prefetch is 4× faster.
 */
export async function fetchFeedSummary(feedCode, numericId = null) {
  const f = (path) => apiFetch(path);
  const p = {};

  // v2: playlist health (fast)
  p.playlistStatus = f(`/api/v2/feeds/${feedCode}/playlist/status`);
  p.currentShow    = f(`/api/v2/feeds/${feedCode}/current_running_show`);

  if (numericId) {
    p.nowPlaying = f(`/v1/api/feeds/${numericId}/now_playing`);
  }

  const keys = Object.keys(p);
  const results = await Promise.allSettled(Object.values(p));
  const data = {};
  keys.forEach((key, i) => {
    data[key] = results[i].status === 'fulfilled'
      ? results[i].value
      : { ok: false, error: 'Promise rejected' };
  });
  data._meta = { feedCode, numericId, _summary: true };
  return data;
}

/**
 * Full feed data — everything needed for the detail view.
 * Called on-demand when user clicks into an account/channel.
 */
export async function fetchFeedData(feedCode, numericId = null) {
  const f = (path) => apiFetch(path);

  const feedPromises = {};

  // v2 APIs (use feed code)
    feedPromises.playlistStatus = f(`/api/v2/feeds/${feedCode}/playlist/status`);
    feedPromises.currentShow = f(`/api/v2/feeds/${feedCode}/current_running_show`);
    feedPromises.playoutChannel = f(`/api/v2/feeds/${feedCode}/playout_channel`);

  if (numericId) {
    // v1 APIs (need numeric ID)
    feedPromises.nowPlaying = f(`/v1/api/feeds/${numericId}/now_playing`);
    feedPromises.feedStorage = f(`/v1/api/feeds/${numericId}/storage`);
    feedPromises.feedErrors = f(`/v1/api/feeds/${numericId}/errors`);
    feedPromises.feedActivity = f(`/v1/api/feeds/${numericId}/activity_log`);
    feedPromises.headendStatus = f(`/v1/api/headend/${numericId}/status`);
    feedPromises.mediaCount = f(`/v1/api/media/count?feed_id=${numericId}`);
    feedPromises.downloadStatus = f(`/v1/api/headend/download_status?feed_id=${numericId}`);
    feedPromises.downloadHistory = f(`/v1/api/headend/download_history?feed_id=${numericId}`);
  }

  const keys = Object.keys(feedPromises);
  const results = await Promise.allSettled(Object.values(feedPromises));
  const data = {};
  keys.forEach((key, i) => {
    data[key] = results[i].status === 'fulfilled'
      ? results[i].value
      : { ok: false, error: 'Promise rejected' };
  });

  data._meta = { feedCode, numericId };

  // Fetch show playout if current show is available
  if (data.currentShow?.ok && data.currentShow.data?.show_id) {
    const showId = data.currentShow.data.show_id;
    data.showPlayout = await f(`/api/v2/feeds/${feedCode}/shows/${showId}/playout`);
  }

  return data;
}
