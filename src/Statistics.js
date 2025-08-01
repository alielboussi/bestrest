import React, { useState, useEffect } from 'react';
import supabase from './supabase';

const Statistics = () => {
  const [dateFilter, setDateFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [stats, setStats] = useState({
    totalSales: 0,
    mostSoldProduct: '',
    leastSoldProduct: '',
    laybyDue: 0,
    totalCustomers: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Debug state
  const [debug, setDebug] = useState({
    salesData: [],
    salesItemsData: [],
    productsData: [],
    laybyData: [],
    customersData: [],
    saleIds: [],
    filteredSales: [],
    productSales: {},
    prodMap: {},
  });
  // Fetch statistics from Supabase
  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      setError('');
      try {
        // Fetch all locations for name lookup
        const { data: locData } = await supabase.from('locations').select('id, name');
        const locationMap = {};
        (locData || []).forEach(l => { locationMap[l.id] = l.name; });

        // Total Sales (with currency)
        let salesQuery = supabase.from('sales').select('total_amount, sale_date, location_id, currency');
        if (dateFilter) salesQuery = salesQuery.gte('sale_date', dateFilter);
        if (locationFilter) {
          // Allow filter by location name or id
          const locId = Object.keys(locationMap).find(id => locationMap[id]?.toLowerCase() === locationFilter.toLowerCase()) || locationFilter;
          salesQuery = salesQuery.eq('location_id', locId);
        }
        const { data: salesData, error: salesError } = await salesQuery;
        if (salesError) throw salesError;
        // Group by currency
        const salesByCurrency = {};
        (salesData || []).forEach(s => {
          const cur = s.currency || '';
          salesByCurrency[cur] = (salesByCurrency[cur] || 0) + (s.total_amount || 0);
        });

        // Most/Least Sold Product (filtered by date/location)
        let itemsQuery = supabase.from('sales_items').select('product_id, quantity, sale_id');
        const { data: allSales } = await supabase.from('sales').select('id, sale_date, location_id');
        let saleIds = (allSales || []).map(s => s.id);
        let filteredSales = allSales || [];
        if (dateFilter) filteredSales = filteredSales.filter(s => s.sale_date >= dateFilter);
        if (locationFilter) {
          const locId = Object.keys(locationMap).find(id => locationMap[id]?.toLowerCase() === locationFilter.toLowerCase()) || locationFilter;
          filteredSales = filteredSales.filter(s => s.location_id === locId);
        }
        saleIds = filteredSales.map(s => s.id);
        let itemsData = [];
        if (saleIds.length > 0) {
          const { data: items, error: itemsError } = await supabase.from('sales_items').select('product_id, quantity, sale_id').in('sale_id', saleIds);
          if (itemsError) throw itemsError;
          itemsData = items;
        }
        const productSales = {};
        (itemsData || []).forEach(item => {
          productSales[item.product_id] = (productSales[item.product_id] || 0) + (item.quantity || 0);
        });
        let mostSoldProduct = '', leastSoldProduct = '';
        let prodMap = {};
        if (Object.keys(productSales).length > 0) {
          const sorted = Object.entries(productSales).sort((a, b) => b[1] - a[1]);
          // Fetch product names
          const prodIds = sorted.map(([id]) => id);
          const { data: prodData, error: prodError } = await supabase.from('products').select('id, name').in('id', prodIds);
          if (prodError) throw prodError;
          prodMap = {};
          (prodData || []).forEach(p => { prodMap[p.id] = p.name; });
          mostSoldProduct = prodMap[sorted[0][0]] || '';
          leastSoldProduct = prodMap[sorted[sorted.length - 1][0]] || '';
        }

        // Lay-By Amount Due (with currency)
        const { data: laybyData, error: laybyError } = await supabase.from('laybys').select('total_amount, paid_amount, currency');
        if (laybyError) throw laybyError;
        const laybyByCurrency = {};
        (laybyData || []).forEach(l => {
          const cur = l.currency || '';
          laybyByCurrency[cur] = (laybyByCurrency[cur] || 0) + ((l.total_amount || 0) - (l.paid_amount || 0));
        });

        // Total Customers
        const { data: custData, error: custError } = await supabase.from('customers').select('id');
        if (custError) throw custError;
        const totalCustomers = (custData || []).length;

        // Fetch all products for debug
        const { data: productsData } = await supabase.from('products').select('id, name');

        setStats({ salesByCurrency, mostSoldProduct, leastSoldProduct, laybyByCurrency, totalCustomers });
        setDebug({
          salesData: salesData || [],
          salesItemsData: itemsData || [],
          productsData: productsData || [],
          laybyData: laybyData || [],
          customersData: custData || [],
          saleIds,
          filteredSales,
          productSales,
          prodMap,
        });
      } catch (err) {
        setError('Failed to fetch statistics.');
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, [dateFilter, locationFilter]);

  const handleDateChange = (e) => {
    setDateFilter(e.target.value);
  };

  const handleLocationChange = (e) => {
    setLocationFilter(e.target.value);
  };

  return (
    <div className="statistics-container" style={{maxWidth: '100vw', maxHeight: '100vh', overflow: 'auto', padding: '0 1vw'}}>
      <h1>Statistics</h1>
      {/* Filters */}
      <div className="filters" style={{overflowX: 'auto', overflowY: 'auto', maxHeight: '20vh'}}>
        <label htmlFor="date">Filter by Date:</label>
        <input type="date" id="date" value={dateFilter} onChange={handleDateChange} />
        <label htmlFor="location">Filter by Location:</label>
        <input
          type="text"
          id="location"
          placeholder="Enter location"
          value={locationFilter}
          onChange={handleLocationChange}
        />
      </div>
      {/* Statistics Cards */}
      {loading ? (
        <div style={{textAlign: 'center', marginTop: 32}}>Loading statistics...</div>
      ) : error ? (
        <div style={{textAlign: 'center', color: 'red', marginTop: 32}}>{error}</div>
      ) : (
        <div>
          <div style={{background:'#222',color:'#fff',padding:12,margin:'12px 0',borderRadius:8,fontSize:13,maxWidth:900}}>
            <b>DEBUG:</b><br/>
            Sales: {debug.salesData.length} | Sales Items: {debug.salesItemsData.length} | Products: {debug.productsData.length} | Laybys: {debug.laybyData.length} | Customers: {debug.customersData.length}<br/>
            Sale IDs: {JSON.stringify(debug.saleIds)}<br/>
            Filtered Sales: {JSON.stringify(debug.filteredSales)}<br/>
            Product Sales: {JSON.stringify(debug.productSales)}<br/>
            Product Map: {JSON.stringify(debug.prodMap)}<br/>
          </div>
          <div className="stats-cards" style={{overflowX: 'auto', overflowY: 'auto', maxHeight: '60vh'}}>
            <div className="stats-card">
              <h3>Total Sales</h3>
              {stats.salesByCurrency && Object.keys(stats.salesByCurrency).length > 0 ? (
                Object.entries(stats.salesByCurrency).map(([cur, amt]) => (
                  <p key={cur}>{cur} {amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                ))
              ) : <p>0</p>}
            </div>
            <div className="stats-card">
              <h3>Most Sold Product</h3>
              <p>{stats.mostSoldProduct}</p>
            </div>
            <div className="stats-card">
              <h3>Least Sold Product</h3>
              <p>{stats.leastSoldProduct}</p>
            </div>
            <div className="stats-card">
              <h3>Total Lay-By Amount Due</h3>
              {stats.laybyByCurrency && Object.keys(stats.laybyByCurrency).length > 0 ? (
                Object.entries(stats.laybyByCurrency).map(([cur, amt]) => (
                  <p key={cur}>{cur} {amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                ))
              ) : <p>0</p>}
            </div>
            <div className="stats-card">
              <h3>Total Customers</h3>
              <p>{stats.totalCustomers}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Statistics;
