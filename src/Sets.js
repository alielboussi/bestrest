import React, { useState, useEffect } from "react";
import supabase from "./supabase";
import "./Sets.css";
import { FaArrowLeft, FaTrash } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
// Removed user permissions imports

export default function Sets() {
  // State for selecting products and their quantities before adding to kit
  const [selectedToAdd, setSelectedToAdd] = useState({}); // { productId: { checked: bool, qty: number } }
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [kitName, setKitName] = useState("");
  const [sku, setSku] = useState("");
  const [skuMode, setSkuMode] = useState("auto"); // 'auto' | 'manual'
  const [standardPrice, setStandardPrice] = useState("");
  const [promotionalPrice, setPromotionalPrice] = useState("");
  const [promoStart, setPromoStart] = useState("");
  const [promoEnd, setPromoEnd] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [kitItems, setKitItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedLocations, setSelectedLocations] = useState([]); // array of location ids
  const [inventory, setInventory] = useState([]);
  const [units, setUnits] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState("");
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [sets, setSets] = useState([]);
  const [setsSearch, setSetsSearch] = useState("");
  const [currency, setCurrency] = useState("K");
  const [skuExists, setSkuExists] = useState(false);
  const [skuChecking, setSkuChecking] = useState(false);
  // Removed user permissions state
  const navigate = useNavigate();

  useEffect(() => {
    supabase.from("products").select("id, name, sku, unit_of_measure_id").then(({ data, error }) => {
      if (error) {
        console.error("Error fetching products:", error);
      } else {
        console.log("Fetched products:", data);
      }
      setProducts(data || []);
    });
    supabase.from("locations").select("id, name").then(({ data }) => setLocations(data || []));
    supabase.from("unit_of_measure").select("id, name").then(({ data }) => setUnits(data || []));
    supabase.from("categories").select("id, name").then(({ data }) => setCategories(data || []));
    // Fetch sets (combos) for selected location(s) using combo_locations join
    if (selectedLocations && selectedLocations.length > 0) {
      supabase
        .from("combos")
        .select("id, combo_name, sku, standard_price, combo_price, promotional_price, promo_start_date, promo_end_date, picture_url, combo_locations(location_id)")
        .then(({ data }) => {
          // Only show combos linked to any selected location
          const selectedSet = new Set((selectedLocations || []).map(x => String(x)));
          const filtered = (data || []).filter(combo => {
            const locs = combo.combo_locations ? combo.combo_locations.map(cl => String(cl.location_id)) : [];
            return locs.some(l => selectedSet.has(String(l)));
          });
          setSets(filtered);
        });
    } else {
      supabase
        .from("combos")
        .select("id, combo_name, sku, standard_price, combo_price, promotional_price, promo_start_date, promo_end_date, picture_url")
        .then(({ data }) => setSets(data || []));
    }
  }, [selectedLocations]);

  // Fetch inventory for selected location
  useEffect(() => {
    if (selectedLocations && selectedLocations.length > 0) {
      supabase
        .from("inventory")
        .select("product_id, quantity, location")
        .in("location", selectedLocations)
        .then(({ data }) => setInventory(data || []));
    } else {
      setInventory([]);
    }
  }, [selectedLocations]);

  // Removed permissions fetching logic

  // Removed permission helpers
  const canAdd = true;
  const canEdit = true;
  const canDelete = true;

  // SKU helpers
  const padSku = (n) => `#${String(n).padStart(5, '0')}`;
  const numberFromSku = (s) => {
    if (!s) return null;
    const str = String(s).trim();
    const m = str.match(/^#?(\d+)$/);
    return m ? parseInt(m[1], 10) : null;
  };
  const computeNextSku = async () => {
    // Gather used numeric SKUs from combos and products to keep sequence unique across both
    const [combosRes, productsRes] = await Promise.all([
      supabase.from('combos').select('sku'),
      supabase.from('products').select('sku')
    ]);
    const used = new Set();
    (combosRes.data || []).forEach(row => { const n = numberFromSku(row.sku); if (n !== null) used.add(n); });
    (productsRes.data || []).forEach(row => { const n = numberFromSku(row.sku); if (n !== null) used.add(n); });
    let i = 1;
    while (used.has(i)) i += 1;
    const next = padSku(i);
    setSku(next);
    return next;
  };

  useEffect(() => {
    if (skuMode === 'auto') {
      computeNextSku();
    }
  }, [skuMode]);

  // Live duplicate SKU check in manual mode
  useEffect(() => {
    let active = true;
    const run = async () => {
      if (skuMode !== 'manual' || !sku || !sku.trim()) {
        if (active) setSkuExists(false);
        return;
      }
      setSkuChecking(true);
      const [cRes, pRes] = await Promise.all([
        supabase.from('combos').select('id').eq('sku', sku).limit(1),
        supabase.from('products').select('id').eq('sku', sku).limit(1),
      ]);
      if (!active) return;
      setSkuChecking(false);
      const cDup = Array.isArray(cRes.data) && cRes.data.length > 0;
      const pDup = Array.isArray(pRes.data) && pRes.data.length > 0;
      setSkuExists(cDup || pDup);
    };
    run();
    return () => { active = false; };
  }, [sku, skuMode]);

  // Filter products for search (by name or SKU, or show all if search is empty)
  const filteredProducts = products.filter(p => {
    if (kitItems.some(item => item.product_id === p.id)) return false;
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (p.name && p.name.toLowerCase().includes(s)) ||
      (p.sku && p.sku.toLowerCase().includes(s))
    );
  });

  // Build a product stock map for the selected location
  const productStock = {};
  inventory.forEach(i => {
    productStock[i.product_id] = (productStock[i.product_id] || 0) + i.quantity;
  });

  // Helper: get product unit label (abbr or name)
  const getProductUnit = (productId) => {
    const p = products.find(pr => pr.id === productId);
    if (!p) return '-';
    const u = units.find(u => u.id === p.unit_of_measure_id);
    return (u && (u.abbreviation || u.name)) || '-';
  };

  // Add product to kit (allow adding even if stock is zero, but default quantity to 0)
  const addProductToKit = (product) => {
    const stock = productStock[product.id] || 0;
    setKitItems([...kitItems, { product_id: product.id, name: product.name, quantity: stock > 0 ? 1 : 0 }]);
  };

  // Update quantity in kit, but do not allow more than available in location or less than 0
  const updateQty = (product_id, qty) => {
    if (qty < 1) qty = 1;
    setKitItems(kitItems.map(item =>
      item.product_id === product_id ? { ...item, quantity: qty } : item
    ));
  };

  // Remove product from kit
  const removeProductFromKit = (product_id) => {
    setKitItems(kitItems.filter(item => item.product_id !== product_id));
  };

  // Save kit/set: creates entries in products, combos, combo_locations, and combo_items
  // After creation, the set will be available for inventory aggregation in OpeningStock.js
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!kitName || !standardPrice || kitItems.length === 0 || !currency || !selectedLocations || selectedLocations.length === 0) {
      alert("Please fill all required fields, select at least one location, currency, and add at least one product.");
      return;
    }
    // Ensure SKU when auto mode
    let finalSku = sku;
    if (skuMode === 'auto' || !finalSku) {
      finalSku = await computeNextSku();
    }
    // Guard: duplicate SKU check right before creating (using array result, not maybeSingle)
    const { data: skuRows } = await supabase
      .from('combos')
      .select('id')
      .eq('sku', finalSku)
      .limit(1);
    if (Array.isArray(skuRows) && skuRows.length > 0) {
      if (skuMode === 'auto') {
        // Race: recompute and retry once or twice
        let attempts = 0;
        let ok = false;
        while (attempts < 3 && !ok) {
          attempts += 1;
          finalSku = await computeNextSku();
          const { data: again } = await supabase.from('combos').select('id').eq('sku', finalSku).limit(1);
          ok = !(Array.isArray(again) && again.length > 0);
        }
        if (!ok) {
          alert('Unable to assign a unique SKU automatically. Please switch to Manual and set a unique SKU.');
          return;
        }
      } else {
        alert('SKU already exists, please choose another.');
        return;
      }
    }
    // 1. Check for existing combo by name or SKU
    const { data: existingList } = await supabase
      .from("combos")
      .select("id")
      .or(`combo_name.eq.${kitName},sku.eq.${finalSku}`)
      .limit(1);
    if (Array.isArray(existingList) && existingList.length > 0) {
      alert("A set/combo with this name or SKU already exists.");
      return;
    }

    // 2. Create only the combo (no product row)
    const { data: combo, error: comboError } = await supabase
      .from("combos")
      .insert([{
        combo_name: kitName,
  sku: finalSku,
        standard_price: standardPrice,
        combo_price: standardPrice,
        promotional_price: promotionalPrice === "" ? null : promotionalPrice,
        promo_start_date: promoStart || null,
        promo_end_date: promoEnd || null,
        picture_url: imageUrl || null,
        currency: currency
      }])
      .select()
      .single();
    if (comboError) return alert("Error creating combo: " + comboError.message);

    // 3. Link combo to selected locations in combo_locations
    const locRows = (selectedLocations || []).map(lid => ({ combo_id: combo.id, location_id: lid }));
    if (locRows.length > 0) {
      await supabase.from("combo_locations").insert(locRows);
    }

    // 4. Insert combo_items for each component product
    for (const item of kitItems) {
      await supabase.from("combo_items").insert({
        combo_id: combo.id,
        product_id: item.product_id,
        quantity: item.quantity
      });
    }

    // Note: Inventory for the set will be calculated and updated in OpeningStock.js after stocktake
    alert("Kit/Set created!");
    setKitName(""); setStandardPrice(""); setPromotionalPrice(""); setPromoStart(""); setPromoEnd(""); setKitItems([]); setImageUrl("");
  setCurrency("K");
  setSelectedLocations([]);
    if (skuMode === 'auto') {
      await computeNextSku();
    } else {
      setSku("");
    }
  };

  // Removed permission access check

  const shouldEnableScroll = (search.trim() !== "") || (kitItems.length > 0) || (setsSearch.trim() !== "");

  return (
    <div
      className="products-container"
      style={{
        maxWidth: '100vw',
        height: '100vh',
        overflowY: shouldEnableScroll ? 'auto' : 'hidden',
        overflowX: 'hidden',
        padding: 0,
        margin: 0
      }}
    >
      <h1 className="products-title" style={{marginTop: '1rem'}}>Create Kit / Set</h1>
      <form className="product-form" onSubmit={handleSubmit}>
  {/* Row 1: currency, unit, category, SKU, kit name */}
  <div className="sets-row-5 sets-grid" style={{width: '100%', maxWidth: 1200, margin: '0 auto'}}>
          <select required name="currency" value={currency} onChange={e => setCurrency(e.target.value)}>
            <option value="K">K</option>
            <option value="$">$</option>
            <option value="">Select Currency</option>
          </select>
          <select required name="unit" value={selectedUnit} onChange={e => setSelectedUnit(e.target.value)}>
            <option value="">Select Unit</option>
            {units.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <select required name="category" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
            <option value="">Select Category</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div style={{display:'flex', alignItems:'center', gap:6}}>
            <select value={skuMode} onChange={e => setSkuMode(e.target.value)} style={{height:30}}>
              <option value="auto">Auto</option>
              <option value="manual">Manual</option>
            </select>
            <div style={{display:'flex', flexDirection:'column'}}>
              <input
                name="sku"
                placeholder="SKU"
                value={sku}
                onChange={e => setSku(e.target.value)}
                readOnly={skuMode==='auto'}
                style={skuMode==='manual' && skuExists ? { borderColor:'#ff4d4d' } : undefined}
                aria-invalid={skuMode==='manual' && skuExists}
              />
              {skuMode==='manual' && sku && skuExists && (
                <span style={{ color:'#ff6b6b', fontSize:'0.8rem' }}>SKU already exists</span>
              )}
            </div>
          </div>
          <input required name="kitName" placeholder="Kit/Set Name" value={kitName} onChange={e => setKitName(e.target.value)} />
        </div>
  {/* Auto SKU mode will always assign the next missing SKU in sequence; no separate fill button needed. */}
        {/* Row 2: prices, dates, image URL */}
        <div className="sets-row-5 sets-grid" style={{width: '100%', maxWidth: 1200, margin: '0 auto', marginTop: '6px'}}>
          <input required type="number" step="0.01" name="standardPrice" placeholder="Standard Price" value={standardPrice} onChange={e => setStandardPrice(e.target.value)} />
          <input type="number" step="0.01" name="promotionalPrice" placeholder="Promotional Price" value={promotionalPrice} onChange={e => setPromotionalPrice(e.target.value)} />
          <input type="date" name="promoStart" placeholder="Promo Start" value={promoStart} onChange={e => setPromoStart(e.target.value)} />
          <input type="date" name="promoEnd" placeholder="Promo End" value={promoEnd} onChange={e => setPromoEnd(e.target.value)} />
          <input placeholder="Image URL" value={imageUrl} onChange={e => setImageUrl(e.target.value)} className="sets-control" />
        </div>
        {/* Locations row with right-aligned Create button */}
        <div className="sets-locations-row" style={{marginTop: '8px', width: '100%'}}>
          <div className="sets-locations">
            <div style={{fontSize: '0.9rem', color: '#00b4d8', marginBottom: 4}}>Locations</div>
            <div style={{display:'flex', flexWrap:'wrap', gap:'6px 12px'}}>
              {locations.map(loc => {
                const idStr = String(loc.id);
                const checked = (selectedLocations || []).some(x => String(x) === idStr);
                return (
                  <label key={loc.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedLocations(prev => Array.from(new Set([...(prev || []).map(String), idStr])));
                        } else {
                          setSelectedLocations(prev => (prev || []).filter(x => String(x) !== idStr));
                        }
                      }}
                    />
                    <span>{loc.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <button
            type="submit"
            className="sets-save-btn"
            disabled={skuMode==='manual' && skuExists}
            title={skuMode==='manual' && skuExists ? 'SKU already exists' : undefined}
            style={{background: '#00b4d8', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.5rem 1.2rem', fontWeight: 'bold', fontSize: '0.98rem', boxShadow: '0 2px 8px #00b4d855', cursor: skuMode==='manual' && skuExists ? 'not-allowed' : 'pointer', opacity: skuMode==='manual' && skuExists ? 0.7 : 1, width: 'auto', alignSelf: 'flex-start'}}
          >
            Create Kit/Set
          </button>
        </div>

        <div className="sets-section-title" style={{color: '#00b4d8'}}>Kit Components</div>
        <div className="form-grid-search-row sets-search-row" style={{marginTop: '12px', marginBottom: '8px', width: '100%'}}>
          <div className="search-box">
            <input
              className="products-search-bar"
              placeholder="Search product to add..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{marginBottom: 0, width: '100%'}}
            />
            {/* Dropdown for matching products */}
      {search.trim().length >= 3 && filteredProducts.length > 0 && (
              <ul style={{position: 'absolute', top: '40px', left: 0, width: '100%', background: '#23272f', border: '1px solid #00b4d8', borderRadius: '6px', maxHeight: '180px', overflowY: 'auto', zIndex: 10, listStyle: 'none', margin: 0, padding: 0}}>
                {filteredProducts.map(product => (
                  <li
                    key={product.id}
                    style={{padding: '8px 12px', cursor: kitItems.some(item => item.product_id === product.id) ? 'not-allowed' : 'pointer', color: kitItems.some(item => item.product_id === product.id) ? '#888' : '#e0e6ed', background: kitItems.some(item => item.product_id === product.id) ? '#181818' : 'inherit'}}
                    onClick={() => {
                      if (!kitItems.some(item => item.product_id === product.id)) {
                        setKitItems(prev => [...prev, { product_id: product.id, name: product.name, quantity: 1 }]);
                        setSearch(""); // Clear search after adding
                      }
                    }}
                  >
        {product.name} <span style={{color:'#00b4d8', fontSize:'0.9em'}}>({product.sku})</span>
        <span style={{color:'#9aa', fontSize:'0.9em'}}> • {getProductUnit(product.id)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <input
            type="text"
            className="sets-search-box"
            placeholder="Search sets..."
            value={setsSearch}
            onChange={e => setSetsSearch(e.target.value)}
          />
        </div>

  {/* Save button is now on the locations row */}

        {/* Removed available products table. Products are now added via dropdown above. */}

        {/* Show sets table with its own search when not searching products */}
        {search.trim() === "" && (
          <div className="sets-list" style={{width: '100%', marginTop: '0.5rem', overflowY: 'auto', maxHeight: '350px'}}>
            {/* Search input provided above in the search row */}
            <table style={{width: '100%', minWidth: 600, background: 'transparent', color: '#e0e6ed', borderCollapse: 'collapse'}}>
              <thead>
                <tr style={{background: '#23272f'}}>
                  <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', color: '#00b4d8', textAlign: 'left'}}>Set Name</th>
                  <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', color: '#00b4d8', width: 120}}>SKU</th>
                  <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', color: '#00b4d8', width: 120}}>Standard Price</th>
                  <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', color: '#00b4d8', width: 120}}>Promotional Price</th>
                </tr>
              </thead>
              <tbody>
                {sets.filter(set => {
                  const s = setsSearch.trim().toLowerCase();
                  if (!s) return false; // hide all sets until a search term is entered
                  return (
                    (set.combo_name && set.combo_name.toLowerCase().includes(s)) ||
                    (set.sku && set.sku.toLowerCase().includes(s))
                  );
                }).map(set => (
                  <tr key={set.id} style={{background: '#181818'}}>
                    <td style={{textAlign: 'left'}}>{set.combo_name}</td>
                    <td>{set.sku}</td>
                    <td>{set.standard_price || set.combo_price || '-'}</td>
                    <td>{set.promotional_price || '-'}</td>
                    <td>
                      <button
                        type="button"
                        style={{background: '#00b4d8', color: '#fff', border: 'none', borderRadius: '5px', padding: '6px 14px', fontSize: '1rem', cursor: 'pointer'}}
                        onClick={() => navigate(`/edit-set/${set.id}`)}
                      >Edit</button>
                    </td>
                  </tr>
                ))}
                {sets.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", color: "#888" }}>No sets found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {/* Show kit items table only when searching products or adding to kit */}
        {(search.trim() !== "" || kitItems.length > 0) && (
          <div className="products-list" style={{width: '100%', marginTop: '0.5rem', overflowY: 'auto', maxHeight: '350px'}}>
            <table style={{width: '100%', minWidth: 700, background: 'transparent', color: '#e0e6ed', borderCollapse: 'collapse'}}>
              <thead>
                <tr style={{background: '#23272f'}}>
                  <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', color: '#00b4d8', textAlign: 'left'}}>Product Name</th>
                  <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', color: '#00b4d8', width: 120}}>Unit</th>
                  <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', color: '#00b4d8', width: 120}}>Quantity</th>
                  <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', color: '#00b4d8', width: 60}}>Remove</th>
                </tr>
              </thead>
              <tbody>
                {kitItems.map(item => (
                  <tr key={item.product_id} style={{background: '#181818'}}>
                    <td style={{textAlign: 'left'}}>{item.name}</td>
                    <td>{getProductUnit(item.product_id)}</td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => updateQty(item.product_id, Number(e.target.value))}
                        style={{ width: 70, borderColor: '#00b4d8', borderRadius: '4px', background: '#23272f', color: '#e0e6ed', padding: '4px 8px' }}
                      />
                      <span style={{ color: '#00b4d8', fontSize: '0.9em', marginLeft: 6 }}>
                        (Stock: {productStock[item.product_id] || 0})
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="sets-delete-btn"
                        onClick={() => removeProductFromKit(item.product_id)}
                        style={{background: '#ff4d4d', color: '#fff', border: 'none', borderRadius: '5px', padding: '6px 10px', fontSize: '1rem', cursor: 'pointer'}}>
                        <FaTrash />
                      </button>
                    </td>
                  </tr>
                ))}
                {kitItems.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", color: "#888" }}>No products added yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
            {products.length === 0 && (
              <div style={{ color: '#ff4d4d', marginTop: '1rem', textAlign: 'center' }}>
                No products found in the database. Please check your Supabase connection and products table.
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}