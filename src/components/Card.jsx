import React from 'react';

export function Card({ id, wide, children }) {
  return (
    <div className={`card${wide ? ' card-wide' : ''}`} id={id}>
      {children}
    </div>
  );
}

export function CardHeader({ icon, title, badge, badgeClass }) {
  return (
    <div className="card-header">
      <h3>
        <span className="card-icon">{icon}</span> {title}
      </h3>
      <span className={`card-badge${badgeClass ? ' ' + badgeClass : ''}`}>
        {badge}
      </span>
    </div>
  );
}

export function CardBody({ scrollable, children }) {
  return (
    <div className={`card-body${scrollable ? ' scrollable' : ''}`}>
      {children}
    </div>
  );
}
