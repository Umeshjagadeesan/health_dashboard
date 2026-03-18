import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardHeader, CardBody } from './Card';
import { StatGrid, StatItem, Placeholder, CardLoading } from './DataDisplay';
import { apiFetch } from '../utils/api';

export default function MediaLibraryCard({ data, isLoading }) {
  if (!data) return null;

  const mc = data.mediaCount;
  const notFetched = !mc;
  const hasData = mc?.ok && mc.data?.states;
  const states = hasData ? mc.data.states : [];
  const pendingCount = mc?.data?.pending_media_count || 0;
  const numericId = data._meta?.numericId || null;

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
  const failedTotal = failed + qcFailed + invalid;

  const badgeText = hasData ? `${total} TOTAL` : (notFetched && isLoading) ? '' : 'NO DATA';
  const badgeClass = hasData ? (failedTotal > 0 ? 'warning' : 'success') : '';

  return (
    <Card id="media-library">
      <CardHeader icon="🎬" title="Media Library" badge={badgeText} badgeClass={badgeClass} />
      <CardBody>
        {notFetched && isLoading ? (
          <CardLoading />
        ) : !hasData ? (
          <Placeholder text="No media data available for this feed." />
        ) : (
          <>
            <StatGrid>
              <StatItem value={total} label="Total" className="info" />
              <StatItem value={uploaded} label="Uploaded" className="success" />
              <StatItem value={transcoding + processing} label="Processing" className={transcoding + processing > 0 ? 'warning' : ''} />
              <FailedStatWithPopup
                failedTotal={failedTotal}
                numericId={numericId}
              />
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


/**
 * Failed stat item — click to open a scrollable popup showing failed assets
 * grouped by category (media, subtitles, graphics, rescue).
 *
 * Uses category + state combined API calls to catch failures across ALL
 * categories. The `total` field from each listing response is used for
 * accurate counts (the /media/count endpoint can be stale/cached).
 */
const CATEGORIES = ['media', 'audio', 'subtitles', 'graphics', 'rescue'];
const FAIL_STATES = ['failed', 'qc_failed', 'invalid'];
const CAT_ICONS = { media: '🎬', audio: '🔊', subtitles: '📝', graphics: '🖼️', rescue: '🛟' };

function FailedStatWithPopup({ failedTotal, numericId }) {
  // { media: [...], subtitles: [...], ... } or null
  const [categoryData, setCategoryData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  // Verified count from listing API (replaces stale /media/count value)
  const [verifiedCount, setVerifiedCount] = useState(null);
  const containerRef = useRef(null);

  /**
   * Fetch ALL pages for a given category+state combo.
   * API uses `limit` and `offset` params (not per_page).
   * Default limit is 20, so we must paginate to get all items.
   */
  const fetchAllPages = useCallback(async (cat, state) => {
    const PAGE_SIZE = 200;
    const items = [];
    let offset = 0;
    let total = 0;

    // First page
    const first = await apiFetch(
      `/v1/api/media?feed_id=${numericId}&category=${cat}&state=${state}&limit=${PAGE_SIZE}&offset=0`
    );
    if (!first.ok || !first.data) return { items: [], total: 0 };

    total = first.data.total || 0;
    if (first.data.media) {
      for (const m of first.data.media) {
        items.push({
          title: m.title || m.filename || 'Unknown',
          state: m.state || '--',
          error: m.error || '',
          category: m.category || cat,
        });
      }
    }

    // Fetch remaining pages if needed
    offset = items.length;
    while (offset < total) {
      const page = await apiFetch(
        `/v1/api/media?feed_id=${numericId}&category=${cat}&state=${state}&limit=${PAGE_SIZE}&offset=${offset}`
      );
      if (!page.ok || !page.data?.media || page.data.media.length === 0) break;
      for (const m of page.data.media) {
        items.push({
          title: m.title || m.filename || 'Unknown',
          state: m.state || '--',
          error: m.error || '',
          category: m.category || cat,
        });
      }
      offset = items.length;
    }

    return { items, total };
  }, [numericId]);

  const fetchFailedAssets = useCallback(async () => {
    if (categoryData !== null || !numericId) return;
    setLoading(true);
    try {
      // 5 categories × 3 states = 15 parallel first-page fetches
      // Each one paginates internally to get ALL items
      const calls = [];
      for (const cat of CATEGORIES) {
        for (const state of FAIL_STATES) {
          calls.push({ cat, promise: fetchAllPages(cat, state) });
        }
      }

      const results = await Promise.allSettled(calls.map(c => c.promise));

      const grouped = {};
      for (const cat of CATEGORIES) grouped[cat] = [];

      let realTotal = 0;

      calls.forEach((call, i) => {
        const result = results[i];
        if (result.status === 'fulfilled') {
          const { items, total } = result.value;
          realTotal += total;
          grouped[call.cat].push(...items);
        }
      });

      setCategoryData(grouped);
      setVerifiedCount(realTotal);
    } catch {
      setCategoryData({});
      setVerifiedCount(0);
    } finally {
      setLoading(false);
    }
  }, [numericId, categoryData, fetchAllPages]);

  // Use verified count (from listing API) if available, otherwise stale count
  const displayCount = verifiedCount !== null ? verifiedCount : failedTotal;
  const isDanger = displayCount > 0;

  const handleClick = useCallback(() => {
    if (failedTotal === 0 && verifiedCount === null) return;
    if (verifiedCount === 0) return;
    setOpen(prev => !prev);
    fetchFailedAssets();
  }, [failedTotal, verifiedCount, fetchFailedAssets]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Total items found across all categories
  const totalFound = categoryData
    ? CATEGORIES.reduce((sum, cat) => sum + (categoryData[cat]?.length || 0), 0)
    : null;

  return (
    <div ref={containerRef} className="stat-item-wrapper">
      <div
        className={`stat-item ${isDanger ? 'danger clickable' : ''}`}
        onClick={handleClick}
      >
        <div className={`stat-value ${isDanger ? 'danger' : 'success'}`}>{displayCount}</div>
        <div className="stat-label">Failed {isDanger ? '⚠' : ''}</div>
      </div>

      {open && (
        <div className="media-fail-tooltip">
          <div className="media-fail-tooltip-header">
            <span>FAILED ASSETS ({totalFound !== null ? totalFound : '…'})</span>
            <button className="media-fail-close" onClick={() => setOpen(false)}>✕</button>
          </div>
          <div className="media-fail-tooltip-body">
            {loading && (
              <div className="media-fail-tooltip-loading">
                <span className="mini-spinner" /> Loading…
              </div>
            )}
            {!loading && categoryData && totalFound === 0 && (
              <div className="media-fail-tooltip-empty">No failed assets currently</div>
            )}
            {!loading && categoryData && totalFound > 0 && (
              <div className="media-fail-tooltip-list">
                {CATEGORIES.map(cat => {
                  const items = categoryData[cat] || [];
                  if (items.length === 0) return null;
                  return (
                    <div key={cat} className="media-fail-category">
                      <div className="media-fail-cat-header">
                        <span>{CAT_ICONS[cat]} {cat.toUpperCase()}</span>
                        <span className="media-fail-cat-count">{items.length}</span>
                      </div>
                      {items.map((asset, i) => (
                        <div key={i} className="media-fail-item">
                          <div className="media-fail-name">
                            <span className={`media-fail-state ${asset.state}`}>{asset.state}</span>
                            <span>{asset.title}</span>
                          </div>
                          {asset.error && <div className="media-fail-reason">{asset.error}</div>}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
