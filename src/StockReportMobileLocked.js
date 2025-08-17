
import React, { useEffect, useState } from "react";
import "./StockReportMobileLocked.css";
import supabase from "./supabase";

const LOCKED_LOCATION_ID = "454a092c-5b12-441e-b99d-216f6fa72198";

function StockReportMobileLocked() {
  const [products, setProducts] = useState([]);
  const [stock, setStock] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [expandedImage, setExpandedImage] = useState(null);
  // Sets (combos) state
  const [combos, setCombos] = useState([]);
  const [comboItems, setComboItems] = useState([]);
  const [comboLocations, setComboLocations] = useState([]);
  const [expandedCombos, setExpandedCombos] = useState(new Set());

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    // Fetch product_locations for locked location
    const { data: prodLocs } = await supabase
      .from("product_locations")
      .select("product_id")
      .eq("location_id", LOCKED_LOCATION_ID);
    const productIds = prodLocs ? prodLocs.map(pl => pl.product_id) : [];
    // Fetch products for those IDs
    let productsData = [];
    if (productIds.length > 0) {
      const { data } = await supabase
        .from("products")
        .select("id, name, sku, category_id, unit_of_measure_id, image_url, price, promotional_price")
        .in("id", productIds);
      productsData = data || [];
    }
    // Fetch stock for locked location only
    const { data: stockData } = await supabase
      .from("inventory")
      .select("product_id, quantity")
      .eq("location", LOCKED_LOCATION_ID);
    // Fetch categories
    const { data: catData } = await supabase
      .from("categories")
      .select("id, name");
    // Fetch sets (combos) and components
    const { data: combosData } = await supabase
      .from("combos")
      .select("id, combo_name, sku, picture_url, combo_price, standard_price, promotional_price, currency");
    const { data: comboItemsData } = await supabase
      .from("combo_items")
      .select("combo_id, product_id, quantity");
    const { data: comboLocs } = await supabase
      .from("combo_locations")
      .select("combo_id, location_id");
    setProducts(productsData);
    setStock(stockData || []);
    setCategories(catData || []);
    setCombos(combosData || []);
    setComboItems(comboItemsData || []);
    setComboLocations(comboLocs || []);
    setLoading(false);
  }

  // Helper: stock at locked location for a product
  function getStockForProduct(productId) {
    const item = stock.find(s => s.product_id === productId);
    return item ? Number(item.quantity) || 0 : 0;
  }

  // Compute buildable sets at locked location
  function computeComboMaxQty(comboId) {
    const items = comboItems.filter(ci => ci.combo_id === comboId);
    if (!items.length) return 0;
    let maxSets = Infinity;
    for (const it of items) {
      const qtyPerSet = Number(it.quantity) || 0;
      if (qtyPerSet <= 0) return 0;
      const onHand = getStockForProduct(it.product_id);
      const possible = Math.floor(onHand / qtyPerSet);
      maxSets = Math.min(maxSets, possible);
      if (maxSets === 0) break;
    }
    return isFinite(maxSets) ? maxSets : 0;
  }

  // Build map of set qty and used component stock
  const comboSetQty = new Map();
  const filteredCombos = (combos || []).filter(c => {
    // limit to combos linked to the locked location (if defined in mapping); if no mapping table entries, allow all
    const hasMapping = (comboLocations || []).some(cl => String(cl.combo_id) === String(c.id));
    if (hasMapping) {
      const linked = (comboLocations || []).some(
        cl => String(cl.combo_id) === String(c.id) && String(cl.location_id) === String(LOCKED_LOCATION_ID)
      );
      if (!linked) return false;
    }
    const s = search.trim().toLowerCase();
    if (!s) return true;
    return (
      (c.combo_name && c.combo_name.toLowerCase().includes(s)) ||
      (c.sku && c.sku.toLowerCase().includes(s))
    );
  });
  for (const c of filteredCombos) {
    const qty = computeComboMaxQty(c.id);
    if (qty > 0) comboSetQty.set(c.id, qty);
  }
  const usedStock = {};
  if (comboSetQty.size > 0) {
    for (const [comboId, setQty] of comboSetQty.entries()) {
      const items = comboItems.filter(ci => ci.combo_id === comboId);
      for (const item of items) {
        usedStock[item.product_id] = (usedStock[item.product_id] || 0) + (Number(item.quantity) || 0) * setQty;
      }
    }
  }

  const toggleComboExpanded = (id) => {
    setExpandedCombos(prev => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Filter products by search and category
  const filteredProducts = products.filter(product => {
    const searchLower = search.trim().toLowerCase();
    const matchesSearch =
      product.name.toLowerCase().includes(searchLower) ||
      product.sku.toLowerCase().includes(searchLower) ||
      (product.price && String(product.price).includes(searchLower));
    const matchesCategory = selectedCategory === "" || String(product.category_id) === String(selectedCategory);
    if (!(matchesSearch && matchesCategory)) return false;
    // Hide components fully consumed by buildable sets
    const total = getStockForProduct(product.id);
    const remaining = total - (usedStock[product.id] || 0);
    const isComponentUsed = (usedStock[product.id] || 0) > 0;
    if (isComponentUsed && remaining <= 0) return false;
    return true;
  });

  return (
    <div className="stock-report-mobile-locked">
      <h2>Stock Report</h2>
      <div className="stock-report-controls">
        <input
          type="text"
          placeholder="Search by name, SKU, or price..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="stock-report-search"
        />
        <select
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
          className="stock-report-category"
        >
          <option value="">All Categories</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <>
          {/* Sets section */}
          {filteredCombos.length > 0 && (
            <div style={{marginBottom: 12}}>
              {filteredCombos.map(c => {
                const qty = computeComboMaxQty(c.id);
                const isExpanded = expandedCombos.has(String(c.id));
                const items = comboItems.filter(ci => ci.combo_id === c.id);
                return (
                  <div key={`combo-${c.id}`} style={{
                    background:'#102015',
                    border:'1px solid #2e7d32',
                    borderRadius:8,
                    padding:8,
                    marginBottom:8
                  }}>
                    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                      <div style={{display:'flex', alignItems:'center', gap:8}}>
                        <button
                          onClick={() => toggleComboExpanded(c.id)}
                          aria-label={isExpanded ? 'Hide components' : 'Show components'}
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 6,
                            border: '1px solid #00e676',
                            background: 'transparent',
                            color: '#00e676',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 13,
                            lineHeight: 1,
                            padding: 0
                          }}
                        >
                          {isExpanded ? '▼' : '▶'}
                        </button>
                        <div style={{fontWeight:'bold', color:'#fff'}}>{c.combo_name}</div>
                      </div>
                      <div style={{color:'#00e676', fontWeight:'bold'}}>Buildable Sets: {qty}</div>
                    </div>
                    {isExpanded && (
                      <div style={{marginTop:8, background:'#1b1b1b', borderRadius:6, padding:8, color:'#fff'}}>
                        {items && items.length ? items.map(it => {
                          const prod = products.find(p => String(p.id) === String(it.product_id));
                          return (
                            <div key={`combo-${c.id}-item-${it.product_id}`} style={{display:'flex', justifyContent:'space-between', marginBottom:4}}>
                              <span>{prod ? prod.name : it.product_id}</span>
                              <span>x {Number(it.quantity) || 0}</span>
                            </div>
                          );
                        }) : <div style={{opacity:0.8}}>No components</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Products table (unchanged layout) */}
          <table className="stock-report-table" style={{fontSize:'0.95em', width:'100%'}}>
          <thead>
            <tr>
              <th style={{minWidth:40, padding:'4px'}}>Image</th>
              <th style={{minWidth:80, padding:'4px'}}>Name</th>
              <th style={{minWidth:60, padding:'4px'}}>SKU</th>
              <th style={{minWidth:70, padding:'4px'}}>Category</th>
              <th style={{minWidth:50, padding:'4px'}}>Stock Qty</th>
              <th style={{minWidth:60, padding:'4px'}}>Standard Price</th>
              <th style={{minWidth:60, padding:'4px'}}>Promo Price</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map(product => {
              const stockItem = stock.find(s => s.product_id === product.id);
              const category = categories.find(c => String(c.id) === String(product.category_id));
              const total = stockItem ? Number(stockItem.quantity) || 0 : 0;
              const remaining = Math.max(0, total - (usedStock[product.id] || 0));
              return (
                <tr key={product.id}>
                  <td>
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        style={{maxWidth:28,maxHeight:28,borderRadius:4,cursor:'pointer'}}
                        onClick={() => setExpandedImage(product.image_url)}
                      />
                    ) : (
                      <span style={{fontSize:'0.9em'}}>No Image</span>
                    )}
                  </td>
                  <td style={{wordBreak:'break-word',padding:'4px'}}>{product.name}</td>
                  <td style={{padding:'4px'}}>{product.sku}</td>
                  <td style={{padding:'4px'}}>{category ? category.name : '-'}</td>
                  <td style={{padding:'4px'}}>{remaining}</td>
                  <td style={{padding:'4px'}}>{product.price ? product.price : '-'}</td>
                  <td style={{padding:'4px'}}>{product.promotional_price ? product.promotional_price : '-'}</td>
                </tr>
              );
            })}
          </tbody>
          </table>
        </>
      )}
      {/* Image Expansion Modal */}
      {expandedImage && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.7)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={e => {
            if (e.target === e.currentTarget) setExpandedImage(null);
          }}
        >
          <img src={expandedImage} alt="Expanded" style={{maxWidth:'80vw',maxHeight:'80vh',borderRadius:'12px',boxShadow:'0 2px 24px #000'}} />
        </div>
      )}
    </div>
  );
}

export default StockReportMobileLocked;
