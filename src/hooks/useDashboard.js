import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchGlobalData,
  fetchFeedData,
  fetchFeedSummary,
  fetchIngestData,
  buildFeedIdMap,
  buildAccountIngestMap,
  buildServoIngestMap,
  buildEpubIngestMap,
  getBlipAuthStatus,
} from '../utils/api';

const PREFETCH_CONCURRENCY = 6; // max parallel feed prefetches
const PREFETCH_DELAY_MS = 2000; // wait before starting background prefetch

export function useDashboard() {
  const [globalData, setGlobalData] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [channelData, setChannelData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [channelLoading, setChannelLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshInterval, setRefreshInterval] = useState(
    parseInt(localStorage.getItem('cp_refreshInterval') || '30', 10)
  );
  // Prefetch progress: { done, total, complete }
  const [prefetchStatus, setPrefetchStatus] = useState({
    done: 0,
    total: 0,
    complete: true,
  });

  // ── Ingest data state ──────────────────────────────────────────────
  const [ingestData, setIngestData] = useState(null);
  // Processed maps for quick lookup
  const accountIngestMapRef = useRef({});  // accountName → [ingest_label]
  const servoIngestMapRef = useRef({});    // ingest_label → servo value
  const epubIngestMapRef = useRef({});     // ingest_label → epub value

  const timerRef = useRef(null);
  const selectedChannelRef = useRef(null);
  const selectedAccountRef = useRef(null);

  // ── Feed data cache ─────────────────────────────────────────────────
  const feedCacheRef = useRef({});
  const prefetchAbortRef = useRef(false);

  // ── Feed code → numeric ID map (built from /v1/api/monitor) ────────
  const feedIdMapRef = useRef({});

  // Keep refs in sync so timer/background callbacks see latest values
  useEffect(() => {
    selectedChannelRef.current = selectedChannel;
  }, [selectedChannel]);
  useEffect(() => {
    selectedAccountRef.current = selectedAccount;
  }, [selectedAccount]);

  // Persist refresh interval
  useEffect(() => {
    localStorage.setItem('cp_refreshInterval', String(refreshInterval));
  }, [refreshInterval]);

  // ── Extract accounts from devices.json ──
  const extractAccounts = useCallback((devicesData) => {
    if (!devicesData?.ok || !Array.isArray(devicesData.data)) return [];
    const map = new Map();
    devicesData.data.forEach((d) => {
      const name = d.FeedName || d.Channel || 'Unknown';
      if (!map.has(name)) {
        map.set(name, { name, channels: new Set(), devices: [] });
      }
      if (d.Channel) map.get(name).channels.add(d.Channel);
      map.get(name).devices.push(d);
    });
    return Array.from(map.values())
      .map((a) => ({
        ...a,
        channels: Array.from(a.channels).sort(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  // ── Helper: resolve numeric ID for a feed code ─────────────────────
  const getNumericId = useCallback((feedCode) => {
    return feedIdMapRef.current[feedCode] || null;
  }, []);

  // ── Background prefetch all feeds (LIGHTWEIGHT summaries) ──────────
  const prefetchAllFeeds = useCallback(async (channels) => {
    if (!channels || channels.length === 0) return;

    prefetchAbortRef.current = false;
    const total = channels.length;
    let done = 0;
    setPrefetchStatus({ done: 0, total, complete: false });

    // Work queue with concurrency limit — fetch SUMMARIES (2-3 endpoints)
    // instead of full data (11 endpoints) → 4× faster
    const queue = [...channels];
    const workers = Array(Math.min(PREFETCH_CONCURRENCY, queue.length))
      .fill(null)
      .map(async () => {
        while (queue.length > 0) {
          if (prefetchAbortRef.current) return;
          const ch = queue.shift();
          try {
            // Skip if already have full data cached
            if (feedCacheRef.current[ch]?.data?._meta && !feedCacheRef.current[ch].data._meta._summary) {
              done++;
              setPrefetchStatus((prev) => ({ ...prev, done }));
              continue;
            }
            const numId = feedIdMapRef.current[ch] || null;
            const data = await fetchFeedSummary(ch, numId);
            // Only store if no full data exists yet
            if (!feedCacheRef.current[ch] || feedCacheRef.current[ch].data?._meta?._summary) {
              feedCacheRef.current[ch] = { data, timestamp: Date.now() };
            }
          } catch {
            // Ignore – feed just won't be cached
          }
          done++;
          setPrefetchStatus((prev) => ({ ...prev, done }));
        }
      });

    await Promise.all(workers);
    setPrefetchStatus((prev) => ({ ...prev, complete: true }));
  }, []);

  // ── Fetch ingest data (Servo + ePub) ──────────────────────────────
  const refreshIngests = useCallback(async () => {
    try {
      const data = await fetchIngestData();
      setIngestData(data);

      // Build lookup maps
      accountIngestMapRef.current = buildAccountIngestMap(data.templates);
      servoIngestMapRef.current = buildServoIngestMap(data.servo);
      epubIngestMapRef.current = buildEpubIngestMap(data.epub);
    } catch (err) {
      console.error('Failed to fetch ingest data:', err);
    }
  }, []);

  // ── Fetch global data ──
  const refreshGlobal = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchGlobalData();
      setGlobalData(data);
      const anyOk = Object.values(data).some((r) => r?.ok);
      setConnected(anyOk);
      setLastRefresh(new Date());

      // Build the feedCode → numericId map from monitor data
      const idMap = buildFeedIdMap(data.monitor);
      feedIdMapRef.current = idMap;

      const accts = extractAccounts(data.devices);
      setAccounts(accts);
      return accts;
    } catch {
      setConnected(false);
      return [];
    } finally {
      setLoading(false);
    }
  }, [extractAccounts]);

  // ── Fetch channel-specific data (on-demand with cache awareness) ───
  const loadChannel = useCallback(async (feedCode) => {
    // Serve from FULL cache immediately if available (not summary)
    const cached = feedCacheRef.current[feedCode];
    const hasFullData = cached && !cached.data?._meta?._summary;
    if (hasFullData) {
      setChannelData(cached.data);
      setChannelLoading(false);
    } else {
      setChannelLoading(true);
    }

    // Always fetch FULL data for detail view
    try {
      const numId = feedIdMapRef.current[feedCode] || null;
      const data = await fetchFeedData(feedCode, numId);
      feedCacheRef.current[feedCode] = { data, timestamp: Date.now() };
      // Only update if user is still viewing this channel
      if (selectedChannelRef.current === feedCode) {
        setChannelData(data);
      }
    } catch {
      if (!hasFullData && selectedChannelRef.current === feedCode) {
        setChannelData(null);
      }
    } finally {
      if (selectedChannelRef.current === feedCode) {
        setChannelLoading(false);
      }
    }
  }, []);

  // ── Navigate to account ──
  const openAccount = useCallback(
    (account) => {
      setSelectedAccount(account);
      if (account.channels.length > 0) {
        const firstCh = account.channels[0];
        setSelectedChannel(firstCh);

        // Show summary data instantly while full data loads
        const cached = feedCacheRef.current[firstCh];
        const hasFullData = cached && !cached.data?._meta?._summary;
        if (hasFullData) {
          setChannelData(cached.data);
          setChannelLoading(false);
        } else if (cached) {
          // Show summary as partial data (better than blank)
          setChannelData(cached.data);
          setChannelLoading(true);  // still loading full
        } else {
          setChannelData(null);
          setChannelLoading(true);
        }

        // Always fetch full data
        loadChannel(firstCh);
      } else {
        setSelectedChannel(null);
        setChannelData(null);
      }
    },
    [loadChannel]
  );

  // ── Switch channel within account ──
  const selectChannel = useCallback(
    (feedCode) => {
      setSelectedChannel(feedCode);

      // Show cached data instantly (full > summary > nothing)
      const cached = feedCacheRef.current[feedCode];
      const hasFullData = cached && !cached.data?._meta?._summary;
      if (hasFullData) {
        setChannelData(cached.data);
        setChannelLoading(false);
      } else if (cached) {
        setChannelData(cached.data);
        setChannelLoading(true);
      } else {
        setChannelData(null);
        setChannelLoading(true);
      }

      // Fetch full data
      loadChannel(feedCode);
    },
    [loadChannel]
  );

  // ── Go back to home ──
  const goHome = useCallback(() => {
    setSelectedAccount(null);
    setSelectedChannel(null);
    setChannelData(null);
  }, []);

  // ── Get ingests for a specific account ──
  const getIngestsForAccount = useCallback((accountName) => {
    const nameKey = (accountName || '').toLowerCase();
    const map = accountIngestMapRef.current;
    const servoMap = servoIngestMapRef.current;
    const epubMap = epubIngestMapRef.current;

    // Strategy 1: from ePub templates mapping
    let labels = map[nameKey];
    if (!labels) {
      for (const [key, val] of Object.entries(map)) {
        if (key.includes(nameKey) || nameKey.includes(key)) {
          labels = val;
          break;
        }
      }
    }

    // Strategy 2: match servo ingests by ingest_label containing account name
    // or by elic_name / account reference
    if (!labels || labels.length === 0) {
      const matchedLabels = new Set();
      for (const [label, servo] of Object.entries(servoMap)) {
        const labelLower = label.toLowerCase();
        // Match if the ingest label contains the account name or vice versa
        if (
          labelLower.includes(nameKey) ||
          nameKey.includes(labelLower.replace(/[_\s-]/g, ''))
        ) {
          matchedLabels.add(label);
        }
        // Also match by elic_name
        if (servo.elic_name && servo.elic_name.toLowerCase().includes(nameKey)) {
          matchedLabels.add(label);
        }
      }
      // Also check epub map
      for (const [label, epub] of Object.entries(epubMap)) {
        const labelLower = label.toLowerCase();
        if (labelLower.includes(nameKey) || nameKey.includes(labelLower.replace(/[_\s-]/g, ''))) {
          matchedLabels.add(label);
        }
        if (epub.account_domain && epub.account_domain.toLowerCase().includes(nameKey)) {
          matchedLabels.add(label);
        }
      }
      if (matchedLabels.size > 0) {
        labels = Array.from(matchedLabels);
      }
    }

    if (!labels || labels.length === 0) return [];

    // Build combined ingest info (servo + epub)
    return labels.map((label) => {
      const servo = servoMap[label] || null;
      const epub = epubMap[label] || null;
      return { label, servo, epub };
    });
  }, []);

  // ── Get all ingests (for the global panel) ──
  const getAllIngests = useCallback(() => {
    const servoMap = servoIngestMapRef.current;
    const epubMap = epubIngestMapRef.current;

    // Merge labels from both sources
    const allLabels = new Set([
      ...Object.keys(servoMap),
      ...Object.keys(epubMap),
    ]);

    return Array.from(allLabels)
      .sort()
      .map((label) => ({
        label,
        servo: servoMap[label] || null,
        epub: epubMap[label] || null,
      }));
  }, []);

  // ── Manual refresh (global + ingests + active channel + deferred prefetch) ──
  const refresh = useCallback(async () => {
    const accts = await refreshGlobal();
    // Fetch ingests in parallel
    refreshIngests();

    // Refresh active channel immediately if one is selected
    if (selectedChannelRef.current) {
      loadChannel(selectedChannelRef.current);
    }

    // Re-prefetch summaries in background (deferred, non-blocking)
    const allChannels = accts.flatMap((a) => a.channels);
    setTimeout(() => prefetchAllFeeds(allChannels), 500);
  }, [refreshGlobal, refreshIngests, loadChannel, prefetchAllFeeds]);

  // ── Auto-refresh timer ──
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (refreshInterval > 0) {
      timerRef.current = setInterval(() => {
        refresh();
      }, refreshInterval * 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh, refreshInterval]);

  // ── Initial fetch ──
  // 1) Fetch global data + ingests immediately (fast — ~6 parallel requests)
  // 2) Delay background prefetch so the page becomes interactive first
  useEffect(() => {
    (async () => {
      const accts = await refreshGlobal();
      // Fetch ingests in parallel (separate from global, ~3 requests)
      refreshIngests();

      // Delay the lightweight prefetch so the page renders first
      const allChannels = accts.flatMap((a) => a.channels);
      if (allChannels.length > 0) {
        setTimeout(() => {
          prefetchAllFeeds(allChannels);
        }, PREFETCH_DELAY_MS);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helper: check if a channel has cached data ──
  // Returns: 'full' | 'summary' | false
  const isFeedCached = useCallback((feedCode) => {
    const cached = feedCacheRef.current[feedCode];
    if (!cached) return false;
    return cached.data?._meta?._summary ? 'summary' : 'full';
  }, []);

  // ── Blip auth status (from proxy) ──
  const [blipAuthStatus, setBlipAuthStatus] = useState({ hasSession: false });

  // Check blip auth status on load and every 5 minutes (no need to poll fast)
  useEffect(() => {
    const checkStatus = async () => {
      const status = await getBlipAuthStatus();
      setBlipAuthStatus(status);
    };
    checkStatus();
    const interval = setInterval(checkStatus, 300_000); // 5 min
    return () => clearInterval(interval);
  }, []);

  return {
    globalData,
    accounts,
    selectedAccount,
    selectedChannel,
    channelData,
    loading,
    channelLoading,
    connected,
    lastRefresh,
    refreshInterval,
    setRefreshInterval,
    prefetchStatus,
    isFeedCached,
    getNumericId,
    ingestData,
    getIngestsForAccount,
    getAllIngests,
    blipAuthStatus,
    refresh,
    openAccount,
    selectChannel,
    goHome,
  };
}
