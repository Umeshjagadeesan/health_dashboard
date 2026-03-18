import React from 'react';
import { Card, CardHeader, CardBody } from './Card';
import { Placeholder, CardLoading } from './DataDisplay';
import { parsePrometheusForFeed } from '../utils/helpers';

export default function PlaylistHealthCard({ data, feedCode, isLoading }) {
  if (!data) return null;

  const ps = data.playlistStatus;
  const notFetched = !ps;

  // Detect error responses like {"error": "Feed not found"}
  if (ps?.ok && ps.data?.error) {
    return (
      <Card id="playlist-health">
        <CardHeader icon="📋" title="Playlist Status" badge="N/A" badgeClass="" />
        <CardBody>
          <Placeholder text={`Playlist not available: ${ps.data.error}`} />
        </CardBody>
      </Card>
    );
  }

  const hasData = ps?.ok && typeof ps.data === 'object';

  // Parse playlist availability from prometheus metrics
  // Source: /v1/api/metrics/asset (global Prometheus endpoint, fetched via blip session)
  // This metric is only exported for feeds that have playlist monitoring enabled,
  // so it shows for some feeds but not others — that's expected.
  const metricsText = data.metricsAsset?.ok ? data.metricsAsset.data : null;
  const plAvail = feedCode && typeof metricsText === 'string'
    ? parsePrometheusForFeed(metricsText, feedCode).filter(m => m.name === 'playlist_available')
    : [];

  const totalPublished = hasData
    ? Object.values(ps.data).filter(d => d.state === 'published').length
    : 0;
  const totalDays = hasData ? Object.keys(ps.data).length : 0;
  const hasWarnings = hasData && Object.values(ps.data).some(d => d.warnings);
  const hasErrors = hasData && Object.values(ps.data).some(d => d.errors);

  let badgeText = (notFetched && isLoading) ? '' : 'NO DATA';
  let badgeClass = '';
  if (hasData) {
    if (hasErrors) { badgeText = 'ERRORS'; badgeClass = 'danger'; }
    else if (hasWarnings) { badgeText = 'WARNINGS'; badgeClass = 'warning'; }
    else { badgeText = `${totalPublished}/${totalDays} PUBLISHED`; badgeClass = 'success'; }
  }

  return (
    <Card id="playlist-health">
      <CardHeader icon="📋" title="Playlist Status" badge={badgeText} badgeClass={badgeClass} />
      <CardBody>
        {notFetched && isLoading ? (
          <CardLoading />
        ) : !hasData ? (
          <Placeholder text="No playlist data available" />
        ) : (
          <>
            <div className="playlist-calendar">
              {Object.entries(ps.data).sort(([a], [b]) => a.localeCompare(b)).map(([date, info]) => {
                const isToday = date === new Date().toISOString().split('T')[0];
                const stateClass = info.state === 'published' ? 'success' : info.state === 'draft' ? 'warning' : 'info';
                return (
                  <div key={date} className={`pl-day ${stateClass}${isToday ? ' today' : ''}`}>
                    <div className="pl-day-date">{formatShortDate(date)}</div>
                    <div className="pl-day-state">{info.state || '--'}</div>
                    <div className="pl-day-version">{info.version || ''}</div>
                    {info.warnings && <span className="pl-day-flag warn">⚠</span>}
                    {info.errors && <span className="pl-day-flag err">✕</span>}
                  </div>
                );
              })}
            </div>

            {plAvail.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="card-section-title">Playlist Availability (Metrics)</div>
                <div className="kv-list">
                  {plAvail.map((m, i) => (
                    <div key={i} className="kv-row">
                      <span className="kv-key">{m.labels.day}</span>
                      <span className={`kv-value ${m.value >= 1 ? 'success' : 'danger'}`}>
                        {m.value >= 1 ? 'Available' : 'Missing'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function formatShortDate(dateStr) {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
  } catch { return dateStr; }
}
