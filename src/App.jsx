import React, { useEffect } from 'react';
import { useDashboard } from './hooks/useDashboard';
import TopBar from './components/TopBar';
import StatusStrip from './components/StatusStrip';
import AccountCard from './components/AccountCard';
import FeedDetailView from './components/FeedDetailView';
import IngestPanel from './components/IngestPanel';

export default function App() {
  const {
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
    getIngestsForAccount,
    getAllIngests,
    blipAuthStatus,
    refresh,
    openAccount,
    selectChannel,
    goHome,
  } = useDashboard();

  // Keyboard shortcut: Ctrl+R to refresh
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        refresh();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [refresh]);

  // Get all ingests for the floating panel
  const allIngests = getAllIngests();

  // Get account-specific ingests when viewing a detail
  const accountIngests = selectedAccount
    ? getIngestsForAccount(selectedAccount.name)
    : [];

  return (
    <>
      <TopBar
        connected={connected}
        lastRefresh={lastRefresh}
        loading={loading}
        onRefresh={refresh}
        refreshInterval={refreshInterval}
        onRefreshIntervalChange={setRefreshInterval}
        prefetchStatus={prefetchStatus}
        blipAuthStatus={blipAuthStatus}
        onGoHome={goHome}
      />

      <main className="dashboard">
        <StatusStrip data={globalData} />

        {!selectedAccount ? (
          /* ── Home: Account Cards Grid ── */
          <div className="accounts-section">
            <div className="section-header">
              <h2>📡 Feeds &amp; Accounts</h2>
              <div className="section-header-right">
                {!prefetchStatus.complete && prefetchStatus.total > 0 && (
                  <span className="prefetch-badge">
                    Loading {prefetchStatus.done}/{prefetchStatus.total} feeds…
                  </span>
                )}
                <span className="section-count">
                  {accounts.length} account{accounts.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Prefetch progress bar */}
            {!prefetchStatus.complete && prefetchStatus.total > 0 && (
              <div className="prefetch-progress-bar">
                <div
                  className="prefetch-progress-fill"
                  style={{ width: `${(prefetchStatus.done / prefetchStatus.total) * 100}%` }}
                />
              </div>
            )}

            {accounts.length === 0 && !loading ? (
              <div className="placeholder-text" style={{ padding: '40px 24px' }}>
                {connected
                  ? 'No feeds discovered from devices.json'
                  : 'Connecting to CloudPort…'}
              </div>
            ) : (
              <div className="accounts-grid">
                {accounts.map((acct) => (
                  <AccountCard
                    key={acct.name}
                    account={acct}
                    globalData={globalData}
                    isCached={acct.channels.reduce((best, ch) => {
                      const level = isFeedCached(ch);
                      if (!level) return best;                       // no cache
                      if (best === 'full') return 'full';            // keep best
                      return level;                                  // 'summary' or 'full'
                    }, false)}
                    onClick={() => openAccount(acct)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ── Detail View for selected account ── */
          <FeedDetailView
            account={selectedAccount}
            selectedChannel={selectedChannel}
            channelData={channelData}
            globalData={globalData}
            channelLoading={channelLoading}
            onSelectChannel={selectChannel}
            onBack={goHome}
            accountIngests={accountIngests}
            onRefreshChannel={() => selectedChannel && selectChannel(selectedChannel)}
          />
        )}
      </main>

      {/* ── Floating Ingest Panel (right side) ── */}
      <IngestPanel ingests={allIngests} />

      <footer className="footer">
        <span>CloudPort Health Dashboard</span>
        <span>
          {accounts.length > 0 && `${accounts.length} accounts · `}
          {allIngests.length > 0 && `${allIngests.length} ingests · `}
          Auto-refresh: {refreshInterval > 0 ? `${refreshInterval}s` : 'OFF'}
        </span>
      </footer>
    </>
  );
}
