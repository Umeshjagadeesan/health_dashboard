import React from 'react';
import { Card, CardHeader, CardBody } from './Card';
import { KvList, KvRow, Placeholder } from './DataDisplay';

/**
 * VersionCard – shows ONLY the playout versions for this account's channels.
 * e.g. for "amagihls" account → amghls1: v8.20.38-1, amghls2: v8.20.38-1
 */
export default function VersionCard({ data, accountChannels }) {
  if (!data) return null;

  const ver = data.version;
  if (!ver?.ok || !ver.data) {
    return (
      <Card id="version-info">
        <CardHeader icon="📦" title="Playout Version" badge="NO DATA" />
        <CardBody>
          <Placeholder text="Could not fetch version data" />
        </CardBody>
      </Card>
    );
  }

  const dv = ver.data.deployed_versions || {};
  const playout = dv.playout || {};

  // Filter to only this account's channels.
  // Playout keys use a suffix, e.g. "amghls-001", "amghls-002"
  // while account channels are "amghls", so we match by prefix.
  const channelPrefixes = accountChannels
    ? accountChannels.map((c) => c.toLowerCase())
    : null;

  const playoutEntries = channelPrefixes
    ? Object.entries(playout).filter(([ch]) => {
        const key = ch.toLowerCase();
        return channelPrefixes.some((prefix) => key === prefix || key.startsWith(prefix + '-'));
      })
    : Object.entries(playout);

  if (playoutEntries.length === 0) {
    return (
      <Card id="version-info">
        <CardHeader icon="📦" title="Playout Version" badge="--" />
        <CardBody>
          <Placeholder text="No playout version found for this account" />
        </CardBody>
      </Card>
    );
  }

  // Badge shows the version if all channels share the same one, otherwise count
  const allSameVersion = playoutEntries.every(([, v]) => v === playoutEntries[0][1]);
  const badgeText = allSameVersion ? playoutEntries[0][1] : `${playoutEntries.length} channels`;

  return (
    <Card id="version-info">
      <CardHeader icon="📦" title="Playout Version" badge={badgeText} badgeClass="info" />
      <CardBody>
        <KvList>
          {playoutEntries.map(([ch, v]) => (
            <KvRow key={ch} label={ch} value={v} className="info" />
          ))}
        </KvList>
      </CardBody>
    </Card>
  );
}
