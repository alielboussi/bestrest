import React, { useState, useEffect } from 'react';
import { getMaxSetQty, selectPrice, formatAmount } from './utils/setInventoryUtils';
import supabase from './supabase';
import './StockReportMobile.css';

const StockReportMobile = () => {
  const [products, setProducts] = useState([]);
  const [productLocations, setProductLocations] = useState([]);
  const [locations, setLocations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [units, setUnits] = useState([]);
  const [productImages, setProductImages] = useState([]);
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [combos, setCombos] = useState([]);
  const [comboItems, setComboItems] = useState([]);
  const [comboInventory, setComboInventory] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      const { data: prods } = await supabase.from('products').select('*');
      setProducts(prods || []);
      const { data: prodLocs } = await supabase.from('product_locations').select('*');
      setProductLocations(prodLocs || []);
      const { data: locs } = await supabase.from('locations').select('*');
      setLocations(locs || []);
      const { data: cats } = await supabase.from('categories').select('*');
      setCategories(cats || []);
      const { data: inv } = await supabase.from('inventory').select('*');
      setInventory(inv || []);
      const { data: unitData } = await supabase.from('unit_of_measure').select('*');
      setUnits(unitData || []);
      const { data: images } = await supabase.from('product_images').select('*');
      setProductImages(images || []);
      const { data: combosData } = await supabase.from('combos').select('*');
      setCombos(combosData || []);
      const { data: comboItemsData } = await supabase.from('combo_items').select('*');
      setComboItems(comboItemsData || []);
      const { data: comboInvData } = await supabase.from('combo_inventory').select('*');
      setComboInventory(comboInvData || []);
    };
    fetchData();
  }, []);

  // Calculate max sets for a combo (global or by location)
  function getMaxSetQty(comboId, loc) {
    const items = comboItems.filter(ci => ci.combo_id === comboId);
    if (!items.length) return 0;
    const productStock = {};
    items.forEach(item => {
      const stock = loc
        ? productLocations.filter(pl => pl.product_id === item.product_id && pl.location_id === loc).reduce((sum, pl) => sum + (pl.quantity || 0), 0)
        : productLocations.filter(pl => pl.product_id === item.product_id).reduce((sum, pl) => sum + (pl.quantity || 0), 0);
      productStock[item.product_id] = stock;
    });
    return getMaxSetQty(items, productStock);
  }

  // Filter combos (sets) that can be made globally or per location, and match search/category
  const filteredCombos = combos.filter(combo => {
    const setQty = getMaxSetQty(combo.id, location || '');
    if (setQty <= 0) return false;
    const matchesCategory = !category || combo.category_id === Number(category);
    const searchValue = search.trim().toLowerCase();
    const matchesSearch =
      !searchValue ||
      (combo.combo_name && combo.combo_name.toLowerCase().includes(searchValue)) ||
      (combo.sku && combo.sku.toLowerCase().includes(searchValue));
    return matchesCategory && matchesSearch;
  });

  // Used stock per product (from only actually buildable combos)
  const usedStock = {};
  filteredCombos.forEach(combo => {
    const setQty = getMaxSetQty(combo.id, location || '');
    comboItems.filter(ci => ci.combo_id === combo.id).forEach(item => {
      usedStock[item.product_id] = (usedStock[item.product_id] || 0) + item.quantity * setQty;
    });
  });

  // Filter products: only show if stock remains after sets
  const filteredProducts = products.filter(p => {
    // Sum global or location stock
    const productLocs = location
      ? productLocations.filter(pl => pl.product_id === p.id && pl.location_id === location)
      : productLocations.filter(pl => pl.product_id === p.id);
    const totalStock = productLocs.reduce((sum, pl) => sum + (pl.quantity || 0), 0);
    const remainingStock = totalStock - (usedStock[p.id] || 0);
    if (remainingStock <= 0) return false;
    const matchesCategory = !category || p.category_id === Number(category);
    const searchValue = search.trim().toLowerCase();
    const matchesSearch =
      !searchValue ||
      (p.name && p.name.toLowerCase().includes(searchValue)) ||
      (p.sku && p.sku.toLowerCase().includes(searchValue));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="stock-report-mobile-container">
      <div className="stock-report-mobile-filters">
        <select
          className="stock-report-mobile-select"
          value={location}
          onChange={e => setLocation(e.target.value)}
        >
          <option value="">All Locations</option>
          {locations.map(l => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <select
          className="stock-report-mobile-select"
          value={category}
          onChange={e => setCategory(e.target.value)}
        >
          <option value="">All Categories</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          type="text"
          className="stock-report-mobile-search"
          placeholder="Search Products..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="stock-report-mobile-list">
        {filteredProducts.map(p => {
          // Find the correct unit name/abbreviation
          let unit = '';
          if (p.unit_of_measure_id) {
            const unitObj = units.find(u => u.id === p.unit_of_measure_id);
            unit = unitObj ? (unitObj.abbreviation || unitObj.name || '') : '';
          }
          // Use *remaining* stock (after sets) for display
          const productLocs = location
            ? productLocations.filter(pl => pl.product_id === p.id && pl.location_id === location)
            : productLocations.filter(pl => pl.product_id === p.id);
          const totalStock = productLocs.reduce((sum, pl) => sum + (pl.quantity || 0), 0);
          const remainingStock = totalStock - (usedStock[p.id] || 0);
          // Find image from product_images table
          const imageObj = productImages.find(img => img.product_id === p.id);
          const imageUrl = imageObj ? imageObj.image_url : p.image_url;
          return (
            <div className="stock-report-mobile-card" key={p.id}>
              <div className="stock-report-mobile-card-img-wrap">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={p.name}
                    className="stock-report-mobile-card-img"
                  />
                ) : (
                  <div className="stock-report-mobile-card-img-placeholder">No Image</div>
                )}
              </div>
              <div className="stock-report-mobile-card-info">
                <div className="stock-report-mobile-card-title">{p.name}</div>
                <div className="stock-report-mobile-card-sku">SKU: {p.sku || '-'}</div>
                <div>Stock: <b>{remainingStock}</b> {unit}</div>
                <div>Standard Price: <b>{p.price !== undefined && p.price !== null && p.price !== '' ? (p.currency ? `${p.currency} ` : '') + p.price : '-'}</b></div>
                <div>Promotional Price: <b>{p.promotional_price !== undefined && p.promotional_price !== null && p.promotional_price !== '' ? (p.currency ? `${p.currency} ` : '') + p.promotional_price : '-'}</b></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StockReportMobile;
