import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./Products.css";
import supabase from "./supabase";


// ...existing code...

const initialForm = {
  name: "",
  sku: "",
  sku_type: "auto", // default to "auto" (will be mapped to boolean)
  cost_price: "",
  price: "",
  promotional_price: "",
  promo_start_date: "",
  promo_end_date: "",
  currency: "",
  category_id: "",
  unit_of_measure_id: "",
  locations: [],
  image: null,
};


function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [locations, setLocations] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    fetchAll();
    fetchUnits();
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    const { data, error } = await supabase.from('inventory').select('product_id, quantity');
    if (!error) {
      console.log('Fetched inventory:', data);
      setInventory(data || []);
    }
  };

  const fetchUnits = async () => {
    const { data, error } = await supabase.from('unit_of_measure').select('*').order('created_at', { ascending: false });
    if (!error) setUnits(data || []);
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [{ data: products }, { data: categories }, { data: locations }] = await Promise.all([
        supabase.from("products").select("id, name, sku, sku_type, cost_price, price, promotional_price, promo_start_date, promo_end_date, currency, category_id, unit_of_measure_id, created_at").order("created_at", { ascending: false }),
        supabase.from("categories").select("id, name"),
        supabase.from("locations").select("id, name"),
      ]);
      setProducts(products || []);
      setCategories(categories || []);
      setLocations(locations || []);
    } catch (err) {
      setError("Failed to fetch data.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, files } = e.target;
    if (name === "locations") {
      // Multi-select
      const options = Array.from(e.target.selectedOptions, (opt) => opt.value);
      setForm((f) => ({ ...f, locations: options }));
    } else if (type === "file") {
      setForm((f) => ({ ...f, image: files[0] }));
    } else {
      setForm((f) => ({ ...f, [name]: value }));
    }
  };

  const handleEdit = (product) => {
    setForm({
      name: product.name || "",
      sku: product.sku || "",
      sku_type: product.sku_type ? "auto" : "manual", // map boolean to string
      cost_price: product.cost_price || "",
      price: product.price || "",
      promotional_price: product.promotional_price || "",
      promo_start_date: product.promo_start_date || "",
      promo_end_date: product.promo_end_date || "",
      currency: product.currency || "",
      category_id: product.category_id || "",
      unit_of_measure_id: product.unit_of_measure_id || "",
      locations: product.product_locations ? product.product_locations.map((pl) => pl.location_id) : [],
      image: null,
    });
    setEditingId(product.id);
    setImageUrl(product.product_images && product.product_images[0] ? product.product_images[0].image_url : "");
  };

  const handleCancelEdit = () => {
    setForm(initialForm);
    setEditingId(null);
    setImageUrl("");
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
      fetchAll();
    } catch (err) {
      setError("Failed to delete product.");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() && !form.sku.trim() && !form.price) {
      setError('Please enter at least one field (name, SKU, or price).');
      return;
    }
    setSaving(true);
    setError("");
    try {
      let productId = editingId;
      // Prepare product data
      const productData = {
        name: form.name,
        sku: form.sku,
        sku_type: form.sku_type === "auto",
        cost_price: form.cost_price ? parseFloat(form.cost_price) : null,
        price: form.price ? parseFloat(form.price) : null,
        promotional_price: form.promotional_price ? parseFloat(form.promotional_price) : null,
        promo_start_date: form.promo_start_date || null,
        promo_end_date: form.promo_end_date || null,
        currency: form.currency,
        category_id: form.category_id ? parseInt(form.category_id) : null,
        unit_of_measure_id: form.unit_of_measure_id ? parseInt(form.unit_of_measure_id) : null
      };

      // Insert product into Supabase
      const { error } = await supabase.from('products').insert([productData]);
      if (error) throw error;
      fetchAll();
      handleCancelEdit();
    } catch (err) {
      setError("Failed to save product. " + (err.message || err));
      console.error('Product save error:', err);
    } finally {
      setSaving(false);
    }
  };

  // Filter products by search
  const filteredProducts = products.filter((product) => {
    const searchLower = search.toLowerCase();
    return (
      product.name?.toLowerCase().includes(searchLower) ||
      product.sku?.toLowerCase().includes(searchLower) ||
      (categories.find((c) => c.id === product.category_id)?.name?.toLowerCase().includes(searchLower))
    );
  });

  return (
    <div className="products-container" style={{maxWidth: '100vw', minHeight: '100vh', height: '100vh', overflow: 'hidden', padding: '0', margin: 0}}>
      <h1 className="products-title" style={{marginTop: '1rem'}}>Products</h1>
      <form className="product-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          {/* Currency, Category, Unit */}
          <select name="currency" value={form.currency} onChange={handleChange} required>
            <option value="">Select Currency</option>
            <option value="K">K</option>
            <option value="$">$</option>
          </select>
          <select name="category_id" value={form.category_id} onChange={handleChange} required>
            <option value="">Select Category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          <select name="unit_of_measure_id" value={form.unit_of_measure_id || ''} onChange={handleChange} required>
            <option value="">Select Unit</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>{unit.name}{unit.abbreviation ? ` (${unit.abbreviation})` : ''}</option>
            ))}
          </select>

          {/* Auto SKU, SKU, Product Name, Cost Price */}
          <select name="sku_type" value={form.sku_type} onChange={handleChange}>
            <option value="auto">Auto SKU</option>
            <option value="manual">Manual SKU</option>
          </select>
          <input name="sku" type="text" placeholder="SKU (leave blank for auto)" value={form.sku} onChange={handleChange} />
          <input name="name" type="text" placeholder="Product Name" value={form.name} onChange={handleChange} required />
          <input name="cost_price" type="number" step="0.01" placeholder="Cost Price" value={form.cost_price} onChange={handleChange} />

          {/* Standard Price, Promotional Price, Promo Start, Promo End */}
          <input name="price" type="number" step="0.01" placeholder="Standard Price" value={form.price} onChange={handleChange} />
          <input name="promotional_price" type="number" step="0.01" placeholder="Promotional Price" value={form.promotional_price} onChange={handleChange} />
          <input name="promo_start_date" type="date" value={form.promo_start_date} onChange={handleChange} className="from-date" />
          <input name="promo_end_date" type="date" value={form.promo_end_date} onChange={handleChange} className="to-date" />
        </div>
        <div className="form-grid-search-row">
          <input className="products-search-bar" type="text" placeholder="Search products by name, SKU, or category..." value={search} onChange={e => setSearch(e.target.value)} style={{marginBottom: 0}} />
        </div>
        {/* Removed duplicate locations-checkbox-row using selectedLocations and handleLocationChange */}
        {/* Locations, Image, Actions */}
        <div className="form-row" style={{display: 'flex', alignItems: 'flex-start', minHeight: '120px', width: '100%'}}>
          <div className="locations-checkbox-group" style={{display: 'flex', flexDirection: 'row', gap: '2rem', justifyContent: 'flex-start', alignItems: 'center', flexWrap: 'wrap'}}>
            {locations.map((loc) => (
              <label key={loc.id} style={{display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem'}}>
                <input
                  type="checkbox"
                  name="locations"
                  value={loc.id}
                  checked={form.locations.includes(loc.id)}
                  onChange={e => {
                    const checked = e.target.checked;
                    setForm(f => ({
                      ...f,
                      locations: checked
                        ? [...f.locations, loc.id]
                        : f.locations.filter(id => id !== loc.id)
                    }));
                  }}
                  style={{
                    width: '18px',
                    height: '18px',
                    accentColor: '#00b4d8',
                    borderRadius: '4px',
                    border: '2px solid #00b4d8',
                    marginRight: '0.5rem',
                  }}
                />
                <span style={{color: '#e0e6ed'}}>{loc.name}</span>
              </label>
            ))}
          </div>
          <input name="image" type="file" accept="image/*" onChange={handleChange} style={{marginLeft: '2rem', alignSelf: 'flex-start'}} />
          {imageUrl && <img src={imageUrl} alt="Product" className="product-image-preview" style={{marginLeft: '2rem', maxHeight: '60px', borderRadius: '6px', border: '1px solid #00b4d8'}} />}
          <div style={{flex: 1}} />
          <div className="form-actions" style={{display: 'flex', flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-end', width: 'auto'}}>
            <button type="submit" disabled={saving} style={{background: '#00b4d8', color: '#fff', border: 'none', borderRadius: '8px', padding: '1rem 2rem', fontWeight: 'bold', fontSize: '1.1rem', boxShadow: '0 2px 8px #00b4d855', cursor: 'pointer'}}>{editingId ? "Update" : "Add"} Product</button>
            {editingId && <button type="button" onClick={handleCancelEdit} style={{marginLeft: '1rem', background: '#23272f', color: '#fff', border: '1px solid #00b4d8', borderRadius: '8px', padding: '1rem 2rem', fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer'}}>Cancel</button>}
          </div>
        </div>
      </form>
      {error && <div className="products-error">{error}</div>}
      {/* Table moved directly below the checkboxes/image row, and only shows last entered product unless searching */}
      <div className="products-list" style={{width: '100%', marginTop: '0.5rem', overflow: 'visible', maxHeight: 'none'}}>
        {loading ? (
          <div>Loading...</div>
        ) : filteredProducts.length === 0 ? (
          <div>No products found.</div>
        ) : (
          <table style={{width: '100%', minWidth: 900, background: 'transparent', color: '#e0e6ed', borderCollapse: 'collapse'}}>
            <thead>
              <tr style={{background: '#23272f'}}>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', textAlign: 'center'}}>Image</th>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', textAlign: 'left'}}>Name</th>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', textAlign: 'center'}}>SKU</th>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', textAlign: 'center'}}>Category</th>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', textAlign: 'center'}}>Unit</th>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', textAlign: 'center'}}>Stock Qty</th>
                {/* Removed Locations column */}
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', textAlign: 'center'}}>Price</th>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', textAlign: 'center'}}>Promo</th>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', textAlign: 'center'}}>Duration</th>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', textAlign: 'center'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.slice(0, 5).map((product) => (
                <tr key={product.id} style={{background: editingId === product.id ? '#1a222b' : 'inherit'}}>
                  <td style={{textAlign: 'center'}}>
                    {product.product_images && product.product_images[0] && (
                      <img src={product.product_images[0].image_url} alt="Product" className="product-image-thumb" />
                    )}
                  </td>
                  <td style={{textAlign: 'left'}}>{product.name}</td>
                  <td style={{textAlign: 'center'}}>{product.sku || '(auto)'}</td>
                  <td style={{textAlign: 'center'}}>{categories.find((c) => c.id === product.category_id)?.name || '-'}</td>
                  <td style={{textAlign: 'center'}}>{units.find((u) => u.id === product.unit_of_measure_id)?.abbreviation || units.find((u) => u.id === product.unit_of_measure_id)?.name || '-'}</td>
                  <td style={{textAlign: 'center'}}>{
                    (() => {
                      if (!inventory || inventory.length === 0) return <span style={{color:'#ff4d4f'}}>No inventory</span>;
                      const matchingInventory = inventory.filter((inv) => inv.product_id === product.id);
                      const totalQty = matchingInventory.reduce((sum, inv) => sum + (Number(inv.quantity) || 0), 0);
                      return matchingInventory.length > 0 ? totalQty : '-';
                    })()
                  }</td>
                  {/* Removed Locations cell */}
                  <td style={{textAlign: 'center'}}>
                    {product.price ? product.price : '-'}
                  </td>
                  <td style={{textAlign: 'center'}}>
                    {product.promotional_price ? product.promotional_price : '-'}
                  </td>
                  <td style={{textAlign: 'center'}}>
                    {(product.promo_start_date && product.promo_end_date) ? `${product.promo_start_date} to ${product.promo_end_date}` : '-'}
                  </td>
                  <td style={{textAlign: 'center'}}>
                    <button className="edit-btn" onClick={() => handleEdit(product)} disabled={saving}>Edit</button>
                    <button className="delete-btn" onClick={() => handleDelete(product.id)} disabled={saving}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default Products;
