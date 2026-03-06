import React from 'react';

export default function TopBar({
  connected,
  lastRefresh,
  loading,
  onRefresh,
  refreshInterval,
  onRefreshIntervalChange,
  prefetchStatus,
  blipAuthStatus,
}) {
  const isPrefetching = prefetchStatus && !prefetchStatus.complete && prefetchStatus.total > 0;

  // Blip auth indicator
  const blipOk = blipAuthStatus?.hasSession;
  const blipMode = blipAuthStatus?.mode; // 'token' or 'session'

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <div className="logo">
          <div className="logo-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="6" fill="url(#grad1)" />
              <path d="M8 14L12 10L16 14L20 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="20" cy="8" r="2" fill="white" />
              <path d="M8 18H20" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
              <path d="M8 21H16" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
              <defs>
                <linearGradient id="grad1" x1="0" y1="0" x2="28" y2="28">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span className="logo-text">
            CloudPort <span className="logo-accent">Health</span>
          </span>
        </div>
        <div className={`connection-badge${connected ? ' connected' : ''}`}>
          <span className="badge-dot"></span>
          <span className="badge-text">{connected ? 'Connected' : 'Not Connected'}</span>
        </div>
        {isPrefetching && (
          <div className="prefetch-topbar-badge">
            <span className="mini-spinner"></span>
            <span>Pre-loading feeds ({prefetchStatus.done}/{prefetchStatus.total})</span>
          </div>
        )}
      </div>
      <div className="top-bar-right">
        {/* Blip auth status (auto-managed, no user action needed) */}
        <div
          className={`blip-session-badge ${blipOk ? 'active' : 'expired'}`}
          title={
            blipOk
              ? `Servo/ePub: Connected (${blipMode === 'token' ? 'API token' : 'session cookie'})`
              : 'Servo/ePub: Connecting...'
          }
        >
          <span>{blipOk ? '🔑' : '⏳'}</span>
          <span>{blipOk ? (blipMode === 'token' ? 'API' : 'Servo') : 'Servo…'}</span>
        </div>

        <div className="last-refresh">
          Last refresh: {lastRefresh ? lastRefresh.toLocaleTimeString() : '--'}
        </div>
        <div className="refresh-selector">
          <span className="refresh-label">Auto</span>
          <select
            value={refreshInterval}
            onChange={(e) => onRefreshIntervalChange(parseInt(e.target.value, 10))}
          >
            <option value="0">OFF</option>
            <option value="15">15s</option>
            <option value="30">30s</option>
            <option value="60">1m</option>
            <option value="120">2m</option>
            <option value="300">5m</option>
          </select>
        </div>
        <button
          className={`icon-btn${loading ? ' spinning' : ''}`}
          onClick={onRefresh}
          title="Refresh Now (Ctrl+R)"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>
    </header>
  );
}
