import React, { useState } from 'react';

const Statistics = () => {
  const [dateFilter, setDateFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');

  const handleDateChange = (e) => {
    setDateFilter(e.target.value);
  };

  const handleLocationChange = (e) => {
    setLocationFilter(e.target.value);
  };

  return (
    <div className="statistics-container">
      <h1>Statistics</h1>

      {/* Filters */}
      <div className="filters">
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
      <div className="stats-cards">
        <div className="stats-card">
          <h3>Total Sales</h3>
          <p>$5000</p>
        </div>
        <div className="stats-card">
          <h3>Most Sold Product</h3>
          <p>Product A</p>
        </div>
        <div className="stats-card">
          <h3>Least Sold Product</h3>
          <p>Product Z</p>
        </div>
        <div className="stats-card">
          <h3>Total Lay-By Amount Due</h3>
          <p>$2000</p>
        </div>
        <div className="stats-card">
          <h3>Total Customers</h3>
          <p>120</p>
        </div>
      </div>
    </div>
  );
};

export default Statistics;
