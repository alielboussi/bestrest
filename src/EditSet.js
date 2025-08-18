import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import supabase from "./supabase";
import "./Sets.css";
import { FaTrash } from "react-icons/fa";

export default function EditSet() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [combo, setCombo] = useState(null);
  const [setProduct, setSetProduct] = useState(null);
  const [comboItems, setComboItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [kitItems, setKitItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [units, setUnits] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [kitName, setKitName] = useState("");
  const [sku, setSku] = useState("");
  const [standardPrice, setStandardPrice] = useState("");
  const [promotionalPrice, setPromotionalPrice] = useState("");
  const [promoStart, setPromoStart] = useState("");
  const [promoEnd, setPromoEnd] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [currency, setCurrency] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      // Fetch combo and populate fields directly from combos table
      const { data: comboData } = await supabase
        .from("combos")
        .select("id, combo_name, sku, standard_price, combo_price, promotional_price, promo_start_date, promo_end_date, picture_url, currency, product_id")
        .eq("id", id)
        .single();
      setCombo(comboData);
      setKitName(comboData?.combo_name || "");
      setSku(comboData?.sku || "");
      setStandardPrice(comboData?.standard_price || comboData?.combo_price || "");
      setPromotionalPrice(comboData?.promotional_price || "");
      setPromoStart(comboData?.promo_start_date || "");
      setPromoEnd(comboData?.promo_end_date || "");
      setImageUrl(comboData?.picture_url || "");
      setCurrency(comboData?.currency || "");
      // Fetch combo_items
      const { data: itemsData } = await supabase.from("combo_items").select("*").eq("combo_id", id);
      setComboItems(itemsData || []);
      setKitItems((itemsData || []).map(item => ({ product_id: item.product_id, quantity: item.quantity })));
      // Fetch products, locations, units, categories
  const { data: prods } = await supabase.from("products").select("id, name, sku");
      setProducts(prods || []);
      const { data: locs } = await supabase.from("locations").select("id, name");
      setLocations(locs || []);
      // fetch selected locations for this combo
      const { data: comboLocs } = await supabase
        .from("combo_locations")
        .select("location_id")
        .eq("combo_id", id);
      setSelectedLocations((comboLocs || []).map(cl => String(cl.location_id)));
      const { data: unitsData } = await supabase.from("unit_of_measure").select("id, name");
      setUnits(unitsData || []);
      const { data: cats } = await supabase.from("categories").select("id, name");
      setCategories(cats || []);
      setLoading(false);
    }
    fetchData();
  }, [id]);

  // Add product to kit
  const addProductToKit = (product) => {
    setKitItems([...kitItems, { product_id: product.id, name: product.name, quantity: 1 }]);
  };

  // Filter products for search (exclude already added)
  const filteredProducts = products.filter(p => {
    if (kitItems.some(item => String(item.product_id) === String(p.id))) return false;
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (p.name && p.name.toLowerCase().includes(s)) ||
      (p.sku && String(p.sku).toLowerCase().includes(s))
    );
  });

  // Update quantity in kit
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

  // Save changes
  const handleSave = async (e) => {
    e.preventDefault();
  if (!kitName || !standardPrice || kitItems.length === 0) {
      alert("Please fill all required fields and add at least one product.");
      return;
    }
  // Update combo only (sets are stored in combos; product row may not exist)
    const { error: comboError } = await supabase
      .from("combos")
      .update({
        combo_name: kitName,
        sku,
        standard_price: standardPrice,
        combo_price: standardPrice,
        promotional_price: promotionalPrice === "" ? null : promotionalPrice,
        promo_start_date: promoStart || null,
        promo_end_date: promoEnd || null,
    picture_url: imageUrl || null,
    currency: currency || combo?.currency || null
      })
      .eq("id", id);
    if (comboError) return alert("Error updating combo: " + comboError.message);
    // Update combo_locations
    await supabase.from("combo_locations").delete().eq("combo_id", id);
    const locRows = (selectedLocations || []).map(lid => ({ combo_id: id, location_id: lid }));
    if (locRows.length > 0) {
      await supabase.from("combo_locations").insert(locRows);
    }
    // Update combo_items: delete old, insert new
    await supabase.from("combo_items").delete().eq("combo_id", id);
    for (const item of kitItems) {
      await supabase.from("combo_items").insert({
        combo_id: id,
        product_id: item.product_id,
        quantity: item.quantity
      });
    }
    alert("Set updated!");
    navigate("/sets");
  };

  if (loading) return <div style={{color:'#00b4d8', textAlign:'center', marginTop:'2rem'}}>Loading...</div>;

  return (
    <div className="products-container" style={{maxWidth: '100vw', minHeight: '100vh', height: 'auto', overflow: 'visible', padding: '0', margin: 0}}>
      <h1 className="products-title" style={{marginTop: '1rem'}}>Edit Kit / Set</h1>
      <form className="product-form" onSubmit={handleSave}>
        {/* Row 1: currency, kit name, SKU, standard price, promo price */}
        <div className="sets-row-5 sets-grid" style={{width: '100%', maxWidth: 1200, margin: '0 auto'}}>
          <select name="currency" value={currency} onChange={e => setCurrency(e.target.value)}>
            <option value="K">K</option>
            <option value="$">$</option>
            <option value="">Select Currency</option>
          </select>
          <input required name="kitName" placeholder="Kit/Set Name" value={kitName} onChange={e => setKitName(e.target.value)} />
          <input name="sku" placeholder="SKU" value={sku} onChange={e => setSku(e.target.value)} />
          <input required type="number" step="0.01" name="standardPrice" placeholder="Standard Price" value={standardPrice} onChange={e => setStandardPrice(e.target.value)} />
          <input type="number" step="0.01" name="promotionalPrice" placeholder="Promotional Price" value={promotionalPrice} onChange={e => setPromotionalPrice(e.target.value)} />
        </div>
        {/* Row 2: image URL, dates (start/end) */}
        <div className="sets-row-5 sets-grid" style={{width: '100%', maxWidth: 1200, margin: '0 auto', marginTop: '6px'}}>
          <input placeholder="Image URL" value={imageUrl} onChange={e => setImageUrl(e.target.value)} className="sets-control" />
          <input type="date" name="promoStart" placeholder="Promo Start" value={promoStart} onChange={e => setPromoStart(e.target.value)} />
          <input type="date" name="promoEnd" placeholder="Promo End" value={promoEnd} onChange={e => setPromoEnd(e.target.value)} />
        </div>
        {/* Locations row with right-aligned Save button */}
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
          <button type="submit" className="sets-save-btn" style={{background: '#00b4d8', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.5rem 1.2rem', fontWeight: 'bold', fontSize: '0.98rem', boxShadow: '0 2px 8px #00b4d855', cursor: 'pointer', width: 'auto', alignSelf: 'flex-start'}}>Save Changes</button>
        </div>
        <div className="sets-section-title" style={{color: '#00b4d8'}}>Kit Components</div>
        <div className="form-grid-search-row sets-search-row" style={{marginTop: '18px', marginBottom: '8px', width: '100%'}}>
          <div className="search-box">
            <input
              className="products-search-bar"
              placeholder="Search product to add..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{marginBottom: 0, width: '100%'}}
            />
            {search.trim().length >= 3 && filteredProducts.length > 0 && (
              <ul style={{position: 'absolute', top: '40px', left: 0, width: '100%', background: '#23272f', border: '1px solid #00b4d8', borderRadius: '6px', maxHeight: '180px', overflowY: 'auto', zIndex: 10, listStyle: 'none', margin: 0, padding: 0}}>
                {filteredProducts.map(product => {
                  const already = kitItems.some(item => String(item.product_id) === String(product.id));
                  return (
                    <li
                      key={product.id}
                      style={{padding: '8px 12px', cursor: already ? 'not-allowed' : 'pointer', color: already ? '#888' : '#e0e6ed', background: already ? '#181818' : 'inherit'}}
                      onClick={() => {
                        if (!already) {
                          addProductToKit(product);
                          setSearch("");
                        }
                      }}
                    >
                      {product.name} <span style={{color:'#00b4d8', fontSize:'0.9em'}}>({product.sku})</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
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
              {kitItems.map(item => {
                const prod = products.find(p => p.id === item.product_id);
                return (
                  <tr key={item.product_id} style={{background: '#181818'}}>
                    <td style={{textAlign: 'left'}}>{prod ? prod.name : item.product_id}</td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => updateQty(item.product_id, Number(e.target.value))}
                        style={{ width: 70, borderColor: '#00b4d8', borderRadius: '4px', background: '#23272f', color: '#e0e6ed', padding: '4px 8px' }}
                      />
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
                );
              })}
              {kitItems.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: "center", color: "#888" }}>No products added yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
  {/* Save button moved to the locations row above */}
      </form>
    </div>
  );
}
