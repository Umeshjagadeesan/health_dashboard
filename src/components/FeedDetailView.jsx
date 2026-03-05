import React from 'react';
import NowPlayingCard from './NowPlayingCard';
import PlaylistHealthCard from './PlaylistHealthCard';
import AssetDownloadCard from './AssetDownloadCard';
import MediaLibraryCard from './MediaLibraryCard';
import HeadendHealthCard from './HeadendHealthCard';
import StorageCard from './StorageCard';
// import LiveEventsCard from './LiveEventsCard'; // Commented out – not needed for now
import VersionCard from './VersionCard';
import ErrorsActivityCard from './ErrorsActivityCard';

export default function FeedDetailView({
  account,
  selectedChannel,
  channelData,
  globalData,
  channelLoading,
  onSelectChannel,
  onBack,
}) {
  // Merge global + channel data so all existing cards work unchanged
  const mergedData = { ...globalData, ...channelData };

  return (
    <div className="feed-detail">
      {/* ── Detail Header ── */}
      <div className="detail-header">
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <div className="detail-title">{account.name}</div>
        {channelLoading && <span className="loading-spinner"></span>}
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
        <NowPlayingCard data={mergedData} />

        {/* Row 2: Playlist + Version */}
        <PlaylistHealthCard data={mergedData} feedCode={selectedChannel} />
        <VersionCard data={mergedData} accountChannels={account.channels} />

        {/* Row 3: Asset Downloads + Media Library */}
        <AssetDownloadCard data={mergedData} />
        <MediaLibraryCard data={mergedData} />

        {/* Row 4: Headend Health + Storage */}
        <HeadendHealthCard data={mergedData} feedCode={selectedChannel} />
        <StorageCard data={mergedData} />

        {/* Live Events & Apex – commented out for now */}
        {/* <LiveEventsCard data={mergedData} /> */}

        {/* Errors & Activity (full width) */}
        <ErrorsActivityCard data={mergedData} />
      </div>
    </div>
  );
}
