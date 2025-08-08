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
  const [standardPrice, setStandardPrice] = useState("");
  const [promotionalPrice, setPromotionalPrice] = useState("");
  const [promoStart, setPromoStart] = useState("");
  const [promoEnd, setPromoEnd] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [kitItems, setKitItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [inventory, setInventory] = useState([]);
  const [units, setUnits] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState("");
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [sets, setSets] = useState([]);
  const [setsSearch, setSetsSearch] = useState("");
  const [currency, setCurrency] = useState("K");
  // Removed user permissions state
  const navigate = useNavigate();

  useEffect(() => {
    supabase.from("products").select("id, name, sku").then(({ data, error }) => {
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
    // Fetch sets (combos) for selected location using combo_locations join
    if (selectedLocation) {
      supabase
        .from("combos")
        .select("id, combo_name, sku, standard_price, combo_price, promotional_price, promo_start_date, promo_end_date, picture_url, combo_locations(location_id)")
        .then(({ data }) => {
          // Only show combos linked to selected location
          const filtered = (data || []).filter(combo => {
            const locs = combo.combo_locations ? combo.combo_locations.map(cl => String(cl.location_id)) : [];
            return locs.includes(String(selectedLocation));
          });
          setSets(filtered);
        });
    } else {
      supabase
        .from("combos")
        .select("id, combo_name, sku, standard_price, combo_price, promotional_price, promo_start_date, promo_end_date, picture_url")
        .then(({ data }) => setSets(data || []));
    }
  }, []);

  // Fetch inventory for selected location
  useEffect(() => {
    if (selectedLocation) {
      supabase.from("inventory").select("product_id, quantity, location").eq("location", selectedLocation).then(({ data }) => setInventory(data || []));
    } else {
      setInventory([]);
    }
  }, [selectedLocation]);

  // Removed permissions fetching logic

  // Removed permission helpers
  const canAdd = true;
  const canEdit = true;
  const canDelete = true;

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
    if (!kitName || !standardPrice || kitItems.length === 0 || !selectedLocation || !currency) {
      alert("Please fill all required fields, select a location, currency, and add at least one product.");
      return;
    }
    // 1. Create a product row for the set
    const { data: setProduct, error: prodError } = await supabase
      .from("products")
      .insert([{
        name: kitName,
        sku,
        price: standardPrice,
        standard_price: standardPrice,
        promotional_price: promotionalPrice === "" ? null : promotionalPrice,
        promo_start_date: promoStart || null,
        promo_end_date: promoEnd || null,
        image_url: imageUrl || null,
        category_id: null, // Optionally set a category for sets
        unit_of_measure_id: selectedUnit || null // Set selected unit
      }])
      .select()
      .single();
    if (prodError) return alert("Error creating set product: " + prodError.message);

    // 2. Create the combo and link to set product_id
    const { data: combo, error: comboError } = await supabase
      .from("combos")
      .insert([{
        combo_name: kitName,
        sku,
        standard_price: standardPrice,
        combo_price: standardPrice,
        promotional_price: promotionalPrice === "" ? null : promotionalPrice,
        promo_start_date: promoStart || null,
        promo_end_date: promoEnd || null,
        picture_url: imageUrl || null,
        product_id: setProduct.id, // Link combo to set product
        currency: currency
      }])
      .select()
      .single();
    if (comboError) return alert("Error creating combo: " + comboError.message);

    // 3. Link combo to location in combo_locations
    await supabase.from("combo_locations").insert({
      combo_id: combo.id,
      location_id: selectedLocation
    });

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
    setKitName(""); setSku(""); setStandardPrice(""); setPromotionalPrice(""); setPromoStart(""); setPromoEnd(""); setKitItems([]); setImageUrl("");
    setCurrency("K");
  };

  // Removed permission access check

  return (
    <div className="products-container" style={{maxWidth: '100vw', minHeight: '100vh', height: 'auto', overflow: 'visible', padding: '0', margin: 0}}>
      <h1 className="products-title" style={{marginTop: '1rem'}}>Create Kit / Set</h1>
      <form className="product-form" onSubmit={handleSubmit}>
        <div className="form-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(6, 150px)', gap: '18px', width: 'fit-content', margin: '0 auto', alignItems: 'center'}}>
          <select required name="location" value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)} style={{borderColor: '#00b4d8', minWidth: 0, width: '150px', maxWidth: '150px', height: '40px', verticalAlign: 'middle', padding: '0 8px'}}>
            <option value="">Select Location</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
          <select required name="currency" value={currency} onChange={e => setCurrency(e.target.value)} style={{borderColor: '#00b4d8', minWidth: 0, width: '150px', maxWidth: '150px', height: '40px', verticalAlign: 'middle', padding: '0 8px'}}>
            <option value="K">K</option>
            <option value="$">$</option>
            <option value="">Select Currency</option>
          </select>
          <select required name="unit" value={selectedUnit} onChange={e => setSelectedUnit(e.target.value)} style={{borderColor: '#00b4d8', minWidth: 0, width: '150px', maxWidth: '150px', height: '40px', verticalAlign: 'middle', padding: '0 8px'}}>
            <option value="">Select Unit</option>
            {units.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <select required name="category" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} style={{borderColor: '#00b4d8', minWidth: 0, width: '150px', maxWidth: '150px', height: '40px', verticalAlign: 'middle', padding: '0 8px'}}>
            <option value="">Select Category</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input required name="kitName" placeholder="Kit/Set Name" value={kitName} onChange={e => setKitName(e.target.value)} style={{borderColor: '#00b4d8', minWidth: 0, width: '150px', maxWidth: '150px', height: '40px', verticalAlign: 'middle', padding: '0 8px', boxSizing: 'border-box', display: 'block', margin: 0}} />
          <input name="sku" placeholder="SKU" value={sku} onChange={e => setSku(e.target.value)} style={{borderColor: '#00b4d8', minWidth: 0, width: '150px', maxWidth: '150px', height: '40px', verticalAlign: 'middle', padding: '0 8px', boxSizing: 'border-box', display: 'block', margin: 0}} />
        </div>
        <div className="form-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(2, 150px)', gap: '18px', width: 'fit-content', margin: '0 auto', alignItems: 'center', marginTop: '8px'}}>
          <input required type="number" step="0.01" name="standardPrice" placeholder="Standard Price" value={standardPrice} onChange={e => setStandardPrice(e.target.value)} style={{borderColor: '#00b4d8', minWidth: 0, width: '150px', maxWidth: '150px', height: '40px', verticalAlign: 'middle', padding: '0 8px'}} />
          <input type="number" step="0.01" name="promotionalPrice" placeholder="Promotional Price" value={promotionalPrice} onChange={e => setPromotionalPrice(e.target.value)} style={{borderColor: '#00b4d8', minWidth: 0, width: '150px', maxWidth: '150px', height: '40px', verticalAlign: 'middle', padding: '0 8px'}} />
        </div>
        <div className="form-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(2, 150px)', gap: '18px', width: 'fit-content', margin: '0 auto', alignItems: 'center', marginTop: '8px'}}>
          <input type="date" name="promoStart" placeholder="Promo Start" value={promoStart} onChange={e => setPromoStart(e.target.value)} style={{borderColor: '#00b4d8', minWidth: 0, width: '150px', maxWidth: '150px', height: '40px', verticalAlign: 'middle', padding: '0 8px'}} />
          <input type="date" name="promoEnd" placeholder="Promo End" value={promoEnd} onChange={e => setPromoEnd(e.target.value)} style={{borderColor: '#00b4d8', minWidth: 0, width: '150px', maxWidth: '150px', height: '40px', verticalAlign: 'middle', padding: '0 8px'}} />
        </div>

        <input placeholder="Image URL" value={imageUrl} onChange={e => setImageUrl(e.target.value)} style={{marginBottom: '10px', borderColor: '#00b4d8'}} />
        <div className="sets-section-title" style={{color: '#00b4d8'}}>Kit Components</div>
        <div className="form-grid-search-row" style={{marginTop: '18px', marginBottom: '8px', width: '100%', display: 'flex', justifyContent: 'flex-start'}}>
          <div style={{position: 'relative', width: '350px'}}>
            <input
              className="products-search-bar"
              placeholder="Search product to add..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{marginBottom: 0, width: '100%', borderColor: '#00b4d8', background: '#23272f', color: '#e0e6ed', borderRadius: '6px', padding: '8px 12px', fontSize: '1rem'}}
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
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Save button above products table, aligned right, smaller and higher */}
        <div style={{display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '2px', marginTop: '-18px', width: '100%'}}>
          <button type="submit" className="sets-save-btn" style={{background: '#00b4d8', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.5rem 1.2rem', fontWeight: 'bold', fontSize: '0.98rem', boxShadow: '0 2px 8px #00b4d855', cursor: 'pointer', width: 'auto'}}>Create Kit/Set</button>
        </div>

        {/* Removed available products table. Products are now added via dropdown above. */}

        {/* Show sets table with its own search when not searching products */}
        {search.trim() === "" && (
          <div className="sets-list" style={{width: '100%', marginTop: '0.5rem', overflowY: 'auto', maxHeight: '350px'}}>
            <div style={{marginBottom: '8px', display: 'flex', alignItems: 'center'}}>
              <input
                type="text"
                placeholder="Search sets..."
                value={setsSearch}
                onChange={e => setSetsSearch(e.target.value)}
                style={{borderColor: '#00b4d8', borderRadius: '6px', padding: '6px 12px', width: '250px', background: '#23272f', color: '#e0e6ed', fontSize: '1rem'}}
              />
            </div>
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
                  if (!s) return true;
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
            <table style={{width: '100%', minWidth: 600, background: 'transparent', color: '#e0e6ed', borderCollapse: 'collapse'}}>
              <thead>
                <tr style={{background: '#23272f'}}>
                  <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', color: '#00b4d8', textAlign: 'left'}}>Product Name</th>
                  <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', color: '#00b4d8', width: 120}}>Quantity</th>
                  <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', color: '#00b4d8', width: 60}}>Remove</th>
                </tr>
              </thead>
              <tbody>
                {kitItems.map(item => (
                  <tr key={item.product_id} style={{background: '#181818'}}>
                    <td style={{textAlign: 'left'}}>{item.name}</td>
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