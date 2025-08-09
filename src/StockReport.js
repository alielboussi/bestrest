import React, { useState, useEffect } from 'react';
import { getMaxSetQty, selectPrice, formatAmount } from './utils/setInventoryUtils';
import supabase from './supabase';
import './StockReports.css';

const StockReport = () => {
  // State for filters and data
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');
  // Removed search state
  const [expandedImage, setExpandedImage] = useState(null);
  const [locations, setLocations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [combos, setCombos] = useState([]);
  const [comboItems, setComboItems] = useState([]);
  const [comboInventory, setComboInventory] = useState([]);

  // Fetch all data on mount
  useEffect(() => {
    const fetchData = async () => {
      const { data: locs } = await supabase.from('locations').select('*');
      setLocations(locs || []);
      const { data: cats } = await supabase.from('categories').select('*');
      setCategories(cats || []);
      const { data: prods } = await supabase.from('products').select('*');
      setProducts(prods || []);
      const { data: invData } = await supabase.from('inventory').select('*');
      setInventory(invData || []);
      const { data: combosData } = await supabase.from('combos').select('*');
      setCombos(combosData || []);
      const { data: comboItemsData } = await supabase.from('combo_items').select('*');
      setComboItems(comboItemsData || []);
  // ...existing code...
    };
    fetchData();
  }, []);

  // Calculate the max number of sets that can be built for a combo, globally or for a location
  function getMaxSetQty(comboId, loc) {
    const items = comboItems.filter(ci => ci.combo_id === comboId);
    if (!items.length) return 0;
    const productStock = {};
    items.forEach(item => {
      const invs = loc
        ? inventory.filter(inv => inv.product_id === item.product_id && inv.location === loc)
        : inventory.filter(inv => inv.product_id === item.product_id);
      productStock[item.product_id] = invs.reduce((sum, inv) => sum + (inv.quantity || 0), 0);
    });
    return getMaxSetQty(items, productStock);
  }

  // Filter combos: If location is empty ("All"), use global logic.
  const filteredCombos = combos.filter(combo => {
    const setQty = getMaxSetQty(combo.id, location || "");
    if (setQty <= 0) return false;
    const matchesCategory = !category || category === "" || combo.category_id === Number(category);
    return matchesCategory;
  });

  // Build a usedStock map based ONLY on combos that are actually possible (filteredCombos)
  const usedStock = {};
  filteredCombos.forEach(combo => {
    const setQty = getMaxSetQty(combo.id, location || "");
    comboItems
      .filter(item => item.combo_id === combo.id)
      .forEach(item => {
        usedStock[item.product_id] = (usedStock[item.product_id] || 0) + item.quantity * setQty;
      });
  });

  // Filter products: Show only those with EXCESS stock after sets, with filters
  const filteredProducts = products.filter(p => {
    // Total available stock globally or per location
    const invs = location
      ? inventory.filter(inv => inv.product_id === p.id && inv.location === location)
      : inventory.filter(inv => inv.product_id === p.id);
    const totalStock = invs.reduce((sum, inv) => sum + (inv.quantity || 0), 0);
    const remainingStock = totalStock - (usedStock[p.id] || 0);
    if (remainingStock <= 0) return false;
    const matchesCategory = !category || category === "" || p.category_id === Number(category);
    return matchesCategory;
  });

  return (
    <div className="stock-report-container">
      <div className="stock-report-filters">
        <label>
          Location:
          <select
            className="stock-report-select"
            value={location}
            onChange={e => setLocation(e.target.value)}
          >
            <option value="">All</option>
            {locations.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>
        <label>
          Category:
          <select
            className="stock-report-select"
            value={category}
            onChange={e => setCategory(e.target.value)}
            style={{ marginLeft: 8 }}
          >
            <option value="">All</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        {/* Search field removed */}
      </div>
      <div className="stock-report-list">
        {(location || category) ? (
          <>
            {/* Show sets (combos) as rows with available quantity */}
            {filteredCombos.map(combo => {
              const setQty = getMaxSetQty(combo.id, location || "");
              return (
                <div className="stock-report-card" key={combo.id} style={{ border: '2px solid #00bfff', background: '#f7fbff' }}>
                  <div className="stock-report-card-info">
                    <div><b>SET: {combo.combo_name}</b></div>
                    <div>SKU: {combo.sku || '-'}</div>
                    <div>Available Sets: <b>{setQty}</b></div>
                    <div>Components: {
                      comboItems.filter(ci => ci.combo_id === combo.id).map(ci => {
                        const prod = products.find(p => p.id === ci.product_id);
                        return prod ? `${prod.name} (${ci.quantity})` : `ID ${ci.product_id} (${ci.quantity})`;
                      }).join(', ')
                    }</div>
                    <div>Standard Price: <b>{combo.price !== undefined && combo.price !== null && combo.price !== '' ? combo.price : '-'}</b></div>
                    <div>Promotional Price: <b>{combo.promotional_price !== undefined && combo.promotional_price !== null && combo.promotional_price !== '' ? combo.promotional_price : '-'}</b></div>
                  </div>
                </div>
              );
            })}
            {/* Show products that are not exclusively set components, or have excess stock */}
            {filteredProducts.filter(p => {
              // Hide products that are only set components unless they have excess stock
              const isSetComponent = comboItems.some(ci => ci.product_id === p.id);
              // If product is not a set component, always show
              if (!isSetComponent) return true;
              // If product is a set component, only show if it has excess stock
              const invs = location
                ? inventory.filter(inv => inv.product_id === p.id && inv.location === location)
                : inventory.filter(inv => inv.product_id === p.id);
              const totalStock = invs.reduce((sum, inv) => sum + (inv.quantity || 0), 0);
              const remainingStock = totalStock - (usedStock[p.id] || 0);
              return remainingStock > 0;
            }).map(p => {
              const invs = location
                ? inventory.filter(inv => inv.product_id === p.id && inv.location === location)
                : inventory.filter(inv => inv.product_id === p.id);
              const totalStock = invs.reduce((sum, inv) => sum + (inv.quantity || 0), 0);
              const remainingStock = totalStock - (usedStock[p.id] || 0);
              return (
                <div className="stock-report-card" key={p.id}>
                  <div className="stock-report-card-img-wrap">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="stock-report-card-img"
                        style={{ cursor: 'pointer' }}
                        onClick={() => setExpandedImage(p.image_url)}
                      />
                    ) : (
                      <div className="stock-report-card-img-placeholder">No Image</div>
                    )}
                  </div>
                  <div className="stock-report-card-info">
                    <div><b>{p.name}</b></div>
                    <div>SKU: {p.sku || '-'}</div>
                    <div>Unit: {p.unit_of_measure || '-'}</div>
                    <div>
                      Stock: <b>{remainingStock}</b>
                    </div>
                    <div>
                      Standard Price: <b>{p.price !== undefined && p.price !== null && p.price !== '' ? (p.currency ? `${p.currency} ` : '') + p.price : '-'}</b>
                    </div>
                    <div>
                      Promotional Price: <b>{p.promotional_price !== undefined && p.promotional_price !== null && p.promotional_price !== '' ? (p.currency ? `${p.currency} ` : '') + p.promotional_price : '-'}</b>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        ) : null}
      </div>
      {/* Modal for expanded image */}
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
              boxShadow: '0 0 20px #000',
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
  );
};

export default StockReport;
