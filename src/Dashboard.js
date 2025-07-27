import React, { useState, useEffect } from 'react';
import supabase from './supabase';
import { useNavigate } from 'react-router-dom';
import { FaBox, FaChartLine, FaUsers, FaCogs, FaMapMarkerAlt, FaTags, FaFlask, FaRegEdit, FaExchangeAlt } from 'react-icons/fa'; // Import React Icons
import './Dashboard.css'; // Import the CSS file

const Dashboard = ({ user }) => {
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState('');
  const [locations, setLocations] = useState([]);
  const [locationFilter, setLocationFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [productStats, setProductStats] = useState({ qty: 0, costK: 0, cost$: 0 });
  const [lastStockDate, setLastStockDate] = useState(null);
  const [canShowVarianceReport, setCanShowVarianceReport] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    async function checkClosingStock() {
      if (!locationFilter) {
        setCanShowVarianceReport(false);
        return;
      }
      // Check if a closing stocktake exists for the selected location
      const { data: closingStock } = await supabase
        .from('stocktakes')
        .select('id')
        .eq('location_id', locationFilter)
        .eq('type', 'closing')
        .order('ended_at', { ascending: false })
        .limit(1);
      setCanShowVarianceReport(!!(closingStock && closingStock.length > 0));
    }
    checkClosingStock();
  }, [locationFilter, dateFilter]);
  // Fetch locations for filter
  useEffect(() => {
    supabase.from('locations').select('id, name').then(({ data }) => setLocations(data || []));
  }, []);

  // Fetch product stats and last stocktake date when filters change
  useEffect(() => {
    const fetchStats = async () => {
      let query = supabase.from('products').select('*');
      // No direct date/location filter in schema, but placeholder for future
      const { data: products } = await query;
      let qty = 0, costK = 0, cost$ = 0;
      if (products) {
        qty = products.length;
        for (const p of products) {
          if (p.currency === 'K') costK += Number(p.cost_price || 0);
          if (p.currency === '$') cost$ += Number(p.cost_price || 0);
        }
      }
      setProductStats({ qty, costK, cost$ });

      // Fetch last stocktake date
      let stocktakeQuery = supabase
        .from('stocktakes')
        .select('ended_at')
        .order('ended_at', { ascending: false })
        .limit(1);
      if (locationFilter) {
        stocktakeQuery = stocktakeQuery.eq('location_id', locationFilter);
      }
      const { data: stocktakes } = await stocktakeQuery;
      setLastStockDate(stocktakes && stocktakes[0] && stocktakes[0].ended_at ? stocktakes[0].ended_at : null);
    };
    fetchStats();
  }, [locationFilter, dateFilter]);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name);
    }

    const companySettings = JSON.parse(localStorage.getItem('companySettings'));
    if (companySettings) {
      setCompanyName(companySettings.company_name);
      setCompanyLogo(companySettings.company_logo);
    }
  }, [user]);

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

  return (
    <div className="dashboard-container">
      <div className="dashboard-banner">
        <span>Welcome{fullName ? `, ${fullName}` : ''}!</span>
      </div>
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <button className="logout-btn" onClick={handleLogout}>Logout</button>
      </div>

      {/* Filters */}
      <div className="dashboard-filters-row">
        <label>Location:
          <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)}>
            <option value="">All Locations</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </label>
        <label>Date:
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
        </label>
      </div>
      <div className="statistics-container">
        <div>
          <FaBox size={40} color="#00bfff" />
          <h2>Products Quantity</h2>
          <p>{productStats.qty}</p>
        </div>
        <div>
          <FaBox size={40} color="#4CAF50" />
          <h2>Products Total Cost (K)</h2>
          <p>{productStats.costK} K</p>
        </div>
        <div>
          <FaBox size={40} color="#ff4d4d" />
          <h2>Products Total Cost ($)</h2>
          <p>{productStats.cost$} $</p>
        </div>
        <div>
          <FaRegEdit size={40} color="#00b4d8" />
          <h2>Last Stocktake</h2>
          <p>{lastStockDate ? new Date(lastStockDate).toLocaleString() : 'No stocktake yet'}</p>
        </div>
      </div>

      <div className="dashboard-pages-row">
        <button className="dashboard-page-btn gray" onClick={handleCompanySettings}>
          <FaCogs size={32} />
          <span>Company Settings</span>
        </button>
        <button className="dashboard-page-btn gray" onClick={handleCustomers}>
          <FaUsers size={32} />
          <span>Customers</span>
        </button>
        <button className="dashboard-page-btn gray" onClick={handleLocations}>
          <FaMapMarkerAlt size={32} />
          <span>Locations</span>
        </button>
        <button className="dashboard-page-btn gray" onClick={() => navigate('/categories')}>
          <FaBox size={32} />
          <span>Categories</span>
        </button>
        <button className="dashboard-page-btn gray" onClick={() => navigate('/products')}>
          <FaTags size={32} />
          <span>Products</span>
        </button>
        <button className="dashboard-page-btn gray" onClick={() => navigate('/units-of-measure')}>
          <FaFlask size={32} />
          <span>Units of Measure</span>
        </button>
        <button className="dashboard-page-btn gray" onClick={() => navigate('/opening-stock')}>
          <FaRegEdit size={32} />
          <span>Opening Stock</span>
        </button>
        <button className="dashboard-page-btn gray" onClick={() => navigate('/closing-stock')}>
          <FaRegEdit size={32} />
          <span>Closing Stock</span>
        </button>
        <button className="dashboard-page-btn gray" onClick={() => navigate('/transfer')}>
          <FaExchangeAlt size={32} />
          <span>New Transfer</span>
        </button>
        <button className="dashboard-page-btn gray" onClick={() => navigate('/transfers')}>
          <FaExchangeAlt size={32} />
          <span>Edit Transfers</span>
        </button>
        <button className="dashboard-page-btn gray" onClick={() => navigate('/sets')}>
          <FaBox size={32} />
          <span>Create Kit/Set</span>
        </button>
        <button className="dashboard-page-btn gray" onClick={() => navigate('/stock-viewer')}>
          <FaChartLine size={32} />
          <span>Stock Viewer</span>
        </button>
        <button
          className="dashboard-page-btn gray"
          style={{ opacity: canShowVarianceReport ? 1 : 0.5, pointerEvents: canShowVarianceReport ? 'auto' : 'none' }}
          onClick={async () => {
            // Find the latest opening and closing stocktake IDs for the selected location
            const { data: opening } = await supabase
              .from('stocktakes')
              .select('id')
              .eq('location_id', locationFilter)
              .eq('type', 'opening')
              .order('started_at', { ascending: false })
              .limit(1);
            const { data: closing } = await supabase
              .from('stocktakes')
              .select('id')
              .eq('location_id', locationFilter)
              .eq('type', 'closing')
              .order('ended_at', { ascending: false })
              .limit(1);
            if (opening && opening.length && closing && closing.length) {
              navigate(`/variance-report?locationId=${locationFilter}&openingStockId=${opening[0].id}&closingStockId=${closing[0].id}`);
            }
          }}
          disabled={!canShowVarianceReport}
        >
          <FaChartLine size={32} />
          <span>Variance Report</span>
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
