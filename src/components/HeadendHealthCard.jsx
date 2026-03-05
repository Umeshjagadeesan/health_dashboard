import React from 'react';
import { Card, CardHeader, CardBody } from './Card';
import { Placeholder, StatusIndicator, DeviceGrid } from './DataDisplay';
import { parsePrometheusForFeed } from '../utils/helpers';

export default function HeadendHealthCard({ data, feedCode }) {
  if (!data) return null;

  // Parse device agent health from prometheus metrics
  const metricsText = data.metricsStatus?.ok ? data.metricsStatus.data : null;
  const metrics = feedCode && typeof metricsText === 'string'
    ? parsePrometheusForFeed(metricsText, feedCode)
    : [];

  // Devices from devices.json
  const devices = data.devices?.ok && Array.isArray(data.devices.data)
    ? data.devices.data.filter(d => d.Channel === feedCode)
    : [];

  // Headend status from v1 API
  const hs = data.headendStatus;
  const hasHeadendStatus = hs?.ok && hs.data;

  const daHealth = metrics.filter(m => m.name === 'device_agent_health');
  const diskFree = metrics.filter(m => m.name === 'headend_disk_free_space');
  const pmHealth = metrics.filter(m => m.name === 'playlist_manager_health');
  const monHealth = metrics.filter(m => m.name === 'monitoring_health');

  const healthyCount = daHealth.filter(m => m.value >= 1).length;
  const totalCount = daHealth.length;

  const badgeText = totalCount > 0 ? `${healthyCount}/${totalCount} HEALTHY` : 'NO DATA';
  const badgeClass = totalCount > 0
    ? (healthyCount === totalCount ? 'success' : healthyCount > 0 ? 'warning' : 'danger')
    : '';

  return (
    <Card id="headend-health">
      <CardHeader icon="🖧" title="Headend & Device Health" badge={badgeText} badgeClass={badgeClass} />
      <CardBody>
        {totalCount === 0 && devices.length === 0 ? (
          <Placeholder text="No headend metrics available for this feed" />
        ) : (
          <>
            {hasHeadendStatus && (
              <div className="kv-list" style={{ marginBottom: 14 }}>
                <div className="kv-row">
                  <span className="kv-key">Health Status</span>
                  <span className={`kv-value ${hs.data.health_status === 'active' || hs.data.health_status === 'neutral' ? 'success' : 'warning'}`}>
                    {hs.data.health_status || '--'}
                  </span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">Playout Status</span>
                  <span className={`kv-value ${hs.data.playout_status === 'media' ? 'success' : 'warning'}`}>
                    {hs.data.playout_status || '--'}
                  </span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">Status</span>
                  <span className={`kv-value ${hs.data.status === 'active' ? 'success' : 'warning'}`}>
                    {hs.data.status || '--'}
                  </span>
                </div>
              </div>
            )}

            {daHealth.length > 0 && (
              <DeviceGrid>
                {daHealth.map((m, i) => {
                  const hCode = m.labels.headend || `headend-${i}`;
                  const disk = diskFree.find(d => d.labels.headend === hCode);
                  const pm = pmHealth.find(d => d.labels.headend === hCode);
                  const mon = monHealth.find(d => d.labels.headend === hCode);
                  const device = devices.find(d => d.Name === hCode);

                  return (
                    <div key={hCode} className={`device-card ${m.value >= 1 ? 'online' : 'offline'}`}>
                      <div className="device-name">{hCode}</div>
                      <div className="device-detail">
                        <StatusIndicator
                          status={m.value >= 1 ? 'up' : 'down'}
                          label={m.value >= 1 ? 'Agent Online' : 'Agent Offline'}
                        />
                      </div>
                      <div className="device-detail" style={{ marginTop: 4 }}>
                        {disk && `Disk: ${disk.value}% free`}
                        {pm && ` · PM: ${pm.value >= 1 ? '✓' : '✕'}`}
                        {mon && ` · Mon: ${mon.value >= 1 ? '✓' : '✕'}`}
                      </div>
                      {device && (
                        <div className="device-detail" style={{ marginTop: 2 }}>
                          DA: {device.DeviceAgentVersion} · FW: {device.FirmwareVersion}
                        </div>
                      )}
                    </div>
                  );
                })}
              </DeviceGrid>
            )}

            {devices.length > 0 && daHealth.length === 0 && (
              <DeviceGrid>
                {devices.map((d, i) => (
                  <div key={i} className="device-card online">
                    <div className="device-name">{d.Name}</div>
                    <div className="device-detail">
                      {d.FeedName} · {d.Type} · {d.TimeZone}
                    </div>
                    <div className="device-detail" style={{ marginTop: 2 }}>
                      DA: {d.DeviceAgentVersion} · FW: {d.FirmwareVersion}
                    </div>
                    <div className="device-detail" style={{ marginTop: 2 }}>
                      IP: {d.IP} · Enabled: {d.Enabled}
                    </div>
                  </div>
                ))}
              </DeviceGrid>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
