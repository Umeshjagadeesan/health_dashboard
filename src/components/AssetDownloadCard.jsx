import React from 'react';
import { Card, CardHeader, CardBody } from './Card';
import { StatGrid, StatItem, Placeholder, ProgressBar, SectionTitle, CardLoading } from './DataDisplay';
import { formatBytes, timeAgo } from '../utils/helpers';

export default function AssetDownloadCard({ data, isLoading }) {
  if (!data) return null;

  const ds = data.downloadStatus;
  const hasData = ds?.ok && ds.data?.headends;
  const headends = hasData ? ds.data.headends : [];
  const notFetched = !ds;

  let totalAssets = 0, downloaded = 0, pending = 0, downloading = 0;
  headends.forEach(h => {
    totalAssets += h.total_assets || 0;
    downloaded += h.downloaded_count || 0;
    pending += h.to_download || 0;
    downloading += Math.max(0, h.downloading || 0);
  });

  const pct = totalAssets > 0 ? Math.round((downloaded / totalAssets) * 100) : 0;
  const badgeText = hasData ? `${pct}% SYNCED` : (notFetched && isLoading) ? '' : 'NO DATA';
  const badgeClass = hasData ? (pct === 100 ? 'success' : pct > 80 ? 'warning' : 'danger') : '';

  return (
    <Card id="asset-download">
      <CardHeader icon="📥" title="Asset Downloads" badge={badgeText} badgeClass={badgeClass} />
      <CardBody>
        {notFetched && isLoading ? (
          <CardLoading />
        ) : !hasData ? (
          <Placeholder text="No download data available for this feed." />
        ) : (
          <>
            <StatGrid>
              <StatItem value={totalAssets} label="Total Assets" className="info" />
              <StatItem value={downloaded} label="Downloaded" className="success" />
              <StatItem value={pending} label="Pending" className={pending > 0 ? 'warning' : 'success'} />
              <StatItem value={downloading} label="Downloading" className={downloading > 0 ? 'info' : ''} />
            </StatGrid>

            <div style={{ marginTop: 14 }}>
              <ProgressBar percent={pct} colorClass={pct === 100 ? 'success' : pct > 80 ? 'warning' : 'danger'} />
            </div>

            {headends.map(h => (
              <div key={h.id} style={{ marginTop: 16 }}>
                <SectionTitle>{h.code || `Headend ${h.id}`}</SectionTitle>
                <div className="kv-list">
                  <div className="kv-row">
                    <span className="kv-key">Disk Usage</span>
                    <span className="kv-value">{h.usage ? `${h.usage}%` : '--'}</span>
                  </div>
                  <div className="kv-row">
                    <span className="kv-key">Assets</span>
                    <span className="kv-value">{h.downloaded_count}/{h.total_assets}</span>
                  </div>
                  <div className="kv-row">
                    <span className="kv-key">To Download</span>
                    <span className={`kv-value ${h.to_download > 0 ? 'warning' : 'success'}`}>
                      {h.to_download} ({formatBytes(h.to_download_size)})
                    </span>
                  </div>
                  <div className="kv-row">
                    <span className="kv-key">Channels</span>
                    <span className="kv-value">
                      {h.download_channels_status
                        ? Object.entries(h.download_channels_status).map(([k, v]) =>
                            `${k.toUpperCase()}: ${v ? '✓' : '✕'}`
                          ).join(' · ')
                        : '--'}
                    </span>
                  </div>
                  {h.ETA_to_download > 0 && (
                    <div className="kv-row">
                      <span className="kv-key">ETA</span>
                      <span className="kv-value">{h.eta_to_download}s</span>
                    </div>
                  )}
                </div>

                {h.recent_downloads?.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Asset</th>
                          <th>Mode</th>
                          <th>Size</th>
                          <th>Status</th>
                          <th>When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {h.recent_downloads.slice(0, 5).map((dl, i) => (
                          <tr key={i}>
                            <td title={dl.asset_id} style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {dl.asset_id?.substring(0, 30)}
                            </td>
                            <td>{dl.mode?.toUpperCase()}</td>
                            <td>{formatBytes(dl.asset_size)}</td>
                            <td style={{ color: dl.status === 'completed' ? 'var(--success)' : 'var(--warning)' }}>
                              {dl.status}
                            </td>
                            <td>{timeAgo(dl.start_time)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </CardBody>
    </Card>
  );
}
