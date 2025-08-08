import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./Products.css";
import supabase from "./supabase";
import * as XLSX from "xlsx";

// Fields available for import mapping
const productFields = [
  // Products table
  { value: "name", label: "Product Name", table: "products" },
  { value: "sku", label: "SKU", table: "products" },
  { value: "sku_type", label: "SKU Type (auto/manual)", table: "products" },
  { value: "cost_price", label: "Cost Price", table: "products" },
  { value: "price", label: "Standard Price", table: "products" },
  { value: "promotional_price", label: "Promotional Price", table: "products" },
  { value: "promo_start_date", label: "Promo Start Date", table: "products" },
  { value: "promo_end_date", label: "Promo End Date", table: "products" },
  { value: "currency", label: "Currency", table: "products" },
  // Categories table
  { value: "category_name", label: "Category Name", table: "categories" },
  { value: "category_name_cat", label: "Category Name (alt)", table: "categories" },
  // Locations table
  { value: "location_name", label: "Location Name", table: "locations" },
  { value: "address", label: "Location Address", table: "locations" },
  { value: "city", label: "Location City", table: "locations" },
  // Units table
  { value: "unit_name", label: "Unit Name", table: "unit_of_measure" },
  { value: "abbreviation", label: "Unit Abbreviation", table: "unit_of_measure" },
  // Combos table
  { value: "combo_name", label: "Combo Name", table: "combos" },
  { value: "combo_price", label: "Combo Price", table: "combos" },
  { value: "standard_price", label: "Combo Standard Price", table: "combos" },
  { value: "promotional_price_combo", label: "Combo Promotional Price", table: "combos" },
  { value: "promo_start_date_combo", label: "Combo Promo Start Date", table: "combos" },
  { value: "promo_end_date_combo", label: "Combo Promo End Date", table: "combos" },
  { value: "sku_combo", label: "Combo SKU", table: "combos" },
  { value: "picture_url", label: "Combo Picture URL", table: "combos" },
  // Combo Items (for future extension)
  { value: "items", label: "Combo Items", table: "combo_items" },
  // Ignore option
  { value: "ignore", label: "Ignore Column", table: "ignore" },
];

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
  // State for direct inventory edit modal
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [inventoryEditProduct, setInventoryEditProduct] = useState(null);
  const [inventoryEditQty, setInventoryEditQty] = useState('');
  const [inventoryEditLocation, setInventoryEditLocation] = useState('');
  const [inventoryEditError, setInventoryEditError] = useState('');
  const [inventoryEditSaving, setInventoryEditSaving] = useState(false);

  // Handler to open inventory modal
  const openInventoryModal = (product) => {
    setInventoryEditProduct(product);
    setInventoryEditQty('');
    setInventoryEditLocation('');
    setInventoryEditError('');
    setShowInventoryModal(true);
  };

  // Handler to save inventory edit
  const handleInventoryEditSave = async () => {
    setInventoryEditError('');
    setInventoryEditSaving(true);
    try {
      if (!inventoryEditProduct || !inventoryEditLocation || inventoryEditQty === '') {
        setInventoryEditError('Select location and enter quantity.');
        setInventoryEditSaving(false);
        return;
      }
      const qtyNum = Number(inventoryEditQty);
      if (isNaN(qtyNum) || qtyNum < 0) {
        setInventoryEditError('Enter a valid quantity (>= 0).');
        setInventoryEditSaving(false);
        return;
      }
      // Update or insert inventory for this product/location only
      const { data: inv } = await supabase.from('inventory').select('id').eq('product_id', inventoryEditProduct.id).eq('location', inventoryEditLocation).single();
      if (inv) {
        await supabase.from('inventory').update({ quantity: qtyNum, updated_at: new Date() }).eq('id', inv.id);
      } else {
        await supabase.from('inventory').insert({ product_id: inventoryEditProduct.id, location: inventoryEditLocation, quantity: qtyNum, updated_at: new Date() });
      }
      setShowInventoryModal(false);
      setInventoryEditProduct(null);
      setInventoryEditQty('');
      setInventoryEditLocation('');
      setInventoryEditSaving(false);
      fetchInventory();
    } catch (err) {
      setInventoryEditError('Failed to update inventory.');
      setInventoryEditSaving(false);
    }
  };
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
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [showMapping, setShowMapping] = useState(false);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [importColumns, setImportColumns] = useState([]);
  const [importRows, setImportRows] = useState([]);
  const [columnMap, setColumnMap] = useState({});
  const [workbook, setWorkbook] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchAll();
    fetchUnits();
    fetchInventory();

    // Check for ?edit=ID in URL and load product for editing
    const params = new URLSearchParams(window.location.search);
    const editId = params.get('edit');
    if (editId) {
      // Wait for products to load, then set editingId and form
      const loadProduct = async () => {
        // If products already loaded, use them
        let product = products.find(p => String(p.id) === String(editId));
        if (!product) {
          // Fetch single product if not loaded
          const { data } = await supabase
            .from('products')
            .select(`id, name, sku, sku_type, cost_price, price, promotional_price, promo_start_date, promo_end_date, currency, category_id, unit_of_measure_id, created_at, product_locations(id, location_id), product_images(image_url)`)
            .eq('id', editId)
            .single();
          product = data;
        }
        if (product) {
          setForm({
            name: product.name || "",
            sku: product.sku || "",
            sku_type: product.sku_type ? "auto" : "manual",
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
        }
      };
      loadProduct();
    }
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
      // Fetch products with product_locations and product_images
      const [{ data: products }, { data: categories }, { data: locations }] = await Promise.all([
        supabase
          .from("products")
          .select(`id, name, sku, sku_type, cost_price, price, promotional_price, promo_start_date, promo_end_date, currency, category_id, unit_of_measure_id, created_at, product_locations(id, location_id), product_images(image_url)`)
          .order("created_at", { ascending: false }),
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
    if (!form.name.trim() && !form.sku.trim()) {
      setError('Please enter at least one field (name or SKU).');
      return;
    }
    setSaving(true);
    setError("");
    try {
      let productId = editingId;
      // Generate unique SKU if needed
      let skuToUse = form.sku;
      if ((form.sku_type === "auto" && !form.sku.trim()) || !form.sku.trim()) {
        // Try to generate a unique SKU: e.g. PROD-YYYYMMDD-HHMMSS-XXXX
        let unique = false;
        let generatedSku = "";
        while (!unique) {
          const now = new Date();
          const pad = (n) => n.toString().padStart(2, '0');
          generatedSku = `PROD-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${Math.floor(1000 + Math.random() * 9000)}`;
          // Check if SKU exists
          const { data: existing } = await supabase.from('products').select('id').eq('sku', generatedSku).maybeSingle();
          if (!existing) unique = true;
        }
        skuToUse = generatedSku;
      }

      // Prepare product data
      const productData = {
        name: form.name,
        sku: skuToUse,
        sku_type: form.sku_type === "auto",
        cost_price: form.cost_price ? parseFloat(form.cost_price) : 0,
        price: form.price ? parseFloat(form.price) : 0,
        promotional_price: form.promotional_price ? parseFloat(form.promotional_price) : null,
        promo_start_date: form.promo_start_date || null,
        promo_end_date: form.promo_end_date || null,
        currency: form.currency,
        category_id: form.category_id ? parseInt(form.category_id) : null,
        unit_of_measure_id: form.unit_of_measure_id ? parseInt(form.unit_of_measure_id) : null
      };

      // Insert product and get the ID
      let insertedProductId = productId;
      if (!editingId) {
        const { data: inserted, error: insertError } = await supabase.from('products').insert([productData]).select('id').single();
        if (insertError) throw insertError;
        insertedProductId = inserted.id;
      } else {
        // If editing, update the product
        const { error: updateError } = await supabase.from('products').update(productData).eq('id', editingId);
        if (updateError) throw updateError;
      }

      // Handle product_locations for selected locations
      if (form.locations && form.locations.length > 0) {
        // Remove existing links if editing
        if (editingId) {
          await supabase.from('product_locations').delete().eq('product_id', insertedProductId);
        }
        // Insert new links
        const prodLocRows = form.locations.map(locId => ({ product_id: insertedProductId, location_id: locId }));
        if (prodLocRows.length > 0) {
          const { error: prodLocError } = await supabase.from('product_locations').insert(prodLocRows);
          if (prodLocError) throw prodLocError;
        }
      }

      // Handle image upload if a file is selected
      if (form.image) {
        const file = form.image;
        const fileExt = file.name.split('.').pop();
        const fileName = `${insertedProductId}_${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        // Upload to bucket 'productimages'
        const { error: uploadError } = await supabase.storage.from('productimages').upload(filePath, file, { upsert: true });
        if (uploadError) throw uploadError;

        // Get public URL
        const { data: publicUrlData } = supabase.storage.from('productimages').getPublicUrl(filePath);
        const publicUrl = publicUrlData?.publicUrl;
        if (!publicUrl) throw new Error('Failed to get public URL for image.');

        // Insert into product_images table
        const { error: imageInsertError } = await supabase.from('product_images').insert([
          { product_id: insertedProductId, image_url: publicUrl }
        ]);
        if (imageInsertError) throw imageInsertError;
      }

      fetchAll();
      handleCancelEdit();
    } catch (err) {
      setError("Failed to save product. " + (err.message || err));
      console.error('Product save error:', err);
    } finally {
      setSaving(false);
    }
  };

  // All actions always accessible
  const canAdd = true;
  const canEdit = true;
  const canDelete = true;


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
          <input name="cost_price" type="number" step="0.01" placeholder="Cost Price (optional)" value={form.cost_price} onChange={handleChange} />
          {/* Standard Price, Promotional Price, Promo Start, Promo End */}
          <input name="price" type="number" step="0.01" placeholder="Standard Price (optional)" value={form.price} onChange={handleChange} />
          <input name="promotional_price" type="number" step="0.01" placeholder="Promotional Price" value={form.promotional_price} onChange={handleChange} />
          <input name="promo_start_date" type="date" value={form.promo_start_date} onChange={handleChange} className="from-date" />
          <input name="promo_end_date" type="date" value={form.promo_end_date} onChange={handleChange} className="to-date" />
        </div>
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
            {canAdd && <button type="submit" disabled={saving} style={{background: '#00b4d8', color: '#fff', border: 'none', borderRadius: '8px', padding: '1rem 2rem', fontWeight: 'bold', fontSize: '1.1rem', boxShadow: '0 2px 8px #00b4d855', cursor: 'pointer'}}>{editingId ? "Update" : "Add"} Product</button>}
            {editingId && <button type="button" onClick={handleCancelEdit} style={{marginLeft: '1rem', background: '#23272f', color: '#fff', border: '1px solid #00b4d8', borderRadius: '8px', padding: '1rem 2rem', fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer'}}>Cancel</button>}
          </div>
        </div>
      </form>
      {error && <div className="products-error">{error}</div>}
      <div style={{marginTop: '2rem', color: '#e0e6ed', fontSize: '1.1rem'}}>
        <b>To view all products, search, and filter by location, go to the <span style={{color:'#00b4d8'}}>Products List</span> page.</b>
      </div>
    </div>
  );
}

export default Products;
