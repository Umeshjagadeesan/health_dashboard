import React, { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Janus WebRTC live preview player.
 *
 * Supports TWO Janus transports:
 *  1. WebSocket (wss://) — used for ingest previews (T-Rex servers)
 *  2. HTTP REST (https://) — used for playout device previews (Now Playing)
 *
 * The transport is auto-detected from the URL scheme.
 *
 * Props:
 *  - wsUrl:     Janus URL — either wss:// (WebSocket) or https:// (HTTP REST)
 *  - size:      'small' (flyout), 'medium' (card), or 'large' (now-playing panel)
 *  - autoPlay:  if true, connect immediately; otherwise show a play button
 */
export default function LivePreview({ wsUrl, size = 'small', autoPlay = false }) {
  const videoRef = useRef(null);
  const janusRef = useRef(null);   // holds the active connection object
  const [status, setStatus] = useState('idle'); // idle | connecting | playing | error | stopped
  const [errorMsg, setErrorMsg] = useState('');
  const [muted, setMuted] = useState(true);     // start muted (browser autoplay policy)

  // Determine transport type and resolve proxy URL
  const isHttpTransport = wsUrl && /^https?:\/\//.test(wsUrl);

  const resolvedUrl = (() => {
    if (!wsUrl) return null;

    // HTTP REST URLs: use directly (CORS is open on Janus playout devices)
    if (isHttpTransport) return wsUrl;

    // WebSocket URLs: proxy T-Rex through Vite in local dev, others direct
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocal) {
      try {
        const parsed = new URL(wsUrl.replace(/^wss/, 'https'));
        if (parsed.hostname.includes('trex')) {
          return wsUrl.replace(
            /^wss?:\/\/[^/]+/,
            `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/janusproxy`
          );
        }
      } catch { /* fall through to direct */ }
      return wsUrl;
    }
    // Production: connect directly
    return wsUrl;
  })();

  /** Start the Janus WebRTC connection */
  const connect = useCallback(() => {
    if (!resolvedUrl) {
      setStatus('error');
      setErrorMsg('No Janus URL');
      return;
    }

    // Clean up any existing connection
    if (janusRef.current) {
      janusRef.current.destroy();
      janusRef.current = null;
    }

    setStatus('connecting');
    setErrorMsg('');

    const cbs = {
      onPlaying: (stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setStatus('playing');
        }
      },
      onError: (msg) => {
        setStatus('error');
        setErrorMsg(msg);
      },
      onStopped: () => {
        setStatus('stopped');
      },
    };

    // Choose transport based on URL scheme
    const conn = isHttpTransport
      ? createJanusHttpConnection(resolvedUrl, cbs)
      : createJanusWsConnection(resolvedUrl, cbs);

    janusRef.current = conn;
  }, [resolvedUrl, isHttpTransport]);

  /** Stop and clean up */
  const disconnect = useCallback(() => {
    if (janusRef.current) {
      janusRef.current.destroy();
      janusRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus('idle');
    setErrorMsg('');
  }, []);

  // Auto-play if requested; also clean up when wsUrl changes
  useEffect(() => {
    if (autoPlay && resolvedUrl) {
      connect();
    }
    return () => {
      if (janusRef.current) {
        janusRef.current.destroy();
        janusRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [autoPlay, resolvedUrl, connect]);

  // When wsUrl changes (without unmount), reset UI state
  useEffect(() => {
    setStatus('idle');
    setErrorMsg('');
    setMuted(true);
  }, [wsUrl]);

  if (!wsUrl) return null;

  const isPlaying = status === 'playing';
  const isConnecting = status === 'connecting';
  const isIdle = status === 'idle';

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      if (videoRef.current) videoRef.current.muted = next;
      return next;
    });
  }, []);

  return (
    <div className={`live-preview live-preview--${size}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="live-preview__video"
      />

      {/* Overlay: play button, spinner, or error */}
      {!isPlaying && (
        <div className={`live-preview__overlay ${status}`}>
          {isIdle && (
            <button className="live-preview__play-btn" onClick={connect} title="Play live preview">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          )}

          {isConnecting && (
            <div className="live-preview__status">
              <span className="live-preview__spinner" />
              <span>Connecting…</span>
            </div>
          )}

          {status === 'error' && (
            <div className="live-preview__status error">
              <span>⚠ {errorMsg || 'Preview unavailable'}</span>
              <button className="live-preview__retry-btn" onClick={connect}>Retry</button>
            </div>
          )}

          {status === 'stopped' && (
            <div className="live-preview__status">
              <span>Stream not active</span>
              <button className="live-preview__retry-btn" onClick={connect}>Retry</button>
            </div>
          )}
        </div>
      )}

      {/* Playing controls overlay (appears on hover) */}
      {isPlaying && (
        <div className="live-preview__controls">
          <span className="live-preview__live-badge">● LIVE</span>
          <div className="live-preview__right-controls">
            <button
              className={`live-preview__mute-btn${muted ? ' muted' : ''}`}
              onClick={toggleMute}
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              )}
            </button>
            <button className="live-preview__stop-btn" onClick={disconnect} title="Stop preview">
              ■
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════
   Janus WebSocket Connection Manager (for ingest / T-Rex)
   ═══════════════════════════════════════════════════════════════════════ */

function createJanusWsConnection(wsUrl, callbacks) {
  let ws = null;
  let pc = null;
  let sessionId = null;
  let handleId = null;
  let keepAliveTimer = null;
  let destroyed = false;
  let txnCounter = 0;

  const pendingTxns = {};
  const nextTxn = () => { txnCounter++; return `t${txnCounter}-${Date.now()}`; };

  const send = (msg) => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  try {
    ws = new WebSocket(wsUrl, 'janus-protocol');
  } catch (e) {
    callbacks.onError?.('WebSocket failed: ' + e.message);
    return { destroy: () => {} };
  }

  ws.onopen = () => {
    if (destroyed) return;
    const txn = nextTxn();
    pendingTxns[txn] = 'create';
    send({ janus: 'create', transaction: txn });
  };

  ws.onmessage = (event) => {
    if (destroyed) return;
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }

    const txn = msg.transaction;
    const pending = txn ? pendingTxns[txn] : null;

    // Session created
    if (msg.janus === 'success' && pending === 'create' && msg.data?.id) {
      sessionId = msg.data.id;
      delete pendingTxns[txn];
      keepAliveTimer = setInterval(() => {
        send({ janus: 'keepalive', session_id: sessionId, transaction: nextTxn() });
      }, 25000);
      const attachTxn = nextTxn();
      pendingTxns[attachTxn] = 'attach';
      send({ janus: 'attach', session_id: sessionId, plugin: 'janus.plugin.streaming', transaction: attachTxn });
      return;
    }

    // Plugin attached
    if (msg.janus === 'success' && pending === 'attach' && msg.data?.id) {
      handleId = msg.data.id;
      delete pendingTxns[txn];
      const listTxn = nextTxn();
      pendingTxns[listTxn] = 'list';
      send({ janus: 'message', session_id: sessionId, handle_id: handleId, transaction: listTxn, body: { request: 'list' } });
      return;
    }

    // Stream list response
    if ((msg.janus === 'success' || msg.janus === 'event') && pending === 'list') {
      delete pendingTxns[txn];
      const streams = msg.plugindata?.data?.list || [];
      const streamId = streams.length > 0 ? streams[0].id : 1;
      const watchTxn = nextTxn();
      pendingTxns[watchTxn] = 'watch';
      send({ janus: 'message', session_id: sessionId, handle_id: handleId, transaction: watchTxn, body: { request: 'watch', id: streamId } });
      return;
    }

    // SDP Offer (from watch)
    if (msg.jsep && msg.jsep.type === 'offer') {
      if (pending === 'watch') delete pendingTxns[txn];
      handleSdpOffer(msg.jsep);
      return;
    }

    // Event: stream started/stopped
    if (msg.janus === 'event') {
      const result = msg.plugindata?.data?.result;
      if (result?.status === 'stopped') callbacks.onStopped?.();
      const error = msg.plugindata?.data?.error;
      if (error) callbacks.onError?.(error);
      return;
    }

    if (msg.janus === 'error') {
      callbacks.onError?.(msg.error?.reason || 'Unknown Janus error');
      return;
    }

    if (msg.janus === 'hangup') {
      callbacks.onStopped?.();
      return;
    }
  };

  ws.onerror = () => { if (!destroyed) callbacks.onError?.('WebSocket connection failed'); };
  ws.onclose = () => { if (!destroyed) callbacks.onStopped?.(); };

  async function handleSdpOffer(jsep) {
    try {
      pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.ontrack = (event) => {
        if (destroyed) return;
        if (event.streams?.[0]) callbacks.onPlaying?.(event.streams[0]);
      };
      pc.onicecandidate = (event) => {
        if (destroyed) return;
        send({
          janus: 'trickle', session_id: sessionId, handle_id: handleId, transaction: nextTxn(),
          candidate: event.candidate || { completed: true },
        });
      };
      pc.oniceconnectionstatechange = () => {
        if (destroyed) return;
        if (pc.iceConnectionState === 'failed') callbacks.onError?.('ICE connection failed');
      };

      await pc.setRemoteDescription(new RTCSessionDescription(jsep));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      send({
        janus: 'message', session_id: sessionId, handle_id: handleId, transaction: nextTxn(),
        body: { request: 'start' }, jsep: { type: 'answer', sdp: answer.sdp },
      });
    } catch (e) {
      console.error('[Janus WS] WebRTC error:', e);
      callbacks.onError?.('WebRTC negotiation failed');
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
    if (ws && ws.readyState === WebSocket.OPEN && sessionId) {
      try { send({ janus: 'destroy', session_id: sessionId, transaction: nextTxn() }); } catch { /* ignore */ }
    }
    if (pc) { pc.close(); pc = null; }
    if (ws) { ws.close(); ws = null; }
  }

  return { destroy };
}


/* ═══════════════════════════════════════════════════════════════════════
   Janus HTTP REST Connection Manager (for playout devices / Now Playing)
   ═══════════════════════════════════════════════════════════════════════ */

function createJanusHttpConnection(httpUrl, callbacks) {
  let sessionId = null;
  let handleId = null;
  let keepAliveTimer = null;
  let pollActive = false;
  let destroyed = false;
  let pc = null;
  let txnCounter = 0;

  const nextTxn = () => `h${++txnCounter}-${Date.now()}`;

  // ── HTTP helpers ──
  async function janusPost(path, body) {
    const res = await fetch(httpUrl + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  async function janusPoll() {
    const res = await fetch(`${httpUrl}/${sessionId}?maxev=1&_=${Date.now()}`);
    return res.json();
  }

  // ── Long-poll loop (runs in background to receive async events) ──
  async function pollLoop() {
    pollActive = true;
    while (!destroyed && sessionId) {
      try {
        const msg = await janusPoll();
        if (destroyed) break;
        handlePollMessage(msg);
      } catch (e) {
        if (destroyed) break;
        // Wait before retry on network error
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    pollActive = false;
  }

  // Resolve for the SDP offer from "watch" command
  let sdpOfferResolve = null;

  function handlePollMessage(msg) {
    if (!msg || destroyed) return;

    // SDP Offer (response to "watch")
    if (msg.jsep && msg.jsep.type === 'offer') {
      if (sdpOfferResolve) {
        sdpOfferResolve(msg.jsep);
        sdpOfferResolve = null;
      }
      return;
    }

    // Event: stream started/stopped
    if (msg.janus === 'event') {
      const result = msg.plugindata?.data?.result;
      if (result?.status === 'stopped') callbacks.onStopped?.();
      const error = msg.plugindata?.data?.error;
      if (error) callbacks.onError?.(error);
      return;
    }

    if (msg.janus === 'hangup') {
      callbacks.onStopped?.();
      return;
    }
  }

  // ── Main async setup flow ──
  (async () => {
    try {
      // Step 1: Create session
      const sess = await janusPost('', { janus: 'create', transaction: nextTxn() });
      if (destroyed) return;
      sessionId = sess.data?.id;
      if (!sessionId) { callbacks.onError?.('Failed to create Janus session'); return; }

      // Start keep-alive (every 25s)
      keepAliveTimer = setInterval(() => {
        janusPost('/' + sessionId, { janus: 'keepalive', transaction: nextTxn() }).catch(() => {});
      }, 25000);

      // Start long-poll loop for async events
      pollLoop();

      // Step 2: Attach streaming plugin
      const att = await janusPost('/' + sessionId, {
        janus: 'attach', plugin: 'janus.plugin.streaming', transaction: nextTxn(),
      });
      if (destroyed) return;
      handleId = att.data?.id;
      if (!handleId) { callbacks.onError?.('Failed to attach streaming plugin'); return; }

      // Step 3: List available streams (synchronous response)
      const list = await janusPost('/' + sessionId + '/' + handleId, {
        janus: 'message', transaction: nextTxn(), body: { request: 'list' },
      });
      if (destroyed) return;
      const streams = list.plugindata?.data?.list || [];
      if (streams.length === 0) {
        callbacks.onError?.('No active streams on this device');
        return;
      }
      const streamId = streams[0].id;

      // Step 4: Watch stream (async — SDP offer comes via long-poll)
      const sdpPromise = new Promise((resolve) => { sdpOfferResolve = resolve; });
      await janusPost('/' + sessionId + '/' + handleId, {
        janus: 'message', transaction: nextTxn(), body: { request: 'watch', id: streamId },
      });
      if (destroyed) return;

      // Wait for SDP offer from long-poll (with timeout)
      const jsep = await Promise.race([
        sdpPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('SDP offer timeout')), 15000)),
      ]);
      if (destroyed) return;

      // Step 5: Create WebRTC peer connection
      pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'turn:18.213.17.26:3478', username: 'test', credential: 'test' },
        ],
      });

      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      pc.ontrack = (event) => {
        if (destroyed) return;
        if (event.streams?.[0]) callbacks.onPlaying?.(event.streams[0]);
      };

      pc.onicecandidate = (event) => {
        if (destroyed) return;
        janusPost('/' + sessionId + '/' + handleId, {
          janus: 'trickle', transaction: nextTxn(),
          candidate: event.candidate || { completed: true },
        }).catch(() => {});
      };

      pc.oniceconnectionstatechange = () => {
        if (destroyed) return;
        if (pc.iceConnectionState === 'failed') callbacks.onError?.('ICE connection failed');
      };

      await pc.setRemoteDescription(new RTCSessionDescription(jsep));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Step 6: Send SDP answer → starts the stream
      await janusPost('/' + sessionId + '/' + handleId, {
        janus: 'message', transaction: nextTxn(),
        body: { request: 'start' },
        jsep: { type: 'answer', sdp: answer.sdp },
      });

    } catch (e) {
      if (!destroyed) {
        console.error('[Janus HTTP] Error:', e);
        callbacks.onError?.(e.message || 'Connection failed');
      }
    }
  })();

  // ── Destroy / cleanup ──
  function destroy() {
    if (destroyed) return;
    destroyed = true;

    if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }

    // Try graceful destroy
    if (sessionId) {
      janusPost('/' + sessionId, { janus: 'destroy', transaction: nextTxn() }).catch(() => {});
    }

    if (pc) { pc.close(); pc = null; }
  }

  return { destroy };
}


/* ═══════════════════════════════════════════════════════════════════════
   Utility: Extract Janus URLs from ingest / now_playing objects
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Get the Janus WebSocket URL from an ingest's servo end_points.
 * Returns a wss:// URL or null.
 */
export function getJanusWsUrl(ingest) {
  if (!ingest?.servo?.end_points) return null;
  const eps = ingest.servo.end_points;
  if (Array.isArray(eps) && eps.length > 0) {
    return eps[0].low_res_ws_url || null;
  }
  return null;
}

/**
 * Get the Janus HTTP REST URL from a now_playing headend item.
 * Returns the HTTPS live_url directly (used with HTTP REST transport).
 *
 * Example: "https://pocs-artv1-001-dd-pocs.demo.amagi.tv/pocs-artv1-001-dd/janus"
 */
export function getNowPlayingJanusUrl(headend) {
  return headend?.live_url || null;
}
