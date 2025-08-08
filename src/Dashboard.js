// src/Dashboard.js

import React, { useState, useEffect } from 'react';
import supabase from './supabase';
import { useNavigate } from 'react-router-dom';
import {
  FaBox, FaChartLine, FaUsers, FaCogs, FaMapMarkerAlt, FaTags, FaFlask,
  FaRegEdit, FaExchangeAlt, FaCashRegister, FaUserShield
} from 'react-icons/fa';
// Removed user permissions and permissionUtils logic
import './Dashboard.css';

const totalSales = 0;

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
  const [productStats, setProductStats] = useState({ qty: 0, costK: 0, costUSD: 0 });
  const [dueTotals, setDueTotals] = useState({ K: 0, USD: 0 });
  const [lastStockDate, setLastStockDate] = useState(null);
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
        <div className="dashboard-banner">
          <span>Welcome{fullName ? `, ${fullName}` : ''}!</span>
        </div>
        <div className="dashboard-header">
          <h1>Dashboard</h1>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>


        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 16 }}>
          <button className="dashboard-page-btn gray" onClick={handleCompanySettings} style={{ marginRight: 8 }}>
            <FaCogs size={24} style={{ marginRight: 6 }} />
            Company Settings
          </button>
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
              {
                key: 'Products Total Cost ($) Stat',
                icon: <FaBox size={28} color="#ff4d4d" />,
                title: 'Products Total Cost ($)',
                value: productStats.costUSD + ' $'
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
                value: totalSales.toLocaleString() + ' K'
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
                style={{ minWidth: 120, margin: 4, fontWeight: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 70 }}
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
