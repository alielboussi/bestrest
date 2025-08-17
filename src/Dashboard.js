// src/Dashboard.js

import React, { useState, useEffect } from 'react';
import supabase from './supabase';
import { useNavigate } from 'react-router-dom';
import {
  FaBox, FaChartLine, FaUsers, FaCogs, FaMapMarkerAlt, FaTags, FaFlask,
  FaRegEdit, FaExchangeAlt, FaCashRegister, FaUserShield
} from 'react-icons/fa';
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

  const MODULES = [
    { name: 'locations', label: 'Locations', route: '/locations', icon: FaMapMarkerAlt },
    { name: 'unitsofmeasure', label: 'Units Of Measure', route: '/units-of-measure', icon: FaFlask },
    { name: 'categories', label: 'Categories', route: '/categories', icon: FaBox },
    { name: 'products', label: 'Products', route: '/products', icon: FaTags },
    { name: 'sets', label: 'Sets', route: '/sets', icon: FaBox },
    { name: 'productslist', label: 'Products List', route: '/products-list', icon: FaTags },
    { name: 'openingstock', label: 'Opening Stock', route: '/opening-stock', icon: FaRegEdit },
    { name: 'transfer', label: 'Stock Transfers', route: '/transfer', icon: FaExchangeAlt },
    { name: 'transferlist', label: 'Edit Transfers', route: '/transfers', icon: FaRegEdit },
    { name: 'closingstock', label: 'Closing Stock', route: '/closing-stock', icon: FaRegEdit },
    { name: 'customers', label: 'Customers', route: '/customers', icon: FaUsers },
    { name: 'pos', label: 'Sales', route: '/POS', icon: FaCashRegister },
    { name: 'salesreport', label: 'Sales Report', route: '/sales-report', icon: FaChartLine },
    { name: 'laybymanagement', label: 'Laybys', route: '/layby-management', icon: FaUsers },
    { name: 'stockreport', label: 'Stock Report', route: '/stock-report', icon: FaBox },
  { name: 'stocktakereport', label: 'Stocktake Report', route: '/stocktake-report', icon: FaRegEdit },
  { name: 'pricelabels', label: 'Print Price Labels', route: '/price-labels', icon: FaTags },
  { name: 'incompletepackages', label: 'Incomplete Packages', route: '/incomplete-packages', icon: FaBox },
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

  // 2) Layby dues by currency (use shared statistics for consistency)
  const laybyByCurrency = sharedStats?.laybyByCurrency || {};
  const dueK = Object.entries(laybyByCurrency).reduce((acc, [cur, amt]) => acc + ((cur.toUpperCase() === 'K') ? Number(amt) : 0), 0);
  const dueUSD = Object.entries(laybyByCurrency).reduce((acc, [cur, amt]) => acc + (((cur === '$') || (cur.toUpperCase() === 'USD')) ? Number(amt) : 0), 0);
  setDueTotals({ K: dueK, USD: dueUSD });

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
