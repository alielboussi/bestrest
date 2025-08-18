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
  const [adjustSetMode, setAdjustSetMode] = useState('receive');
  const [deleteIsCombo, setDeleteIsCombo] = useState(false);

  const handleOpenAdjustModal = (product) => {
    setAdjustProduct(product);
    // Default mode for sets is 'receive'; for products it's normal adjust
    if (product.__isCombo) {
      setAdjustSetMode('receive');
      setAdjustQty(1);
    } else if (selectedLocation) {
      const inv = inventory.find(inv => inv.product_id === product.id && String(inv.location) === String(selectedLocation));
      const qty = inv ? Number(inv.quantity) : 0;
      setAdjustQty(qty);
    } else {
      setAdjustQty("");
    }
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
      // Handle set receive/assembly: update component inventory according to combo_items
      if (adjustProduct.__isCombo) {
        const items = (comboItems || []).filter(ci => String(ci.combo_id) === String(adjustProduct.id));
        let setCount = Number(adjustQty);
        if (!Number.isFinite(setCount) || setCount <= 0) {
          alert('Enter a positive number of sets.');
          setAdjustLoading(false);
          return;
        }

        if (adjustSetMode === 'assemble') {
          const buildable = computeComboMaxQty(adjustProduct.id, locationId);
          if (setCount > buildable) setCount = buildable;
          if (setCount <= 0) {
            alert('Insufficient component stock to assemble sets at this location.');
            setAdjustLoading(false);
            return;
          }
          for (const it of items) {
            const need = (Number(it.quantity) || 0) * setCount;
            if (need <= 0) continue;
            const { data: invRow } = await supabase
              .from('inventory')
              .select('id, quantity')
              .eq('product_id', it.product_id)
              .eq('location', locationId)
              .maybeSingle();
            if (invRow) {
              const newQty = Math.max(0, Number(invRow.quantity || 0) - need);
              await supabase.from('inventory').update({ quantity: newQty }).eq('id', invRow.id);
            } else {
              await supabase.from('inventory').insert({ product_id: it.product_id, location: locationId, quantity: 0 });
            }
            await supabase.from('inventory_adjustments').insert({
              product_id: it.product_id,
              location_id: locationId,
              quantity: -need,
              adjustment_type: 'Set Assembly',
              adjusted_at: new Date().toISOString()
            });
          }
        } else {
          // receive mode: increase components so these sets can be built later
          for (const it of items) {
            const add = (Number(it.quantity) || 0) * setCount;
            if (add <= 0) continue;
            const { data: invRow } = await supabase
              .from('inventory')
              .select('id, quantity')
              .eq('product_id', it.product_id)
              .eq('location', locationId)
              .maybeSingle();
            if (invRow) {
              const newQty = Number(invRow.quantity || 0) + add;
              await supabase.from('inventory').update({ quantity: newQty }).eq('id', invRow.id);
            } else {
              await supabase.from('inventory').insert({ product_id: it.product_id, location: locationId, quantity: add });
            }
            await supabase.from('inventory_adjustments').insert({
              product_id: it.product_id,
              location_id: locationId,
              quantity: add,
              adjustment_type: 'Set Receive',
              adjusted_at: new Date().toISOString()
            });
          }
        }
        setAdjustModalOpen(false);
        await fetchInventory();
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
  const [importLoading, setImportLoading] = useState(false);
  const fileInputRef = React.useRef(null);

  const handleDownloadTemplate = () => {
    // Use tab-delimited content so Excel reliably splits into columns across locales
    const header = 'sku\tproduct name\tqty\r\n';
    const sample = '#00001\tExample Product\t10\r\n';
    const tsv = header + sample;
    const blob = new Blob([tsv], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stock_import_template.xls';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportStock = () => {
    if (!selectedLocation) {
      alert('Please select a location first.');
      return;
    }
    const locName = locations.find(l => String(l.id) === String(selectedLocation))?.name || 'location';
    const lines = [];
    // Tab-delimited header for robust Excel import
    lines.push('sku\tproduct name\tqty');
    const esc = (s) => (s == null ? '' : String(s).replace(/[\r\n\t]/g, ' '));
    (products || []).forEach(p => {
      const inv = (inventory || []).find(r => String(r.product_id) === String(p.id) && String(r.location) === String(selectedLocation));
      const qty = inv ? Number(inv.quantity) || 0 : 0;
      lines.push([esc(p.sku || ''), esc(p.name || ''), String(qty)].join('\t'));
    });
    const tsv = lines.join('\r\n') + '\r\n';
    const blob = new Blob([tsv], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    a.href = url;
    a.download = `stock_export_${locName}_${ts}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const parseImportText = (text) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    const out = [];
    // Detect delimiter: prefer tab, else semicolon, else comma
    const detectDelimiter = (line) => {
      if (line.includes('\t')) return '\t';
      // Use counts to avoid false positives on names
      const sc = (line.match(/;/g) || []).length;
      const cc = (line.match(/,/g) || []).length;
      if (sc >= 2 && sc >= cc) return ';';
      if (cc >= 1) return ',';
      return '\t';
    };
    let delimiter = lines.length ? detectDelimiter(lines[0]) : ',';
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (i === 0 && /sku/i.test(raw) && /(qty|quantity)/i.test(raw)) {
        // Re-evaluate delimiter based on header row if needed
        delimiter = detectDelimiter(raw);
        continue; // skip header
      }
      const parts = raw.split(delimiter);
      if (parts.length < 2) continue;
      const sku = String(parts[0] || '').trim();
      const qtyStr = String(parts[parts.length - 1] || '').trim();
      const qty = Number(qtyStr);
      if (!sku) continue;
      out.push({ sku, qty: Number.isFinite(qty) ? qty : 0 });
    }
    return out;
  };

  const handleImportStock = async (file) => {
    if (!selectedLocation) {
      alert('Please select a location first.');
      return;
    }
    if (!file) return;
    setImportLoading(true);
    try {
      const text = await file.text();
      const rows = parseImportText(text);
      if (!rows.length) {
        alert('No rows found. Ensure the file has columns: sku, product name, qty');
        return;
      }
      // Map by SKU (use last occurrence)
      const skuMap = new Map();
      rows.forEach(r => skuMap.set(r.sku, r.qty));
      const skus = Array.from(skuMap.keys());
      // Fetch products for these SKUs
      const { data: prodRows } = await supabase
        .from('products')
        .select('id, sku')
        .in('sku', skus);
      const foundMap = new Map((prodRows || []).map(r => [String(r.sku), r.id]));

      const notFound = skus.filter(s => !foundMap.has(String(s)));
      if (notFound.length > 0) {
        // Continue but inform user
        console.warn('SKUs not found:', notFound);
      }

      // Opening stock sessions for location
      const { data: openingSessions } = await supabase
        .from('opening_stock_sessions')
        .select('id')
        .eq('location_id', selectedLocation)
        .eq('status', 'submitted');
      const sessionIds = (openingSessions || []).map(s => s.id);

      // Preload opening entries for matched products
      const productIds = Array.from(foundMap.values());
      let openingEntries = [];
      if (sessionIds.length && productIds.length) {
        const { data: entries } = await supabase
          .from('opening_stock_entries')
          .select('id, product_id')
          .in('session_id', sessionIds)
          .in('product_id', productIds);
        openingEntries = entries || [];
      }
      const hasOpeningEntry = new Set(openingEntries.map(e => String(e.product_id)));

      // Process each matched product
      let updated = 0;
      for (const [sku, qty] of skuMap.entries()) {
        const pid = foundMap.get(String(sku));
        if (!pid) continue; // skip unknown SKU
        const quantity = Math.max(0, Number(qty) || 0);
        // Upsert inventory for product/location
        const { data: invRow } = await supabase
          .from('inventory')
          .select('id')
          .eq('product_id', pid)
          .eq('location', selectedLocation)
          .maybeSingle();
        if (invRow) {
          await supabase.from('inventory').update({ quantity }).eq('id', invRow.id);
        } else {
          await supabase.from('inventory').insert({ product_id: pid, location: selectedLocation, quantity });
        }
        // Determine adjustment type
        let adjustmentType = 'opening';
        if (sessionIds.length > 0 && hasOpeningEntry.has(String(pid))) {
          adjustmentType = 'Stock Transfer Qty Adjustment';
        }
        await supabase.from('inventory_adjustments').insert({
          product_id: pid,
          location_id: selectedLocation,
          quantity,
          adjustment_type: adjustmentType,
          adjusted_at: new Date().toISOString()
        });
        updated += 1;
      }
      await fetchInventory();
      const skipped = notFound.length;
      alert(`Import complete. Updated ${updated} items.${skipped ? ` Skipped ${skipped} unknown SKUs.` : ''}`);
    } catch (err) {
      alert('Failed to import stock: ' + (err.message || err));
    } finally {
      setImportLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

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
        { data: unitsData },
        { data: combos },
        { data: comboLocations },
        { data: comboItems }
      ] = await Promise.all([
        supabase
          .from("products")
          .select(`id, name, sku, sku_type, cost_price, price, promotional_price, promo_start_date, promo_end_date, currency, category_id, unit_of_measure_id, created_at, image_url, product_images(image_url), product_locations(location_id), unit:unit_of_measure(id, name, abbreviation)`)
          .order("created_at", { ascending: false }),
        supabase.from("categories").select("id, name"),
        supabase.from("locations").select("id, name"),
        supabase.from("unit_of_measure").select("id, name, abbreviation"),
        supabase.from("combos").select("id, combo_name, sku, combo_price, standard_price, promotional_price, promo_start_date, promo_end_date, picture_url, currency"),
        supabase.from("combo_locations").select("combo_id, location_id"),
        supabase.from("combo_items").select("combo_id, product_id, quantity"),
      ]);
      // Build units map for quick lookup
      const unitsMap = Object.fromEntries((unitsData || []).map(u => [String(u.id), u]));
      // Map image_url and attach unitLabel from units
      const mappedProducts = (products || []).map(p => {
        const related = Array.isArray(p.product_images) && p.product_images.length > 0 ? p.product_images[0].image_url : "";
        const finalUrl = (p.image_url && p.image_url.trim() !== "") ? p.image_url : (related || "");
        const unitFromMap = unitsMap[String(p.unit_of_measure_id)];
        const unitFromJoin = p.unit || null;
        const unitLabel = unitFromJoin
          ? (unitFromJoin.abbreviation || unitFromJoin.name)
          : (unitFromMap ? (unitFromMap.abbreviation || unitFromMap.name) : undefined);
        return { ...p, image_url: finalUrl, unitLabel };
      });
      setProducts(mappedProducts);
      setCategories(categories || []);
      setLocations(locations || []);
      setUnits(unitsData || []);
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

  // Helpers for sets (use function declarations so they are hoisted)
  function getStockForProduct(productId, locId) {
    const lid = String(locId || '');
    const rows = (inventory || []).filter(inv => String(inv.product_id) === String(productId) && (!lid || String(inv.location) === lid));
    return rows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
  }

  function computeComboMaxQty(comboId, locId) {
    const items = (comboItems || []).filter(ci => String(ci.combo_id) === String(comboId));
    if (!items.length) return 0;
    let minSets = Infinity;
    for (const it of items) {
      const stock = getStockForProduct(it.product_id, locId);
      const perSet = Number(it.quantity) || 0;
      if (perSet <= 0) return 0;
      const possible = Math.floor(stock / perSet);
      if (possible < minSets) minSets = possible;
    }
    return Number.isFinite(minSets) ? minSets : 0;
  }

  // Helper to resolve a product's unit label
  const getUnitLabel = (product) => {
    const pid = product?.unit_of_measure_id;
    if (pid === null || pid === undefined || pid === '') return '-';
    const u = units.find((x) => String(x.id) === String(pid));
    if (!u) return '-';
    return u.abbreviation || u.name || '-';
  };

  // Merge products and combos into one list and filter by location/search/image
  const allItems = [
    // tag combos so row rendering can branch
    ...(combos || []).map(c => ({ ...c, __isCombo: true })),
    ...(products || []).map(p => ({ ...p, __isCombo: false }))
  ];

  const filteredProducts = allItems.filter(item => {
    const isCombo = !!item.__isCombo;
    if (!isCombo) {
      // Exclude legacy 'set' unit products
      let unitName = undefined;
      if (item.unit && item.unit.name) {
        unitName = item.unit.name;
      } else {
        const unit = units.find(u => String(u.id) === String(item.unit_of_measure_id));
        unitName = unit?.name;
      }
      if (unitName && unitName.toLowerCase() === 'set') return false;
    }
    // Location filter
    if (selectedLocation) {
      if (isCombo) {
        const linked = (comboLocations || []).some(cl => String(cl.combo_id) === String(item.id) && String(cl.location_id) === String(selectedLocation));
        if (!linked) return false;
      } else {
        if (item.product_locations && item.product_locations.length > 0) {
          const linked = item.product_locations.some(pl => String(pl.location_id) === String(selectedLocation));
          if (!linked) return false;
        } else {
          return false;
        }
      }
    }
    // Search filter
    if (search.trim() !== "") {
      const searchLower = search.toLowerCase();
      if (isCombo) {
        if (!(
          (item.combo_name && item.combo_name.toLowerCase().includes(searchLower)) ||
          (item.sku && item.sku.toLowerCase().includes(searchLower))
        )) return false;
      } else {
        if (!(
          (item.name && item.name.toLowerCase().includes(searchLower)) ||
          (item.sku && item.sku.toLowerCase().includes(searchLower)) ||
          (categories.find((c) => c.id === item.category_id)?.name?.toLowerCase().includes(searchLower))
        )) return false;
      }
    }
    // Image filter
    if (imageFilter === "with") {
      const url = isCombo ? (item.picture_url || '') : (item.image_url || '');
      if (!url || url.trim() === "") return false;
    } else if (imageFilter === "without") {
      const url = isCombo ? (item.picture_url || '') : (item.image_url || '');
      if (url && url.trim() !== "") return false;
    }
    return true;
  });

  return (
    <div className="products-list-page" style={{maxWidth: '100vw', minHeight: '100vh', padding: 0, margin: 0}}>
      <h1 className="products-title" style={{marginTop: '1rem'}}>All Products</h1>
  <div style={{display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap'}}>
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
        <button
          type="button"
          onClick={handleDownloadTemplate}
          style={{background:'#23272f', color:'#e0e6ed', border:'1px solid #00b4d8', borderRadius:'6px', padding:'0.5rem 1rem', fontWeight:'bold', cursor:'pointer'}}
        >Download Template (.xls)</button>
        <button
          type="button"
          disabled={!selectedLocation}
          onClick={handleExportStock}
          style={{background: !selectedLocation ? '#555' : '#23272f', color:'#e0e6ed', border:'1px solid #00b4d8', borderRadius:'6px', padding:'0.5rem 1rem', fontWeight:'bold', cursor: !selectedLocation ? 'not-allowed' : 'pointer'}}
          title={!selectedLocation ? 'Select a location first' : `Export stock for ${locations.find(l => String(l.id)===String(selectedLocation))?.name || 'location'}`}
        >Export Stock (.xls)</button>
        <button
          type="button"
          disabled={!selectedLocation || importLoading}
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          style={{background: !selectedLocation ? '#555' : '#43aa8b', color:'#fff', border:'none', borderRadius:'6px', padding:'0.5rem 1rem', fontWeight:'bold', cursor: !selectedLocation ? 'not-allowed' : 'pointer'}}
          title={!selectedLocation ? 'Select a location first' : 'Import stock for selected location'}
        >{importLoading ? 'Importing…' : 'Import Stock'}</button>
        <input
          type="file"
          ref={fileInputRef}
          accept=".xls,.csv,.tsv,.txt"
          style={{ display: 'none' }}
          onChange={e => handleImportStock(e.target.files && e.target.files[0])}
        />
      </div>
    <div className="products-list" style={{width: '100%', overflowX: 'auto'}}>
        {loading ? (
          <div>Loading...</div>
        ) : filteredProducts.length === 0 ? (
          <div>No products found.</div>
        ) : (
      <div style={{width: '100%'}}>
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
                  const isCombo = !!item.__isCombo;
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
                      <td style={{textAlign: 'center'}}>{isCombo ? 'Set' : (item.unitLabel || getUnitLabel(item))}</td>
                      <td style={{textAlign: 'center'}}>
                        {
                          (() => {
                            if (isCombo) {
                              const qty = computeComboMaxQty(item.id, selectedLocation || '');
                              return qty;
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
                          {isCombo ? (
                            <>
                              <button
                                style={{background:'#00b4d8',color:'#fff',border:'none',borderRadius:'6px',padding:'6px 14px',fontWeight:'bold',cursor:'pointer'}}
                                onClick={() => { window.location.href = `/edit-set/${item.id}`; }}
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
                                  setDeleteIsCombo(true);
                                  setDeleteProductId(item.id);
                                  setDeleteConfirmText("");
                                  setDeleteConfirmOpen(true);
                                }}
                              >Delete</button>
                            </>
                          ) : (
                            <>
                              <button
                                style={{background:'#00b4d8',color:'#fff',border:'none',borderRadius:'6px',padding:'6px 14px',fontWeight:'bold',cursor:'pointer'}}
                                onClick={() => { window.location.href = `/products?edit=${item.id}`; }}
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
                  setDeleteIsCombo(false);
                                  setDeleteProductId(item.id);
                                  setDeleteConfirmText("");
                                  setDeleteConfirmOpen(true);
                                }}
                              >Delete</button>
                            </>
                          )}
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
                  if (deleteIsCombo) {
                    try {
                      await supabase.from('combo_items').delete().eq('combo_id', deleteProductId);
                      await supabase.from('combo_locations').delete().eq('combo_id', deleteProductId);
                      await supabase.from('combos').delete().eq('id', deleteProductId);
                      setCombos(prev => prev.filter(c => String(c.id) !== String(deleteProductId)));
                    } catch (err) {
                      alert('Failed to delete set: ' + (err.message || err));
                    }
                  } else {
                    await handleDeleteProduct(deleteProductId, setProducts);
                  }
                  setDeleteConfirmOpen(false);
                  setDeleteProductId(null);
                  setDeleteIsCombo(false);
                  setDeleteConfirmText("");
                }}
                style={{background:'#e74c3c',color:'#fff',border:'none',borderRadius:'6px',padding:'8px 18px',fontWeight:'bold',cursor: deleteConfirmText.trim().toLowerCase() === 'yes' ? 'pointer' : 'not-allowed'}}
              >Confirm</button>
              <button
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDeleteProductId(null);
                  setDeleteIsCombo(false);
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

      {/* Image Edit Modal (Product or Set) */}
      {imageEditModalOpen && imageEditProduct && (
        <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.6)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#23272f',padding:32,borderRadius:12,minWidth:320,maxWidth:400}}>
            <h3>{imageEditProduct.__isCombo ? 'Edit Set Image' : 'Edit Product Image'}</h3>
            <div style={{marginBottom:12}}>
              {imageEditProduct.__isCombo ? (
                <>Set: <b>{imageEditProduct.combo_name}</b></>
              ) : (
                <>Product: <b>{imageEditProduct.name}</b></>
              )}
            </div>
            <input type="file" accept="image/*" onChange={e => setImageEditFile(e.target.files[0])} style={{marginBottom:12}} />
            {(imageEditProduct.__isCombo ? imageEditProduct.picture_url : imageEditProduct.image_url) && (
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                <img src={imageEditProduct.__isCombo ? imageEditProduct.picture_url : imageEditProduct.image_url} alt="Current" style={{maxWidth:'80px',maxHeight:'80px',borderRadius:'8px'}} />
                <button
                  onClick={async () => {
                    setImageEditLoading(true);
                    try {
                      if (imageEditProduct.__isCombo) {
                        await supabase.from('combos').update({ picture_url: '' }).eq('id', imageEditProduct.id);
                      } else {
                        await supabase.from('product_images').delete().eq('product_id', imageEditProduct.id);
                        await supabase.from('products').update({ image_url: '' }).eq('id', imageEditProduct.id);
                      }
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
                    let filePath, publicUrl;
                    if (imageEditProduct.__isCombo) {
                      filePath = `sets/${imageEditProduct.id}/main.${fileExt}`;
                      const { error: uploadError } = await supabase.storage.from('productimages').upload(filePath, file, { upsert: true });
                      if (uploadError) throw uploadError;
                      const { data: publicUrlData } = supabase.storage.from('productimages').getPublicUrl(filePath);
                      publicUrl = publicUrlData?.publicUrl;
                      if (!publicUrl) throw new Error('Failed to get public URL for image.');
                      await supabase.from('combos').update({ picture_url: publicUrl }).eq('id', imageEditProduct.id);
                    } else {
                      // FIX: stable, unique path per product
                      filePath = `products/${imageEditProduct.id}/main.${fileExt}`;
                      const { error: uploadError } = await supabase.storage.from('productimages').upload(filePath, file, { upsert: true });
                      if (uploadError) throw uploadError;
                      const { data: publicUrlData } = supabase.storage.from('productimages').getPublicUrl(filePath);
                      publicUrl = publicUrlData?.publicUrl;
                      if (!publicUrl) throw new Error('Failed to get public URL for image.');
                      await supabase.from('product_images').insert([
                        { product_id: imageEditProduct.id, image_url: publicUrl }
                      ]);
                      await supabase.from('products').update({ image_url: publicUrl }).eq('id', imageEditProduct.id);
                    }
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

      {/* Manual Inventory Adjust / Set Assembly Modal */}
      {adjustModalOpen && adjustProduct && (
        <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#23272f',padding:32,borderRadius:12,minWidth:320,maxWidth:420}}>
            <h3>{adjustProduct.__isCombo ? (adjustSetMode === 'assemble' ? 'Assemble Set' : 'Receive Sets') : 'Adjust Inventory'}</h3>
            <div style={{marginBottom:12}}>
              {adjustProduct.__isCombo ? (
                <>Set: <b>{adjustProduct.combo_name}</b> (SKU: {adjustProduct.sku})</>
              ) : (
                <>Product: <b>{adjustProduct.name}</b> (SKU: {adjustProduct.sku})</>
              )}
            </div>
            <div style={{marginBottom:12}}>
              <label>Location:</label>
              <select
                value={selectedLocation}
                onChange={(e) => {
                  handleLocationChange(e);
                  const lid = e.target.value;
                  if (adjustProduct) {
                    if (adjustProduct.__isCombo) {
                      if (adjustSetMode === 'assemble') {
                        const b = computeComboMaxQty(adjustProduct.id, lid);
                        setAdjustQty(b > 0 ? 1 : 0);
                      } else {
                        setAdjustQty(1);
                      }
                    } else {
                      const inv = inventory.find(inv => inv.product_id === adjustProduct.id && String(inv.location) === String(lid));
                      const qty = inv ? Number(inv.quantity) : 0;
                      setAdjustQty(qty);
                    }
                  }
                }}
                style={{marginLeft:8}}
              >
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
            {adjustProduct.__isCombo ? (
              <div style={{marginBottom:12, color:'#9aa4b2'}}>
                {selectedLocation ? (
                  (() => {
                    const b = computeComboMaxQty(adjustProduct.id, selectedLocation);
                    const locName = locations.find(l => String(l.id) === String(selectedLocation))?.name || '';
                    return <span>Buildable Sets at {locName}: <b style={{color:'#e0e6ed'}}>{b}</b></span>;
                  })()
                ) : (
                  <span>Select a location to view buildable sets</span>
                )}
              </div>
            ) : (
              <div style={{marginBottom:12, color:'#9aa4b2'}}>
                {selectedLocation
                  ? (
                    (() => {
                      const inv = inventory.find(inv => inv.product_id === adjustProduct.id && String(inv.location) === String(selectedLocation));
                      const qty = inv ? Number(inv.quantity) : 0;
                      const locName = locations.find(l => String(l.id) === String(selectedLocation))?.name || '';
                      return <span>Current Qty at {locName}: <b style={{color:'#e0e6ed'}}>{qty}</b></span>;
                    })()
                  )
                  : (<span>Select a location to view current quantity</span>)}
              </div>
            )}
            {adjustProduct.__isCombo && (
              <div style={{marginBottom:12}}>
                <label>Mode:</label>
                <select value={adjustSetMode} onChange={e => {
                  const mode = e.target.value;
                  setAdjustSetMode(mode);
                  if (mode === 'assemble') {
                    const b = computeComboMaxQty(adjustProduct.id, selectedLocation || '');
                    setAdjustQty(b > 0 ? 1 : 0);
                  } else {
                    setAdjustQty(1);
                  }
                }} style={{marginLeft:8}}>
                  <option value="receive">Receive (increase components)</option>
                  <option value="assemble">Assemble (consume components)</option>
                </select>
              </div>
            )}
            <div style={{marginBottom:12}}>
              {adjustProduct.__isCombo ? (
                <>
                  <label>{adjustSetMode === 'assemble' ? 'Assemble Sets:' : 'Receive Sets:'}</label>
                  <input type="number" min={1} value={adjustQty} onChange={e => setAdjustQty(e.target.value)} style={{marginLeft:8,width:80}} />
                </>
              ) : (
                <>
                  <label>Quantity:</label>
                  <input type="number" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} style={{marginLeft:8,width:80}} />
                </>
              )}
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
