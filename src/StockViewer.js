import React, { useEffect, useState } from 'react';
import supabase from './supabase';
import './StockViewer.css';

const StockViewer = () => {
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Fetch locations
    const fetchLocations = async () => {
      const { data, error } = await supabase.from('locations').select('*');
      if (!error) setLocations(data);
    };
    fetchLocations();
  }, []);

  useEffect(() => {
    if (!selectedLocation) return setProducts([]);
    setLoading(true);
    // Fetch products for selected location
    const fetchProducts = async () => {
      let query = supabase
        .from('products')
        .select(`*, stock:stocktakes(quantity, location_id), unit:units_of_measure(name), picture_url`)
        .order('name');
      if (selectedLocation) {
        query = query.eq('stock.location_id', selectedLocation);
      }
      if (search) {
        query = query.ilike('name', `%${search}%`);
      }
      const { data, error } = await query;
      if (!error) setProducts(data);
      setLoading(false);
    };
    fetchProducts();
  }, [selectedLocation, search]);

  return (
    <div className="stock-viewer-container">
      <h2>Stock Viewer</h2>
      <div className="stock-viewer-controls">
        <select
          value={selectedLocation}
          onChange={e => setSelectedLocation(e.target.value)}
        >
          <option value="">Select Location</option>
          {locations.map(loc => (
            <option key={loc.id} value={loc.id}>{loc.name}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search product..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          disabled={!selectedLocation}
        />
      </div>
      <div className="stock-viewer-table-wrapper">
        <table className="stock-viewer-table">
          <thead>
            <tr>
              <th>Picture</th>
              <th>SKU</th>
              <th>Name</th>
              <th>Unit</th>
              <th>Standard Price</th>
              <th>Promo Price</th>
              <th>Quantity</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7">Loading...</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan="7">No products found.</td></tr>
            ) : (
              products.map(prod => (
                <tr key={prod.id}>
                  <td>
                    {prod.picture_url ? (
                      <img src={prod.picture_url} alt={prod.name} className="stock-viewer-img" />
                    ) : (
                      <span>No Image</span>
                    )}
                  </td>
                  <td>{prod.sku}</td>
                  <td>{prod.name}</td>
                  <td>{prod.unit ? prod.unit.name : ''}</td>
                  <td>{prod.standard_price}</td>
                  <td>{prod.promotional_price}</td>
                  <td>{prod.stock && prod.stock.length > 0 ? prod.stock[0].quantity : 0}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StockViewer;
