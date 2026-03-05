import React from 'react';
import { Card, CardHeader, CardBody } from './Card';
import { StatGrid, StatItem, Placeholder, KvRow, KvList, SectionTitle } from './DataDisplay';

export default function LiveEventsCard({ data }) {
  if (!data) return null;

  const count = data.liveEventsCount;
  const apex = data.apex;
  const hasCount = count?.ok && count.data;
  const hasApex = apex?.ok && apex.data;

  const total = hasCount ? count.data.total || 0 : 0;
  const published = hasCount ? count.data.published || 0 : 0;
  const modified = hasCount ? count.data.modified || 0 : 0;
  const newCount = hasCount ? count.data.new || 0 : 0;

  const apexData = hasApex ? (apex.data.apex || apex.data) : {};
  const isListenerActive = apexData.listener === true;
  const apexState = apexData.state || '--';
  const lastSync = apexData.last_sync_completed_at || '--';

  const badgeText = hasCount ? `${total} EVENTS` : 'NO DATA';
  const badgeClass = hasCount ? 'info' : '';

  return (
    <Card id="live-events">
      <CardHeader icon="📡" title="Live Events & Apex" badge={badgeText} badgeClass={badgeClass} />
      <CardBody>
        {!hasCount && !hasApex ? (
          <Placeholder text="No live events data" />
        ) : (
          <>
            {hasCount && (
              <StatGrid>
                <StatItem value={total} label="Total" className="info" />
                <StatItem value={published} label="Published" className="success" />
                <StatItem value={modified} label="Modified" className={modified > 0 ? 'warning' : ''} />
                <StatItem value={newCount} label="New" className={newCount > 0 ? 'info' : ''} />
              </StatGrid>
            )}

            {hasApex && (
              <div style={{ marginTop: 16 }}>
                <SectionTitle>Apex (CP Live) Status</SectionTitle>
                <KvList>
                  <KvRow
                    label="Listener"
                    value={isListenerActive ? 'Active' : 'Inactive'}
                    className={isListenerActive ? 'success' : 'danger'}
                  />
                  <KvRow label="State" value={apexState} className={apexState === 'running' ? 'success' : ''} />
                  <KvRow label="Last Sync" value={lastSync} />
                </KvList>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
