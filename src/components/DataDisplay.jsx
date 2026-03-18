import React from 'react';
import { safe } from '../utils/helpers';

export function KvList({ children }) {
  return <div className="kv-list">{children}</div>;
}

export function KvRow({ label, value, className = '' }) {
  return (
    <div className="kv-row">
      <span className="kv-key">{label}</span>
      <span className={`kv-value ${className}`}>{safe(value)}</span>
    </div>
  );
}

export function StatGrid({ children }) {
  return <div className="stat-grid">{children}</div>;
}

export function StatItem({ value, label, className = '' }) {
  return (
    <div className="stat-item">
      <div className={`stat-value ${className}`}>{safe(value)}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function ErrorBanner({ message }) {
  return (
    <div className="error-banner">
      <span className="error-icon">⚠️</span> {message}
    </div>
  );
}

export function Placeholder({ text }) {
  return <div className="placeholder-text">{text}</div>;
}

export function CardLoading({ text = 'Loading data…' }) {
  return (
    <div className="card-loading">
      <span className="mini-spinner" />
      <span>{text}</span>
    </div>
  );
}

export function SectionTitle({ children }) {
  return <div className="card-section-title">{children}</div>;
}

export function StatusIndicator({ status, label }) {
  const cls = status === 'up' ? 'up' : status === 'down' ? 'down' : 'partial';
  return (
    <span className={`status-indicator ${cls}`}>
      <span className="status-dot"></span> {label}
    </span>
  );
}

export function ProgressBar({ percent, colorClass = 'info' }) {
  return (
    <div className="progress-bar">
      <div
        className={`progress-fill ${colorClass}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function EventList({ children }) {
  return <div className="event-list">{children}</div>;
}

export function EventItem({ dotClass, title, subtitle }) {
  return (
    <div className="event-item">
      <div className={`event-dot ${dotClass}`}></div>
      <div className="event-info">
        <div className="event-title">{title}</div>
        <div className="event-time">{subtitle}</div>
      </div>
    </div>
  );
}

export function LogList({ children }) {
  return <div className="log-list">{children}</div>;
}

export function LogItem({ time, badgeClass, level, message }) {
  return (
    <div className="log-item">
      <span className="log-time">{time}</span>
      <span className={`log-badge ${badgeClass}`}>{level}</span>
      <span className="log-message">{message}</span>
    </div>
  );
}

export function DeviceGrid({ children }) {
  return <div className="device-grid">{children}</div>;
}

export function DeviceCard({ name, detail, online }) {
  return (
    <div className={`device-card ${online ? 'online' : 'offline'}`}>
      <div className="device-name">{name}</div>
      <div className="device-detail">{detail}</div>
      <div className="device-detail" style={{ marginTop: 2 }}>
        <StatusIndicator
          status={online ? 'up' : 'down'}
          label={online ? 'Online' : 'Offline'}
        />
      </div>
    </div>
  );
}
