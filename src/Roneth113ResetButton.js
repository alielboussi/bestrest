import React, { useState, useEffect } from 'react';


import { useLocation } from 'react-router-dom';
import supabase from './supabase';

// List of all public tables except 'users' and 'company_settings'
const TABLES_TO_RESET = [
  'batch_numbers',
  'categories',
  'combo_items',
  'combos',
  'currencies',
  'customers',
  'expenses',
  'inventory',
  'laybys',
  'locations',
  'permissions',
  'product_images',
  'product_locations',
  'products',
  'roles',
  'sales',
  'sales_items',
  'sales_payments',
  'serial_numbers',
  'stock_transfer_entries',
  'stock_transfer_sessions',
  'stock_transfers',
  'stocktake_entries',
  'stocktakes',
  'unit_of_measure',
  'user_roles'
  // 'users' and 'company_settings' are intentionally excluded!
];

export default function Roneth113ResetButton() {
  const [show, setShow] = useState(false);
  const location = useLocation();
  useEffect(() => {
    // Only listen on dashboard route
    if (location.pathname !== '/dashboard') {
      setShow(false);
      return;
    }
    let buffer = '';
    const handler = (e) => {
      if (e.key === 'Escape') {
        setShow(false);
        buffer = '';
        return;
      }
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      buffer += e.key.toLowerCase();
      if (buffer.length > 20) buffer = buffer.slice(-20);
      if (buffer.includes('roneth113')) setShow(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [location.pathname]);

  async function handleResetTables() {
    if (!window.confirm('Are you sure? This will delete ALL data except users and company settings!')) return;
    try {
      const res = await fetch('/api/reset-tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: 'Roneth113' })
      });
      if (res.ok) {
        alert('Tables reset!');
        setShow(false);
      } else {
        const data = await res.json();
        alert('Failed to reset tables: ' + (data.error || res.status));
      }
    } catch (err) {
      alert('Failed to reset tables: ' + err.message);
    }
  }

  // Only show for admin
  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem('user'));
    } catch {
      return null;
    }
  })();
  const isAdmin = user && (user.role === 'admin' || user.userRole === 'admin');

  async function factoryResetRoneth113() {
    if (!window.confirm('Are you sure you want to factory reset? This will delete ALL data except users and company settings!')) return;
    let failedTables = [];
    // NOTE: If Row Level Security (RLS) is enabled, you must use the service role key or allow delete for your user.
    for (const table of TABLES_TO_RESET) {
      let error = null;
      try {
        const { error: delError } = await supabase.from(table).delete();
        if (delError) error = delError;
      } catch (e) {
        error = e;
      }
      if (error) {
        console.error(`Failed to clear table ${table}:`, error);
        failedTables.push(table);
      }
    }
    if (failedTables.length > 0) {
      alert(`Some tables could not be cleared: ${failedTables.join(', ')}. Check console for details.`);
    } else {
      alert('Factory reset complete. All data except users and company settings has been deleted.');
    }
    setShow(false);
  }

  if (!show || !isAdmin) return null;
  // Only render the hidden Roneth113 button, no other reset button should exist here
  return (
    <button
      style={{
        position: 'fixed',
        bottom: 32,
        right: 32,
        zIndex: 9999,
        background: '#c00',
        color: '#fff',
        border: '2px solid #c00',
        borderRadius: 8,
        fontWeight: 700,
        fontSize: '1.1em',
        padding: '14px 32px',
        boxShadow: '0 2px 12px #0006',
        cursor: 'pointer',
        transition: 'background 0.2s, color 0.2s',
      }}
      onClick={handleResetTables}
      title="Delete all data except users"
    >Factory Reset (Roneth113)</button>
  );
}