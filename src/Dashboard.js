
import React, { useState, useEffect } from 'react';
import supabase from './supabase';
import { useNavigate } from 'react-router-dom';
import { FaBox, FaChartLine, FaUsers, FaCogs, FaMapMarkerAlt, FaTags, FaFlask, FaRegEdit, FaExchangeAlt, FaCashRegister } from 'react-icons/fa';
import './Dashboard.css';
// Dummy totalSales, replace with real calculation if needed
const totalSales = 0;

// Dummy canAccessModule, replace with real permission logic if needed
const canAccessModule = (moduleName) => {
  // Example: allow all modules for now
  return true;
};

// Dummy canShowVarianceReport, replace with real logic if needed
const canShowVarianceReport = true;

// List of modules/pages and their dashboard routes
const MODULES = [
  { name: 'Products', route: '/products' },
  { name: 'Categories', route: '/categories' },
  { name: 'Customers', route: '/customers' },
  { name: 'Sales', route: '/pos' },
  { name: 'Laybys', route: '/layby-management' },
  { name: 'Stocktake', route: '/opening-stock' },
  { name: 'Stock Transfers', route: '/transfer' },
  { name: 'Reports', route: '/sales-report' },
  { name: 'Company Settings', route: '/company-settings' },

  { name: 'Sets', route: '/sets' },
  { name: 'Units of Measure', route: '/units-of-measure' },
  { name: 'Stock Viewer', route: '/stock-viewer' },
  { name: 'Transfer List', route: '/transfers' },
  { name: 'Closing Stock', route: '/closing-stock' },
];

const Dashboard = () => {


  // Helper functions that use navigate
  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleCompanySettings = () => {
    navigate('/company-settings');
  };

  // All hooks at the top level
  // Remove permissions state
  const [user, setUser] = useState(null);
  const [showReset, setShowReset] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const secret = 'azili';
  const [typed, setTyped] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState('');
  const [locations, setLocations] = useState([]);
  const [locationFilter, setLocationFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [productStats, setProductStats] = useState({ qty: 0, costK: 0, cost$: 0 });
  const [lastStockDate, setLastStockDate] = useState(null);

  const [dueTotals, setDueTotals] = useState({ K: 0, $: 0 });
  const navigate = useNavigate();

  // Fetch locations for dropdown
  useEffect(() => {
    async function fetchLocations() {
      const { data, error } = await supabase.from('locations').select('id, name');
      if (!error && data) setLocations(data);
      else setLocations([]);
    }
    fetchLocations();
  }, []);

  useEffect(() => {
    // Get user from localStorage
    const userData = localStorage.getItem('user');
    if (userData) setUser(JSON.parse(userData));
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
    // eslint-disable-next-line
  }, [typed, showResetConfirm]);





  const handleCustomers = () => {
    navigate('/customers');
  };

  const handleLocations = () => {
    navigate('/locations');
  };


  // Factory Reset Handlers
  const handleFactoryReset = () => {
    setShowResetConfirm(true);
  };

  const confirmFactoryReset = async () => {
    // Example: Clear all tables and localStorage, then reload
    // You should add confirmation and actual Supabase delete logic as needed
    try {
      // Optionally, call Supabase to delete all data (dangerous!)
      // await supabase.from('products').delete().neq('id', 0);
      // ...repeat for other tables as needed
      localStorage.clear();
      window.location.reload();
    } catch (err) {
      alert('Factory reset failed: ' + err.message);
    }
  };

  // Fetch and filter product statistics by location and date
  useEffect(() => {
    async function fetchProductStats() {
      // Build inventory query
      let inventoryQuery = supabase.from('inventory').select('product_id, quantity, location');
      if (locationFilter) inventoryQuery = inventoryQuery.eq('location', locationFilter);
      const { data: inventoryRows, error: invError } = await inventoryQuery;
      if (invError) {
        setProductStats({ qty: 0, costK: 0, cost$: 0 });
        return;
      }

      // Get all product IDs in inventory
      const productIds = Array.from(new Set((inventoryRows || []).map(row => row.product_id)));
      if (productIds.length === 0) {
        setProductStats({ qty: 0, costK: 0, cost$: 0 });
        return;
      }

      // Fetch product details for these IDs
      const { data: products, error: prodError } = await supabase
        .from('products')
        .select('id, standard_price, price, promotional_price, currency')
        .in('id', productIds);
      if (prodError) {
        setProductStats({ qty: 0, costK: 0, cost$: 0 });
        return;
      }

      // Build product map for price/currency lookup
      const productMap = {};
      (products || []).forEach(p => { productMap[p.id] = p; });

      // Aggregate stats
      let qty = 0, costK = 0, cost$ = 0;
      (inventoryRows || []).forEach(row => {
        const prod = productMap[row.product_id];
        if (!prod) return;
        const quantity = Number(row.quantity) || 0;
        qty += quantity;
        // Use promotional price if available, else standard, else price
        let price = prod.promotional_price || prod.standard_price || prod.price || 0;
        if (prod.currency === 'K') costK += price * quantity;
        else if (prod.currency === '$') cost$ += price * quantity;
        else costK += price * quantity; // Default to K if currency missing
      });
      setProductStats({ qty, costK, cost$: cost$ });
    }
    fetchProductStats();
  }, [locationFilter, dateFrom, dateTo]);

  // Password generator state
  const [showPasswordGen, setShowPasswordGen] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');

  // Password generator handler (overwrites row with id=1 in closing_stock_password table)
  const handleGeneratePassword = async () => {
    // Generate a random 6-digit password
    const pwd = Math.floor(100000 + Math.random() * 900000).toString();
    // Upsert (insert or update) the password at id=1
    const { error: upsertError } = await supabase
      .from('closing_stock_password')
      .upsert([{ id: 1, password: pwd, created_at: new Date().toISOString() }], { onConflict: ['id'] });
    if (upsertError) {
      alert('Failed to save password to database: ' + upsertError.message);
      return;
    }
    setGeneratedPassword(pwd);
    setShowPasswordGen(true);
  };

  const handleClosePasswordGen = () => {
    setShowPasswordGen(false);
    setGeneratedPassword('');
  };

  return (
    <div className="dashboard-container">
      {/* Secret Factory Reset Button */}
      {showReset && !showResetConfirm && (
        <button
          style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, background: '#b71c1c', color: '#fff', fontWeight: 'bold', padding: '14px 28px', borderRadius: 8, border: 'none', fontSize: 18, boxShadow: '0 2px 8px #0008', cursor: 'pointer' }}
          onClick={handleFactoryReset}
        >
          FACTORY RESET
        </button>
      )}
      {showReset && showResetConfirm && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 10000, background: '#fff', color: '#b71c1c', fontWeight: 'bold', padding: '22px 32px', borderRadius: 10, border: '2px solid #b71c1c', fontSize: 18, boxShadow: '0 2px 12px #000a', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ marginBottom: 16, textAlign: 'center' }}>Are you absolutely sure?<br/>This will <span style={{ color: '#b71c1c', fontWeight: 'bold' }}>delete ALL data</span> and cannot be undone!</div>
          <div style={{ display: 'flex', gap: 16 }}>
            <button style={{ background: '#b71c1c', color: '#fff', fontWeight: 'bold', padding: '10px 22px', borderRadius: 8, border: 'none', fontSize: 17, cursor: 'pointer' }} onClick={confirmFactoryReset}>Yes, Reset</button>
            <button style={{ background: '#888', color: '#fff', fontWeight: 'bold', padding: '10px 22px', borderRadius: 8, border: 'none', fontSize: 17, cursor: 'pointer' }} onClick={() => { setShowReset(false); setShowResetConfirm(false); setTyped(''); }}>Cancel (Esc)</button>
          </div>
        </div>
      )}
      <div className="dashboard-banner">
        <span>Welcome{fullName ? `, ${fullName}` : ''}!</span>
      </div>
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <button className="logout-btn" onClick={handleLogout}>Logout</button>
      </div>

      {/* Password Generator Button moved to dashboard row below */}

      {/* Password Modal */}
      {showPasswordGen && (
        <div style={{position:'fixed', top:0, left:0, width:'100vw', height:'100vh', background:'rgba(0,0,0,0.6)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center'}}>
          <div style={{background:'#23272f', borderRadius:12, padding:32, minWidth:320, color:'#e0e6ed', boxShadow:'0 2px 16px #000a', display:'flex', flexDirection:'column', alignItems:'center'}}>
            <h2 style={{marginTop:0, marginBottom:12}}>Closing Stock Password</h2>
            <div style={{fontSize:'2.2em', fontWeight:700, letterSpacing:2, marginBottom:16, color:'#00b4d8'}}>{generatedPassword}</div>
            <div style={{marginBottom:18, color:'#aaa', fontSize:'1em'}}>Share this password with authorized staff only.<br/>It is now required to access the Closing Stock page.</div>
            <button onClick={handleClosePasswordGen} style={{padding:'8px 22px', borderRadius:7, background:'#00b4d8', color:'#fff', fontWeight:600, fontSize:'1.1em', border:'none', cursor:'pointer'}}>Close</button>
          </div>
        </div>
      )}
      {/* Filters and Company Settings - only one set */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 16 }}>
        <button className="dashboard-page-btn gray" onClick={handleCompanySettings} style={{ marginRight: 8 }}>
          <FaCogs size={24} style={{ marginRight: 6 }} />
          Company Settings
        </button>
        <div className="dashboard-filters-row" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 24, width: '100%' }}>
          <label style={{ display: 'flex', alignItems: 'center', fontWeight: 500, fontSize: 16, marginRight: 0 }}>
            Location:
            <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} style={{ marginLeft: 8, minWidth: 160, height: 44, fontSize: 15, boxSizing: 'border-box' }}>
              <option value="">All Locations</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', fontWeight: 500, fontSize: 16, marginRight: 0 }}>
            From:
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ marginLeft: 8, height: 44, fontSize: 15, minWidth: 160, boxSizing: 'border-box', width: 160 }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', fontWeight: 500, fontSize: 16, marginRight: 0 }}>
            To:
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ marginLeft: 8, height: 44, fontSize: 15, minWidth: 160, boxSizing: 'border-box', width: 160 }} />
          </label>
          {/* Show User Access Control button for admin only, next to To date */}
          {user?.role === 'admin' && (
            <div style={{ marginLeft: 12 }}>
              {/* UserAccessControlBtn removed */}
            </div>
          )}
        </div>
      </div>

      {/* Statistics with Links */}
      <div className="statistics-container" style={{ width: '100%', margin: '0 auto', maxWidth: 1200 }}>
        <div style={{ flex: 1, minWidth: 0, maxWidth: '100%', fontSize: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', wordBreak: 'break-word' }}>
          <FaBox size={28} color="#00bfff" />
          <h2 style={{ fontSize: 15, textAlign: 'center', margin: '6px 0 2px 0' }}>Products Quantity</h2>
          <p>{productStats.qty}</p>
        </div>
        <div style={{ flex: 1, minWidth: 0, maxWidth: '100%', fontSize: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', wordBreak: 'break-word' }}>
          <FaBox size={28} color="#4CAF50" />
          <h2 style={{ fontSize: 15, textAlign: 'center', margin: '6px 0 2px 0' }}>Products Total Cost (K)</h2>
          <p>{productStats.costK} K</p>
        </div>
        <div style={{ flex: 1, minWidth: 0, maxWidth: '100%', fontSize: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', wordBreak: 'break-word' }}>
          <FaBox size={28} color="#ff4d4d" />
          <h2 style={{ fontSize: 15, textAlign: 'center', margin: '6px 0 2px 0' }}>Products Total Cost ($)</h2>
          <p>{productStats.cost$} $</p>
        </div>
        <div style={{ flex: 1, minWidth: 0, maxWidth: '100%', fontSize: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', wordBreak: 'break-word' }}>
          <FaRegEdit size={28} color="#00b4d8" />
          <h2 style={{ fontSize: 15, textAlign: 'center', margin: '6px 0 2px 0' }}>Last Stocktake</h2>
          <p>{lastStockDate ? new Date(lastStockDate).toLocaleString() : 'No stocktake yet'}</p>
        </div>
        {/* Customer Due Totals (K & $) */}
        <div style={{ flex: 1, minWidth: 0, maxWidth: '100%', fontSize: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', wordBreak: 'break-word' }}>
          <FaCashRegister size={28} color="#00bfff" />
          <h2 style={{ fontSize: 15, textAlign: 'center', margin: '6px 0 2px 0' }}>Customer Due Total (K)</h2>
          <p>{dueTotals.K.toLocaleString()} K</p>
        </div>
        <div style={{ flex: 1, minWidth: 0, maxWidth: '100%', fontSize: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', wordBreak: 'break-word' }}>
          <FaCashRegister size={28} color="#4CAF50" />
          <h2 style={{ fontSize: 15, textAlign: 'center', margin: '6px 0 2px 0' }}>Customer Due Total ($)</h2>
          <p>{dueTotals.$.toLocaleString()} $</p>
        </div>
        {/* Total Sales Stat */}
        <div style={{ flex: 1, minWidth: 0, maxWidth: '100%', fontSize: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', wordBreak: 'break-word' }}>
          <FaChartLine size={28} color="#FFD700" />
          <h2 style={{ fontSize: 15, textAlign: 'center', margin: '6px 0 2px 0' }}>Total Sales</h2>
          <p>{totalSales.toLocaleString()} K</p>
        </div>
        {/* Add more stats/links as needed from your app */}
      </div>

      {/* Main Icon Rows - Arranged as requested */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 12, marginTop: 18, marginBottom: 8, width: '100%' }}>
        {/* All dashboard buttons in a single row, no horizontal scroll */}
        {canAccessModule('Locations') && (
          <button className="dashboard-page-btn gray" style={{ width: 130, height: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', whiteSpace: 'normal', textAlign: 'center', wordBreak: 'break-word', padding: 0 }} onClick={handleLocations}>
            <FaMapMarkerAlt size={32} />
            <span style={{ fontSize: 13, marginTop: 2 }}>Locations</span>
          </button>
        )}
        {canAccessModule('Categories') && (
          <button className="dashboard-page-btn gray" style={{ width: 130, height: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', whiteSpace: 'normal', textAlign: 'center', wordBreak: 'break-word', padding: 0 }} onClick={() => navigate('/categories')}>
            <FaBox size={32} />
            <span style={{ fontSize: 13, marginTop: 2 }}>Categories</span>
          </button>
        )}
        {canAccessModule('Products') && (
          <button className="dashboard-page-btn gray" style={{ width: 130, height: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', whiteSpace: 'normal', textAlign: 'center', wordBreak: 'break-word', padding: 0 }} onClick={() => navigate('/products')}>
            <FaTags size={32} />
            <span style={{ fontSize: 13, marginTop: 2 }}>Products</span>
          </button>
        )}
        {canAccessModule('Sets') && (
          <button className="dashboard-page-btn gray" style={{ width: 130, height: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', whiteSpace: 'normal', textAlign: 'center', wordBreak: 'break-word', padding: 0 }} onClick={() => navigate('/sets')}>
            <FaBox size={32} />
            <span style={{ fontSize: 13, marginTop: 2 }}>Sets</span>
          </button>
        )}
        {canAccessModule('Units of Measure') && (
          <button className="dashboard-page-btn gray" style={{ width: 130, height: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', whiteSpace: 'normal', textAlign: 'center', wordBreak: 'break-word', padding: 0 }} onClick={() => navigate('/units-of-measure')}>
            <FaFlask size={32} />
            <span style={{ fontSize: 13, marginTop: 2 }}>Units of Measure</span>
          </button>
        )}
        {canAccessModule('Stocktake') && (
          <button className="dashboard-page-btn gray" style={{ width: 130, height: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', whiteSpace: 'normal', textAlign: 'center', wordBreak: 'break-word', padding: 0 }} onClick={() => navigate('/opening-stock')}>
            <FaRegEdit size={32} />
            <span style={{ fontSize: 13, marginTop: 2 }}>Opening Stock</span>
          </button>
        )}
        {canAccessModule('Stock Transfers') && (
          <button className="dashboard-page-btn gray" style={{ width: 130, height: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', whiteSpace: 'normal', textAlign: 'center', wordBreak: 'break-word', padding: 0 }} onClick={() => navigate('/transfer')}>
            <FaExchangeAlt size={32} />
            <span style={{ fontSize: 13, marginTop: 2 }}>Stock Transfer</span>
          </button>
        )}
        {canAccessModule('Transfer List') && (
          <button className="dashboard-page-btn gray" style={{ width: 130, height: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', whiteSpace: 'normal', textAlign: 'center', wordBreak: 'break-word', padding: 0 }} onClick={() => navigate('/transfers')}>
            <FaExchangeAlt size={32} />
            <span style={{ fontSize: 13, marginTop: 2 }}>Edit Transfers</span>
          </button>
        )}
        {canAccessModule('Closing Stock') && (
          <button className="dashboard-page-btn gray" style={{ width: 130, height: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', whiteSpace: 'normal', textAlign: 'center', wordBreak: 'break-word', padding: 0 }} onClick={() => navigate('/closing-stock')}>
            <FaRegEdit size={32} />
            <span style={{ fontSize: 13, marginTop: 2 }}>Closing Stock</span>
          </button>
        )}
        {canAccessModule('Customers') && (
          <button className="dashboard-page-btn gray" style={{ width: 130, height: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', whiteSpace: 'normal', textAlign: 'center', wordBreak: 'break-word', padding: 0 }} onClick={handleCustomers}>
            <FaUsers size={32} />
            <span style={{ fontSize: 13, marginTop: 2 }}>Customers</span>
          </button>
        )}
        {canAccessModule('Sales') && (
          <button className="dashboard-page-btn gray" style={{ width: 130, height: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', whiteSpace: 'normal', textAlign: 'center', wordBreak: 'break-word', padding: 0 }} onClick={() => navigate('/pos')} title="Point of Sale">
            <span style={{ fontSize: 18, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="1.7em" height="1.7em" viewBox="0 0 24 24" fill="none"><path d="M3 19V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Zm2 0h14V7H5v12Zm2-8h2v2H7v-2Zm4 0h2v2h-2v-2Zm4 0h2v2h-2v-2Z" fill="#fff"/></svg>
              <span style={{ fontSize: 13, marginTop: 2 }}>POS</span>
            </span>
          </button>
        )}
        {canAccessModule('Laybys') && (
          <button className="dashboard-page-btn gray" style={{ width: 130, height: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', whiteSpace: 'normal', textAlign: 'center', wordBreak: 'break-word', padding: 0 }} onClick={() => navigate('/layby-management')} title="Layby Management">
            <FaCashRegister size={22} style={{ marginBottom: 2 }} />
            <span style={{ fontSize: 13, marginTop: 2 }}>Layby Management</span>
          </button>
        )}
        {canAccessModule('Reports') && (
          <button className="dashboard-page-btn gray" style={{ width: 130, height: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', whiteSpace: 'normal', textAlign: 'center', wordBreak: 'break-word', padding: 0 }} onClick={() => navigate('/sales-report')} title="Sales Report">
            <FaChartLine size={22} style={{ marginBottom: 2 }} />
            <span style={{ fontSize: 13, marginTop: 2 }}>Sales Report</span>
          </button>
        )}
        {canAccessModule('Reports') && (
          <button className="dashboard-page-btn gray" style={{ width: 130, height: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', whiteSpace: 'normal', textAlign: 'center', wordBreak: 'break-word', padding: 0 }} onClick={() => navigate('/stock-report')} title="Stock Report">
            <FaBox size={22} style={{ marginBottom: 2 }} />
            <span style={{ fontSize: 13, marginTop: 2 }}>Stock Report</span>
          </button>
        )}
        {canAccessModule('Reports') && (
          // Layby Report button removed as requested
          <></>
        )}
        {canAccessModule('Reports') && (
          <button className="dashboard-page-btn gray" style={{ width: 130, height: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', whiteSpace: 'normal', textAlign: 'center', wordBreak: 'break-word', padding: 0 }} onClick={() => navigate('/stocktake-report')} title="Stocktake Report">
            <FaRegEdit size={22} style={{ marginBottom: 2 }} />
            <span style={{ fontSize: 13, marginTop: 2 }}>Stocktake Report</span>
          </button>
        )}
        {/* Password Generator button always at the end */}
        <button
          className="dashboard-page-btn gray"
          style={{ width: 180, height: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', whiteSpace: 'normal', textAlign: 'center', wordBreak: 'break-word', padding: 0, marginLeft: 4 }}
          onClick={handleGeneratePassword}
          title="Password Generator"
        >
          <FaRegEdit size={22} style={{ marginBottom: 2 }} />
          <span style={{ fontSize: 13, marginTop: 2 }}>Password Generator</span>
        </button>
        {/* Variance Report button removed as requested */}
      </div>
    </div>
  );
}

export default Dashboard;
