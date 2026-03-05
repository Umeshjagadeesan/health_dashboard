import React from 'react';
import { Card, CardHeader, CardBody } from './Card';
import { Placeholder, SectionTitle, LogList, LogItem } from './DataDisplay';
import { timeAgo } from '../utils/helpers';

export default function ErrorsActivityCard({ data }) {
  if (!data) return null;

  const errData = data.feedErrors;
  const actData = data.feedActivity;

  const hasErrors = errData?.ok && errData.data;
  const hasActivity = actData?.ok && actData.data;

  const errors = hasErrors ? errData.data.errors || [] : [];
  const feedName = hasErrors ? errData.data.feed_name : '';
  const actLog = hasActivity ? (actData.data.log || []) : [];

  const badgeText = errors.length > 0 ? `${errors.length} ERRORS` : 'CLEAN';
  const badgeClass = errors.length > 0 ? 'danger' : 'success';

  return (
    <Card id="errors-activity" wide>
      <CardHeader
        icon="📝"
        title={`Errors & Activity${feedName ? ` — ${feedName}` : ''}`}
        badge={badgeText}
        badgeClass={badgeClass}
      />
      <CardBody scrollable>
        {!hasErrors && !hasActivity ? (
          <Placeholder text="No errors or activity data available for this feed." />
        ) : (
          <>
            {/* Errors section */}
            <SectionTitle>Errors ({errors.length})</SectionTitle>
            {errors.length === 0 ? (
              <div style={{ padding: '8px 0', color: 'var(--success)', fontSize: 13 }}>
                ✓ No errors reported for this feed
              </div>
            ) : (
              <LogList>
                {errors.slice(0, 20).map((err, i) => (
                  <LogItem
                    key={i}
                    time={timeAgo(err.created_at || err.timestamp)}
                    badgeClass="error"
                    level="ERROR"
                    message={err.message || err.description || JSON.stringify(err)}
                  />
                ))}
              </LogList>
            )}

            {/* Activity Log */}
            {actLog.length > 0 && (
              <>
                <SectionTitle>Recent Activity ({actData.data.total || actLog.length} total)</SectionTitle>
                <LogList>
                  {actLog.slice(0, 15).map((entry) => (
                    <LogItem
                      key={entry.id}
                      time={timeAgo(entry.created_at)}
                      badgeClass={entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warn' : 'info'}
                      level={entry.level || 'info'}
                      message={
                        `[${entry.module}] ${entry.subject}` +
                        (entry.user?.name ? ` — by ${entry.user.name}` : '')
                      }
                    />
                  ))}
                </LogList>
              </>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
