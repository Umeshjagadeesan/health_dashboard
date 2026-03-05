import React from 'react';
import { Card, CardHeader, CardBody } from './Card';
import { StatGrid, StatItem, Placeholder, ProgressBar } from './DataDisplay';
import { formatBytes } from '../utils/helpers';

export default function StorageCard({ data }) {
  if (!data) return null;

  const st = data.feedStorage;
  const hasData = st?.ok && st.data;

  if (!hasData) {
    return (
      <Card id="storage">
        <CardHeader icon="💾" title="Storage" badge="NO DATA" />
        <CardBody>
          <Placeholder text="No storage data available for this feed." />
        </CardBody>
      </Card>
    );
  }

  const d = st.data;
  const quota = d.storage_quota || 0;
  const used = d.used_space || 0;
  const sizeByCategory = d.size_by_category || {};
  const countByCategory = d.count_by_category || {};

  const totalUsedBytes = Object.values(sizeByCategory).reduce((a, b) => a + b, 0);
  const pctUsed = quota > 0 ? Math.round((totalUsedBytes / quota) * 100) : 0;

  const badgeClass = pctUsed > 90 ? 'danger' : pctUsed > 70 ? 'warning' : 'success';

  return (
    <Card id="storage">
      <CardHeader icon="💾" title="Storage" badge={`${pctUsed}% USED`} badgeClass={badgeClass} />
      <CardBody>
        <StatGrid>
          <StatItem value={formatBytes(quota)} label="Quota" className="info" />
          <StatItem value={formatBytes(totalUsedBytes)} label="Used" className={badgeClass === 'success' ? '' : badgeClass} />
        </StatGrid>

        <div style={{ marginTop: 14 }}>
          <ProgressBar percent={pctUsed} colorClass={badgeClass} />
        </div>

        <div className="card-section-title" style={{ marginTop: 18 }}>By Category</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Files</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(sizeByCategory).map(cat => (
              <tr key={cat}>
                <td style={{ textTransform: 'capitalize' }}>{cat}</td>
                <td>{countByCategory[cat] || 0}</td>
                <td>{formatBytes(sizeByCategory[cat])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}
