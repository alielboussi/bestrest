import React from 'react';
import StockReportMobile from './StockReportMobile';
import './StockReportMobile.css';

// Minimal, view-only stock report page for Android app
export default function StockApp() {
  return (
    <div className="stock-report-mobile-container">
  <StockReportMobile />
    </div>
  );
}
