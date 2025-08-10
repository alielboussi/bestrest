import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./Products.css";
import supabase from "./supabase";
import * as XLSX from "xlsx";

// Levenshtein distance for fuzzy matching
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Dictionary for auto-correction
const productDictionary = {
  'Night Stands': 'Nightstands',
  'Mattresses': 'Mattresses',
  'Mattrressess': 'Mattresses',
  // Add more corrections as needed
};

// Helper to normalize names
const normalize = str => str.toLowerCase().replace(/\s+/g, '');

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
  // Ref for file input
  const fileInputRef = React.useRef();

  // Download template logic
  const handleDownloadTemplate = () => {
    const template = [{
      name: '',
      sku: '',
      standard_price: '',
      promotional_price: '',
      category: '',
      unit: '',
      cost_price: '',
      currency: '',
      promo_start_date: '',
      promo_end_date: '',
      // Add more fields as needed
    }];
    const worksheet = XLSX.utils.json_to_sheet(template);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'ProductsTemplate');
    XLSX.writeFile(workbook, 'products_template.xlsx');
  };
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
    const loadAllAndEdit = async () => {
      await fetchAll();
      await fetchUnits();
      await fetchInventory();

      // Check for ?edit=ID in URL and load product for editing
      const params = new URLSearchParams(window.location.search);
      const editId = params.get('edit');
      if (editId) {
        // Wait for products to load, then set editingId and form
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
            category_id: product.category_id ? String(product.category_id) : "",
            unit_of_measure_id: product.unit_of_measure_id !== undefined && product.unit_of_measure_id !== null ? String(product.unit_of_measure_id) : "",
            locations: product.product_locations ? product.product_locations.map((pl) => pl.location_id) : [],
            image: null,
          });
          setEditingId(product.id);
          setImageUrl(product.product_images && product.product_images[0] ? product.product_images[0].image_url : "");
        }
      }
    };
    loadAllAndEdit();
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
        // Sanitize product name for filename
        const safeName = (form.name || '').replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileName = `${safeName}_${insertedProductId}_${Date.now()}.${fileExt}`;
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

        // Update image_url in products table
        const { error: prodImgUpdateError } = await supabase.from('products').update({ image_url: publicUrl }).eq('id', insertedProductId);
        if (prodImgUpdateError) throw prodImgUpdateError;
      }

      fetchAll();
      handleCancelEdit();
      // Remove ?edit=PRODUCT_ID from URL before reload
      if (window.location.search.includes('edit=')) {
        const url = new URL(window.location.href);
        url.searchParams.delete('edit');
        window.history.replaceState({}, '', url.pathname + url.search);
      }
      window.location.reload();
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

  // Import logic
  const handleImportExcel = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setImporting(true);
    setImportError("");
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      let rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      // Skip header row (row 1)
      if (rows.length > 1) {
        const headers = rows[0];
        rows = rows.slice(1).map(rowArr => {
          const rowObj = {};
          headers.forEach((header, idx) => {
            rowObj[header] = rowArr[idx];
          });
          return rowObj;
        });
      } else {
        rows = [];
      }
      // Fetch existing products, categories, locations, units
      const [{ data: existingProducts }, { data: categories }, { data: locations }, { data: units }] = await Promise.all([
        supabase.from('products').select('id, name'),
        supabase.from('categories').select('id, name'),
        supabase.from('locations').select('id, name'),
        supabase.from('unit_of_measure').select('id, name')
      ]);
      // Define valid product columns from schema
      const productSchema = [
        'name', 'sku', 'sku_type', 'cost_price', 'price', 'standard_price', 'promotional_price', 'promo_start_date', 'promo_end_date', 'currency', 'category_id', 'unit_of_measure_id', 'created_at', 'updated_at', 'id'
      ];
      // Helper to check for similar names
      const isSimilar = (name, arr) => {
        const normName = normalize(name);
        return arr.some(prod => levenshtein(normalize(prod.name), normName) <= 1);
      };
      const productsToInsert = [];
      let importedCount = 0;
      let skippedCount = 0;
      for (const row of rows) {
      // Only use columns that match the schema
      const filteredRow = {};
      for (const key of productSchema) {
        if (row.hasOwnProperty(key)) filteredRow[key] = row[key];
      }
      const name = filteredRow.name || '';
      if (!name) continue;
      if (isSimilar(name, existingProducts)) {
        skippedCount++;
        continue;
      }
      // Match category (fuzzy)
      let category_id = null;
      if (row.category) {
        // Try exact match first
        let cat = categories.find(c => normalize(c.name) === normalize(row.category));
        if (!cat) {
          // Fuzzy match: find closest category by Levenshtein distance
          let minDist = Infinity;
          let bestCat = null;
          for (const c of categories) {
            const dist = levenshtein(normalize(c.name), normalize(row.category));
            if (dist < minDist) {
              minDist = dist;
              bestCat = c;
            }
          }
          // Only match if reasonably close (distance ≤ 2)
          if (bestCat && minDist <= 2) cat = bestCat;
        }
        if (cat) category_id = cat.id;
      }
  // Assign all available locations to every product
  let location_ids = locations.map(l => l.id);
      // Match unit
      let unit_id = null;
      if (row.unit) {
        const unit = units.find(u => normalize(u.name) === normalize(row.unit));
        if (unit) unit_id = unit.id;
      }
      productsToInsert.push({
        name,
        sku: filteredRow.sku || '',
        sku_type: filteredRow.sku_type === 'manual' ? false : true,
        cost_price: filteredRow.hasOwnProperty('cost_price') && filteredRow.cost_price !== undefined && filteredRow.cost_price !== null && filteredRow.cost_price !== '' ? parseFloat(filteredRow.cost_price) : '',
        price: filteredRow.standard_price ? parseFloat(filteredRow.standard_price) : 0,
        promotional_price: filteredRow.hasOwnProperty('promotional_price') && filteredRow.promotional_price !== undefined && filteredRow.promotional_price !== null && filteredRow.promotional_price !== '' ? parseFloat(filteredRow.promotional_price) : '',
        promo_start_date: filteredRow.hasOwnProperty('promo_start_date') && filteredRow.promo_start_date ? filteredRow.promo_start_date : '',
        promo_end_date: filteredRow.hasOwnProperty('promo_end_date') && filteredRow.promo_end_date ? filteredRow.promo_end_date : '',
        currency: filteredRow.hasOwnProperty('currency') && filteredRow.currency ? filteredRow.currency : '',
        category_id,
        unit_of_measure_id: unit_id,
        locations: location_ids,
      });
      importedCount++;
    }
      // Insert products
      // Group products by name+sku and merge locations
      const productMap = {};
      for (const prod of productsToInsert) {
        const key = `${prod.name}||${prod.sku}`;
        if (!productMap[key]) {
          productMap[key] = { ...prod, locations: new Set(prod.locations) };
        } else {
          if (prod.locations) {
            prod.locations.forEach(loc => productMap[key].locations.add(loc));
          }
        }
      }
      for (const key in productMap) {
        const prod = productMap[key];
        // Only send valid fields to Supabase
        const validProduct = {
          name: prod.name,
          sku: prod.sku,
          sku_type: typeof prod.sku_type === 'boolean' ? prod.sku_type : true,
          cost_price: prod.cost_price !== '' && prod.cost_price !== undefined && prod.cost_price !== null ? Number(prod.cost_price) : null,
          price: prod.price !== '' && prod.price !== undefined && prod.price !== null ? Number(prod.price) : 0,
          promotional_price: prod.promotional_price !== '' && prod.promotional_price !== undefined && prod.promotional_price !== null ? Number(prod.promotional_price) : null,
          promo_start_date: prod.promo_start_date || null,
          promo_end_date: prod.promo_end_date || null,
          currency: prod.currency || '',
          category_id: prod.category_id || null,
          unit_of_measure_id: prod.unit_of_measure_id || null
        };
        Object.keys(validProduct).forEach(key => {
          if (validProduct[key] === undefined) delete validProduct[key];
        });
        const { data: inserted, error: insertError } = await supabase.from('products').insert([validProduct]).select('id').single();
        if (insertError) continue;
        // Insert all unique product_locations
        const locationsArr = Array.from(prod.locations);
        if (locationsArr.length > 0) {
          const prodLocRows = locationsArr.map(locId => ({ product_id: inserted.id, location_id: locId }));
          await supabase.from('product_locations').insert(prodLocRows);
        }
      }
      alert(`Import finished! Imported: ${importedCount}, Skipped: ${skippedCount}`);
      fetchAll();
    } catch (err) {
      setImportError('Import failed: ' + (err.message || err));
      alert('Import failed: ' + (err.message || err));
    }
    setImporting(false);
  };

  return (
    <div className="products-container" style={{maxWidth: '100vw', minHeight: '100vh', height: '100vh', overflow: 'hidden', padding: '0', margin: 0}}>
      <h1 className="products-title" style={{marginTop: '1rem'}}>Products</h1>
      {/* Import and Template Buttons */}
      <div style={{ marginBottom: 16, display: 'flex', gap: '8px', justifyContent: 'center' }}>
        <button
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          style={{ minWidth: 170, background: '#27ae60', color: '#fff', border: 'none', borderRadius: '8px', padding: '1rem 2rem', fontWeight: 'bold', fontSize: '1.1rem', boxShadow: '0 2px 8px #27ae6055', cursor: 'pointer' }}
        >
          Import by Excel
        </button>
        <button onClick={handleDownloadTemplate} type="button" style={{ minWidth: 170, background: '#27ae60', color: '#fff', border: 'none', borderRadius: '8px', padding: '1rem 2rem', fontWeight: 'bold', fontSize: '1.1rem', boxShadow: '0 2px 8px #27ae6055', cursor: 'pointer' }}>
          Download Template
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={handleImportExcel}
        />


      </div>
      <form className="product-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          {/* First row: Category, Unit, Auto SKU, SKU */}
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
          <select name="sku_type" value={form.sku_type} onChange={handleChange}>
            <option value="auto">Auto SKU</option>
            <option value="manual">Manual SKU</option>
          </select>
          <input name="sku" type="text" placeholder="SKU (leave blank for auto)" value={form.sku} onChange={handleChange} />
        </div>
        <div className="form-grid">
          {/* Second row: Cost Price, Standard Price, Promotional Price, Promo Start, Promo End */}
          <input name="cost_price" type="number" step="0.01" placeholder="Cost Price (optional)" value={form.cost_price} onChange={handleChange} />
          <input name="price" type="number" step="0.01" placeholder="Standard Price (optional)" value={form.price} onChange={handleChange} />
          <input name="promotional_price" type="number" step="0.01" placeholder="Promotional Price" value={form.promotional_price} onChange={handleChange} />
          <input name="promo_start_date" type="date" value={form.promo_start_date} onChange={handleChange} className="from-date" />
          <input name="promo_end_date" type="date" value={form.promo_end_date} onChange={handleChange} className="to-date" />
        </div>
        <div className="form-grid">
          <input name="name" type="text" placeholder="Product Name" value={form.name} onChange={handleChange} required />
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
