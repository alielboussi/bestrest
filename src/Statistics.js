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
  // Fetch statistics from Supabase
  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      setError('');
      try {
        // Total Sales
        let salesQuery = supabase.from('sales').select('total_amount, sale_date, location_id');
        if (dateFilter) salesQuery = salesQuery.gte('sale_date', dateFilter);
        if (locationFilter) salesQuery = salesQuery.eq('location_id', locationFilter);
        const { data: salesData, error: salesError } = await salesQuery;
        if (salesError) throw salesError;
        const totalSales = (salesData || []).reduce((sum, s) => sum + (s.total_amount || 0), 0);

        // Most/Least Sold Product
        let itemsQuery = supabase.from('sales_items').select('product_id, quantity');
        const { data: itemsData, error: itemsError } = await itemsQuery;
        if (itemsError) throw itemsError;
        const productSales = {};
        (itemsData || []).forEach(item => {
          productSales[item.product_id] = (productSales[item.product_id] || 0) + (item.quantity || 0);
        });
        let mostSoldProduct = '', leastSoldProduct = '';
        if (Object.keys(productSales).length > 0) {
          const sorted = Object.entries(productSales).sort((a, b) => b[1] - a[1]);
          // Fetch product names
          const prodIds = sorted.map(([id]) => id);
          const { data: prodData, error: prodError } = await supabase.from('products').select('id, name').in('id', prodIds);
          if (prodError) throw prodError;
          const prodMap = {};
          (prodData || []).forEach(p => { prodMap[p.id] = p.name; });
          mostSoldProduct = prodMap[sorted[0][0]] || '';
          leastSoldProduct = prodMap[sorted[sorted.length - 1][0]] || '';
        }

        // Lay-By Amount Due
        const { data: laybyData, error: laybyError } = await supabase.from('laybys').select('total_amount, paid_amount');
        if (laybyError) throw laybyError;
        const laybyDue = (laybyData || []).reduce((sum, l) => sum + ((l.total_amount || 0) - (l.paid_amount || 0)), 0);

        // Total Customers
        const { data: custData, error: custError } = await supabase.from('customers').select('id');
        if (custError) throw custError;
        const totalCustomers = (custData || []).length;

        setStats({ totalSales, mostSoldProduct, leastSoldProduct, laybyDue, totalCustomers });
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
        <div className="stats-cards" style={{overflowX: 'auto', overflowY: 'auto', maxHeight: '60vh'}}>
          <div className="stats-card">
            <h3>Total Sales</h3>
            <p>${stats.totalSales}</p>
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
            <p>${stats.laybyDue}</p>
          </div>
          <div className="stats-card">
            <h3>Total Customers</h3>
            <p>{stats.totalCustomers}</p>
          </div>
        </div>
      )}
    </div>
  
