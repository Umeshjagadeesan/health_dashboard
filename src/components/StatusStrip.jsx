import React from 'react';

function StripCard({ icon, label, value, statusDot, cardClass }) {
  return (
    <div className={`strip-card${cardClass ? ' ' + cardClass : ''}`}>
      <div className="strip-icon">{icon}</div>
      <div className="strip-info">
        <div className="strip-label">{label}</div>
        <div className="strip-value" title={typeof value === 'string' ? value : ''}>{value || '--'}</div>
      </div>
      {statusDot !== undefined && (
        <div className={`strip-status ${statusDot}`}></div>
      )}
    </div>
  );
}

export default function StatusStrip({ data }) {
  if (!data) {
    return (
      <section className="status-strip">
        <StripCard icon="🖥️" label="System" value="--" />
        <StripCard icon="🚀" label="Automation" value="--" />
        <StripCard icon="👤" label="Customer" value="--" />
        <StripCard icon="📡" label="CP Live" value="--" />
        <StripCard icon="🔗" label="Blip Endpoint" value="--" />
      </section>
    );
  }

  // ── System (/status → "ok") ──
  let sysVal = 'Unreachable', sysDot = 'down', sysCard = 'error';
  if (data.status?.ok) {
    const d = data.status.data;
    const isUp = typeof d === 'string'
      ? d.toLowerCase().includes('ok')
      : (d?.status === 'ok' || d?.healthy === true);
    sysVal = isUp ? 'Healthy' : 'Degraded';
    sysDot = isUp ? 'up' : 'down';
    sysCard = isUp ? 'healthy' : 'error';
  }

  // ── Version data (/api/v2/status/version) ──
  const ver = data.version?.ok ? data.version.data : null;
  const dv = ver?.deployed_versions || {};

  // Automation Version
  const autoVer = dv.automation || '--';
  const autoCard = autoVer !== '--' ? 'info' : '';

  // Customer
  const customer = ver?.customer || '--';

  // CP Live Version
  const liveVer = dv.live || '--';
  const liveCard = liveVer !== '--' ? 'info' : '';

  // Blip Endpoint
  let blip = ver?.blip_endpoint || '--';
  if (blip.length > 35) blip = blip.substring(0, 32) + '…';

  return (
    <section className="status-strip">
      <StripCard icon="🖥️" label="System" value={sysVal} statusDot={sysDot} cardClass={sysCard} />
      <StripCard icon="🚀" label="Automation" value={autoVer} cardClass={autoCard} />
      <StripCard icon="👤" label="Customer" value={customer} />
      <StripCard icon="📡" label="CP Live" value={liveVer} cardClass={liveCard} />
      <StripCard icon="🔗" label="Blip Endpoint" value={blip} />
    </section>
  );
}
