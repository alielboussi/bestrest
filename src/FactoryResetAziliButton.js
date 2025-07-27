import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import supabase from './supabase';

const TABLES_TO_RESET = [
  'batch_numbers',
  'categories',
  'combo_items',
  'combos',
  'company_settings',
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
  // 'users' is intentionally excluded!
];

export default function FactoryResetAziliButton() {
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
      if (buffer.length > 10) buffer = buffer.slice(-10);
      if (buffer.includes('azili')) setShow(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [location.pathname]);

  // Only show for admin
  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem('user'));
    } catch {
      return null;
    }
  })();
  const isAdmin = user && (user.role === 'admin' || user.userRole === 'admin');

  async function factoryResetAzili() {
    if (!window.confirm('Are you sure you want to factory reset? This will delete ALL data except users!')) return;
    for (const table of TABLES_TO_RESET) {
      const { error } = await supabase.from(table).delete().neq('id', null);
      if (error) {
        alert(`Failed to clear table ${table}: ${error.message}`);
        return;
      }
    }
    alert('Factory reset complete. All data except users has been deleted.');
    setShow(false);
  }

  if (!show || !isAdmin) return null;
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
      onClick={factoryResetAzili}
      title="Delete all data except users"
    >Factory Reset (Azili)</button>
  );
}
