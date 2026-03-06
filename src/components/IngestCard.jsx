import React, { useState } from 'react';
import { Card, CardHeader, CardBody } from './Card';
import LivePreview, { getJanusWsUrl } from './LivePreview';

/**
 * Shows ingests associated with the current account inside the detail view.
 * Properly parses servo data: status[0].relay_status for live detection.
 */
export default function IngestCard({ ingests }) {
  const [expanded, setExpanded] = useState(null);

  if (!ingests || ingests.length === 0) {
    return (
      <Card id="ingest-info">
        <CardHeader
          icon="📡"
          title="Live Ingests"
          badge="NO INGESTS"
          badgeClass=""
        />
        <CardBody>
          <div className="placeholder-text">
            No ingest points mapped to this account
          </div>
        </CardBody>
      </Card>
    );
  }

  const runningCount = ingests.filter((i) => getRelayStatus(i) === 'RUNNING').length;
  const withInputCount = ingests.filter((i) => getInputBitrate(i) > 0).length;

  return (
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
            const isOpen = expanded === ingest.label;

            return (
              <div
                key={ingest.label}
                className={`ingest-card-item ${statusClass}`}
                onClick={() => setExpanded(isOpen ? null : ingest.label)}
              >
                <div className="ingest-card-top">
                  <div className={`ingest-status-dot ${statusClass}`} />
                  <div className="ingest-card-label">{ingest.label}</div>
                  <div className={`ingest-status-badge ${statusClass}`}>
                    {statusLabel}
                  </div>
                </div>

                {/* Summary chips */}
                <div className="ingest-card-summary">
                  {getQuickStats(ingest).map((stat, i) => (
                    <span key={i} className="ingest-stat-chip">
                      {stat}
                    </span>
                  ))}
                </div>

                {/* Expanded details — stop click propagation so play/stop don't collapse the card */}
                {isOpen && (
                  <div className="ingest-card-details" onClick={(e) => e.stopPropagation()}>
                    {/* Live Preview (medium player) */}
                    {getJanusWsUrl(ingest) && (
                      <LivePreview wsUrl={getJanusWsUrl(ingest)} size="medium" />
                    )}
                    <IngestDetails ingest={ingest} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}


/* ── Helpers: extract data from servo's nested structure ── */

function getRelay(ingest) {
  if (!ingest.servo) return null;
  const status = ingest.servo.status;
  if (Array.isArray(status) && status.length > 0) {
    return status[0].relay_status || null;
  }
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
  if (rs === 'RUNNING') return '◉ Running';
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


/* ── Expanded detail view inside the card ── */

function IngestDetails({ ingest }) {
  const servo = ingest.servo;
  const epub = ingest.epub;
  const relay = getRelay(ingest);

  return (
    <div className="ingest-details-inner">
      {/* Relay Status */}
      {relay && (
        <div className="ingest-detail-block">
          <div className="card-section-title">Status</div>
          <div className="kv-list">
            <KvRow label="Status" value={relay.status} highlight />
            <KvRow label="Input Bitrate" value={fmtBitrate(relay.input_bitrate)} />
            <KvRow label="Output Bitrate" value={fmtBitrate(relay.output_bitrate)} />
            {relay.elic_name && <KvRow label="ELIC" value={relay.elic_name} />}
          </div>
        </div>
      )}

      {/* Media Info — show structured fields with PID & framerate */}
      {servo && Array.isArray(servo.media_info) && servo.media_info.length > 0 && (
        <div className="ingest-detail-block">
          <div className="card-section-title">Media Info</div>
          <div className="kv-list">
            {servo.media_info[0].elic_name && (
              <KvRow label="ELIC" value={servo.media_info[0].elic_name} />
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

      {/* Stream Endpoint from ePub */}
      {epub && epub.stream_url && (
        <div className="ingest-detail-block">
          <div className="card-section-title">Stream Endpoint</div>
          <div className="kv-row">
            <span className="kv-key">URL</span>
            <span className="kv-value endpoint-value">{epub.stream_url}</span>
          </div>
        </div>
      )}

      {/* ePub config */}
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
    </div>
  );
}


/* ── Small helpers ── */

function KvRow({ label, value, highlight }) {
  const displayVal = value === null || value === undefined ? '—' : String(value);
  return (
    <div className="kv-row">
      <span className="kv-key">{label}</span>
      <span className={`kv-value${highlight ? ' highlight' : ''}`}>{displayVal}</span>
    </div>
  );
}

/** Structured track row showing codec, PID, framerate on one line */
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
