import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getPlayerStatus, startPlayer, stopPlayer } from '../utils/api';

/**
 * PlayerControls – Start/Stop buttons with live status for each headend.
 *
 * Props:
 *   feedCode   – e.g. "amghls"
 *   headends   – array of headend objects from now_playing API [{ id, code, state, ... }]
 *   onStatusChange – optional callback after a start/stop action completes
 */
export default function PlayerControls({ feedCode, headends, onStatusChange }) {
  if (!feedCode || !headends || headends.length === 0) return null;

  return (
    <div className="player-controls">
      {headends.map((h) => (
        <HeadendControl
          key={h.id || h.code}
          feedCode={feedCode}
          headend={h}
          onStatusChange={onStatusChange}
        />
      ))}
    </div>
  );
}

/**
 * Extract the orchestrator player ID from a headend code.
 * CloudPort now_playing returns codes like "amghls_001", "timeint_001"
 * but the orchestrator expects just the suffix: "001", "002".
 *
 * Pattern: {feedCode}_{playerId}  →  playerId
 * Fallback: use the full code if no underscore prefix matches.
 */
function getOrcPlayerId(headendCode, feedCode) {
  if (!headendCode) return null;
  // Try stripping the feed code prefix: "amghls_001" → "001"
  const prefix = feedCode + '_';
  if (headendCode.startsWith(prefix)) {
    return headendCode.substring(prefix.length);
  }
  // Try extracting the last segment after underscore: "foo_bar_001" → "001"
  const lastUnderscore = headendCode.lastIndexOf('_');
  if (lastUnderscore >= 0) {
    return headendCode.substring(lastUnderscore + 1);
  }
  return headendCode;
}

function HeadendControl({ feedCode, headend, onStatusChange }) {
  const hCode = headend.code || `headend_${headend.id}`;
  const orcPlayerId = getOrcPlayerId(hCode, feedCode);
  // now_playing often returns state: null, so default to 'loading'
  const [status, setStatus] = useState(headend.state || 'loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Fetch fresh status from orchestrator
  const refreshStatus = useCallback(async () => {
    if (!orcPlayerId) {
      setStatus('unknown');
      return;
    }
    try {
      const res = await getPlayerStatus(feedCode, orcPlayerId);
      if (!mountedRef.current) return;
      if (res.ok && res.data) {
        // Orchestrator returns { status: "running" | "stopped" | "starting" | "stopping" }
        const newState = res.data.status || res.data.state || null;
        setStatus(newState || 'unknown');
      } else {
        // API call failed — show the error but keep current status
        console.warn(`[PlayerControls] Status fetch failed for ${feedCode}/${orcPlayerId}:`, res.error);
        if (status === 'loading') setStatus('unknown');
      }
    } catch (err) {
      console.warn(`[PlayerControls] Status fetch error:`, err);
      if (status === 'loading') setStatus('unknown');
    }
  }, [feedCode, orcPlayerId]);

  // Fetch initial status on mount — orchestrator is the source of truth
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Poll status while busy (action in progress)
  useEffect(() => {
    if (busy) {
      pollRef.current = setInterval(() => {
        refreshStatus().then(() => {
          if (!mountedRef.current) return;
          // Stop polling once status settles
          setBusy((prev) => {
            // Keep busy until the state actually changes from the transitional state
            return prev;
          });
        });
      }, 5000);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [busy, refreshStatus]);

  const handleStart = async () => {
    setBusy(true);
    setError(null);
    const res = await startPlayer(feedCode, orcPlayerId);
    if (!mountedRef.current) return;
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    // Poll for status update — give the player time to boot
    setTimeout(async () => {
      await refreshStatus();
      if (mountedRef.current) {
        setBusy(false);
        onStatusChange?.();
      }
    }, 8000);
  };

  const handleStop = async () => {
    setBusy(true);
    setError(null);
    const res = await stopPlayer(feedCode, orcPlayerId);
    if (!mountedRef.current) return;
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    // Poll for status update
    setTimeout(async () => {
      await refreshStatus();
      if (mountedRef.current) {
        setBusy(false);
        onStatusChange?.();
      }
    }, 8000);
  };

  // Derive display info
  // orchestrator states: running, stopped, starting, stopping
  // now_playing states:  media, live, rescue, slate, idle
  const isPlaying = ['media', 'live', 'rescue', 'slate', 'running'].includes(status);
  const isIdle = ['idle', 'off', 'stopped'].includes(status);
  const isTransitioning = ['starting', 'stopping', 'loading'].includes(status);
  const statusLabel = (() => {
    if (status === 'loading') return 'Fetching…';
    if (!status || status === 'unknown') return 'N/A';
    return status.charAt(0).toUpperCase() + status.slice(1);
  })();
  const statusColor = isPlaying
    ? 'var(--success)'
    : isIdle
      ? 'var(--text-muted)'
      : isTransitioning
        ? 'var(--warning)'
        : 'var(--text-secondary)';

  return (
    <div className="headend-control">
      <span className="hc-name">{hCode}</span>
      <span className="hc-status" style={{ color: statusColor }}>
        <span className={`hc-dot${isPlaying ? ' on' : ''}`} />
        {statusLabel}
      </span>
      <div className="hc-actions">
        <button
          className="hc-btn hc-start"
          onClick={handleStart}
          disabled={busy || isPlaying || isTransitioning}
          title={isPlaying ? 'Player is already running' : isTransitioning ? 'Player is transitioning…' : 'Start player'}
        >
          {(busy || status === 'starting') ? (
            <span className="mini-spinner" />
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
          <span>Start</span>
        </button>
        <button
          className="hc-btn hc-stop"
          onClick={handleStop}
          disabled={busy || isIdle || isTransitioning}
          title={isIdle ? 'Player is already stopped' : isTransitioning ? 'Player is transitioning…' : 'Stop player'}
        >
          {(busy || status === 'stopping') ? (
            <span className="mini-spinner" />
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
          )}
          <span>Stop</span>
        </button>
      </div>
      {error && <span className="hc-error" title={error}>⚠ {error}</span>}
    </div>
  );
}
