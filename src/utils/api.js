/**
 * API utility – routes through Vite's /cpproxy and /blipproxy middleware.
 * Config is hardcoded so the user never needs to enter settings.
 *
 * Authentication:
 *   - CloudPort APIs (/cpproxy): uses x-user-token header
 *   - Servo/ePub APIs (/blipproxy): session managed automatically by the proxy
 *     (Auth0 JWT refresh → _blip_session acquisition, all server-side)
 */

// ── Hardcoded configuration ──────────────────────────────────────────
export const CONFIG = {
  baseUrl: 'https://pocs.demo.amagi.tv',
  token: '4ppioic-yycR64SGC-z1',
};

// ── Core fetch helpers ────────────────────────────────────────────────

/** Fetch from CloudPort API (uses x-user-token) */
export async function apiFetch(path) {
  const url = `/cpproxy${path}`;
  const headers = {
    'x-user-token': CONFIG.token,
    'Content-Type': 'application/json',
    'x-target-base': CONFIG.baseUrl,
  };
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return { ok: true, data: await res.json(), status: res.status };
    }
    return { ok: true, data: await res.text(), status: res.status };
  } catch (err) {
    return { ok: false, error: err.message, data: null };
  }
}

/**
 * Fetch from Servo/ePub API (session managed automatically).
 *
 * - LOCAL (Vite dev server): the /blipproxy middleware in vite.config.js
 *   performs Devise login and attaches _blip_session cookie server-side.
 *   It needs x-target-base to know where to forward.
 *
 * - VERCEL: the /blipproxy route hits a serverless function
 *   (api/blipproxy/[...path].js) which also handles login + session.
 *   It does NOT need x-target-base (hardcoded in the function).
 *
 * Both environments handle auth failures + retries transparently.
 */
export async function blipFetch(path) {
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
        return { ok: false, error: err.detail || 'Blip session unavailable', data: null };
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
