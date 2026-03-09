import React from 'react';
import { parsePrometheusForFeed } from '../utils/helpers';

export default function AccountCard({ account, globalData, isCached, onClick }) {
  const { name, channels, devices } = account;

  // isCached is now: 'full' | 'summary' | false
  const cacheLevel = isCached; // keep semantic name

  // ── Parse headend health summary from Prometheus metrics ──
  const metricsText =
    globalData?.metricsStatus?.ok && typeof globalData.metricsStatus.data === 'string'
      ? globalData.metricsStatus.data
      : '';
  let healthyCount = 0;
  let totalCount = 0;

  if (metricsText) {
    channels.forEach((ch) => {
      const metrics = parsePrometheusForFeed(metricsText, ch);
      const daHealth = metrics.filter((m) => m.name === 'device_agent_health');
      totalCount += daHealth.length;
      healthyCount += daHealth.filter((m) => m.value >= 1).length;
    });
  }

  // ── Device type summary ──
  const typeSet = new Set(devices.map((d) => d.Type).filter(Boolean));
  const types = Array.from(typeSet).join(', ');

  // ── Status badge logic ──
  let statusBadge;
  if (cacheLevel === 'full') {
    statusBadge = <span className="card-badge success" title="Full data pre-loaded">✓ Ready</span>;
  } else if (cacheLevel === 'summary') {
    statusBadge = <span className="card-badge info" title="Summary loaded, full data loads on click">✓ Ready</span>;
  } else {
    // Not yet prefetched — still show the card instantly, no spinner
    statusBadge = (
      <span className="card-badge" style={{ opacity: 0.5 }} title="Click to load details">
        <span className="mini-spinner"></span> Loading
      </span>
    );
  }

  return (
    <div className={`account-card${cacheLevel ? ' cached' : ''}`} onClick={onClick}>
      <div className="account-card-header">
        <div className="account-name">{name}</div>
        <div className="account-badges">
          {statusBadge}
          {totalCount > 0 && (
            <span
              className={`card-badge ${
                healthyCount === totalCount
                  ? 'success'
                  : healthyCount > 0
                  ? 'warning'
                  : 'danger'
              }`}
            >
              {healthyCount}/{totalCount} Healthy
            </span>
          )}
        </div>
      </div>

      <div className="account-channels">
        {channels.map((ch) => (
          <span key={ch} className="channel-tag">{ch}</span>
        ))}
      </div>

      <div className="account-meta">
        <span>📦 {devices.length} Device{devices.length !== 1 ? 's' : ''}</span>
        {types && <span>🏷️ {types}</span>}
      </div>

      <div className="account-footer">
        <span className="account-arrow">View Details →</span>
      </div>
    </div>
  );
}
