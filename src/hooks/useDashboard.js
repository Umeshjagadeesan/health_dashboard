import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchGlobalData, fetchFeedData, buildFeedIdMap } from '../utils/api';

const PREFETCH_CONCURRENCY = 3; // max parallel feed fetches

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

  // ── Background prefetch all feeds ───────────────────────────────────
  const prefetchAllFeeds = useCallback(async (channels) => {
    if (!channels || channels.length === 0) return;

    prefetchAbortRef.current = false;
    const total = channels.length;
    let done = 0;
    setPrefetchStatus({ done: 0, total, complete: false });

    // Work queue with concurrency limit
    const queue = [...channels];
    const workers = Array(Math.min(PREFETCH_CONCURRENCY, queue.length))
      .fill(null)
      .map(async () => {
        while (queue.length > 0) {
          if (prefetchAbortRef.current) return;
          const ch = queue.shift();
          try {
            const numId = feedIdMapRef.current[ch] || null;
            const data = await fetchFeedData(ch, numId);
            feedCacheRef.current[ch] = { data, timestamp: Date.now() };

            // If user is already viewing this channel, update UI immediately
            if (selectedChannelRef.current === ch) {
              setChannelData(data);
              setChannelLoading(false);
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
    // Serve from cache immediately if available
    const cached = feedCacheRef.current[feedCode];
    if (cached) {
      setChannelData(cached.data);
      setChannelLoading(false);
    } else {
      setChannelLoading(true);
    }

    // Always fetch fresh data in background
    try {
      const numId = feedIdMapRef.current[feedCode] || null;
      const data = await fetchFeedData(feedCode, numId);
      feedCacheRef.current[feedCode] = { data, timestamp: Date.now() };
      // Only update if user is still viewing this channel
      if (selectedChannelRef.current === feedCode) {
        setChannelData(data);
      }
    } catch {
      if (!cached && selectedChannelRef.current === feedCode) {
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

        // Use cached data if available for instant display
        const cached = feedCacheRef.current[firstCh];
        if (cached) {
          setChannelData(cached.data);
          setChannelLoading(false);
        } else {
          setChannelData(null);
          setChannelLoading(true);
        }

        // Always refresh in background
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

      // Use cached data if available for instant display
      const cached = feedCacheRef.current[feedCode];
      if (cached) {
        setChannelData(cached.data);
        setChannelLoading(false);
      } else {
        setChannelData(null);
        setChannelLoading(true);
      }

      // Always refresh in background
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

  // ── Manual refresh (global + re-prefetch all + active channel) ──
  const refresh = useCallback(async () => {
    const accts = await refreshGlobal();
    // Re-prefetch all feeds in background
    const allChannels = accts.flatMap((a) => a.channels);
    prefetchAllFeeds(allChannels);

    // Also refresh active channel immediately if one is selected
    if (selectedChannelRef.current) {
      loadChannel(selectedChannelRef.current);
    }
  }, [refreshGlobal, loadChannel, prefetchAllFeeds]);

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

  // ── Initial fetch + prefetch ──
  useEffect(() => {
    (async () => {
      const accts = await refreshGlobal();
      // Once we know all channels, prefetch them all in background
      const allChannels = accts.flatMap((a) => a.channels);
      prefetchAllFeeds(allChannels);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helper: check if a channel has cached data ──
  const isFeedCached = useCallback((feedCode) => {
    return !!feedCacheRef.current[feedCode];
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
    refresh,
    openAccount,
    selectChannel,
    goHome,
  };
}
