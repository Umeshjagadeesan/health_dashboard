export function safe(val, fallback = '--') {
  return val !== undefined && val !== null && val !== '' ? val : fallback;
}

export function timeAgo(dateStr) {
  if (!dateStr) return '--';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  if (isNaN(diffMs)) return dateStr;

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ago`;
}

export function formatDuration(ms) {
  if (!ms && ms !== 0) return '--';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '--';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatDate(dateStr) {
  if (!dateStr) return '--';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return dateStr; }
}

export function formatTime(dateStr) {
  if (!dateStr) return '--';
  try {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return dateStr; }
}

export function statusClass(val) {
  if (val === true || val === 'ok' || val === 'healthy' || val === 'connected' || val === 'running' || val === 'active' || val === 'success' || val === 'good' || val === 'published')
    return 'success';
  if (val === false || val === 'error' || val === 'down' || val === 'disconnected' || val === 'failed' || val === 'offline' || val === 'inactive')
    return 'danger';
  if (val === 'degraded' || val === 'warning' || val === 'partial' || val === 'pending')
    return 'warning';
  return '';
}

/**
 * Parse Prometheus-format text and extract metrics for a given feed.
 * Returns an object: { metricName: { labels: {...}, value: number } }
 */
export function parsePrometheusForFeed(text, feedCode) {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split('\n').filter(l => l && !l.startsWith('#'));
  const results = [];
  for (const line of lines) {
    if (!line.includes(`feed="${feedCode}"`)) continue;
    const match = line.match(/^(\w+)\{(.+)\}\s+([\d.eE+-]+)$/);
    if (!match) continue;
    const [, name, labelsStr, val] = match;
    const labels = {};
    labelsStr.replace(/(\w+)="([^"]*)"/g, (_, k, v) => { labels[k] = v; });
    results.push({ name, labels, value: parseFloat(val) });
  }
  return results;
}

/**
 * Parse Prometheus text and return ALL metrics grouped by name.
 */
export function parsePrometheus(text) {
  if (!text || typeof text !== 'string') return {};
  const lines = text.split('\n').filter(l => l && !l.startsWith('#'));
  const grouped = {};
  for (const line of lines) {
    const match = line.match(/^(\w+)(\{(.+)\})?\s+([\d.eE+-]+)$/);
    if (!match) continue;
    const [, name, , labelsStr, val] = match;
    const labels = {};
    if (labelsStr) {
      labelsStr.replace(/(\w+)="([^"]*)"/g, (_, k, v) => { labels[k] = v; });
    }
    if (!grouped[name]) grouped[name] = [];
    grouped[name].push({ labels, value: parseFloat(val) });
  }
  return grouped;
}
