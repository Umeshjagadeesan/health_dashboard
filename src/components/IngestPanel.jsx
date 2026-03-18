import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import LivePreview, { getJanusWsUrl } from './LivePreview';

/**
 * Floating button on the right side that expands into a panel
 * showing all ingest points with their live status.
 * Detail flyout appears to the LEFT of the hovered item (using a portal).
 */
export default function IngestPanel({ ingests }) {
  const [open, setOpen] = useState(false);
  const [hoveredIngest, setHoveredIngest] = useState(null);
  const [flyoutPos, setFlyoutPos] = useState(null);
  const itemRefs = useRef({});
  const flyoutLeaveTimer = useRef(null);  // delay before closing flyout
  const panelLeaveTimer = useRef(null);   // delay before closing entire panel

  // Compute flyout position whenever hovered item changes
  const updateFlyoutPos = useCallback((label) => {
    if (!label || !itemRefs.current[label]) {
      setFlyoutPos(null);
      return;
    }
    const el = itemRefs.current[label];
    const rect = el.getBoundingClientRect();
    const panelLeftEdge = rect.left;
    setFlyoutPos({
      top: rect.top + rect.height / 2,
      right: window.innerWidth - panelLeftEdge + 14,
    });
  }, []);

  // ── Panel open/close with delay ──
  const keepPanelOpen = useCallback(() => {
    if (panelLeaveTimer.current) {
      clearTimeout(panelLeaveTimer.current);
      panelLeaveTimer.current = null;
    }
    setOpen(true);
  }, []);

  const schedulePanelClose = useCallback(() => {
    if (panelLeaveTimer.current) clearTimeout(panelLeaveTimer.current);
    panelLeaveTimer.current = setTimeout(() => {
      setOpen(false);
      setHoveredIngest(null);
      setFlyoutPos(null);
      panelLeaveTimer.current = null;
    }, 300);
  }, []);

  // ── Flyout hover in: cancel ALL pending close timers ──
  const handleHover = useCallback((label) => {
    if (flyoutLeaveTimer.current) {
      clearTimeout(flyoutLeaveTimer.current);
      flyoutLeaveTimer.current = null;
    }
    if (panelLeaveTimer.current) {
      clearTimeout(panelLeaveTimer.current);
      panelLeaveTimer.current = null;
    }
    setHoveredIngest(label);
    updateFlyoutPos(label);
  }, [updateFlyoutPos]);

  // ── Flyout hover out: delay close so mouse can travel ──
  const handleLeave = useCallback(() => {
    if (flyoutLeaveTimer.current) clearTimeout(flyoutLeaveTimer.current);
    flyoutLeaveTimer.current = setTimeout(() => {
      setHoveredIngest(null);
      setFlyoutPos(null);
      flyoutLeaveTimer.current = null;
    }, 250);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (flyoutLeaveTimer.current) clearTimeout(flyoutLeaveTimer.current);
      if (panelLeaveTimer.current) clearTimeout(panelLeaveTimer.current);
    };
  }, []);

  if (!ingests || ingests.length === 0) return null;

  const liveCount = ingests.filter((i) => getRelayStatus(i) === 'RUNNING').length;
  const withInputCount = ingests.filter((i) => getInputBitrate(i) > 0).length;
  const totalCount = ingests.length;

  // Find the hovered ingest data for the flyout
  const hoveredData = hoveredIngest
    ? ingests.find((i) => i.label === hoveredIngest)
    : null;

  return (
    <>
      {/* ── Floating Tab Button ── */}
      <div
        className={`ingest-tab-btn${open ? ' active' : ''}`}
        onMouseEnter={keepPanelOpen}
        onClick={() => { open ? schedulePanelClose() : keepPanelOpen(); }}
      >
        <span className="ingest-tab-icon">📡</span>
        <span className="ingest-tab-label">Ingests</span>
        <span className="ingest-tab-count">
          {liveCount}/{totalCount}
        </span>
      </div>

      {/* ── Slide-out Panel ── */}
      {open && (
        <div
          className="ingest-panel-overlay"
          onClick={() => { setOpen(false); setHoveredIngest(null); setFlyoutPos(null); }}
        >
          <div
            className="ingest-panel"
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={keepPanelOpen}
            onMouseLeave={schedulePanelClose}
          >
            <div className="ingest-panel-header">
              <h3>📡 Ingests</h3>
              <div className="ingest-panel-summary">
                <span className="card-badge success">{liveCount} Running</span>
                {withInputCount > 0 && (
                  <span className="card-badge info">{withInputCount} With Input</span>
                )}
                <span className="card-badge">{totalCount} Total</span>
              </div>
            </div>

            <div className="ingest-panel-list">
              {ingests.map((ingest) => {
                const statusClass = getStatusClass(ingest);
                const statusLabel = getStatusLabel(ingest);
                const isHovered = hoveredIngest === ingest.label;
                return (
                  <div
                    key={ingest.label}
                    ref={(el) => { itemRefs.current[ingest.label] = el; }}
                    className={`ingest-item ${statusClass}${isHovered ? ' hovered' : ''}`}
                    onMouseEnter={() => handleHover(ingest.label)}
                    onMouseLeave={handleLeave}
                  >
                    <div className={`ingest-status-dot ${statusClass}`} />
                    <div className="ingest-item-info">
                      <div className="ingest-item-label">{ingest.label}</div>
                      <div className="ingest-item-meta">
                        {getIngestSummary(ingest)}
                      </div>
                    </div>
                    <div className={`ingest-status-badge ${statusClass}`}>
                      {statusLabel}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Flyout Portal — renders at body level, floats LEFT of panel ── */}
      {/* key={hoveredData.label} forces full unmount/remount when switching ingests,
          which properly tears down the old Janus WebRTC connection */}
      {hoveredData && flyoutPos && createPortal(
        <FlyoutCard
          key={hoveredData.label}
          ingest={hoveredData}
          pos={flyoutPos}
          onMouseEnter={() => {
            // Cancel BOTH close timers — user is interacting with the flyout
            handleHover(hoveredData.label);
            keepPanelOpen();
          }}
          onMouseLeave={() => {
            handleLeave();
            schedulePanelClose();
          }}
        />,
        document.body
      )}
    </>
  );
}


/** Flyout card that appears to the left of the panel */
function FlyoutCard({ ingest, pos, onMouseEnter, onMouseLeave }) {
  const ref = useRef(null);
  const [adjustedTop, setAdjustedTop] = useState(pos.top);

  // Adjust vertical position so flyout doesn't overflow viewport
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const vH = window.innerHeight;
    let newTop = pos.top;

    // If it extends below viewport, push it up
    if (newTop + rect.height / 2 > vH - 20) {
      newTop = vH - rect.height / 2 - 20;
    }
    // If it extends above viewport, push it down
    if (newTop - rect.height / 2 < 20) {
      newTop = rect.height / 2 + 20;
    }
    setAdjustedTop(newTop);
  }, [pos.top]);

  const statusClass = getStatusClass(ingest);
  const statusLabel = getStatusLabel(ingest);

  return (
    <div
      ref={ref}
      className="ingest-flyout"
      style={{
        top: adjustedTop,
        right: pos.right,
        transform: 'translateY(-50%)',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="ingest-flyout-arrow" />
      <div className="ingest-flyout-header">
        <div className={`ingest-status-dot ${statusClass}`} />
        <span className="ingest-flyout-title">{ingest.label}</span>
        <span className={`ingest-status-badge ${statusClass}`}>{statusLabel}</span>
      </div>

      {/* ── Live Preview (mini player) ── */}
      {getJanusWsUrl(ingest) && (
        <LivePreview wsUrl={getJanusWsUrl(ingest)} size="small" />
      )}

      <IngestDetail ingest={ingest} />
    </div>
  );
}


/* ── Helper: extract relay_status from servo data ── */
function getRelay(ingest) {
  if (!ingest.servo) return null;
  const status = ingest.servo.status;
  if (Array.isArray(status) && status.length > 0) {
    return status[0].relay_status || null;
  }
  return null;
}

function getSourceStreamUrl(ingest) {
  const eps = ingest.servo?.end_points;
  if (Array.isArray(eps) && eps.length > 0) return eps[0].source_stream_url || null;
  return null;
}

function getRelayStatus(ingest) {
  const relay = getRelay(ingest);
  return relay?.status || 'UNKNOWN';
}

function getInputBitrate(ingest) {
  const relay = getRelay(ingest);
  return relay?.input_bitrate || 0;
}

function getStatusClass(ingest) {
  const relayStatus = getRelayStatus(ingest);
  const inputBr = getInputBitrate(ingest);
  if (relayStatus === 'RUNNING' && inputBr > 0) return 'live';
  if (relayStatus === 'RUNNING') return 'running';
  if (relayStatus === 'PENDING_CONFIGURATION') return 'pending';
  if (relayStatus === 'STOPPED') return 'idle';
  return 'unknown';
}

function getStatusLabel(ingest) {
  const relayStatus = getRelayStatus(ingest);
  const inputBr = getInputBitrate(ingest);
  if (relayStatus === 'RUNNING' && inputBr > 0) return '● LIVE';
  if (relayStatus === 'RUNNING') return '⚠ Bitrate Zero';
  if (relayStatus === 'PENDING_CONFIGURATION') return '◌ Pending';
  if (relayStatus === 'STOPPED') return '○ Stopped';
  return '? N/A';
}

/** Build summary text for an ingest */
function getIngestSummary(ingest) {
  const parts = [];
  const relay = getRelay(ingest);

  if (relay) {
    if (relay.input_bitrate > 0) parts.push(`In: ${fmtBitrate(relay.input_bitrate)}`);
    if (relay.output_bitrate > 0) parts.push(`Out: ${fmtBitrate(relay.output_bitrate)}`);
  }

  if (ingest.servo) {
    const media = ingest.servo.media_info;
    if (Array.isArray(media) && media.length > 0) {
      const tracks = media[0].tracks;
      if (Array.isArray(tracks) && tracks.length > 0) {
        const codecs = tracks.map(t => t.codec).filter(Boolean);
        if (codecs.length > 0) parts.push(codecs.join('+'));
      }
    }
    if (ingest.servo.elic_name && parts.length === 0) parts.push(ingest.servo.elic_name);
  }

  if (ingest.epub) {
    if (ingest.epub.account_domain) parts.push(`Acct: ${ingest.epub.account_domain}`);
  }

  return parts.join(' · ') || ingest.servo?.elic_name || 'No data';
}


/** Detailed view for an ingest (shown in flyout) */
function IngestDetail({ ingest }) {
  const servo = ingest.servo;
  const epub = ingest.epub;
  const relay = getRelay(ingest);

  return (
    <div className="ingest-detail-grid">
      {relay && (
        <DetailSection title="Live Status">
          <div className="kv-list compact">
            <KV label="Status" value={relay.status} highlight />
            <KV label="Input Bitrate" value={fmtBitrate(relay.input_bitrate)} />
            <KV label="Output Bitrate" value={fmtBitrate(relay.output_bitrate)} />
            {relay.elic_name && <KV label="ELIC" value={relay.elic_name} />}
          </div>
        </DetailSection>
      )}

      {servo && Array.isArray(servo.media_info) && servo.media_info.length > 0 && (
        <DetailSection title="Media Info">
          <div className="kv-list compact">
            {getSourceStreamUrl(ingest) && (
              <KV label="Endpoint" value={truncate(getSourceStreamUrl(ingest), 55)} mono />
            )}
            {servo.media_info[0].pcr_pid !== undefined && (
              <KV label="PCR PID" value={servo.media_info[0].pcr_pid} />
            )}
            {Array.isArray(servo.media_info[0].tracks) && servo.media_info[0].tracks.map((track, i) => (
              <TrackRow key={i} index={i + 1} track={track} />
            ))}
          </div>
        </DetailSection>
      )}

      {epub && (
        <DetailSection title="Configuration (ePub)">
          <div className="kv-list compact">
            {epub.ingest_type && <KV label="Type" value={epub.ingest_type} />}
            {epub.account_domain && <KV label="Account" value={epub.account_domain} />}
            {epub.protocol && <KV label="Protocol" value={epub.protocol} />}
            {epub.input_resolution && <KV label="Resolution" value={epub.input_resolution} />}
            {epub.input_codec && <KV label="Codec" value={epub.input_codec} />}
          </div>
        </DetailSection>
      )}

      {!servo && !epub && (
        <div className="placeholder-text" style={{ height: 40 }}>
          No detailed data available
        </div>
      )}
    </div>
  );
}

function DetailSection({ title, children }) {
  return (
    <div className="ingest-detail-section">
      <div className="ingest-detail-title">{title}</div>
      {children}
    </div>
  );
}

function KV({ label, value, highlight, mono }) {
  const displayVal = value === null || value === undefined ? '—' : String(value);
  return (
    <div className="kv-row compact">
      <span className="kv-key">{label}</span>
      <span
        className={`kv-value${highlight ? ' highlight' : ''}${mono ? ' mono' : ''}`}
        title={displayVal}
      >
        {displayVal}
      </span>
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
    <div className="kv-row compact">
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

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.substring(0, n - 1) + '…' : s;
}
