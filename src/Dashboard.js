// src/Dashboard.js

import React, { useState, useEffect } from 'react';
import supabase from './supabase';
import { useNavigate } from 'react-router-dom';
import {
  FaBox, FaChartLine, FaUsers, FaCogs, FaMapMarkerAlt, FaTags, FaFlask,
  FaRegEdit, FaExchangeAlt, FaCashRegister, FaUserShield
} from 'react-icons/fa';
import { v4 as uuidv4 } from 'uuid';
import useStatistics from './hooks/useStatistics';
// Removed user permissions and permissionUtils logic
import './Dashboard.css';

// Removed static totalSales; will compute from sales table

function getPermissionsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  try {
    return JSON.parse(decodeURIComponent(params.get('permissions') || '{}'));
  } catch {
    return {};
  }
}

function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState([]);
  const [locationFilter, setLocationFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [productStats, setProductStats] = useState({ qty: 0, costK: 0, costUSD: 0, unitsOnHand: 0 });
  const [dueTotals, setDueTotals] = useState({ K: 0, USD: 0 });
  const [lastStockDate, setLastStockDate] = useState(null);
  const [totalSalesK, setTotalSalesK] = useState(0);
  const [incompleteCount, setIncompleteCount] = useState(0);
  const { stats: sharedStats } = useStatistics({ dateFrom, dateTo, locationFilter });
  const [showReset, setShowReset] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [typed, setTyped] = useState('');
  const [fullName, setFullName] = useState('');
  const secret = 'factoryreset';
  const [periodBusy, setPeriodBusy] = useState(false);
  const [periodMsg, setPeriodMsg] = useState('');
  const [periodInfo, setPeriodInfo] = useState({ opening: null, closing: null, status: 'idle' });

  const MODULES = [
    { name: 'locations', label: 'Locations', route: '/locations', icon: FaMapMarkerAlt },
    { name: 'unitsofmeasure', label: 'Units Of Measure', route: '/units-of-measure', icon: FaFlask },
    { name: 'categories', label: 'Categories', route: '/categories', icon: FaBox },
    { name: 'products', label: 'Products', route: '/products', icon: FaTags },
    { name: 'sets', label: 'Sets', route: '/sets', icon: FaBox },
    { name: 'productslist', label: 'Products List', route: '/products-list', icon: FaTags },
    { name: 'transfer', label: 'Stock Transfers', route: '/transfer', icon: FaExchangeAlt },
  { name: 'transferlist', label: 'Edit Transfers', route: '/transfers', icon: FaRegEdit },
    { name: 'customers', label: 'Customers', route: '/customers', icon: FaUsers },
    { name: 'pos', label: 'Sales', route: '/POS', icon: FaCashRegister },
    { name: 'salesreport', label: 'Sales Report', route: '/sales-report', icon: FaChartLine },
  { name: 'allsales', label: 'All Sales', route: '/all-sales', icon: FaRegEdit },
    { name: 'laybymanagement', label: 'Laybys', route: '/layby-management', icon: FaUsers },
  // Stock Report (mobile) hidden from desktop dashboard
  { name: 'stocktakereport', label: 'Stocktake Report', route: '/stocktake-report', icon: FaRegEdit },
  { name: 'pricelabels', label: 'Print Price Labels', route: '/price-labels', icon: FaTags },
  { name: 'incompletepackages', label: 'Incomplete Packages', route: '/incomplete-packages', icon: FaBox },
  { name: 'openingbalanceentry', label: 'Opening Balance Entry', route: '/opening-balance-entry', icon: FaCashRegister },
  ];

useEffect(() => {
  const userData = localStorage.getItem('user');
  if (userData) setUser(JSON.parse(userData));
  else setUser(null);
  setLoading(false);
}, [window.location.pathname]);

  useEffect(() => {
    if (!user) return;
    // Removed all permission logic and setUserPermissions
  }, [user]);

  useEffect(() => {
    if (!loading && !user) {
      // If admin, do not redirect
      const userData = localStorage.getItem('user');
      if (userData) {
        const parsed = JSON.parse(userData);
        if (parsed && parsed.role && parsed.role.toLowerCase() === 'admin') {
          return;
        }
      }
      navigate('/login');
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    async function fetchLocations() {
      const { data, error } = await supabase.from('locations').select('id, name');
      if (!error && data) setLocations(data);
      else setLocations([]);
    }
    fetchLocations();
  }, []);

  // Load current period status for the selected location
  useEffect(() => {
    const loadPeriod = async () => {
      if (!locationFilter) { setPeriodInfo({ opening: null, closing: null, status: 'idle' }); return; }
      // Latest opening for location
      const { data: openings } = await supabase
        .from('opening_stock_sessions')
        .select('id, started_at')
        .eq('location_id', locationFilter)
        .order('started_at', { ascending: false })
        .limit(1);
      const opening = openings && openings[0];
      if (!opening) { setPeriodInfo({ opening: null, closing: null, status: 'none' }); return; }
      // Latest closed closing after opening
      const { data: closed } = await supabase
        .from('closing_stock_sessions')
        .select('id, ended_at')
        .eq('location_id', locationFilter)
        .eq('status', 'closed')
        .gte('ended_at', opening.started_at)
        .order('ended_at', { ascending: false })
        .limit(1);
      const closing = closed && closed[0];
      if (closing) {
        setPeriodInfo({ opening: opening.started_at, closing: closing.ended_at, status: 'closed' });
      } else {
        setPeriodInfo({ opening: opening.started_at, closing: null, status: 'open' });
      }
    };
    loadPeriod();
  }, [locationFilter]);

    // Compute Layby due totals (K, USD) across all active laybys
    const computeLaybyDueTotals = React.useCallback(async () => {
      try {
        // 1) Active laybys
        const { data: laybys, error: layErr } = await supabase
          .from('laybys')
          .select('id, customer_id, sale_id, total_amount, status')
          .not('status', 'eq', 'completed');
        if (layErr) throw layErr;
        const saleIds = (laybys || []).map(l => Number(l.sale_id)).filter(id => !isNaN(id));

        // Short-circuit
        if (!saleIds.length) { setDueTotals({ K: 0, USD: 0 }); return; }

        // 2) Down payments on sales
        const { data: sales, error: salesErr } = await supabase
          .from('sales')
          .select('id, down_payment')
          .in('id', saleIds);
        if (salesErr) throw salesErr;
        const downMap = (sales || []).reduce((acc, s) => { acc[Number(s.id)] = Number(s.down_payment || 0); return acc; }, {});

        // 3) All payments per sale
        const { data: pays, error: payErr } = await supabase
          .from('sales_payments')
          .select('sale_id, amount')
          .in('sale_id', saleIds);
        if (payErr) throw payErr;
        const paymentsMap = (pays || []).reduce((acc, p) => {
          const sid = Number(p.sale_id);
          acc[sid] = (acc[sid] || 0) + Number(p.amount || 0);
          return acc;
        }, {});

        // 4) Customers for currency
        const customerIds = Array.from(new Set((laybys || []).map(l => l.customer_id).filter(Boolean)));
        let customersMap = {};
        if (customerIds.length) {
          const { data: customers, error: custErr } = await supabase
            .from('customers')
            .select('id, currency')
            .in('id', customerIds);
          if (custErr) throw custErr;
          customersMap = (customers || []).reduce((acc, c) => { acc[c.id] = c; return acc; }, {});
        }

        // 5) Aggregate outstanding by currency
        const totals = { K: 0, USD: 0 };
        (laybys || []).forEach(l => {
          const sid = Number(l.sale_id);
          const down = downMap[sid] || 0;
          const paid = down + (paymentsMap[sid] || 0);
          const outstanding = Math.max(0, Number(l.total_amount || 0) - paid);
          const cur = customersMap[l.customer_id]?.currency || 'K';
          const code = (cur === '$' || String(cur).toUpperCase() === 'USD') ? 'USD' : 'K';
          totals[code] += outstanding;
        });
        setDueTotals({ K: totals.K, USD: totals.USD });
      } catch (e) {
        console.warn('computeLaybyDueTotals failed:', e?.message || e);
        // Do not throw; keep last known totals
      }
    }, []);

    // Initial fetch and realtime updates for layby dues
    useEffect(() => {
      computeLaybyDueTotals();
      const channel = supabase.channel('dashboard-layby-dues');
      const handler = () => { computeLaybyDueTotals(); };
      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_payments' }, handler)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'laybys' }, handler)
        .on('postgres_changes', { event: 'update', schema: 'public', table: 'sales' }, handler)
        .subscribe();
      return () => {
        try { supabase.removeChannel(channel); } catch {}
      };
    }, [computeLaybyDueTotals]);

  // Fetch live stats for dashboard: inventory totals, layby dues, last stocktake date, total sales (K)
  useEffect(() => {
    async function fetchStats() {
      // Helper to resolve a location filter ID (string id or name)
      let locationId = locationFilter;
      if (locationFilter && locations.length > 0 && isNaN(Number(locationFilter))) {
        const match = locations.find(l => (l.name || '').toLowerCase() === (locationFilter || '').toLowerCase());
        if (match) locationId = match.id;
      }

      // 1) Inventory totals -> product quantity + cost by currency
      let invQuery = supabase.from('inventory').select('product_id, location, quantity');
      if (locationId) invQuery = invQuery.eq('location', locationId);
      const { data: invData } = await invQuery;
      const qtyByProduct = {};
      (invData || []).forEach(i => {
        qtyByProduct[i.product_id] = (qtyByProduct[i.product_id] || 0) + (Number(i.quantity) || 0);
      });
    const prodIds = Object.keys(qtyByProduct);
    let costK = 0, costUSD = 0;
      if (prodIds.length > 0) {
        const { data: prodCost } = await supabase
          .from('products')
          .select('id, cost_price, currency')
          .in('id', prodIds);
        (prodCost || []).forEach(p => {
          const q = qtyByProduct[p.id] || 0;
      const cost = (Number(p.cost_price) || 0) * q;
          if ((p.currency || '').toUpperCase() === 'K') costK += cost;
          else if ((p.currency || '').includes('$') || (p.currency || '').toUpperCase() === 'USD') costUSD += cost;
        });
      }
    const unitsOnHand = Object.values(qtyByProduct).reduce((acc, v) => acc + (Number(v) || 0), 0);
      // Products Quantity should reflect count of products in catalog, not units on hand
      const { count: productCount } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true });
    setProductStats({ qty: productCount || 0, costK, costUSD, unitsOnHand });

  // Layby due totals are computed separately and updated in realtime

      // 3) Last stocktake date (prefer latest closing; fallback to latest opening)
      let closingQ = supabase
        .from('closing_stock_sessions')
        .select('ended_at, location_id')
        .order('ended_at', { ascending: false })
        .limit(1);
      if (locationId) closingQ = closingQ.eq('location_id', locationId);
      const { data: lastClose } = await closingQ;
      if (lastClose && lastClose.length > 0) {
        setLastStockDate(lastClose[0].ended_at);
      } else {
        let openingQ = supabase
          .from('opening_stock_sessions')
          .select('started_at, location_id')
          .order('started_at', { ascending: false })
          .limit(1);
        if (locationId) openingQ = openingQ.eq('location_id', locationId);
        const { data: lastOpen } = await openingQ;
        setLastStockDate(lastOpen && lastOpen.length > 0 ? lastOpen[0].started_at : null);
      }

    // 4) Total Sales (K) using shared stats
    const salesByCurrency = sharedStats?.salesByCurrency || {};
    const sumK = Object.entries(salesByCurrency).reduce((acc, [cur, amt]) => acc + ((cur.toUpperCase() === 'K') ? Number(amt) : 0), 0);
    setTotalSalesK(sumK);

  // 5) Incomplete Packages count (filtered by location when selected)
  let ipQuery = supabase.from('incomplete_packages').select('id', { count: 'exact', head: true });
  if (locationId) ipQuery = ipQuery.eq('location_id', locationId);
  const { count: ipCount } = await ipQuery;
  setIncompleteCount(ipCount || 0);
    }
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, locationFilter, dateFrom, dateTo, sharedStats]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (showResetConfirm && e.key === 'Escape') {
        setShowReset(false);
        setShowResetConfirm(false);
        setTyped('');
        return;
      }
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      let next = (typed + e.key).slice(-secret.length);
      setTyped(next);
      if (next === secret) setShowReset(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [typed, showResetConfirm]);

  const isAdmin = user && user.role && user.role.toLowerCase() === 'admin';

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleCompanySettings = () => {
    navigate('/company-settings');
  };


  const handleCustomers = () => {
    navigate('/customers');
  };

  const handleLocations = () => {
    navigate('/locations');
  };

  const handleFactoryReset = () => {
    // Removed: Factory reset logic and button
  };

  const confirmFactoryReset = async () => {
    // Removed: Factory reset logic and button
  };

  // Start a new stocktake period: snapshot current inventory as opening stock for the selected location
  const handleStartPeriod = async () => {
    if (!locationFilter) {
      alert('Please select a location first.');
      return;
    }
    // Guard: prevent starting if there is an opening without a later closed closing session
    try {
      const { data: openings } = await supabase
        .from('opening_stock_sessions')
        .select('id, started_at')
        .eq('location_id', locationFilter)
        .order('started_at', { ascending: false })
        .limit(1);
      const opening = openings && openings[0];
      if (opening) {
        const { data: closings } = await supabase
          .from('closing_stock_sessions')
          .select('id')
          .eq('location_id', locationFilter)
          .eq('status', 'closed')
          .gte('ended_at', opening.started_at)
          .limit(1);
        const hasClosed = closings && closings.length > 0;
        if (!hasClosed) {
          alert('A period is already open for this location. Please submit Closing Stock and end the period before starting a new one.');
          return;
        }
      }
    } catch (_) {
      // If guard check fails silently continue to confirmation
    }
    if (!window.confirm('Start a new period for the selected location? This will snapshot current stock as Opening Stock.')) return;
    setPeriodBusy(true);
    setPeriodMsg('Starting period...');
    try {
      const now = new Date().toISOString();
      // Create opening session (mark as submitted so imports are treated as adjustments later)
      const { data: openingSession, error: openErr } = await supabase
        .from('opening_stock_sessions')
        .insert({ location_id: locationFilter, started_at: now, status: 'submitted' })
        .select()
        .single();
      if (openErr) throw openErr;
      const sessionId = openingSession.id;
      // Fetch all product ids
      const { data: prodRows, error: prodErr } = await supabase
        .from('products')
        .select('id');
      if (prodErr) throw prodErr;
      const productIds = (prodRows || []).map(p => p.id);
      // Fetch inventory for selected location
      const { data: invRows, error: invErr } = await supabase
        .from('inventory')
        .select('product_id, quantity')
        .eq('location', locationFilter);
      if (invErr) throw invErr;
      const invMap = new Map((invRows || []).map(r => [String(r.product_id), Number(r.quantity) || 0]));
      // Build opening entries (include all products; default 0)
  const entries = productIds.map(pid => ({ id: uuidv4(), session_id: sessionId, product_id: pid, qty: invMap.get(String(pid)) || 0 }));
      // Insert in chunks to avoid payload limits
      const chunkSize = 500;
      for (let i = 0; i < entries.length; i += chunkSize) {
        const chunk = entries.slice(i, i + chunkSize);
        const { error: insErr } = await supabase.from('opening_stock_entries').insert(chunk);
        if (insErr) throw insErr;
      }
      setPeriodMsg('Period started. Opening stock captured.');
      alert('Period started successfully. Opening stock captured for this location.');
  // Refresh widget
  setPeriodInfo({ opening: now, closing: null, status: 'open' });
    } catch (err) {
      console.error(err);
      alert('Failed to start period: ' + (err.message || err));
    } finally {
      setPeriodBusy(false);
    }
  };

  // End the current stocktake period: ensure latest closing stock (from Closing Stock) is applied to inventory
  const handleEndPeriod = async () => {
    if (!locationFilter) {
      alert('Please select a location first.');
      return;
    }
    if (!window.confirm('End the current period for the selected location? This will set inventory to the submitted Closing Stock (missing items -> 0).')) return;
    setPeriodBusy(true);
    setPeriodMsg('Ending period...');
    try {
      // Find latest opening session for this location
      const { data: openings } = await supabase
        .from('opening_stock_sessions')
        .select('id, started_at')
        .eq('location_id', locationFilter)
        .order('started_at', { ascending: false })
        .limit(1);
      const opening = openings && openings[0];
      if (!opening) {
        alert('No opening period found for this location. Start a period first.');
        setPeriodBusy(false);
        return;
      }
      // Find latest closed closing session after opening start
      const { data: closings } = await supabase
        .from('closing_stock_sessions')
        .select('id, ended_at, status')
        .eq('location_id', locationFilter)
        .eq('status', 'closed')
        .gte('ended_at', opening.started_at)
        .order('ended_at', { ascending: false })
        .limit(1);
      const closing = closings && closings[0];
      if (!closing) {
        alert('No submitted Closing Stock found. Please submit Closing Stock first (Closing Stock page).');
        setPeriodBusy(false);
        return;
      }
      // Fetch closing entries for this session
      const { data: closeEntries } = await supabase
        .from('closing_stock_entries')
        .select('product_id, qty')
        .eq('session_id', closing.id);
      const closeMap = new Map((closeEntries || []).map(e => [String(e.product_id), Number(e.qty) || 0]));
      // Fetch all product ids
      const { data: prodRows } = await supabase.from('products').select('id');
      const pids = (prodRows || []).map(p => p.id);
      // Fetch existing inventory rows for location
      const { data: invRows } = await supabase
        .from('inventory')
        .select('id, product_id, quantity')
        .eq('location', locationFilter);
      const invByPid = new Map((invRows || []).map(r => [String(r.product_id), r]));
      // Apply closing stock to inventory (missing -> 0)
      for (const pid of pids) {
        const desired = closeMap.get(String(pid)) || 0;
        const existing = invByPid.get(String(pid));
        if (existing) {
          if (Number(existing.quantity) !== desired) {
            await supabase.from('inventory').update({ quantity: desired }).eq('id', existing.id);
          }
        } else {
          await supabase.from('inventory').insert({ product_id: pid, location: locationFilter, quantity: desired });
        }
      }
      setPeriodMsg('Period closed. Inventory synced to Closing Stock.');
      alert('Period ended successfully. Inventory has been set to Closing Stock values.');
  // Refresh widget
  setPeriodInfo(prev => ({ opening: prev.opening, closing: closing.ended_at, status: 'closed' }));
    } catch (err) {
      console.error(err);
      alert('Failed to end period: ' + (err.message || err));
    } finally {
      setPeriodBusy(false);
    }
  };


  if (loading) {
    return <div style={{ textAlign: 'center', marginTop: 80, fontSize: 22 }}>Loading...</div>;
  }

  if (!user) return null;

  return (
    <>


  <div className="dashboard-container">
        <div className="dashboard-header">
          <h1>Dashboard</h1>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>


        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 16, flexWrap: 'wrap' }}>
          <button className="dashboard-page-btn gray" onClick={handleCompanySettings} style={{ marginRight: 8 }}>
            <FaCogs size={24} style={{ marginRight: 6 }} />
            Company Settings
          </button>
          {/* Inline filters next to Company Settings */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label htmlFor="dash-location" style={{ fontSize: 13 }}>Location:</label>
              <select
                id="dash-location"
                value={locationFilter}
                onChange={e => setLocationFilter(e.target.value)}
                style={{ padding: '4px 6px' }}
              >
                <option value="">All</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label htmlFor="dash-from" style={{ fontSize: 13 }}>From:</label>
              <input id="dash-from" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label htmlFor="dash-to" style={{ fontSize: 13 }}>To:</label>
              <input id="dash-to" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className="dashboard-page-btn gray"
                onClick={handleStartPeriod}
                disabled={periodBusy}
                title="Start a new stocktake period (captures Opening Stock from current inventory)"
              >
                Start Period
              </button>
              <button
                className="dashboard-page-btn gray"
                onClick={handleEndPeriod}
                disabled={periodBusy}
                title="End current period (sets inventory to Closing Stock values)"
              >
                End Period
              </button>
              {periodMsg && (
                <span style={{ fontSize: 12, color: '#9aa4b2' }}>{periodMsg}</span>
              )}
              {/* Period Status Widget */}
              {locationFilter && (
                <div style={{ marginLeft: 8, padding: '6px 10px', border: '1px solid #00b4d8', borderRadius: 6, color: '#e0e6ed', background: '#23272f' }}>
                  <div style={{ fontSize: 12, marginBottom: 2 }}>Period Status</div>
                  <div style={{ fontSize: 12 }}>Opening: {periodInfo.opening ? new Date(periodInfo.opening).toLocaleString() : '-'}</div>
                  <div style={{ fontSize: 12 }}>Closing: {periodInfo.closing ? new Date(periodInfo.closing).toLocaleString() : (periodInfo.status === 'open' ? 'Not closed' : '-')}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Statistics section */}
        <div style={{ width: '100%', marginTop: 18, marginBottom: 8 }}>
          {(() => {
            const stats = [
              {
                key: 'Products Quantity Stat',
                icon: <FaBox size={28} color="#00bfff" />,
                title: 'Products Quantity',
                value: productStats.qty
              },
              {
                key: 'Products Total Cost (K) Stat',
                icon: <FaBox size={28} color="#4CAF50" />,
                title: 'Products Total Cost (K)',
                value: productStats.costK + ' K'
              },
              // Removed Products Total Cost ($) card as requested
              {
                key: 'Units On Hand Stat',
                icon: <FaBox size={28} color="#9c27b0" />,
                title: 'Units On Hand',
                value: productStats.unitsOnHand
              },
              {
                key: 'Last Stocktake Stat',
                icon: <FaRegEdit size={28} color="#00b4d8" />,
                title: 'Last Stocktake',
                value: lastStockDate ? new Date(lastStockDate).toLocaleString() : 'No stocktake yet'
              },
              {
                key: 'Customer Due Total (K) Stat',
                icon: <FaCashRegister size={28} color="#00bfff" />,
                title: 'Customer Due Total (K)',
                value: dueTotals.K.toLocaleString() + ' K'
              },
              {
                key: 'Customer Due Total ($) Stat',
                icon: <FaCashRegister size={28} color="#4CAF50" />,
                title: 'Customer Due Total ($)',
                value: dueTotals.USD.toLocaleString() + ' $'
              },
              {
                key: 'Total Sales Stat',
                icon: <FaChartLine size={28} color="#FFD700" />,
                title: 'Total Sales',
                value: totalSalesK.toLocaleString() + ' K'
              },
              {
                key: 'Incomplete Packages Stat',
                icon: <FaBox size={28} color="#ff9800" />,
                title: 'Incomplete Packages',
                value: incompleteCount
              }
            ];
            return (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {stats.map(stat =>
                  (isAdmin) && (
                    <div key={stat.key} style={{ flex: 1, minWidth: 0, maxWidth: '100%', fontSize: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', wordBreak: 'break-word' }}>
                      {stat.icon}
                      <h2 style={{ fontSize: 15, textAlign: 'center', margin: '6px 0 2px 0' }}>{stat.title}</h2>
                      <p>{stat.value}</p>
                    </div>
                  )
                )}
              </div>
            );
          })()}
        </div>

        {/* Module navigation buttons: admin sees all, others see only permitted */}
        <div style={{ width: '100%', marginTop: 18, marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {MODULES.map(module => {
            const Icon = module.icon;
            return (
              <button
                key={module.name}
                className="dashboard-page-btn gray"
                style={{ margin: 4, fontWeight: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => navigate(module.route)}
              >
                <Icon size={22} style={{ marginBottom: 4 }} />
                <span>{module.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default Dashboard;
