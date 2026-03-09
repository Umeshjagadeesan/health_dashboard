import React, { useState } from 'react';
import { Card, CardHeader, CardBody } from './Card';
import { Placeholder } from './DataDisplay';
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

export default function NowPlayingCard({ data }) {
  if (!data) return null;

  const np = data.nowPlaying;
  const show = data.showPlayout;

  const hasNowPlaying = np?.ok && Array.isArray(np.data) && np.data.length > 0;
  const hasShow = show?.ok && show.data;

  if (!hasNowPlaying && !hasShow) {
    return (
      <Card id="now-playing" wide>
        <CardHeader icon="▶️" title="Now Playing" badge="NO DATA" />
        <CardBody>
          <Placeholder text="No now playing data available for this feed." />
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
  const activeHeadend = headends.find(h => isPlayingState(h.state));
  const currentMedia = activeHeadend?.media;

  const hState = activeHeadend?.state;
  const { badgeText, badgeClass } = getHeaderBadge(hState);

  return (
    <Card id="now-playing" wide>
      <CardHeader icon="▶️" title="Now Playing" badge={badgeText} badgeClass={badgeClass} />
      <CardBody>
        {/* ── Live preview + headend selector ── */}
        <PreviewWithHeadendSelector headends={headends} activeHeadend={activeHeadend} />

        <div className="now-playing-content">
          <div className="np-info">
            {currentMedia ? (
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
        </div>
      </CardBody>
    </Card>
  );
}


/** Preview area with clickable headend cards */
function PreviewWithHeadendSelector({ headends, activeHeadend }) {
  const defaultIdx = activeHeadend
    ? headends.indexOf(activeHeadend)
    : 0;
  const [selectedIdx, setSelectedIdx] = useState(Math.max(defaultIdx, 0));

  const selected = headends[selectedIdx] || headends[0];
  const janusUrl = selected ? getNowPlayingJanusUrl(selected) : null;
  const hasMultiple = headends.length > 1;

  return (
    <>
      {/* ── Main preview area ── */}
      {janusUrl && (
        <div className="np-preview-wrapper">
          <LivePreview key={selected.id || selectedIdx} wsUrl={janusUrl} size="medium" />
        </div>
      )}

      {/* ── Headend cards (original appearance, clickable to switch preview) ── */}
      {hasMultiple && (
        <div style={{ marginTop: 16, marginBottom: 12 }}>
          <div className="card-section-title">HEADENDS</div>
          <div className="device-grid">
            {headends.map((h, idx) => {
              const isOnline = isPlayingState(h.state);
              const isSelected = idx === selectedIdx;
              return (
                <div
                  key={h.id}
                  className={`device-card ${isOnline ? 'online' : 'offline'}${h.state === 'rescue' ? ' rescue' : ''}${isSelected ? ' selected' : ''}`}
                  onClick={() => setSelectedIdx(idx)}
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
      )}
    </>
  );
}
