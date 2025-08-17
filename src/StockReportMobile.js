import React, { useState, useEffect } from 'react';
import { getMaxSetQty as calcMaxSetQty, selectPrice, formatAmount } from './utils/setInventoryUtils';
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
  const [comboLocations, setComboLocations] = useState([]);
  const [expandedImage, setExpandedImage] = useState(null);

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
  const { data: comboLocs } = await supabase.from('combo_locations').select('*');
  setComboLocations(comboLocs || []);
  // ...existing code...
    };
    fetchData();
  }, []);

  // Aggregate stock per product from product_locations OR inventory (prefer product_locations if present)
  function getStockForProduct(productId, locId = '') {
    const loc = locId === undefined || locId === null ? '' : locId;
    // Sum from product_locations
    const fromPL = productLocations
      .filter(pl => pl.product_id === productId && (!loc || pl.location_id == loc))
      .reduce((sum, pl) => sum + (Number(pl.quantity) || 0), 0);
    if (fromPL > 0) return fromPL;
    // Fallback to inventory table (supports fields: location or location_id)
    const fromInv = inventory
      .filter(inv => inv.product_id === productId && (!loc || inv.location == loc || inv.location_id == loc))
      .reduce((sum, inv) => sum + (Number(inv.quantity) || 0), 0);
    return fromInv;
  }

  // Calculate max sets for a combo (global or by location)
  function computeComboMaxQty(comboId, locId) {
    const items = comboItems.filter(ci => ci.combo_id === comboId);
    if (!items.length) return 0;
    const productStock = {};
    for (const item of items) {
      productStock[item.product_id] = getStockForProduct(item.product_id, locId);
    }
    return calcMaxSetQty(items, productStock);
  }

  // Note: mobile view shows actual on-hand stock only (no deduction for potential sets)

  // Compute buildable set qty per combo at the selected location, then sum used component stock
  const comboSetQty = new Map(); // combo_id -> set qty
  for (const combo of combos) {
    const qty = computeComboMaxQty(combo.id, location || '');
    if (qty > 0) comboSetQty.set(combo.id, qty);
  }
  const usedStock = {}; // product_id -> qty used by sets
  if (comboSetQty.size > 0) {
    for (const [comboId, setQty] of comboSetQty.entries()) {
      const items = comboItems.filter(ci => ci.combo_id === comboId);
      for (const item of items) {
        usedStock[item.product_id] = (usedStock[item.product_id] || 0) + (Number(item.quantity) || 0) * setQty;
      }
    }
  }

  // Filter products: only show if stock remains after sets
  const filteredProducts = products.filter(p => {
    const totalStock = getStockForProduct(p.id, location || '');
    // Hide a component if all its stock would be consumed by buildable sets
    const isSetComponent = comboItems.some(ci => ci.product_id === p.id && comboSetQty.has(ci.combo_id));
    if (isSetComponent) {
      const remaining = totalStock - (usedStock[p.id] || 0);
      if (remaining <= 0) return false;
    }
    const matchesCategory = !category || p.category_id === Number(category);
    const searchValue = search.trim().toLowerCase();
    const matchesSearch = !searchValue || (p.name && p.name.toLowerCase().includes(searchValue));
    return matchesCategory && matchesSearch;
  });

  // Filter combos: show sets available at location (if selected) and matching search
  const filteredCombos = combos.filter(c => {
    if (location) {
      const linked = (comboLocations || []).some(cl => String(cl.combo_id) === String(c.id) && String(cl.location_id) === String(location));
      if (!linked) return false;
    }
    const searchValue = search.trim().toLowerCase();
    if (searchValue) {
      const matches = (c.combo_name && c.combo_name.toLowerCase().includes(searchValue)) || (c.sku && c.sku.toLowerCase().includes(searchValue));
      if (!matches) return false;
    }
    return true;
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
        {/* Render sets (combos) first */}
        {filteredCombos.map(c => {
          const qty = computeComboMaxQty(c.id, location || '');
          const pic = c.picture_url || '';
          const stdPrice = c.combo_price || c.standard_price || '';
          const promo = c.promotional_price || '';
          return (
            <div className="stock-report-mobile-card glowing-green" key={`combo-${c.id}`}>
              <div className="stock-report-mobile-card-row">
                <div className="stock-report-mobile-card-img-wrap" style={{width: 60, height: 60, minWidth: 60, minHeight: 60, marginRight: 10}}>
                  {pic ? (
                    <img
                      src={pic}
                      alt={c.combo_name}
                      className="stock-report-mobile-card-img"
                      style={{width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, cursor: 'pointer'}}
                      onClick={() => setExpandedImage(pic)}
                    />
                  ) : (
                    <div className="stock-report-mobile-card-img-placeholder">Set</div>
                  )}
                </div>
                <div style={{display: 'flex', flexDirection: 'column', flex: 1}}>
                  <div style={{fontWeight: 'bold', fontSize: '1.25em', color: '#fff'}}>{c.combo_name}</div>
                  <div style={{display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, fontSize: '1.1em'}}>
                    <span style={{fontWeight: 'bold', color: '#00e676'}}>Buildable Sets: {qty}</span>
                    <span style={{color: '#fff'}}>Set</span>
                  </div>
                </div>
              </div>
              <div style={{display: 'flex', flexDirection: 'row', gap: 16, marginTop: 8, justifyContent: 'space-between'}}>
                <div style={{fontSize: '1.1em', color: '#fff'}}>Standard Price: <b>{stdPrice !== '' ? (c.currency ? `${c.currency} ` : '') + stdPrice : '-'}</b></div>
                <div style={{fontSize: '1.1em', color: '#fff'}}>Promotional Price: <b>{promo !== '' ? (c.currency ? `${c.currency} ` : '') + promo : '-'}</b></div>
              </div>
            </div>
          );
        })}
        {/* Then render individual products */}
        {filteredProducts.map(p => {
          let unit = '';
          if (p.unit_of_measure_id) {
            const unitObj = units.find(u => u.id === p.unit_of_measure_id);
            unit = unitObj ? (unitObj.abbreviation || unitObj.name || '') : '';
          }
          const totalStock = getStockForProduct(p.id, location || '');
          const imageObj = productImages.find(img => img.product_id === p.id);
          const imageUrl = imageObj ? imageObj.image_url : p.image_url;
          return (
            <div className="stock-report-mobile-card glowing-green" key={p.id}>
              <div className="stock-report-mobile-card-row">
                <div className="stock-report-mobile-card-img-wrap" style={{width: 60, height: 60, minWidth: 60, minHeight: 60, marginRight: 10}}>
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={p.name}
                      className="stock-report-mobile-card-img"
                      style={{width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, cursor: 'pointer'}}
                      onClick={() => setExpandedImage(imageUrl)}
                    />
                  ) : (
                    <div className="stock-report-mobile-card-img-placeholder">No Image</div>
                  )}
                </div>
                <div style={{display: 'flex', flexDirection: 'column', flex: 1}}>
                  <div style={{fontWeight: 'bold', fontSize: '1.25em', color: '#fff'}}>{p.name}</div>
                  <div style={{display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, fontSize: '1.1em'}}>
                    <span style={{fontWeight: 'bold', color: '#00e676'}}>Stock: {totalStock}</span>
                    <span style={{color: '#fff'}}>{unit}</span>
                  </div>
                </div>
              </div>
              <div style={{display: 'flex', flexDirection: 'row', gap: 16, marginTop: 8, justifyContent: 'space-between'}}>
                <div style={{fontSize: '1.1em', color: '#fff'}}>Standard Price: <b>{p.price !== undefined && p.price !== null && p.price !== '' ? (p.currency ? `${p.currency} ` : '') + p.price : '-'}</b></div>
                <div style={{fontSize: '1.1em', color: '#fff'}}>Promotional Price: <b>{p.promotional_price !== undefined && p.promotional_price !== null && p.promotional_price !== '' ? (p.currency ? `${p.currency} ` : '') + p.promotional_price : '-'}</b></div>
              </div>
            </div>
          );
        })}
        {expandedImage && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              background: 'rgba(0,0,0,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
            onClick={() => setExpandedImage(null)}
          >
            <img
              src={expandedImage}
              alt="Expanded Product"
              style={{
                maxWidth: '90vw',
                maxHeight: '90vh',
                borderRadius: '10px',
                boxShadow: '0 0 20px #00e676',
                background: '#fff',
              }}
              onClick={e => e.stopPropagation()}
            />
            <button
              onClick={() => setExpandedImage(null)}
              style={{
                position: 'fixed',
                top: 30,
                right: 40,
                fontSize: 32,
                background: 'transparent',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                zIndex: 1001,
              }}
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockReportMobile;
