import React from 'react';
import StockReport from './StockReport';
import './StockReports.css';

// Minimal, view-only stock report page for Android app
export default function StockApp() {
  return (
    <div className="stock-report-mobile-container">
      <StockReport hideControls hideExport hideSearch hideNavOnly />
    </div>
  );
}
