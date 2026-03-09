import React from 'react';
import { Card, CardHeader, CardBody } from './Card';
import { Placeholder } from './DataDisplay';
import { formatDuration, formatTime } from '../utils/helpers';
import LivePreview, { getNowPlayingJanusUrl } from './LivePreview';

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
  const activeHeadend = headends.find(h => h.state === 'media' || h.state === 'live');
  const currentMedia = activeHeadend?.media;

  const isLive = activeHeadend?.state === 'live';
  const badgeText = isLive ? 'LIVE' : (activeHeadend?.state === 'media' ? 'ON AIR' : 'IDLE');
  const badgeClass = isLive ? 'danger' : (activeHeadend?.state === 'media' ? 'success' : 'warning');

  // Janus WebSocket URL for the active headend's live preview
  const janusUrl = activeHeadend ? getNowPlayingJanusUrl(activeHeadend) : null;

  return (
    <Card id="now-playing" wide>
      <CardHeader icon="▶️" title="Now Playing" badge={badgeText} badgeClass={badgeClass} />
      <CardBody>
        {/* ── Live preview from playout device ── */}
        {janusUrl && (
          <div className="np-preview-wrapper">
            <LivePreview wsUrl={janusUrl} size="medium" />
          </div>
        )}

        <div className="now-playing-content">
          <div className="np-info">
            {currentMedia ? (
              <>
                <div className="np-title">{currentMedia.title || 'Unknown Media'}</div>
                <div className="np-subtitle">
                  Show: {showName} ({showType})
                </div>
                {isLive && <span className="np-live-badge">LIVE</span>}
              </>
            ) : (
              <>
                <div className="np-title">{showName}</div>
                <div className="np-subtitle">Show Type: {showType} &bull; State: {showState}</div>
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

        {/* ── Multiple headends with individual previews ── */}
        {headends.length > 1 && (
          <div style={{ marginTop: 16 }}>
            <div className="card-section-title">Headends</div>
            <div className="device-grid">
              {headends.map((h) => {
                const hJanusUrl = getNowPlayingJanusUrl(h);
                return (
                  <div key={h.id} className={`device-card ${h.state === 'media' || h.state === 'live' ? 'online' : 'offline'}`}>
                    <div className="device-name">{h.code || `Headend ${h.id}`}</div>
                    <div className="device-detail">
                      State: {h.state || 'idle'} &bull; Type: {h.playout_type || '--'}
                    </div>
                    {h.media && (
                      <div className="device-detail" style={{ marginTop: 2, color: 'var(--text-primary)' }}>
                        {h.media.title}
                      </div>
                    )}
                    {hJanusUrl && (
                      <div style={{ marginTop: 6 }}>
                        <LivePreview wsUrl={hJanusUrl} size="small" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
