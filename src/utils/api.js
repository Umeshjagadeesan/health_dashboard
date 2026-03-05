/**
 * API utility – routes through Vite's /cpproxy middleware to avoid CORS.
 * Config is hardcoded so the user never needs to enter settings.
 */

// ── Hardcoded configuration ──────────────────────────────────────────
export const CONFIG = {
  baseUrl: 'https://pocs.demo.amagi.tv',
  token: '4ppioic-yycR64SGC-z1',
};

// ── Core fetch helper ────────────────────────────────────────────────
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

// ── Fetch global data (no feed needed) ───────────────────────────────
export async function fetchGlobalData() {
  const f = (path) => apiFetch(path);

  const promises = {
    status: f('/status'),
    version: f('/api/v2/status/version'),
    // apex: f('/api/v2/status/apex'),                // Commented out – not needed for now
    metricsAsset: f('/v1/api/metrics/asset'),
    metricsStatus: f('/v1/api/metrics/status'),
    devices: f('/devices.json'),
    // liveEvents: f('/api/v2/live_events'),           // Commented out – not needed for now
    // liveEventsCount: f('/api/v2/live_events/count'),// Commented out – not needed for now
    monitor: f('/v1/api/monitor?feed_id=1'),           // Returns ALL feeds with id+code mapping
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
 * Build a feedCode → numericId map from the /v1/api/monitor response.
 * e.g. { artv1: 1, artv2: 2, amghls: 3, ... }
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

// ── Fetch feed-specific data for a single channel ────────────────────
// numericId is now passed in directly (resolved from the global feed map).
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
