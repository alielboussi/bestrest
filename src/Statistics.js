import React, { useState } from 'react';
import useStatistics from './hooks/useStatistics';

const Statistics = () => {
  const [dateFilter, setDateFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const { loading, error, stats, debug } = useStatistics({ dateFrom: dateFilter, dateTo: '', locationFilter });

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
              <h3>Customer Due Total (K)</h3>
              <p>{stats.dueK.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} K</p>
            </div>
            <div className="stats-card">
              <h3>Customer Due Total ($)</h3>
              <p>{stats.due$.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</p>
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
