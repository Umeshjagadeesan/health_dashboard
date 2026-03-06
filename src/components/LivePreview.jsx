import React, { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Janus WebRTC live preview player.
 *
 * Connects to a Janus Gateway streaming plugin via WebSocket,
 * negotiates a WebRTC peer connection, and renders the live
 * low-res ingest preview in a <video> element.
 *
 * Props:
 *  - wsUrl:  original wss:// Janus WebSocket URL (from servo end_points.low_res_ws_url)
 *  - size:   'small' (flyout, ~200×112) or 'medium' (card, ~320×180)
 *  - autoPlay: if true, connect immediately; otherwise show a play button
 */
export default function LivePreview({ wsUrl, size = 'small', autoPlay = false }) {
  const videoRef = useRef(null);
  const janusRef = useRef(null);   // holds the active connection object
  const [status, setStatus] = useState('idle'); // idle | connecting | playing | error | stopped
  const [errorMsg, setErrorMsg] = useState('');
  const [muted, setMuted] = useState(true);     // start muted (browser autoplay policy)

  // Convert original wss://pocs-trex.demo.amagi.tv/... to local proxy ws://localhost:PORT/janusproxy/...
  const proxyUrl = wsUrl
    ? wsUrl.replace(
        /^wss?:\/\/[^/]+/,
        `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/janusproxy`
      )
    : null;

  /** Start the Janus WebRTC connection */
  const connect = useCallback(() => {
    if (!proxyUrl) {
      setStatus('error');
      setErrorMsg('No WebSocket URL');
      return;
    }

    // Clean up any existing connection
    if (janusRef.current) {
      janusRef.current.destroy();
      janusRef.current = null;
    }

    setStatus('connecting');
    setErrorMsg('');

    const conn = createJanusConnection(proxyUrl, {
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
    });

    janusRef.current = conn;
  }, [proxyUrl]);

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
    if (autoPlay && proxyUrl) {
      connect();
    }
    return () => {
      // Destroy old connection when URL changes or component unmounts
      if (janusRef.current) {
        janusRef.current.destroy();
        janusRef.current = null;
      }
      // Reset video element so stale frames don't linger
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [autoPlay, proxyUrl, connect]);

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
                /* Speaker Off / Muted icon */
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                /* Speaker On icon */
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
   Janus WebSocket Connection Manager
   ═══════════════════════════════════════════════════════════════════════ */

function createJanusConnection(wsUrl, callbacks) {
  let ws = null;
  let pc = null;
  let sessionId = null;
  let handleId = null;
  let keepAliveTimer = null;
  let destroyed = false;
  let txnCounter = 0;

  // Pending transaction callbacks
  const pendingTxns = {};

  const nextTxn = () => {
    txnCounter++;
    return `t${txnCounter}-${Date.now()}`;
  };

  const send = (msg) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  // ── Start connection ──
  try {
    ws = new WebSocket(wsUrl, 'janus-protocol');
  } catch (e) {
    callbacks.onError?.('WebSocket failed: ' + e.message);
    return { destroy: () => {} };
  }

  ws.onopen = () => {
    if (destroyed) return;
    // Step 1: Create session
    const txn = nextTxn();
    pendingTxns[txn] = 'create';
    send({ janus: 'create', transaction: txn });
  };

  ws.onmessage = (event) => {
    if (destroyed) return;
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    const txn = msg.transaction;
    const pending = txn ? pendingTxns[txn] : null;

    // ── Session created ──
    if (msg.janus === 'success' && pending === 'create' && msg.data?.id) {
      sessionId = msg.data.id;
      delete pendingTxns[txn];

      // Start keep-alive
      keepAliveTimer = setInterval(() => {
        send({ janus: 'keepalive', session_id: sessionId, transaction: nextTxn() });
      }, 25000);

      // Step 2: Attach streaming plugin
      const attachTxn = nextTxn();
      pendingTxns[attachTxn] = 'attach';
      send({
        janus: 'attach',
        session_id: sessionId,
        plugin: 'janus.plugin.streaming',
        transaction: attachTxn,
      });
      return;
    }

    // ── Plugin attached ──
    if (msg.janus === 'success' && pending === 'attach' && msg.data?.id) {
      handleId = msg.data.id;
      delete pendingTxns[txn];

      // Step 3: List available streams to find the mountpoint ID
      const listTxn = nextTxn();
      pendingTxns[listTxn] = 'list';
      send({
        janus: 'message',
        session_id: sessionId,
        handle_id: handleId,
        transaction: listTxn,
        body: { request: 'list' },
      });
      return;
    }

    // ── Stream list response ──
    // Janus returns "list" as a synchronous "success" (not "event"),
    // so we must check for BOTH message types here.
    if ((msg.janus === 'success' || msg.janus === 'event') && pending === 'list') {
      delete pendingTxns[txn];
      const pluginData = msg.plugindata?.data;
      const streams = pluginData?.list || [];

      let streamId = 1; // default fallback
      if (streams.length > 0) {
        streamId = streams[0].id;
      }

      // Step 4: Watch the stream
      const watchTxn = nextTxn();
      pendingTxns[watchTxn] = 'watch';
      send({
        janus: 'message',
        session_id: sessionId,
        handle_id: handleId,
        transaction: watchTxn,
        body: { request: 'watch', id: streamId },
      });
      return;
    }

    // ── SDP Offer (from watch) ──
    if (msg.jsep && msg.jsep.type === 'offer') {
      if (pending === 'watch') delete pendingTxns[txn];
      handleSdpOffer(msg.jsep);
      return;
    }

    // ── Event: stream started/stopped ──
    if (msg.janus === 'event') {
      const result = msg.plugindata?.data?.result;
      if (result?.status === 'stopped') {
        callbacks.onStopped?.();
      }
      // Also check for error in events
      const error = msg.plugindata?.data?.error;
      if (error) {
        callbacks.onError?.(error);
      }
      return;
    }

    // ── Janus-level error ──
    if (msg.janus === 'error') {
      const errMsg = msg.error?.reason || 'Unknown Janus error';
      console.warn('[Janus] Error:', errMsg);
      callbacks.onError?.(errMsg);
      return;
    }

    // ── WebRTC hang-up ──
    if (msg.janus === 'hangup') {
      callbacks.onStopped?.();
      return;
    }
  };

  ws.onerror = () => {
    if (!destroyed) callbacks.onError?.('WebSocket connection failed');
  };

  ws.onclose = () => {
    if (!destroyed) callbacks.onStopped?.();
  };

  // ── Handle SDP Offer → create WebRTC answer ──
  async function handleSdpOffer(jsep) {
    try {
      pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      // Receive-only: add transceivers
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      // Handle incoming media stream
      pc.ontrack = (event) => {
        if (destroyed) return;
        if (event.streams && event.streams[0]) {
          callbacks.onPlaying?.(event.streams[0]);
        }
      };

      // Trickle ICE candidates to Janus
      pc.onicecandidate = (event) => {
        if (destroyed) return;
        if (event.candidate) {
          send({
            janus: 'trickle',
            session_id: sessionId,
            handle_id: handleId,
            transaction: nextTxn(),
            candidate: event.candidate,
          });
        } else {
          // ICE gathering complete
          send({
            janus: 'trickle',
            session_id: sessionId,
            handle_id: handleId,
            transaction: nextTxn(),
            candidate: { completed: true },
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (destroyed) return;
        const state = pc.iceConnectionState;
        if (state === 'failed') {
          callbacks.onError?.('ICE connection failed');
        } else if (state === 'disconnected') {
          // May recover, but note it
          console.warn('[Janus] ICE disconnected, may recover...');
        }
      };

      // Set remote offer
      await pc.setRemoteDescription(new RTCSessionDescription(jsep));

      // Create and send answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Step 5: Send SDP answer back to Janus → starts the stream
      const startTxn = nextTxn();
      pendingTxns[startTxn] = 'start';
      send({
        janus: 'message',
        session_id: sessionId,
        handle_id: handleId,
        transaction: startTxn,
        body: { request: 'start' },
        jsep: { type: 'answer', sdp: answer.sdp },
      });

    } catch (e) {
      console.error('[Janus] WebRTC error:', e);
      callbacks.onError?.('WebRTC negotiation failed');
    }
  }

  // ── Destroy / cleanup ──
  function destroy() {
    if (destroyed) return;
    destroyed = true;

    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }

    // Try graceful Janus session destroy
    if (ws && ws.readyState === WebSocket.OPEN && sessionId) {
      try {
        send({ janus: 'destroy', session_id: sessionId, transaction: nextTxn() });
      } catch { /* ignore */ }
    }

    if (pc) {
      pc.close();
      pc = null;
    }

    if (ws) {
      ws.close();
      ws = null;
    }
  }

  return { destroy };
}


/* ═══════════════════════════════════════════════════════════════════════
   Utility: Extract Janus WS URL from an ingest object
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Get the Janus WebSocket URL from an ingest's servo end_points.
 * Returns null if not available.
 */
export function getJanusWsUrl(ingest) {
  if (!ingest?.servo?.end_points) return null;
  const eps = ingest.servo.end_points;
  if (Array.isArray(eps) && eps.length > 0) {
    return eps[0].low_res_ws_url || null;
  }
  return null;
}
