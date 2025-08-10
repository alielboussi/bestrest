import React, { useState, useEffect } from "react";
import supabase from "./supabase";
import "./Products.css";
// Handler for location dropdown change should be inside the component

// Delete product by id using Supabase
const handleDeleteProduct = async (id, setProducts) => {
  try {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      alert('Failed to delete product: ' + error.message);
    } else {
      setProducts(products => products.filter(p => p.id !== id));
    }
  } catch (err) {
    alert('Error deleting product: ' + err.message);
  }
}

function ProductsListPage() {
  const [expandedImage, setExpandedImage] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState(null);
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustLoading, setAdjustLoading] = useState(false);

  const handleOpenAdjustModal = (product) => {
    setAdjustProduct(product);
    setAdjustQty("");
    setAdjustModalOpen(true);
  };

  const handleAdjustInventory = async () => {
    if (!adjustProduct) return;
    setAdjustLoading(true);
    try {
      const locationId = selectedLocation || locations[0]?.id;
      if (!locationId) {
        alert("Select a location first.");
        setAdjustLoading(false);
        return;
      }
      // Check previous adjustments for this product/location
      const { data: logs } = await supabase
        .from('inventory_adjustments')
        .select('id')
        .eq('product_id', adjustProduct.id)
        .eq('location_id', locationId);
      const adjustmentType = logs && logs.length === 0 ? 'opening' : 'transfer';
      // Upsert inventory
      const { data: inv } = await supabase.from('inventory').select('id').eq('product_id', adjustProduct.id).eq('location', locationId).single();
      if (inv) {
        await supabase.from('inventory').update({ quantity: Number(adjustQty) }).eq('id', inv.id);
      } else {
        await supabase.from('inventory').insert({ product_id: adjustProduct.id, location: locationId, quantity: Number(adjustQty) });
      }
      // Log the adjustment
      await supabase.from('inventory_adjustments').insert({
        product_id: adjustProduct.id,
        location_id: locationId,
        quantity: Number(adjustQty),
        adjustment_type: adjustmentType,
        adjusted_at: new Date().toISOString()
      });
      setAdjustModalOpen(false);
      fetchInventory();
    } catch (err) {
      alert('Failed to adjust inventory: ' + err.message);
    } finally {
      setAdjustLoading(false);
    }
  };
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [locations, setLocations] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [combos, setCombos] = useState([]);
  const [comboLocations, setComboLocations] = useState([]);
  const [comboItems, setComboItems] = useState([]);

  // Handler for location dropdown change
  const handleLocationChange = (e) => {
    setSelectedLocation(e.target.value);
  };

  useEffect(() => {
    fetchAll();
    fetchInventory();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [
        { data: products },
        { data: categories },
        { data: locations },
        { data: units },
        { data: combos },
        { data: comboLocations },
        { data: comboItems }
      ] = await Promise.all([
        supabase
          .from("products")
          .select(`id, name, sku, sku_type, cost_price, price, promotional_price, promo_start_date, promo_end_date, currency, category_id, unit_of_measure_id, created_at, product_images(image_url), product_locations(location_id)`)
          .order("created_at", { ascending: false }),
        supabase.from("categories").select("id, name"),
        supabase.from("locations").select("id, name"),
        supabase.from("unit_of_measure").select("id, name, abbreviation"),
        supabase.from("combos").select("id, combo_name, sku, combo_price, standard_price, promotional_price, promo_start_date, promo_end_date, picture_url, currency"),
        supabase.from("combo_locations").select("combo_id, location_id"),
        supabase.from("combo_items").select("combo_id, product_id, quantity"),
      ]);
      // Map image_url from product_images array to direct property
      const mappedProducts = (products || []).map(p => ({
        ...p,
        image_url: Array.isArray(p.product_images) && p.product_images.length > 0 ? p.product_images[0].image_url : ""
      }));
      setProducts(mappedProducts);
      setCategories(categories || []);
      setLocations(locations || []);
      setUnits(units || []);
      setCombos(combos || []);
      setComboLocations(comboLocations || []);
      setComboItems(comboItems || []);
    } catch (err) {
      // handle error
    } finally {
      setLoading(false);
    }
  };

  const fetchInventory = async () => {
    const { data, error } = await supabase.from('inventory').select('product_id, location, quantity');
    if (!error) {
      setInventory(data || []);
    }
  };

  // Filter products by location and search
  const filteredProducts = [
    ...products.filter(product => {
      // Exclude sets (combos)
      const unit = units.find(u => u.id === product.unit_of_measure_id);
      if (unit && unit.name && unit.name.toLowerCase() === 'set') return false;
      // Location filter
      if (selectedLocation) {
        if (product.product_locations && product.product_locations.length > 0) {
          const linked = product.product_locations.some(pl => String(pl.location_id) === String(selectedLocation));
          if (!linked) return false;
        } else {
          return false;
        }
      }
      // Search filter
      if (search.trim() !== "") {
        const searchLower = search.toLowerCase();
        if (!(
          (product.name && product.name.toLowerCase().includes(searchLower)) ||
          (product.sku && product.sku.toLowerCase().includes(searchLower)) ||
          (categories.find((c) => c.id === product.category_id)?.name?.toLowerCase().includes(searchLower))
        )) {
          return false;
        }
      }
      return true;
    })
  ];

  return (
    <div className="products-list-page" style={{maxWidth: '100vw', minHeight: '100vh', height: '100vh', overflow: 'hidden', padding: '0', margin: 0}}>
      <h1 className="products-title" style={{marginTop: '1rem'}}>All Products</h1>
      <div style={{display: 'flex', gap: '2rem', marginBottom: '1rem', alignItems: 'center'}}>
        <input
          type="text"
          placeholder="Search products by name, SKU, or category..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{padding: '0.5rem 1rem', fontSize: '1.1rem', borderRadius: '6px', border: '1px solid #00b4d8', width: '300px'}}
        />
  <select name="location" value={selectedLocation} onChange={handleLocationChange} style={{marginTop: '2mm', padding: '0.5rem 1rem', fontSize: '1.1rem', borderRadius: '6px', border: '1px solid #00b4d8', width: '220px'}}>
          <option value="">All Locations</option>
          {locations.map(loc => (
            <option key={loc.id} value={loc.id}>{loc.name}</option>
          ))}
        </select>
      </div>
      <div className="products-list" style={{width: '100%', overflowX: 'auto', maxHeight: 'none'}}>
        {loading ? (
          <div>Loading...</div>
        ) : filteredProducts.length === 0 ? (
          <div>No products found.</div>
        ) : (
          <div style={{maxHeight: 500, overflowY: 'auto', width: '100%'}}>
            <table style={{width: '100%', minWidth: '0', background: 'transparent', color: '#e0e6ed', borderCollapse: 'collapse', tableLayout: 'fixed'}}>
              <thead>
                <tr style={{background: '#23272f'}}>
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '5%'}}>Image</th>
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'left', width: '10%'}}>Name</th>
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '7%'}}>SKU</th>
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '8%'}}>Category</th>
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '5%'}}>Unit</th>
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '6%'}}>Stock Qty</th>
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '6%'}}>Price</th>
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '6%'}}>Promo</th>
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '8%'}}>Duration</th>
                  <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '9%'}}>Actions</th>
                <th style={{padding: '0.15rem', borderBottom: '1px solid #00b4d8', textAlign: 'center', width: '7%'}}>Adjust</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((item) => {
                  const isCombo = !!item.combo_name;
                  return (
                    <tr key={isCombo ? `combo-${item.id}` : item.id}>
                      <td style={{textAlign: 'center'}}>
                        {isCombo ? (
                          item.picture_url && item.picture_url.trim() !== '' ? (
                            <img
                              src={item.picture_url}
                              alt="Set"
                              className="product-image-thumb"
                              onError={e => { e.target.onerror = null; e.target.src = '/default-set-image.png'; }}
                              style={{cursor: 'pointer', maxWidth: '48px', maxHeight: '48px', borderRadius: '6px'}}
                              onClick={e => {
                                e.preventDefault();
                                setExpandedImage(item.picture_url);
                              }}
                            />
                          ) : (
                            <img src="/default-set-image.png" alt="Set" className="product-image-thumb" style={{maxWidth: '48px', maxHeight: '48px', borderRadius: '6px'}} />
                          )
                        ) : (
                          item.image_url && item.image_url.trim() !== '' ? (
                            <img
                              src={item.image_url}
                              alt="Product"
                              className="product-image-thumb"
                              onError={e => { e.target.onerror = null; e.target.src = '/default-product-image.png'; }}
                              style={{cursor: 'pointer', maxWidth: '48px', maxHeight: '48px', borderRadius: '6px'}}
                              onClick={e => {
                                e.preventDefault();
                                setExpandedImage(item.image_url);
                              }}
                            />
                          ) : (
                            <img src="/default-product-image.png" alt="Product" className="product-image-thumb" style={{maxWidth: '48px', maxHeight: '48px', borderRadius: '6px'}} />
                          )
                        )}
  {/* Image Expansion Modal */}
  {expandedImage && (
    <div
      style={{
        position: 'absolute',
        top: window.scrollY,
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
        // Only close if clicking outside the image
        if (e.target === e.currentTarget) setExpandedImage(null);
      }}
    >
      <img src={expandedImage} alt="Expanded" style={{maxWidth:'80vw',maxHeight:'80vh',borderRadius:'12px',boxShadow:'0 2px 24px #000'}} />
    </div>
  )}
                      </td>
                      <td style={{textAlign: 'left'}}>{isCombo ? item.combo_name : item.name}</td>
                      <td style={{textAlign: 'center'}}>{isCombo ? item.sku : (item.sku || '(auto)')}</td>
                      <td style={{textAlign: 'center'}}>{isCombo ? 'Set' : (categories.find((c) => c.id === item.category_id)?.name || '-')}</td>
                      <td style={{textAlign: 'center'}}>{isCombo ? 'Set' : (units.find((u) => u.id === item.unit_of_measure_id)?.abbreviation || units.find((u) => u.id === item.unit_of_measure_id)?.name || '-')}</td>
                      <td style={{textAlign: 'center'}}>
                        {
                          (() => {
                            if (isCombo) {
                              return '-';
                            } else {
                              if (!inventory || inventory.length === 0) return <span style={{color:'#ff4d4f'}}>No inventory</span>;
                              let qty = 0;
                              if (selectedLocation) {
                                const inv = inventory.find(inv => inv.product_id === item.id && inv.location === selectedLocation);
                                qty = inv ? Number(inv.quantity) : 0;
                              } else {
                                const matchingInventory = inventory.filter(inv => inv.product_id === item.id);
                                qty = matchingInventory.reduce((sum, inv) => sum + (Number(inv.quantity) || 0), 0);
                              }
                              return qty;
                            }
                          })()
                        }
                      </td>
                      <td style={{textAlign: 'center'}}>
                        {isCombo ? (item.combo_price || item.standard_price || '-') : (item.price ? item.price : '-')}
                      </td>
                      <td style={{textAlign: 'center'}}>
                        {isCombo ? (item.promotional_price || '-') : (item.promotional_price ? item.promotional_price : '-')}
                      </td>
                      <td style={{textAlign: 'center'}}>
                        {isCombo
                          ? (item.promo_start_date && item.promo_end_date ? `${item.promo_start_date} to ${item.promo_end_date}` : '-')
                          : ((item.promo_start_date && item.promo_end_date) ? `${item.promo_start_date} to ${item.promo_end_date}` : '-')}
                      </td>
                      <td style={{textAlign: 'center', padding: '0.15rem'}}>
                        <div style={{display: 'flex', justifyContent: 'center', gap: '4px'}}>
                          <button
                            style={{background:'#00b4d8',color:'#fff',border:'none',borderRadius:'6px',padding:'6px 14px',fontWeight:'bold',cursor:'pointer'}}
                            onClick={() => {
                              // Navigate to Products.js and pass product id for editing
                              window.location.href = `/products?edit=${item.id}`;
                            }}
                          >Edit</button>
      {/* Product Edit Modal */}
      {editModalOpen && editProduct && (
        <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#23272f',padding:32,borderRadius:12,minWidth:320,maxWidth:400}}>
            <h3>Edit Product</h3>
            <div style={{marginBottom:12}}>Name: <b>{editProduct.name}</b></div>
            <div style={{marginBottom:12}}>SKU: {editProduct.sku}</div>
            <div style={{marginBottom:12}}>
              <label>Image URL:</label>
              <input type="text" value={editProduct.image_url || ''} onChange={e => setEditProduct({...editProduct, image_url: e.target.value})} style={{marginLeft:8,width:'100%'}} />
            </div>
            <div style={{display:'flex',gap:12,marginTop:18}}>
              <button onClick={async () => {
                // Save image_url to Supabase
                await supabase.from('products').update({ image_url: editProduct.image_url }).eq('id', editProduct.id);
                setEditModalOpen(false);
                fetchAll();
              }} style={{background:'#43aa8b',color:'#fff',border:'none',borderRadius:'6px',padding:'8px 18px',fontWeight:'bold',cursor:'pointer'}}>Save</button>
              <button onClick={()=>setEditModalOpen(false)} style={{background:'#e74c3c',color:'#fff',border:'none',borderRadius:'6px',padding:'8px 18px',fontWeight:'bold',cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
                          <button
                            style={{background:'#e74c3c',color:'#fff',border:'none',borderRadius:'6px',padding:'6px 14px',fontWeight:'bold',cursor:'pointer'}}
                            onClick={() => {
                              if (window.confirm('Are you sure you want to delete this product?')) {
                                handleDeleteProduct(item.id, setProducts);
                              }
                            }}
                          >Delete</button>
                          <button
                            style={{background:'#f9c74f',color:'#23272f',border:'none',borderRadius:'6px',padding:'6px 14px',fontWeight:'bold',cursor:'pointer'}}
                            onClick={() => handleOpenAdjustModal(item)}
                          >Adjust</button>
                        </div>
      {/* Manual Inventory Adjust Modal */}
      {adjustModalOpen && adjustProduct && (
        <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#23272f',padding:32,borderRadius:12,minWidth:320,maxWidth:400}}>
            <h3>Adjust Inventory</h3>
            <div style={{marginBottom:12}}>Product: <b>{adjustProduct.name}</b> (SKU: {adjustProduct.sku})</div>
            <div style={{marginBottom:12}}>
              <label>Location:</label>
              <select value={selectedLocation} onChange={handleLocationChange} style={{marginLeft:8}}>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
            <div style={{marginBottom:12}}>
              <label>Quantity:</label>
              <input type="number" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} style={{marginLeft:8,width:80}} />
            </div>
            <div style={{display:'flex',gap:12,marginTop:18}}>
              <button onClick={handleAdjustInventory} disabled={adjustLoading || !adjustQty} style={{background:'#43aa8b',color:'#fff',border:'none',borderRadius:'6px',padding:'8px 18px',fontWeight:'bold',cursor:'pointer'}}>
                {adjustLoading ? 'Saving...' : 'Save'}
              </button>
              <button onClick={()=>setAdjustModalOpen(false)} style={{background:'#e74c3c',color:'#fff',border:'none',borderRadius:'6px',padding:'8px 18px',fontWeight:'bold',cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProductsListPage;
