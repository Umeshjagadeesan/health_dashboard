import React from 'react';
import { Card, CardHeader, CardBody } from './Card';
import { StatGrid, StatItem, Placeholder } from './DataDisplay';

export default function MediaLibraryCard({ data }) {
  if (!data) return null;

  const mc = data.mediaCount;
  const hasData = mc?.ok && mc.data?.states;
  const states = hasData ? mc.data.states : [];
  const pendingCount = mc?.data?.pending_media_count || 0;

  const getCount = (state) => {
    const found = states.find(s => s.state === state);
    return found ? found.count : 0;
  };

  const total = getCount('all');
  const uploaded = getCount('uploaded');
  const transcoding = getCount('transcoding');
  const processing = getCount('processing');
  const failed = getCount('failed');
  const qcFailed = getCount('qc_failed');
  const invalid = getCount('invalid');

  const badgeText = hasData ? `${total} TOTAL` : 'NO DATA';
  const badgeClass = hasData ? (failed > 0 || invalid > 0 ? 'warning' : 'success') : '';

  return (
    <Card id="media-library">
      <CardHeader icon="🎬" title="Media Library" badge={badgeText} badgeClass={badgeClass} />
      <CardBody>
        {!hasData ? (
          <Placeholder text="No media data available for this feed." />
        ) : (
          <>
            <StatGrid>
              <StatItem value={total} label="Total" className="info" />
              <StatItem value={uploaded} label="Uploaded" className="success" />
              <StatItem value={transcoding + processing} label="Processing" className={transcoding + processing > 0 ? 'warning' : ''} />
              <StatItem value={failed + qcFailed + invalid} label="Failed" className={failed + qcFailed + invalid > 0 ? 'danger' : 'success'} />
            </StatGrid>

            {pendingCount > 0 && (
              <div className="kv-row" style={{ marginTop: 12 }}>
                <span className="kv-key">Pending Downloads</span>
                <span className="kv-value warning">{pendingCount}</span>
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>State</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {states.filter(s => s.state !== 'all').map(s => (
                    <tr key={s.state}>
                      <td style={{ textTransform: 'capitalize' }}>{s.state}</td>
                      <td style={{
                        color: s.count > 0
                          ? (s.state === 'failed' || s.state === 'invalid' || s.state === 'qc_failed' ? 'var(--danger)' :
                             s.state === 'uploaded' ? 'var(--success)' :
                             s.state === 'transcoding' || s.state === 'processing' ? 'var(--warning)' : 'var(--text-primary)')
                          : 'var(--text-muted)'
                      }}>
                        {s.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
