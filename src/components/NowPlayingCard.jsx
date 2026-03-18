import React, { useState } from 'react';
import { Card, CardHeader, CardBody } from './Card';
import { Placeholder, CardLoading } from './DataDisplay';
import { formatDuration, formatTime } from '../utils/helpers';
import LivePreview, { getNowPlayingJanusUrl } from './LivePreview';

// ── Helpers for headend state ──────────────────────────────────────
/** Returns true if the headend is actively playing (not idle/off) */
const isPlayingState = (s) => s && s !== 'idle' && s !== 'off';

// ── Helpers for headend state display ──────────────────────────────
function headendStateLabel(state) {
  if (!state) return 'idle';
  switch (state) {
    case 'media':   return 'Playing';
    case 'live':    return 'Live';
    case 'rescue':  return 'Rescue';
    case 'slate':   return 'Slate';
    case 'idle':    return 'Idle';
    case 'off':     return 'Off';
    default:        return state.charAt(0).toUpperCase() + state.slice(1);
  }
}

function getStateColor(state) {
  switch (state) {
    case 'media':   return 'var(--success)';
    case 'live':    return 'var(--danger)';
    case 'rescue':  return 'var(--warning)';
    case 'slate':   return 'var(--purple, #a78bfa)';
    case 'idle':
    case 'off':     return 'var(--text-muted)';
    default:        return 'var(--text-secondary)';
  }
}

function getHeaderBadge(state) {
  switch (state) {
    case 'live':    return { badgeText: 'LIVE',    badgeClass: 'danger'  };
    case 'media':   return { badgeText: 'ON AIR',  badgeClass: 'success' };
    case 'rescue':  return { badgeText: 'RESCUE',  badgeClass: 'warning' };
    case 'slate':   return { badgeText: 'SLATE',   badgeClass: 'warning' };
    default:        return { badgeText: 'IDLE',    badgeClass: 'warning' };
  }
}

export default function NowPlayingCard({ data, isLoading }) {
  if (!data) return null;

  const np = data.nowPlaying;
  const show = data.showPlayout;
  const notFetched = !np && !show;

  const hasNowPlaying = np?.ok && Array.isArray(np.data) && np.data.length > 0;
  const hasShow = show?.ok && show.data;

  if (!hasNowPlaying && !hasShow) {
    return (
      <Card id="now-playing" wide>
        <CardHeader icon="▶️" title="Now Playing" badge={notFetched && isLoading ? '' : 'NO DATA'} />
        <CardBody>
          {notFetched && isLoading ? <CardLoading /> : <Placeholder text="No now playing data available for this feed." />}
        </CardBody>
      </Card>
    );
  }

  // Current show details
  const showData = hasShow ? show.data : {};
  const showName = showData.name || '--';
  const showType = showData.show_type || '--';
  const showState = showData.show_state || '--';
  const startTime = showData.start_time;
  const endTime = showData.end_time;
  const duration = showData.duration;
  const fps = showData.fps;
  const itemCount = showData.items?.length || 0;

  // Headend playout data
  const headends = hasNowPlaying ? np.data : [];
  const activeIdx = headends.findIndex(h => isPlayingState(h.state));

  // State: which headend is selected (default to active, or first)
  const [selectedIdx, setSelectedIdx] = useState(Math.max(activeIdx, 0));

  // Keep selectedIdx in bounds if headends list changes
  const safeIdx = selectedIdx < headends.length ? selectedIdx : 0;
  const selected = headends[safeIdx];
  const hState = selected?.state;
  const currentMedia = selected?.media;
  const { badgeText, badgeClass } = getHeaderBadge(hState);

  return (
    <Card id="now-playing" wide>
      <CardHeader icon="▶️" title="Now Playing" badge={badgeText} badgeClass={badgeClass} />
      <CardBody>
        <div className="np-side-by-side">
          {/* ── LEFT: Details ── */}
          <div className="np-details-panel">
            <div className="np-info">
              {isPlayingState(hState) && currentMedia ? (
                <>
                  <div className="np-title">{currentMedia.title || 'Unknown Media'}</div>
                  <div className="np-subtitle">
                    Show: {showName} ({showType})
                    {hState && hState !== 'media' && (
                      <span style={{ marginLeft: 8, fontWeight: 600, textTransform: 'uppercase', color: getStateColor(hState) }}>
                        — {hState}
                      </span>
                    )}
                  </div>
                  {hState === 'live' && <span className="np-live-badge">LIVE</span>}
                  {hState === 'rescue' && <span className="np-live-badge" style={{ background: 'var(--warning)' }}>RESCUE</span>}
                </>
              ) : (
                <>
                  <div className="np-title">{showName}</div>
                  <div className="np-subtitle">
                    Show Type: {showType} &bull; State: {showState}
                    {hState && hState !== 'idle' && (
                      <span style={{ marginLeft: 8, fontWeight: 600, textTransform: 'uppercase', color: getStateColor(hState) }}>
                        — {headendStateLabel(hState)}
                      </span>
                    )}
                  </div>
                </>
              )}

              <div className="np-meta">
                {startTime && (
                  <div className="np-meta-item">
                    <span className="meta-label">Start</span>
                    <span className="meta-value">{formatTime(startTime)}</span>
                  </div>
                )}
                {endTime && (
                  <div className="np-meta-item">
                    <span className="meta-label">End</span>
                    <span className="meta-value">{formatTime(endTime)}</span>
                  </div>
                )}
                {duration && (
                  <div className="np-meta-item">
                    <span className="meta-label">Duration</span>
                    <span className="meta-value">{formatDuration(duration)}</span>
                  </div>
                )}
                {fps && (
                  <div className="np-meta-item">
                    <span className="meta-label">FPS</span>
                    <span className="meta-value">{parseFloat(fps).toFixed(2)}</span>
                  </div>
                )}
                {itemCount > 0 && (
                  <div className="np-meta-item">
                    <span className="meta-label">Items</span>
                    <span className="meta-value">{itemCount}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Headend cards (clickable to switch preview) ── */}
            {headends.length > 0 && (
              <HeadendSelector
                headends={headends}
                selectedIdx={safeIdx}
                onSelect={setSelectedIdx}
              />
            )}
          </div>

          {/* ── RIGHT: Preview ── */}
          <div className="np-preview-panel">
            <PreviewArea headend={selected} />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}


/** Preview area — auto-plays for active headend, shows message for stopped */
function PreviewArea({ headend }) {
  if (!headend) return null;

  const isActive = isPlayingState(headend.state);
  const janusUrl = getNowPlayingJanusUrl(headend);

  // For stopped/idle players → show "not available" message
  if (!isActive || !janusUrl) {
    return (
      <div className="np-preview-unavailable">
        <div className="np-preview-unavailable-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
            <line x1="7" y1="2" x2="7" y2="22" />
            <line x1="17" y1="2" x2="17" y2="22" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <line x1="2" y1="7" x2="7" y2="7" />
            <line x1="2" y1="17" x2="7" y2="17" />
            <line x1="17" y1="7" x2="22" y2="7" />
            <line x1="17" y1="17" x2="22" y2="17" />
          </svg>
        </div>
        <div className="np-preview-unavailable-text">Preview not available</div>
        <div className="np-preview-unavailable-hint">
          Player is {headend.state || 'stopped'}. Start the player to watch preview.
        </div>
      </div>
    );
  }

  // Auto-play preview for active players
  return (
    <LivePreview
      key={headend.id || headend.code}
      wsUrl={janusUrl}
      size="large"
      autoPlay={true}
    />
  );
}


/** Headend cards — clickable to switch preview */
function HeadendSelector({ headends, selectedIdx, onSelect }) {
  if (!headends || headends.length === 0) return null;

  return (
    <div className="np-headend-list">
      <div className="card-section-title" style={{ marginBottom: 8 }}>
        HEADENDS {headends.length > 1 && <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>(click to switch preview)</span>}
      </div>
      <div className="np-headend-grid">
        {headends.map((h, idx) => {
          const isOnline = isPlayingState(h.state);
          const isSelected = idx === selectedIdx;
          return (
            <div
              key={h.id}
              className={`device-card ${isOnline ? 'online' : 'offline'}${h.state === 'rescue' ? ' rescue' : ''}${isSelected ? ' selected' : ''}`}
              onClick={() => onSelect(idx)}
              style={{ cursor: 'pointer' }}
            >
              <div className="device-name">{h.code || `Headend ${h.id}`}</div>
              <div className="device-detail">
                State: <span style={{ color: getStateColor(h.state), fontWeight: 600 }}>{headendStateLabel(h.state)}</span> &bull; Type: {h.playout_type || '--'}
              </div>
              {h.media && (
                <div className="device-detail" style={{ marginTop: 2, color: 'var(--text-primary)' }}>
                  {h.media.title}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
