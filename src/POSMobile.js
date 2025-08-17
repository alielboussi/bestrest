import React from 'react';
import POS from './POS';
import './POSMobile.css';

// Mobile wrapper that reuses full POS features, with mobile-specific CSS overrides
export default function POSMobile() {
  return (
    <div className="pos-mobile">
      <POS />
    </div>
  );
}
