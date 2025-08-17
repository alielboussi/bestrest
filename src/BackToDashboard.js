import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Small, neat floating button to go back to dashboard
export default function BackToDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname || '';
  const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

  // Hide on Android app and on login/dashboard
  if (isAndroid) return null;
  if (path === '/dashboard' || path === '/login') return null;
  // Hide on explicit mobile routes
  if (/\bmobile\b/i.test(path)) return null; // matches -mobile routes

  return (
    <button
      onClick={() => navigate('/dashboard')}
      title="Back to Dashboard"
      aria-label="Back to Dashboard"
      style={{
        position: 'fixed',
        top: 14,
        left: 14,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8,
        background: 'linear-gradient(180deg, rgba(35,39,47,0.95), rgba(26,31,41,0.95))',
        color: '#e5e7eb',
        fontWeight: 600,
        fontSize: 13,
        boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
        cursor: 'pointer',
        zIndex: 1000,
        backdropFilter: 'blur(4px)'
      }}
      onMouseOver={(e) => { e.currentTarget.style.borderColor = 'rgba(0,191,255,0.6)'; }}
      onMouseOut={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
    >
      <span style={{
        display: 'inline-flex',
        width: 18,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
        color: '#00bfff'
      }}>←</span>
      <span>Back to Dashboard</span>
    </button>
  );
}
