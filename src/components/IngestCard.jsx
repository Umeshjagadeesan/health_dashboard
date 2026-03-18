import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardHeader, CardBody } from './Card';
import LivePreview, { getJanusWsUrl } from './LivePreview';

/**
 * Shows ingests inside the account detail view.
 * Clicking an ingest opens a slide-out detail panel (same UX as IngestPanel).
 */
export default function IngestCard({ ingests }) {
  const [selectedLabel, setSelectedLabel] = useState(null);

  if (!ingests || ingests.length === 0) {
    return (
      <Card id="ingest-info">
        <CardHeader icon="📡" title="Live Ingests" badge="NO INGESTS" badgeClass="" />
        <CardBody>
          <div className="placeholder-text">No ingest points mapped to this account</div>
        </CardBody>
      </Card>
    );
  }

  const runningCount = ingests.filter((i) => getRelayStatus(i) === 'RUNNING').length;
  const withInputCount = ingests.filter((i) => getInputBitrate(i) > 0).length;

  const selectedIngest = selectedLabel
    ? ingests.find((i) => i.label === selectedLabel)
    : null;

  return (
    <>
      <Card id="ingest-info" wide>
        <CardHeader
          icon="📡"
          title="Live Ingests"
          badge={`${runningCount}/${ingests.length} Running`}
          badgeClass={withInputCount > 0 ? 'success' : runningCount > 0 ? 'warning' : 'danger'}
        />
        <CardBody>
          <div className="ingest-card-grid">
            {ingests.map((ingest) => {
              const statusClass = getStatusClass(ingest);
              const statusLabel = getStatusLabel(ingest);
              const isSelected = selectedLabel === ingest.label;

              return (
                <div
                  key={ingest.label}
                  className={`ingest-card-item ${statusClass}${isSelected ? ' selected' : ''}`}
                  onClick={() => setSelectedLabel(isSelected ? null : ingest.label)}
                >
                  <div className="ingest-card-top">
                    <div className={`ingest-status-dot ${statusClass}`} />
                    <div className="ingest-card-label">{ingest.label}</div>
                    <div className={`ingest-status-badge ${statusClass}`}>{statusLabel}</div>
                  </div>

                  <div className="ingest-card-summary">
                    {getQuickStats(ingest).map((stat, i) => (
                      <span key={i} className="ingest-stat-chip">{stat}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* ── Slide-out Detail Panel (portal) ── */}
      {selectedIngest && createPortal(
        <IngestDetailPanel
          key={selectedIngest.label}
          ingest={selectedIngest}
          ingests={ingests}
          onClose={() => setSelectedLabel(null)}
          onSelect={(label) => setSelectedLabel(label)}
        />,
        document.body
      )}
    </>
  );
}


/* ================================================================
   Slide-out detail panel — shows full ingest info + live preview
   ================================================================ */

function IngestDetailPanel({ ingest, ingests, onClose, onSelect }) {
  const panelRef = useRef(null);
  const statusClass = getStatusClass(ingest);
  const statusLabel = getStatusLabel(ingest);
  const janusUrl = getJanusWsUrl(ingest);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="ingest-detail-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        className="ingest-detail-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="ingest-detail-panel-header">
          <div className="ingest-detail-panel-title-row">
            <div className={`ingest-status-dot ${statusClass}`} />
            <h3 className="ingest-detail-panel-title">{ingest.label}</h3>
            <span className={`ingest-status-badge ${statusClass}`}>{statusLabel}</span>
          </div>
          <button className="ingest-detail-panel-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Body ── */}
        <div className="ingest-detail-panel-body">
          {/* Live Preview */}
          {janusUrl && (
            <div className="ingest-detail-preview">
              <LivePreview wsUrl={janusUrl} size="medium" />
            </div>
          )}

          {/* Detailed info */}
          <IngestDetails ingest={ingest} />
        </div>

        {/* ── Quick-switch tabs at the bottom ── */}
        {ingests.length > 1 && (
          <div className="ingest-detail-panel-tabs">
            <div className="ingest-detail-tabs-label">Switch Ingest:</div>
            <div className="ingest-detail-tabs-list">
              {ingests.map((ing) => {
                const sc = getStatusClass(ing);
                const isActive = ing.label === ingest.label;
                return (
                  <button
                    key={ing.label}
                    className={`ingest-detail-tab ${sc}${isActive ? ' active' : ''}`}
                    onClick={() => onSelect(ing.label)}
                    title={ing.label}
                  >
                    <span className={`ingest-status-dot ${sc}`} />
                    <span className="ingest-detail-tab-name">{ing.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


/* ── Expanded detail view inside the panel ── */

function IngestDetails({ ingest }) {
  const servo = ingest.servo;
  const epub = ingest.epub;
  const relay = getRelay(ingest);

  return (
    <div className="ingest-details-inner">
      {relay && (
        <div className="ingest-detail-block">
          <div className="card-section-title">Live Status</div>
          <div className="kv-list">
            <KvRow label="Status" value={relay.status} highlight />
            <KvRow label="Input Bitrate" value={fmtBitrate(relay.input_bitrate)} />
            <KvRow label="Output Bitrate" value={fmtBitrate(relay.output_bitrate)} />
            {relay.elic_name && <KvRow label="ELIC" value={relay.elic_name} />}
          </div>
        </div>
      )}

      {servo && Array.isArray(servo.media_info) && servo.media_info.length > 0 && (
        <div className="ingest-detail-block">
          <div className="card-section-title">Media Info</div>
          <div className="kv-list">
            {getSourceStreamUrl(ingest) && (
              <KvRow label="Endpoint" value={getSourceStreamUrl(ingest)} />
            )}
            {servo.media_info[0].pcr_pid !== undefined && (
              <KvRow label="PCR PID" value={servo.media_info[0].pcr_pid} />
            )}
            {Array.isArray(servo.media_info[0].tracks) && servo.media_info[0].tracks.map((track, i) => (
              <TrackRow key={i} index={i + 1} track={track} />
            ))}
          </div>
        </div>
      )}

      {epub && (
        <div className="ingest-detail-block">
          <div className="card-section-title">Configuration (ePub)</div>
          <div className="kv-list">
            {epub.ingest_type && <KvRow label="Type" value={epub.ingest_type} />}
            {epub.account_domain && <KvRow label="Account" value={epub.account_domain} />}
            {epub.protocol && <KvRow label="Protocol" value={epub.protocol} />}
            {epub.input_resolution && <KvRow label="Resolution" value={epub.input_resolution} />}
            {epub.input_codec && <KvRow label="Codec" value={epub.input_codec} />}
          </div>
        </div>
      )}

      {!servo && !epub && (
        <div className="placeholder-text" style={{ height: 40 }}>No detailed data available</div>
      )}
    </div>
  );
}


/* ── Helpers ── */

function getRelay(ingest) {
  if (!ingest.servo) return null;
  const status = ingest.servo.status;
  if (Array.isArray(status) && status.length > 0) return status[0].relay_status || null;
  return null;
}

function getSourceStreamUrl(ingest) {
  const eps = ingest.servo?.end_points;
  if (Array.isArray(eps) && eps.length > 0) return eps[0].source_stream_url || null;
  return null;
}

function getRelayStatus(ingest) {
  return getRelay(ingest)?.status || 'UNKNOWN';
}

function getInputBitrate(ingest) {
  return getRelay(ingest)?.input_bitrate || 0;
}

function getStatusClass(ingest) {
  const rs = getRelayStatus(ingest);
  const br = getInputBitrate(ingest);
  if (rs === 'RUNNING' && br > 0) return 'live';
  if (rs === 'RUNNING') return 'running';
  if (rs === 'PENDING_CONFIGURATION') return 'pending';
  if (rs === 'STOPPED') return 'idle';
  return 'unknown';
}

function getStatusLabel(ingest) {
  const rs = getRelayStatus(ingest);
  const br = getInputBitrate(ingest);
  if (rs === 'RUNNING' && br > 0) return '● LIVE';
  if (rs === 'RUNNING') return '⚠ Bitrate Zero';
  if (rs === 'PENDING_CONFIGURATION') return '◌ Pending';
  if (rs === 'STOPPED') return '○ Stopped';
  return '? N/A';
}

function getQuickStats(ingest) {
  const stats = [];
  const relay = getRelay(ingest);
  if (relay) {
    if (relay.input_bitrate > 0) stats.push(`In: ${fmtBitrate(relay.input_bitrate)}`);
    if (relay.output_bitrate > 0) stats.push(`Out: ${fmtBitrate(relay.output_bitrate)}`);
  }
  if (ingest.servo) {
    const media = ingest.servo.media_info;
    if (Array.isArray(media) && media.length > 0) {
      const tracks = media[0].tracks;
      if (Array.isArray(tracks) && tracks.length > 0) {
        const codecs = tracks.map(t => t.codec).filter(Boolean);
        if (codecs.length > 0) stats.push(codecs.join('+'));
      }
    }
  }
  if (ingest.epub?.ingest_type) stats.push(ingest.epub.ingest_type);
  return stats.length > 0 ? stats : [ingest.servo?.elic_name || 'No data'];
}

function KvRow({ label, value, highlight }) {
  const displayVal = value === null || value === undefined ? '—' : String(value);
  return (
    <div className="kv-row">
      <span className="kv-key">{label}</span>
      <span className={`kv-value${highlight ? ' highlight' : ''}`}>{displayVal}</span>
    </div>
  );
}

function TrackRow({ index, track }) {
  const parts = [];
  if (track.codec) parts.push(track.codec);
  if (track.command_category) parts.push(track.command_category);
  if (track.pid !== undefined && track.pid !== null) parts.push(`PID: ${track.pid}`);
  if (track.frame_rate) parts.push(`${track.frame_rate} fps`);
  if (track.framerate) parts.push(`${track.framerate} fps`);
  return (
    <div className="kv-row">
      <span className="kv-key">{`Track ${index}`}</span>
      <span className="kv-value">{parts.join(' · ') || 'Unknown'}</span>
    </div>
  );
}

function fmtBitrate(val) {
  if (!val || val === 0) return '0';
  if (val >= 1000) return `${val.toFixed(1)} Gbps`;
  if (val >= 1) return `${val.toFixed(2)} Mbps`;
  return `${(val * 1000).toFixed(0)} Kbps`;
}
