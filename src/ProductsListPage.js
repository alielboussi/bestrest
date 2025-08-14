import React, { useState, useEffect } from "react";
import supabase from "./supabase";
import "./Products.css";

// Delete product handler
const handleDeleteProduct = async (productId, setProducts) => {
  try {
    await supabase.from('products').delete().eq('id', productId);
    setProducts(prev => prev.filter(p => p.id !== productId));
  } catch (err) {
    alert('Failed to delete product: ' + (err.message || err));
  }
};

function ProductsListPage() {
  const [imageEditModalOpen, setImageEditModalOpen] = useState(false);
  const [imageEditProduct, setImageEditProduct] = useState(null);
  const [imageEditFile, setImageEditFile] = useState(null);
  const [imageEditLoading, setImageEditLoading] = useState(false);
  const [expandedImage, setExpandedImage] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState(null);
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteProductId, setDeleteProductId] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

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
      // Check if opening stock exists for this product/location
      let adjustmentType = 'opening';
      const { data: openingSession } = await supabase
        .from('opening_stock_sessions')
        .select('id')
        .eq('location_id', locationId)
        .eq('status', 'submitted');
      if (openingSession && openingSession.length > 0) {
        // Check if this product is in opening_stock_entries for this session
        const sessionIds = openingSession.map(s => s.id);
        const { data: openingEntry } = await supabase
          .from('opening_stock_entries')
          .select('id')
          .in('session_id', sessionIds)
          .eq('product_id', adjustProduct.id);
        if (openingEntry && openingEntry.length > 0) {
          adjustmentType = 'Stock Transfer Qty Adjustment';
        }
      }
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
  const [imageFilter, setImageFilter] = useState("all"); // all | with | without

  // Count products without images
  const withoutImageCount = products.filter(p => !p.image_url || p.image_url.trim() === "").length;
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
          .select(`id, name, sku, sku_type, cost_price, price, promotional_price, promo_start_date, promo_end_date, currency, category_id, unit_of_measure_id, created_at, image_url, product_images(image_url), product_locations(location_id)`)
          .order("created_at", { ascending: false }),
        supabase.from("categories").select("id, name"),
        supabase.from("locations").select("id, name"),
        supabase.from("unit_of_measure").select("id, name, abbreviation"),
        supabase.from("combos").select("id, combo_name, sku, combo_price, standard_price, promotional_price, promo_start_date, promo_end_date, picture_url, currency"),
        supabase.from("combo_locations").select("combo_id, location_id"),
        supabase.from("combo_items").select("combo_id, product_id, quantity"),
      ]);
      // Map image_url from product_images array to direct property (prefer products.image_url)
      const mappedProducts = (products || []).map(p => {
        const related = Array.isArray(p.product_images) && p.product_images.length > 0 ? p.product_images[0].image_url : "";
        const finalUrl = (p.image_url && p.image_url.trim() !== "") ? p.image_url : (related || "");
        return { ...p, image_url: finalUrl };
      });
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

  // Filter products by location, search, and image presence
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
      // Image filter
      if (imageFilter === "with") {
        if (!product.image_url || product.image_url.trim() === "") return false;
      } else if (imageFilter === "without") {
        if (product.image_url && product.image_url.trim() !== "") return false;
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
        <select value={imageFilter} onChange={e => setImageFilter(e.target.value)} style={{marginTop: '2mm', padding: '0.5rem 1rem', fontSize: '1.1rem', borderRadius: '6px', border: '1px solid #00b4d8', width: '220px'}}>
          <option value="all">All Products</option>
          <option value="with">With Image</option>
          <option value="without">
            Without Image
            {imageFilter === 'without' && (
              <span style={{marginLeft:6, color:'#f77f00', fontWeight:'bold', fontSize:'0.95em'}}>
                ({withoutImageCount})
              </span>
            )}
          </option>
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
                              style={{cursor: 'pointer', maxWidth: '48px', maxHeight: '48px', borderRadius: '6px', background:'#222'}}
                              onClick={e => {
                                e.preventDefault();
                                setExpandedImage(item.picture_url);
                              }}
                              onError={e => {
                                e.target.onerror = null;
                                e.target.src = '/default-set-image.png';
                              }}
                            />
                          ) : (
                            <img src="/default-set-image.png" alt="Set" className="product-image-thumb" style={{maxWidth: '48px', maxHeight: '48px', borderRadius: '6px', background:'#222'}} />
                          )
                        ) : (
                          item.image_url && item.image_url.trim() !== '' ? (
                            <img
                              src={item.image_url}
                              alt="Product"
                              className="product-image-thumb"
                              style={{cursor: 'pointer', maxWidth: '48px', maxHeight: '48px', borderRadius: '6px', background:'#222'}}
                              onClick={e => {
                                e.preventDefault();
                                setExpandedImage(item.image_url);
                              }}
                              onError={e => {
                                e.target.onerror = null;
                                e.target.src = '/default-product-image.png';
                              }}
                            />
                          ) : (
                            <img src="/default-product-image.png" alt="Product" className="product-image-thumb" style={{maxWidth: '48px', maxHeight: '48px', borderRadius: '6px', background:'#222'}} />
                          )
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
                          <button
                            style={{background:'#f9c74f',color:'#23272f',border:'none',borderRadius:'6px',padding:'6px 14px',fontWeight:'bold',cursor:'pointer'}}
                            onClick={() => {
                              setImageEditProduct(item);
                              setImageEditFile(null);
                              setImageEditModalOpen(true);
                            }}
                          >Edit Image</button>
                          <button
                            style={{background:'#e74c3c',color:'#fff',border:'none',borderRadius:'6px',padding:'6px 14px',fontWeight:'bold',cursor:'pointer'}}
                            onClick={() => {
                              setDeleteProductId(item.id);
                              setDeleteConfirmText("");
                              setDeleteConfirmOpen(true);
                            }}
                          >Delete</button>
      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && (
        <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.6)',zIndex:4000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#23272f',padding:32,borderRadius:12,minWidth:320,maxWidth:400,display:'flex',flexDirection:'column',alignItems:'center'}}>
            <h3>Confirm Product Deletion</h3>
            <div style={{marginBottom:16}}>Type <b>yes</b> to confirm deletion of this product.</div>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              style={{marginBottom:18, padding:'8px', borderRadius:'6px', border:'1px solid #00b4d8', width:'80%'}}
              autoFocus
            />
            <div style={{display:'flex',gap:12}}>
              <button
                disabled={deleteConfirmText.trim().toLowerCase() !== 'yes'}
                onClick={async () => {
                  await handleDeleteProduct(deleteProductId, setProducts);
                  setDeleteConfirmOpen(false);
                  setDeleteProductId(null);
                  setDeleteConfirmText("");
                }}
                style={{background:'#e74c3c',color:'#fff',border:'none',borderRadius:'6px',padding:'8px 18px',fontWeight:'bold',cursor: deleteConfirmText.trim().toLowerCase() === 'yes' ? 'pointer' : 'not-allowed'}}
              >Confirm</button>
              <button
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDeleteProductId(null);
                  setDeleteConfirmText("");
                }}
                style={{background:'#888',color:'#fff',border:'none',borderRadius:'6px',padding:'8px 18px',fontWeight:'bold',cursor:'pointer'}}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}
                          <button
                            style={{background:'#f9c74f',color:'#23272f',border:'none',borderRadius:'6px',padding:'6px 14px',fontWeight:'bold',cursor:'pointer'}}
                            onClick={() => handleOpenAdjustModal(item)}
                          >Adjust</button>
                        </div>
                      </td>
                      <td style={{textAlign: 'center'}}></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ======== FIX: Modals rendered once, outside the map, positioned fixed ======== */}

      {/* Image Expansion Modal */}
      {expandedImage && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0,
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

      {/* Product Image Edit Modal */}
      {imageEditModalOpen && imageEditProduct && (
        <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.6)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#23272f',padding:32,borderRadius:12,minWidth:320,maxWidth:400}}>
            <h3>Edit Product Image</h3>
            <div style={{marginBottom:12}}>Product: <b>{imageEditProduct.name}</b></div>
            <input type="file" accept="image/*" onChange={e => setImageEditFile(e.target.files[0])} style={{marginBottom:12}} />
            {imageEditProduct.image_url && (
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                <img src={imageEditProduct.image_url} alt="Current" style={{maxWidth:'80px',maxHeight:'80px',borderRadius:'8px'}} />
                <button
                  onClick={async () => {
                    setImageEditLoading(true);
                    try {
                      // Remove from product_images table
                      await supabase.from('product_images').delete().eq('product_id', imageEditProduct.id);
                      // Remove from products table
                      await supabase.from('products').update({ image_url: '' }).eq('id', imageEditProduct.id);
                      setImageEditModalOpen(false);
                      setImageEditProduct(null);
                      setImageEditFile(null);
                      await fetchAll();
                    } catch (err) {
                      alert('Failed to remove image: ' + (err.message || err));
                    } finally {
                      setImageEditLoading(false);
                    }
                  }}
                  style={{background:'#e74c3c',color:'#fff',border:'none',borderRadius:'6px',padding:'6px 14px',fontWeight:'bold',cursor:'pointer'}}
                  disabled={imageEditLoading}
                >Remove Image</button>
              </div>
            )}
            <div style={{display:'flex',gap:12,marginTop:18}}>
              <button
                disabled={!imageEditFile || imageEditLoading}
                onClick={async () => {
                  if (!imageEditFile) return;
                  setImageEditLoading(true);
                  try {
                    const file = imageEditFile;
                    const fileExt = file.name.split('.').pop();
                    // FIX: stable, unique path per product
                    const filePath = `products/${imageEditProduct.id}/main.${fileExt}`;
                    // Upload to bucket 'productimages'
                    const { error: uploadError } = await supabase.storage.from('productimages').upload(filePath, file, { upsert: true });
                    if (uploadError) throw uploadError;
                    // Get public URL
                    const { data: publicUrlData } = supabase.storage.from('productimages').getPublicUrl(filePath);
                    const publicUrl = publicUrlData?.publicUrl;
                    if (!publicUrl) throw new Error('Failed to get public URL for image.');
                    // Insert into product_images table
                    await supabase.from('product_images').insert([
                      { product_id: imageEditProduct.id, image_url: publicUrl }
                    ]);
                    // Update image_url in products table
                    await supabase.from('products').update({ image_url: publicUrl }).eq('id', imageEditProduct.id);
                    setImageEditModalOpen(false);
                    setImageEditProduct(null);
                    setImageEditFile(null);
                    // Instead of window.location.reload(), just refetch products and keep filter
                    await fetchAll();
                  } catch (err) {
                    alert('Failed to upload image: ' + (err.message || err));
                  } finally {
                    setImageEditLoading(false);
                  }
                }}
                style={{background:'#43aa8b',color:'#fff',border:'none',borderRadius:'6px',padding:'8px 18px',fontWeight:'bold',cursor:'pointer'}}
              >Save</button>
              <button
                onClick={() => {
                  setImageEditModalOpen(false);
                  setImageEditProduct(null);
                  setImageEditFile(null);
                }}
                style={{background:'#e74c3c',color:'#fff',border:'none',borderRadius:'6px',padding:'8px 18px',fontWeight:'bold',cursor:'pointer'}}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

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
      {/* ======== End fixed modals ======== */}
    </div>
  );
}

export default ProductsListPage;
