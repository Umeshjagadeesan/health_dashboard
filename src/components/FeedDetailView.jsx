import React from 'react';
import NowPlayingCard from './NowPlayingCard';
import PlaylistHealthCard from './PlaylistHealthCard';
import AssetDownloadCard from './AssetDownloadCard';
import MediaLibraryCard from './MediaLibraryCard';
import HeadendHealthCard from './HeadendHealthCard';
import StorageCard from './StorageCard';
// import LiveEventsCard from './LiveEventsCard'; // Commented out – not needed for now
// VersionCard removed — replaced by MediaLibraryCard in row 2
import ErrorsActivityCard from './ErrorsActivityCard';
import IngestCard from './IngestCard';
import PlayerControls from './PlayerControls';

export default function FeedDetailView({
  account,
  selectedChannel,
  channelData,
  globalData,
  channelLoading,
  onSelectChannel,
  onBack,
  accountIngests,
  onRefreshChannel,
}) {
  // Merge global + channel data so all existing cards work unchanged
  const mergedData = { ...globalData, ...channelData };

  // Extract headends from now_playing for PlayerControls
  const np = channelData?.nowPlaying;
  const headends = np?.ok && Array.isArray(np.data) ? np.data : [];

  // Determine if data is still being fetched (summary or loading)
  const isSummary = channelData?._meta?._summary === true;
  const isLoading = channelLoading || isSummary;

  // Has any ingests for this account?
  const hasIngests = accountIngests && accountIngests.length > 0;

  return (
    <div className="feed-detail">
      {/* ── Detail Header ── */}
      <div className="detail-header">
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <div className="detail-title">{account.name}</div>
        {channelLoading && <span className="loading-spinner"></span>}
        {/* ── Player Start/Stop controls (same line as account name) ── */}
        {selectedChannel && headends.length > 0 && (
          <PlayerControls
            feedCode={selectedChannel}
            headends={headends}
            onStatusChange={onRefreshChannel}
          />
        )}
      </div>

      {/* ── Channel Tabs (only if more than 1 channel) ── */}
      {account.channels.length > 1 && (
        <div className="channel-tabs">
          {account.channels.map((ch) => (
            <button
              key={ch}
              className={`channel-tab${ch === selectedChannel ? ' active' : ''}`}
              onClick={() => onSelectChannel(ch)}
            >
              {ch}
            </button>
          ))}
        </div>
      )}

      {selectedChannel && (
        <div className="channel-label">
          Channel: <strong>{selectedChannel}</strong>
          {channelData?._meta?.numericId && (
            <span> · Feed ID: {channelData._meta.numericId}</span>
          )}
        </div>
      )}

      {/* ── Detail Cards Grid ── */}
      <div className="grid-layout">
        {/* Row 1: Now Playing (full width) */}
        <NowPlayingCard data={mergedData} isLoading={isLoading} />

        {/* Row 2: Playlist + Media Library */}
        <PlaylistHealthCard data={mergedData} feedCode={selectedChannel} isLoading={isLoading} />
        <MediaLibraryCard data={mergedData} isLoading={isLoading} />

        {/* Ingest Card (full width) — only show if account has ingests */}
        {hasIngests && <IngestCard ingests={accountIngests} />}

        {/* Row 3: Asset Downloads + Headend Health */}
        <AssetDownloadCard data={mergedData} isLoading={isLoading} />
        <HeadendHealthCard data={mergedData} feedCode={selectedChannel} isLoading={isLoading} />

        {/* Row 4: Storage */}
        <StorageCard data={mergedData} isLoading={isLoading} />

        {/* Live Events & Apex – commented out for now */}
        {/* <LiveEventsCard data={mergedData} /> */}

        {/* Errors & Activity (full width) */}
        <ErrorsActivityCard data={mergedData} isLoading={isLoading} />
      </div>
    </div>
  );
}
