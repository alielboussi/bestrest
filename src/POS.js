import React, { useState, useEffect } from "react";
import { getMaxSetQty, selectPrice, formatAmount } from './utils/setInventoryUtils';
import { FaCashRegister, FaUserPlus, FaPlus } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import supabase from "./supabase";
import "./POS.css";

export default function POS() {
  // Place ALL hooks here, inside the function!
  const [saleTypeFilter, setSaleTypeFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [amountFilter, setAmountFilter] = useState('');
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showEditCustomerModal, setShowEditCustomerModal] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: "", phone: "", tpin: "", address: "", city: "" });
  const [editCustomerForm, setEditCustomerForm] = useState({ id: null, name: "", phone: "", tpin: "", address: "", city: "" });
  const [customerError, setCustomerError] = useState("");
  const [editCustomerError, setEditCustomerError] = useState("");
  const [customerLoading, setCustomerLoading] = useState(false);
  const [editCustomerLoading, setEditCustomerLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutSuccess, setCheckoutSuccess] = useState("");
  const [currency, setCurrency] = useState("K");
  const [products, setProducts] = useState([]);
  const [sets, setSets] = useState([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]); // [{product, qty, price, vat}]
  const [vatIncluded, setVatIncluded] = useState(true);
  const [discountAll, setDiscountAll] = useState(0);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [receiptNumber, setReceiptNumber] = useState("");
  const [customerLaybys, setCustomerLaybys] = useState([]);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showCustomPriceModal, setShowCustomPriceModal] = useState(false);
  const [customPriceIdx, setCustomPriceIdx] = useState(null);
  const [customPriceValue, setCustomPriceValue] = useState(0);
  const [showCustomProductModal, setShowCustomProductModal] = useState(false);
  const [customProductForm, setCustomProductForm] = useState({ name: '', price: '', qty: 1 });
  const [customProductError, setCustomProductError] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [inventoryDeductedMsg, setInventoryDeductedMsg] = useState(""); // New state for inventory deducted message
  const [remainingDue, setRemainingDue] = useState(0); // Total remaining (opening + outstanding laybys)

  // Fetch locations and customers (only once)
  useEffect(() => {
    supabase.from("locations").select("id, name").then(({ data }) => setLocations(data || []));
    supabase.from("customers").select("id, name, phone, currency, opening_balance").then(({ data }) => setCustomers(data || []));
  }, []);


  // --- FIXED LOGIC BELOW ---
  useEffect(() => {
    if (!selectedLocation) {
      setProducts([]);
      setSets([]);
      return;
    }

    async function fetchProductsAndSets() {
      // Fetch inventory (with products joined)
      const { data: invData } = await supabase
        .from("inventory")
        .select(
          "product_id, quantity, product:products(id, name, sku, price:price, promotional_price, currency, product_locations(location_id))"
        )
        .eq("location", selectedLocation);

      // Build productMap
      const productMap = {};
      (invData || []).forEach(row => {
        if (!row.product) return;
        const pid = row.product.id;
        const locationIds = row.product.product_locations
          ? row.product.product_locations.map(pl => pl.location_id)
          : [];
        if (!locationIds.includes(selectedLocation)) return;
        productMap[pid] = {
          ...row.product,
          stock: Number(row.quantity) || 0,
        };
      });
      // Debug: print productMap after building
      console.log('DEBUG productMap:', productMap);

      // Fetch combos, combo_items
      const { data: combosData, error: combosError } = await supabase
        .from("combos")
        .select("id, combo_name, sku, standard_price, promotional_price, combo_price, currency, combo_locations:combo_locations(location_id)");
      // Debug: print combosData after fetching
      console.log('DEBUG combosData:', combosData);
      if (combosError) {
        console.error('DEBUG combosError:', combosError.message);
      }
      const { data: comboItemsData } = await supabase
        .from("combo_items")
        .select("combo_id, product_id, quantity");
      // Debug: print comboItemsData after fetching
      console.log('DEBUG comboItemsData:', comboItemsData);

      // Filter combos for this location
      const combosForLocation = (combosData || []).filter(combo => {
        const locationIds = Array.isArray(combo.combo_locations)
          ? combo.combo_locations.map(cl => String(cl.location_id))
          : [];
        return locationIds.includes(String(selectedLocation));
      });
      // Debug: print combosForLocation after filtering
      console.log('DEBUG combosForLocation:', combosForLocation);
      // Debug logs
      console.log('DEBUG combosForLocation:', combosForLocation);
      console.log('DEBUG comboItemsData:', comboItemsData);
      // Centralized set inventory calculation
      function getSetQty(comboId) {
        const items = comboItemsData.filter(ci => String(ci.combo_id) === String(comboId));
        const productStock = {};
        Object.values(productMap).forEach(p => { productStock[p.id] = p.stock; });
        return getMaxSetQty(items, productStock);
      }

      // Create filtered sets
      const filteredSets = combosForLocation
        .map(combo => {
          const setQty = getSetQty(combo.id);
          const usePrice = selectPrice(combo.promotional_price, combo.standard_price);
          return {
            ...combo,
            price: usePrice,
            currency: combo.currency ?? '',
            stock: setQty,
            isSet: true,
          };
        })
        .filter(set => set.stock > 0);
      // Debug log for filtered sets (after creation)
      console.log('DEBUG filteredSets:', filteredSets);

      setSets(filteredSets);

      // Calculate used stock per product for sets
      const usedStock = {};
      filteredSets.forEach(set => {
        const setQty = set.stock;
        comboItemsData
          .filter(ci => ci.combo_id === set.id)
          .forEach(item => {
            usedStock[item.product_id] = (usedStock[item.product_id] || 0) + item.quantity * setQty;
          });
      });

      // Show products only if there is excess stock after sets are accounted for
      const filteredProducts = Object.values(productMap)
        .map(p => {
          const remainingStock = p.stock - (usedStock[p.id] || 0);
          return remainingStock > 0 ? { ...p, stock: remainingStock } : null;
        })
        .filter(Boolean);

      setProducts(filteredProducts);
    }

    fetchProductsAndSets();
  }, [selectedLocation]);
  // --- END OF FIXED LOGIC ---



  // When customer changes, fetch laybys
  useEffect(() => {
    fetchCustomerLaybys(selectedCustomer);
  // Set POS currency from selected customer's preferred currency when customer changes
  const cust = customers.find(c => String(c.id) === String(selectedCustomer));
  if (cust?.currency) setCurrency(cust.currency);
  }, [selectedCustomer]);

  // Fetch permissions and actions
  // Removed permissions fetching logic for open access




  // Removed user and checkingUser checks for open access

  // Helper: get correct price (use promo if present and > 0, else use price if present and > 0)
  const getBestPrice = (item) => selectPrice(item.promotional_price, item.price);

  // Add product or set to cart
  const addToCart = (item) => {
    setCart([
      ...cart,
      {
        ...item,
        qty: 1,
        price: getBestPrice(item),
        isSet: item.isSet || false,
        isCustom: false
      }
    ]);
  };

  // Add custom product/service to cart
  const addCustomProductToCart = () => {
    setCustomProductError('');
    const name = customProductForm.name.trim();
    const price = Number(customProductForm.price);
    const qty = Number(customProductForm.qty);
    if (!name || isNaN(price) || price <= 0 || isNaN(qty) || qty <= 0) {
      setCustomProductError('Enter valid name, price, and quantity.');
      return;
    }
    setCart([
      ...cart,
      {
        id: `custom-${Date.now()}-${Math.floor(Math.random()*10000)}`,
        name,
        sku: '',
        qty,
        price,
        isCustom: true,
        isSet: false,
        currency,
      }
    ]);
    setShowCustomProductModal(false);
    setCustomProductForm({ name: '', price: '', qty: 1 });
  };

  // Update cart item
  const updateCartItem = (idx, changes) => {
    setCart(cart.map((item, i) => (i === idx ? { ...item, ...changes } : item)));
  };

  // Remove cart item
  const removeCartItem = (idx) => {
    setCart(cart.filter((_, i) => i !== idx));
  };

  // Add new customer (modal logic)
  const handleAddCustomer = async (e) => {
    e.preventDefault();
    setCustomerError("");
    setCustomerLoading(true);
    if (!customerForm.name.trim() && !customerForm.phone.trim()) {
      setCustomerError("Please enter at least one field (name or phone).");
      setCustomerLoading(false);
      return;
    }
    // Capitalize name before saving
    const name = capitalizeWords(customerForm.name.trim());
    const { data, error } = await supabase
      .from("customers")
      .insert([{ 
        name,
        phone: customerForm.phone.trim(),
        tpin: customerForm.tpin.trim(),
        address: customerForm.address.trim(),
        city: customerForm.city.trim()
      }])
      .select();
    if (error) {
      setCustomerError(error.message);
    } else {
      setCustomers((prev) => [...prev, ...data]);
      setSelectedCustomer(data[0].id);
      setShowCustomerModal(false);
      setCustomerForm({ name: "", phone: "", tpin: "", address: "", city: "" });
    }
    setCustomerLoading(false);
  };

  // Edit existing customer (modal logic)
  const openEditCustomerModal = (customer) => {
    setEditCustomerForm({
      id: customer.id,
      name: customer.name || "",
      phone: customer.phone || "",
      tpin: customer.tpin || "",
      address: customer.address || "",
      city: customer.city || ""
    });
    setEditCustomerError("");
    setShowEditCustomerModal(true);
  };

  const handleEditCustomer = async (e) => {
    e.preventDefault();
    setEditCustomerError("");
    setEditCustomerLoading(true);
    if (!editCustomerForm.name.trim()) {
      setEditCustomerError("Please enter a name or business name.");
      setEditCustomerLoading(false);
      return;
    }
    // Capitalize name before saving
    const name = capitalizeWords(editCustomerForm.name.trim());
    const { error } = await supabase
      .from("customers")
      .update({
        name,
        phone: editCustomerForm.phone.trim(),
        tpin: editCustomerForm.tpin.trim(),
        address: editCustomerForm.address.trim(),
        city: editCustomerForm.city.trim()
      })
      .eq("id", editCustomerForm.id);
    if (error) {
      setEditCustomerError(error.message);
    } else {
      setCustomers((prev) => prev.map(c => c.id === editCustomerForm.id ? { ...c, ...editCustomerForm, name } : c));
      setShowEditCustomerModal(false);
      // If the edited customer is selected, update their info
      if (selectedCustomer === editCustomerForm.id) {
        setSelectedCustomer(editCustomerForm.id);
      }
    }
    setEditCustomerLoading(false);
  };

  // Calculate totals (VAT is inclusive, not added)
  const subtotal = cart.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty)), 0);
  const discountAmount = Number(discountAll) || 0;
  const total = subtotal - discountAmount;


  // Handle checkout (Supabase integration, supports partial payments/layby)
  // --- Restore inventory logic ---
  // Restore inventory for all products in a layby using only recorded sales_items
  const restoreInventoryForLayby = async (laybyId) => {
    // 1) Find sale and its location
    const { data: laybyData, error: laybyError } = await supabase
      .from('laybys')
      .select('sale_id')
      .eq('id', laybyId)
      .single();
    if (laybyError || !laybyData?.sale_id) return;
    const saleId = laybyData.sale_id;
    const { data: saleRow, error: saleRowError } = await supabase
      .from('sales')
      .select('location_id')
      .eq('id', saleId)
      .single();
    if (saleRowError || !saleRow?.location_id) return;
    const restoreLocation = saleRow.location_id;
    // 2) Get sale items and add their quantities back to inventory
    const { data: saleItems } = await supabase
      .from('sales_items')
      .select('product_id, quantity')
      .eq('sale_id', saleId);
    const ops = [];
    for (const item of saleItems || []) {
      if (!item.product_id) continue; // skip custom lines
      ops.push((async () => {
        const { data: invRows } = await supabase
          .from('inventory')
          .select('id, quantity')
          .eq('product_id', item.product_id)
          .eq('location', restoreLocation);
        if (invRows && invRows.length > 0) {
          const invId = invRows[0].id;
          const newQty = (Number(invRows[0].quantity) || 0) + Number(item.quantity);
          await supabase
            .from('inventory')
            .update({ quantity: newQty, updated_at: new Date().toISOString() })
            .eq('id', invId);
        } else {
          await supabase
            .from('inventory')
            .insert([
              {
                product_id: item.product_id,
                location: restoreLocation,
                quantity: Number(item.quantity),
                updated_at: new Date().toISOString()
              }
            ]);
        }
        // Ensure product_locations exists
        const { data: prodLocRows } = await supabase
          .from('product_locations')
          .select('id')
          .eq('product_id', item.product_id)
          .eq('location_id', restoreLocation);
        if (!prodLocRows || prodLocRows.length === 0) {
          await supabase
            .from('product_locations')
            .insert([{ product_id: item.product_id, location_id: restoreLocation }]);
        }
      })());
    }
    await Promise.all(ops);
  };

  // Restore inventory for all laybys of a customer
  const restoreInventoryForCustomer = async (customerId) => {
    // Get all laybys for customer
    const { data: laybys } = await supabase
      .from('laybys')
      .select('id')
      .eq('customer_id', customerId);
    for (const layby of laybys || []) {
      await restoreInventoryForLayby(layby.id);
    }
  };

  // Handle checkout (Supabase integration, supports partial payments/layby)
  const handleCheckout = async () => {
    setCheckoutError("");
    setCheckoutSuccess("");
    if (!selectedLocation || !selectedCustomer || cart.length === 0) {
      setCheckoutError("Please select location, customer, and add products to cart.");
      return;
    }
    // Accept both UUID and integer customer IDs
    const customerObj = customers.find(c => String(c.id) === String(selectedCustomer));
    const customerId = customerObj ? customerObj.id : null;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const intRegex = /^\d+$/;
    if (!customerId || (!uuidRegex.test(String(customerId)) && !intRegex.test(String(customerId)))) {
      setCheckoutError("Selected customer is not valid. Please select a valid customer.");
      return;
    }
    // Require receipt number
    if (!receiptNumber.trim()) {
      setCheckoutError("Please enter a receipt number.");
      return;
    }
    // Prevent selling more than available stock
    for (const item of cart) {
      if (item.isCustom) continue;
      // Find product in products or sets
      let availableStock = null;
      if (item.isSet) {
        // For sets, use sets array
        const setObj = sets.find(s => s.id === item.id || s.id === (item.id && item.id.replace('set-', '')));
        availableStock = setObj ? setObj.stock : null;
      } else {
        const prodObj = products.find(p => p.id === item.id);
        availableStock = prodObj ? prodObj.stock : null;
      }
      if (availableStock !== null && item.qty > availableStock) {
        setCheckoutError(`Cannot sell more than available stock for ${item.name}. Requested: ${item.qty}, Available: ${availableStock}`);
        return;
      }
    }
  // If paymentAmount is not set or 0, treat as layby/partial
  let payAmt = Number(paymentAmount);
    if (payAmt < 0 || payAmt > total) {
      setCheckoutError("Enter a valid payment amount (<= total).");
      return;
    }
    if (!payAmt || payAmt === 0) payAmt = 0;
    setCheckoutLoading(true);

    try {
      // 0. Apply opening balance first; compute remainder to use for sale
      let remainingPay = Number(payAmt) || 0;
      if (selectedCustomer && remainingPay > 0) {
        const cust = customers.find(c => String(c.id) === String(selectedCustomer));
        const opening = Number(cust?.opening_balance || 0);
        if (opening > 0) {
          if (remainingPay >= opening) {
            await supabase.from('customers').update({ opening_balance: 0 }).eq('id', selectedCustomer);
            remainingPay = remainingPay - opening;
          } else {
            await supabase.from('customers').update({ opening_balance: opening - remainingPay }).eq('id', selectedCustomer);
            remainingPay = 0;
          }
        }
      }
      let laybyId = null;
      let saleId = null;
      // 1. If partial payment, create layby record first to get layby_id (UUID)
  if (remainingPay < total) {
        const { data: laybyData, error: laybyError } = await supabase
          .from("laybys")
          .insert([
            {
              customer_id: customerId,
      total_amount: total,
      paid_amount: remainingPay,
              status: 'active',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            },
          ])
          .select();
        if (laybyError) throw laybyError;
        laybyId = laybyData[0].id; // UUID
      }

      // 2. Insert sale with all required columns (let DB generate integer id)
      const { data: saleData, error: saleError } = await supabase
        .from("sales")
        .insert([
          {
            customer_id: customerId,
            sale_date: date,
            total_amount: total,
            status: remainingPay < total ? 'layby' : 'completed',
            updated_at: new Date().toISOString(),
            location_id: selectedLocation,
            layby_id: laybyId || null,
            currency: currency,
            discount: discountAmount,
            down_payment: remainingPay,
            receipt_number: `#${receiptNumber.trim().replace(/^#*/, "")}`,
          },
        ])
        .select();
      if (saleError) throw saleError;
      saleId = saleData[0].id; // integer

      // 3. Update layby with sale_id if layby was created
      if (laybyId) {
        await supabase.from("laybys").update({ sale_id: saleId }).eq("id", laybyId);
      }

      // 4. Insert sale_items (use integer saleId)
      //    - Custom lines: product_id null, store qty and unit_price
      //    - Set lines: expand into component product rows with aggregated qty and unit_price 0 (revenue tracked at sale level)
      const saleItems = [];
      for (const item of cart) {
    if (item.isCustom) {
          saleItems.push({
            sale_id: saleId,
            product_id: null,
      display_name: item.name,
            quantity: Number(item.qty),
            unit_price: Number(item.price),
            currency: item.currency || currency
          });
        } else if (item.isSet) {
          const comboIdInt = typeof item.id === 'string' ? parseInt(String(item.id).replace('set-', ''), 10) : item.id;
          const { data: comboItemsData } = await supabase
            .from('combo_items')
            .select('product_id, quantity')
            .eq('combo_id', comboIdInt);
          for (const ci of comboItemsData || []) {
            saleItems.push({
              sale_id: saleId,
              product_id: ci.product_id,
              quantity: Number(ci.quantity) * Number(item.qty),
              unit_price: 0,
              currency: item.currency || currency
            });
          }
        } else {
          saleItems.push({
            sale_id: saleId,
            product_id: item.id,
            quantity: Number(item.qty),
            unit_price: Number(item.price),
            currency: item.currency || currency
          });
        }
      }
      const { error: itemsError } = await supabase.from("sales_items").insert(saleItems);
      if (itemsError) throw itemsError;

      // 5. Insert sale payment only for the remainder after opening balance
      if (remainingPay > 0) {
        const paymentType = remainingPay < total ? 'layby' : 'cash';
        const { error: payError } = await supabase.from("sales_payments").insert([
          {
            sale_id: saleId,
            amount: remainingPay,
            payment_type: paymentType,
            currency,
            payment_date: new Date().toISOString(),
          },
        ]);
        if (payError) throw payError;
      }

      setCheckoutSuccess("Sale completed successfully!");
      // Deduct inventory ONLY for completed sales (not layby/partial)
  if (remainingPay >= total) {
        for (const item of cart) {
          if (item.isCustom) continue; // Skip inventory for custom products/services
          if (!item.id || !selectedLocation) continue;
          if (item.isSet) {
            // Deduct inventory for all products in the set
            // Find combo_items for this set
            const comboIdInt = typeof item.id === 'string' ? parseInt(item.id.replace('set-', ''), 10) : item.id;
            const { data: comboItemsData, error: comboItemsError } = await supabase
              .from('combo_items')
              .select('product_id, quantity')
              .eq('combo_id', comboIdInt);
            if (comboItemsError) throw comboItemsError;
            for (const comboItem of comboItemsData || []) {
              // Deduct comboItem.quantity * item.qty from inventory for each product in the set
              const { data: invRows, error: invError } = await supabase
                .from('inventory')
                .select('id, quantity')
                .eq('product_id', comboItem.product_id)
                .eq('location', selectedLocation);
              if (invError) throw invError;
              const deductQty = Number(comboItem.quantity) * Number(item.qty);
              if (invRows && invRows.length > 0) {
                const invId = invRows[0].id;
                const newQty = Math.max(0, (Number(invRows[0].quantity) || 0) - deductQty);
                const { error: updateError } = await supabase
                  .from('inventory')
                  .update({ quantity: newQty, updated_at: new Date().toISOString() })
                  .eq('id', invId);
                if (updateError) throw updateError;
              } else {
                const { error: insertError } = await supabase
                  .from('inventory')
                  .insert([
                    {
                      product_id: comboItem.product_id,
                      location: selectedLocation,
                      quantity: Math.max(0, 0 - deductQty),
                      updated_at: new Date().toISOString()
                    }
                  ]);
                if (insertError) throw insertError;
              }
              // Ensure product_locations exists
              const { data: prodLocRows, error: prodLocError } = await supabase
                .from('product_locations')
                .select('id')
                .eq('product_id', comboItem.product_id)
                .eq('location_id', selectedLocation);
              if (prodLocError) throw prodLocError;
              if (!prodLocRows || prodLocRows.length === 0) {
                const { error: insertProdLocError } = await supabase
                  .from('product_locations')
                  .insert([
                    {
                      product_id: comboItem.product_id,
                      location_id: selectedLocation
                    }
                  ]);
                if (insertProdLocError) throw insertProdLocError;
              }
            }
          } else {
            // Deduct inventory for single product
            const { data: invRows, error: invError } = await supabase
              .from('inventory')
              .select('id, quantity')
              .eq('product_id', item.id)
              .eq('location', selectedLocation);
            if (invError) throw invError;
            if (invRows && invRows.length > 0) {
              const invId = invRows[0].id;
              const newQty = Math.max(0, (Number(invRows[0].quantity) || 0) - Number(item.qty));
              const { error: updateError } = await supabase
                .from('inventory')
                .update({ quantity: newQty, updated_at: new Date().toISOString() })
                .eq('id', invId);
              if (updateError) throw updateError;
            } else {
              const { error: insertError } = await supabase
                .from('inventory')
                .insert([
                  {
                    product_id: item.id,
                    location: selectedLocation,
                    quantity: Math.max(0, 0 - Number(item.qty)),
                    updated_at: new Date().toISOString()
                  }
                ]);
              if (insertError) throw insertError;
            }
            // Ensure product_locations exists
            const { data: prodLocRows, error: prodLocError } = await supabase
              .from('product_locations')
              .select('id')
              .eq('product_id', item.id)
              .eq('location_id', selectedLocation);
            if (prodLocError) throw prodLocError;
            if (!prodLocRows || prodLocRows.length === 0) {
              const { error: insertProdLocError } = await supabase
                .from('product_locations')
                .insert([
                  {
                    product_id: item.id,
                    location_id: selectedLocation
                  }
                ]);
              if (insertProdLocError) throw insertProdLocError;
            }
          }
        }
      }
      // After checkout, refresh products and sets to update stock
      setCart([]);
      setPaymentAmount(0);
      setReceiptNumber("");
      // Optionally, refresh laybys for this customer
      fetchCustomerLaybys(selectedCustomer);
      // Refresh products and sets for selected location
      if (selectedLocation) {
        // Re-run fetchProductsAndSets logic
        // Use same logic as useEffect for selectedLocation
        async function refreshProductsAndSets() {
          const { data: invData } = await supabase
            .from("inventory")
            .select(
              "product_id, quantity, product:products(id, name, sku, price:price, promotional_price, currency, product_locations(location_id))"
            )
            .eq("location", selectedLocation);
          const productMap = {};
          (invData || []).forEach(row => {
            if (!row.product) return;
            const pid = row.product.id;
            const locationIds = row.product.product_locations
              ? row.product.product_locations.map(pl => pl.location_id)
              : [];
            if (!locationIds.includes(selectedLocation)) return;
            productMap[pid] = {
              ...row.product,
              stock: Number(row.quantity) || 0,
            };
          });
          const { data: combosData } = await supabase
            .from("combos")
            .select("id, combo_name, sku, standard_price, promotional_price, combo_price, currency, combo_locations:combo_locations(location_id)");
          const { data: comboItemsData } = await supabase
            .from("combo_items")
            .select("combo_id, product_id, quantity");
          const combosForLocation = (combosData || []).filter(combo => {
            const locationIds = Array.isArray(combo.combo_locations)
              ? combo.combo_locations.map(cl => String(cl.location_id))
              : [];
            return locationIds.includes(String(selectedLocation));
          });
          function getMaxSetQty(comboId) {
            const comboIdInt = typeof comboId === 'string' ? parseInt(comboId, 10) : comboId;
            const items = comboItemsData.filter(ci => {
              const ciComboIdInt = typeof ci.combo_id === 'string' ? parseInt(ci.combo_id, 10) : ci.combo_id;
              return ciComboIdInt === comboIdInt;
            });
            if (!items.length) return 0;
            let minQty = Infinity;
            for (const item of items) {
              const prod = productMap[item.product_id];
              const stock = prod ? prod.stock : 0;
              if (stock < item.quantity)
              minQty = Math.min(minQty, Math.floor(stock / item.quantity));
            }
            return minQty;
          }
          const filteredSets = combosForLocation
            .map(combo => {
              const setQty = getMaxSetQty(combo.id);
              return {
                ...combo,
                price: combo.combo_price ?? combo.standard_price ?? 0,
                promotional_price: combo.promotional_price ?? 0,
                currency: combo.currency ?? '',
                stock: setQty,
                isSet: true,
              };
            })
            .filter(set => set.stock > 0);
          setSets(filteredSets);
          // Calculate used stock per product for sets
          const usedStock = {};
          filteredSets.forEach(set => {
            const setQty = set.stock;
            comboItemsData
              .filter(ci => ci.combo_id === set.id)
              .forEach(item => {
                usedStock[item.product_id] = (usedStock[item.product_id] || 0) + item.quantity * setQty;
              });
          });
          const filteredProducts = Object.values(productMap)
            .map(p => {
              const remainingStock = p.stock - (usedStock[p.id] || 0);
              return remainingStock > 0 ? { ...p, stock: remainingStock } : null;
            })
            .filter(Boolean);
          setProducts(filteredProducts);
        }
        await refreshProductsAndSets();
      }
    } catch (err) {
      setCheckoutError(err.message || "Checkout failed.");
    }
    setCheckoutLoading(false);
  };

  // Fetch laybys for customer
  const fetchCustomerLaybys = async (customerId) => {
    if (!customerId) {
      setCustomerLaybys([]);
      setRemainingDue(0);
      return;
    }
    const { data: laybys } = await supabase
      .from('laybys')
      .select('id, sale_id, total_amount, paid_amount, status, created_at, updated_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });
    let list = laybys || [];
    // Pre-compute paid per sale (down_payment + payments) and outstanding per layby
    const saleIds = Array.from(new Set(list.map(l => Number(l.sale_id)).filter(id => !isNaN(id))));
    let downPayments = {};
    if (saleIds.length) {
      const { data: salesRows } = await supabase
        .from('sales')
        .select('id, down_payment')
        .in('id', saleIds);
      (salesRows || []).forEach(s => { downPayments[s.id] = Number(s.down_payment || 0); });
    }
    let paymentsSum = {};
    if (saleIds.length) {
      const { data: pays } = await supabase
        .from('sales_payments')
        .select('sale_id, amount')
        .in('sale_id', saleIds);
      (pays || []).forEach(p => {
        const sid = Number(p.sale_id);
        paymentsSum[sid] = (paymentsSum[sid] || 0) + Number(p.amount || 0);
      });
    }
    list = list.map(l => {
      const sid = Number(l.sale_id);
      const paid = (downPayments[sid] || 0) + (paymentsSum[sid] || 0);
      const outstanding = Math.max(0, Number(l.total_amount || 0) - paid);
      return { ...l, computed_paid: paid, computed_outstanding: outstanding };
    });
    setCustomerLaybys(list);
    // Compute remaining: sum of outstanding across laybys + customer's opening balance
    const totalOutstanding = list.reduce((sum, l) => {
      return sum + Number(l.computed_outstanding || 0);
    }, 0);
    const cust = customers.find(c => String(c.id) === String(customerId));
    const opening = Number(cust?.opening_balance || 0);
    setRemainingDue(opening + totalOutstanding);
  };

  // Delete sale and restore inventory
  const deleteSale = async (saleId) => {
    setCheckoutError("");
    setCheckoutSuccess("");
    setDeleteLoading(true);
    try {
      // 1. Restore inventory for all products in the sale
      const { data: saleItems, error: saleItemsError } = await supabase
        .from('sales_items')
        .select('product_id, quantity')
        .eq('sale_id', saleId);
      if (saleItemsError) throw saleItemsError;
      for (const item of saleItems || []) {
        if (!item.product_id) continue;
        // Update inventory quantity for each product
        const { data: invRows, error: invError } = await supabase
          .from('inventory')
          .select('id, quantity')
          .eq('product_id', item.product_id);
        if (invError) throw invError;
        if (invRows && invRows.length > 0) {
          const invId = invRows[0].id;
          const newQty = (Number(invRows[0].quantity) || 0) + Number(item.quantity);
          const { error: updateError } = await supabase
            .from('inventory')
            .update({ quantity: newQty, updated_at: new Date().toISOString() })
            .eq('id', invId);
          if (updateError) throw updateError;
        }
      }
      // 2. Delete layby if exists
      await supabase.from('laybys').delete().eq('sale_id', saleId);
      // 3. Delete sale
      await supabase.from('sales').delete().eq('id', saleId);
      // 4. Delete sales_items and sales_payments for cleanup
      await supabase.from('sales_items').delete().eq('sale_id', saleId);
      await supabase.from('sales_payments').delete().eq('sale_id', saleId);
      // 5. Refresh laybys and products for UI
      await fetchCustomerLaybys(selectedCustomer);
      if (selectedLocation) {
        // Re-run fetchProductsAndSets logic
        async function refreshProductsAndSets() {
          const { data: invData } = await supabase
            .from("inventory")
            .select(
              "product_id, quantity, product:products(id, name, sku, price:price, promotional_price, currency, product_locations(location_id))"
            )
            .eq("location", selectedLocation);
          const productMap = {};
          (invData || []).forEach(row => {
            if (!row.product) return;
            const pid = row.product.id;
            const locationIds = row.product.product_locations
              ? row.product.product_locations.map(pl => pl.location_id)
              : [];
            if (!locationIds.includes(selectedLocation)) return;
            productMap[pid] = {
              ...row.product,
              stock: Number(row.quantity) || 0,
            };
          });
          const { data: combosData } = await supabase
            .from("combos")
            .select("id, combo_name, sku, standard_price, promotional_price, combo_price, currency, combo_locations:combo_locations(location_id)");
          const { data: comboItemsData } = await supabase
            .from("combo_items")
            .select("combo_id, product_id, quantity");
          const combosForLocation = (combosData || []).filter(combo => {
            const locationIds = Array.isArray(combo.combo_locations)
              ? combo.combo_locations.map(cl => String(cl.location_id))
              : [];
            return locationIds.includes(String(selectedLocation));
          });
          function getMaxSetQty(comboId) {
            const comboIdInt = typeof comboId === 'string' ? parseInt(comboId, 10) : comboId;
            const items = comboItemsData.filter(ci => {
              const ciComboIdInt = typeof ci.combo_id === 'string' ? parseInt(ci.combo_id, 10) : ci.combo_id;
              return ciComboIdInt === comboIdInt;
            });
            if (!items.length) return 0;
            let minQty = Infinity;
            for (const item of items) {
              const prod = productMap[item.product_id];
              const stock = prod ? prod.stock : 0;
              if (stock < item.quantity)
              minQty = Math.min(minQty, Math.floor(stock / item.quantity));
            }
            return minQty;
          }
          const filteredSets = combosForLocation
            .map(combo => {
              const setQty = getMaxSetQty(combo.id);
              return {
                ...combo,
                price: combo.combo_price ?? combo.standard_price ?? 0,
                promotional_price: combo.promotional_price ?? 0,
                currency: combo.currency ?? '',
                stock: setQty,
                isSet: true,
              };
            })
            .filter(set => set.stock > 0);
          setSets(filteredSets);
          // Calculate used stock per product for sets
          const usedStock = {};
          filteredSets.forEach(set => {
            const setQty = set.stock;
            comboItemsData
              .filter(ci => ci.combo_id === set.id)
              .forEach(item => {
                usedStock[item.product_id] = (usedStock[item.product_id] || 0) + item.quantity * setQty;
              });
          });
          const filteredProducts = Object.values(productMap)
            .map(p => {
              const remainingStock = p.stock - (usedStock[p.id] || 0);
              return remainingStock > 0 ? { ...p, stock: remainingStock } : null;
            })
            .filter(Boolean);
          setProducts(filteredProducts);
        }
        await refreshProductsAndSets();
      }
      setCheckoutSuccess("Sale deleted and inventory restored.");
    } catch (err) {
      setCheckoutError(err.message || "Failed to delete sale.");
    }
    setDeleteLoading(false);
  };

  // Delete layby and restore inventory
  // Robust layby deletion: restore inventory, delete sales, delete layby
  const deleteLayby = async (laybyId) => {
    setCheckoutError("");
    setCheckoutSuccess("");
    setDeleteLoading(true);
    try {
      // 1. Restore inventory for this layby
      await restoreInventoryForLayby(laybyId);
      // 2. Find all sales referencing this layby
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('id')
        .eq('layby_id', laybyId);
      if (salesError) throw salesError;
      let allSaleIds = salesData ? salesData.map(s => s.id) : [];
      // 3. Delete sales_items, sales_payments, then sales
      if (allSaleIds.length > 0) {
        // Delete sales_items
        const { error: itemsDeleteError } = await supabase.from('sales_items').delete().in('sale_id', allSaleIds);
        if (itemsDeleteError) throw itemsDeleteError;
        // Delete sales_payments
        const { error: paymentsDeleteError } = await supabase.from('sales_payments').delete().in('sale_id', allSaleIds);
        if (paymentsDeleteError) throw paymentsDeleteError;
        // Delete sales
        const { error: salesDeleteError } = await supabase.from('sales').delete().in('id', allSaleIds);
        if (salesDeleteError) throw salesDeleteError;
      }
      // 4. Delete layby record
      const { error: laybyDeleteError } = await supabase.from('laybys').delete().eq('id', laybyId);
      if (laybyDeleteError) throw laybyDeleteError;
      await fetchCustomerLaybys(selectedCustomer);
      setCheckoutSuccess("Layby and related sales deleted, inventory restored.");
    } catch (err) {
      setCheckoutError(err.message || "Failed to delete layby.");
    }
    setDeleteLoading(false);
  };

  // Delete customer and restore inventory for all their laybys
  // Robust customer deletion: restore inventory, delete laybys, delete sales, then customer
  const deleteCustomer = async (customerId) => {
    setCheckoutError("");
    try {
      // 1. Restore inventory for all laybys
      await restoreInventoryForCustomer(customerId);
      // 2. Find all laybys for customer
      const { data: laybys } = await supabase.from('laybys').select('id').eq('customer_id', customerId);
      for (const layby of laybys || []) {
        await deleteLayby(layby.id);
      }
      // 3. Find all sales for customer (not layby)
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('id')
        .eq('customer_id', customerId);
      if (salesError) throw salesError;
      let allSaleIds = salesData ? salesData.map(s => s.id) : [];
      if (allSaleIds.length > 0) {
        // Delete sales_items
        const { error: itemsDeleteError } = await supabase.from('sales_items').delete().in('sale_id', allSaleIds);
        if (itemsDeleteError) throw itemsDeleteError;
        // Delete sales_payments
        const { error: paymentsDeleteError } = await supabase.from('sales_payments').delete().in('sale_id', allSaleIds);
        if (paymentsDeleteError) throw paymentsDeleteError;
        // Delete sales
        const { error: salesDeleteError } = await supabase.from('sales').delete().in('id', allSaleIds);
        if (salesDeleteError) throw salesDeleteError;
      }
      // 4. Delete customer
      await supabase.from('customers').delete().eq('id', customerId);
      setCustomers(customers.filter(c => c.id !== customerId));
      setSelectedCustomer("");
      setCheckoutSuccess("Customer, laybys, and sales deleted, inventory restored.");
    } catch (err) {
      setCheckoutError(err.message || "Failed to delete customer.");
    }
  };



  // All actions always accessible
  const canAdd = true;
  const canEdit = true;
  const canDelete = true;

  // Filter products and sets by search
  const searchValue = search.trim().toLowerCase();
  const filteredProducts = products.filter(product => {
  if (!searchValue) return true;
  return (
    (product.name && product.name.toLowerCase().includes(searchValue)) ||
    (product.sku && product.sku.toLowerCase().includes(searchValue))
  );
  });
  const filteredSets = sets.filter(set => {
  if (!searchValue) return true;
  return (
    (set.combo_name && set.combo_name.toLowerCase().includes(searchValue)) ||
    (set.sku && set.sku.toLowerCase().includes(searchValue))
  );
  });

  return (
    <div className="pos-container">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem' }}><FaCashRegister style={{ marginRight: 6, fontSize: '1.1rem' }} /> Point of Sale</h2>
      </div>
      <div className="pos-row" style={{
        display: 'flex',
        alignItems: 'center',
        marginBottom: 6,
        maxWidth: 1200,
        width: '100%',
        gap: 10,
        flexWrap: 'wrap',
      }}>
        {/* Unified controls row */}
        <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)} required style={{ fontSize: '1rem', width: 170, height: 38, borderRadius: 6, boxSizing: 'border-box', marginRight: 0 }}>
          <option value="">Select Location</option>
          {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
        </select>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={{
            fontSize: '1rem',
            width: 160,
            height: 38,
            borderRadius: 6,
            boxSizing: 'border-box',
            padding: '0 12px',
            background: '#222',
            color: '#fff',
            border: '1px solid #333',
            outline: 'none',
            appearance: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            marginTop: '-4mm',
          }}
        />
        <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ fontSize: '1rem', width: 80, height: 38, borderRadius: 6, boxSizing: 'border-box', marginRight: 0 }}>
          <option value="K">K</option>
          <option value="$">$</option>
        </select>
        <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)} style={{ fontSize: '1rem', width: 180, height: 38, borderRadius: 6, boxSizing: 'border-box', marginRight: 0 }}>
          <option value="">Select Customer</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
        </select>
        {selectedCustomer && (
          <button type="button" style={{ fontSize: '1rem', width: 70, height: 38, borderRadius: 6, boxSizing: 'border-box', marginRight: 0, background: '#888', color: '#fff', border: 'none' }} onClick={() => {
            const cust = customers.find(c => c.id === selectedCustomer);
            if (cust) openEditCustomerModal(cust);
          }}>Edit</button>
        )}
        {canAdd && (
          <button type="button" onClick={() => setShowCustomerModal(true)} style={{ fontSize: '1rem', width: 170, height: 38, borderRadius: 6, background: '#00b4ff', color: '#fff', fontWeight: 600, border: 'none', boxSizing: 'border-box', marginRight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '-4mm' }}><FaUserPlus style={{ marginRight: 6 }} /> New Customer</button>
        )}
        {selectedCustomer && remainingDue > 0 && (
          <span style={{
            marginLeft: 8,
            background: '#2e7d32',
            color: '#fff',
            padding: '4px 10px',
            borderRadius: 8,
            fontSize: '0.92rem',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.08) inset'
          }}>
            Remaining balance: {currency} {Number(remainingDue).toLocaleString()}
          </span>
        )}
      </div>
      {/* ...rest of the component remains unchanged... */}
      <div className="pos-row" style={{ gap: 6, marginBottom: 6, alignItems: 'center', display: 'flex', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, position: 'relative', marginLeft: '3mm', width: 170 }}>
          <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: '1.1rem', color: '#aaa', pointerEvents: 'none', zIndex: 2 }}>#</span>
          <input
            type="text"
            placeholder="Receipt Number"
            value={receiptNumber}
            onChange={e => setReceiptNumber(e.target.value)}
            style={{ fontSize: '0.95rem', height: 38, width: '100%', paddingLeft: 22, borderRadius: 6, boxSizing: 'border-box', background: '#222', color: '#fff', border: '1px solid #333', position: 'relative' }}
          />
        </div>
      </div>

      {/* Search row: Add Custom Product/Service button before search field */}
      <div className="pos-row" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: 10, width: 1200 }}>
        {canAdd && (
          <button type="button" onClick={() => setShowCustomProductModal(true)} style={{ fontSize: '0.92rem', padding: '2px 8px', height: 38, width: 170, minWidth: 170, maxWidth: 170, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#00b4d8', color: '#fff', border: 'none', borderRadius: 6, marginLeft: '3mm' }}>
            <FaPlus style={{ marginRight: 4 }} /> Add Custom Product/Service
          </button>
        )}
        <input
          type="text"
          placeholder="Search product by name or SKU..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            fontSize: '0.95rem',
            height: 38,
            minHeight: 38,
            maxHeight: 38,
            flex: 1,
            borderRadius: 6,
            boxSizing: 'border-box',
            background: '#222',
            color: '#fff',
            border: '1.5px solid #ff5252',
            marginLeft: 0,
            boxShadow: '0 0 8px 2px #ff5252',
            outline: '2px solid #ff5252',
            transition: 'box-shadow 0.2s, border 0.2s',
          }}
        />
      </div>
      {/* Product/set cards above the table */}
      <div className="pos-products" style={{ gap: 0 }}>
        {/* Always show all matching products/sets, no limit applied */}
        {[
          ...filteredProducts.map(product => (
            <button
              key={product.id}
              className="pos-product-btn"
              onClick={() => addToCart(product)}
            >
              {product.name} ({product.sku})<br />Stock: {product.stock}<br />
              <b>Price: {getBestPrice(product).toFixed(2)} {product.currency || currency}</b>
              <div style={{fontSize:'0.8em',color:'#aaa'}}>std: {String(product.price)} | promo: {String(product.promotional_price)}</div>
            </button>
          )),
          ...filteredSets.map(set => (
            <button
              key={"set-" + set.id}
              className="pos-product-btn"
              onClick={() => addToCart(set)}
            >
              {set.combo_name} (Set) ({set.sku})<br />
              <span style={{color:'#00b4d8',fontWeight:'bold'}}>Stock: {set.stock}</span><br />
              <b>Price: {getBestPrice(set).toFixed(2)} {set.currency || currency}</b>
            </button>
          ))
        ]}
      </div>
      <table className="pos-table" style={{ fontSize: '0.95rem', marginTop: '-85px' }}>
        <thead>
          <tr>
            <th className="text-col" style={{ fontSize: '0.95rem', padding: 4 }}>SKU</th>
            <th className="text-col" style={{ fontSize: '0.95rem', padding: 4 }}>Name</th>
            <th className="num-col" style={{ fontSize: '0.95rem', padding: 4 }}>Qty</th>
            <th className="num-col" style={{ fontSize: '0.95rem', padding: 4 }}>Amount</th>
            <th className="action-col" style={{ fontSize: '0.95rem', padding: 4 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {cart.map((item, idx) => (
            <tr key={idx}>
              <td className="text-col" style={{ padding: 4 }}>{item.sku || (item.isCustom ? '-' : '')}</td>
              <td className="text-col" style={{ padding: 4 }}>
                {item.name}{item.isCustom && <span style={{ color: '#00b4d8', fontSize: '0.9em', marginLeft: 4 }}>(Custom)</span>}
                {item.isSet && <span style={{ color: '#00b4d8', fontSize: '0.9em', marginLeft: 8 }}>(Stock: {item.stock})</span>}
              </td>
              <td className="num-col" style={{ padding: 4 }}><input type="number" min="1" max={item.stock || 9999} value={item.qty} onChange={e => updateCartItem(idx, { qty: Number(e.target.value) })} style={{ width: 48, fontSize: '0.95rem', height: 24, textAlign: 'center' }} /></td>
              <td className="num-col" style={{ padding: 4 }}>{Number(item.price).toFixed(2)}</td>
              <td className="action-col" style={{ padding: 4, display: 'flex', gap: 4 }}>
                <button onClick={() => removeCartItem(idx)} style={{ fontSize: '0.95rem', padding: '2px 8px', height: 24 }}>Remove</button>
                <button onClick={() => { setCustomPriceIdx(idx); setCustomPriceValue(item.price); setShowCustomPriceModal(true); }} style={{ fontSize: '0.95rem', padding: '2px 8px', height: 24, background: '#00b4d8', color: '#fff', border: 'none', borderRadius: 4 }}>Set Custom Price</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Custom Price Modal */}
      {showCustomPriceModal && (
        <div className="pos-modal">
          <div className="pos-modal-content">
            <h3>Set Custom Price</h3>
            <input
              type="number"
              min="0"
              value={customPriceValue}
              onChange={e => setCustomPriceValue(e.target.value)}
              style={{ width: 120, fontSize: '1.1em', marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => {
                if (customPriceIdx !== null) updateCartItem(customPriceIdx, { price: Number(customPriceValue) });
                setShowCustomPriceModal(false);
              }} style={{ background: '#00b4d8', color: '#fff', fontWeight: 600, border: 'none', borderRadius: 6, padding: '8px 18px' }}>Save</button>
              <button onClick={() => setShowCustomPriceModal(false)} style={{ background: '#888', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Product/Service Modal */}
      {showCustomProductModal && (
        <div className="pos-modal">
          <div className="pos-modal-content">
            <h3>Add Custom Product/Service</h3>
            <input
              type="text"
              placeholder="Name (e.g. Handmade Service)"
              value={customProductForm.name}
              onChange={e => setCustomProductForm(f => ({ ...f, name: e.target.value }))}
              style={{ width: 220, marginBottom: 8 }}
              required
            />
            <input
              type="number"
              placeholder="Price"
              value={customProductForm.price}
              onChange={e => setCustomProductForm(f => ({ ...f, price: e.target.value }))}
              style={{ width: 120, marginBottom: 8 }}
              required
            />
            <input
              type="number"
              placeholder="Quantity"
              value={customProductForm.qty}
              min={1}
              onChange={e => setCustomProductForm(f => ({ ...f, qty: e.target.value }))}
              style={{ width: 80, marginBottom: 8 }}
              required
            />
            {customProductError && <div style={{ color: '#ff5252', marginBottom: 8 }}>{customProductError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addCustomProductToCart} style={{ background: '#00b4d8', color: '#fff', fontWeight: 600, border: 'none', borderRadius: 6, padding: '8px 18px' }}>Add</button>
              <button onClick={() => { setShowCustomProductModal(false); setCustomProductError(''); }} style={{ background: '#888', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      <div className="pos-summary" style={{ fontSize: '1rem', display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', marginTop: 8, marginBottom: 8 }}>
        <div>Subtotal: {subtotal.toFixed(2)}</div>
        <div>VAT @16%: Inclusive</div>
        <div>
          Discount: <input
            type="number"
            min="0"
            max={subtotal}
            value={discountAll}
            onChange={e => setDiscountAll(e.target.value)}
            style={{ width: 60, marginLeft: 4, marginRight: 4, fontSize: '0.95rem', height: 24 }}
          />
        </div>
        <div><b>Total: {total.toFixed(2)} {currency}</b></div>
      </div>
      <div className="pos-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
        <input
          type="number"
          min="0"
          max={total}
          value={paymentAmount}
          onChange={e => setPaymentAmount(Number(e.target.value))}
          placeholder="Payment Amount"
          style={{ minWidth: 90, fontSize: '0.95rem', height: 28, marginRight: 4 }}
        />
        <button
          onClick={handleCheckout}
          disabled={checkoutLoading || total <= 0}
          style={{ fontSize: '0.95rem', padding: '4px 14px', height: 28, whiteSpace: 'nowrap', minWidth: 140 }}
        >
          {checkoutLoading
            ? "Processing..."
            : (paymentAmount < total ? "Checkout (Partial/Layby)" : "Checkout")}
        </button>
      </div>
      {/* Sales/Layby search/filter section */}
      {customerLaybys.length > 0 && (
        <div style={{ margin: '24px 0', background: '#23272f', borderRadius: 8, padding: 16 }}>
          <h4 style={{ color: '#00b4d8', margin: 0, marginBottom: 8 }}>Layby / Partial Payment History</h4>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <select value={saleTypeFilter} onChange={e => setSaleTypeFilter(e.target.value)} style={{ fontSize: 15, borderRadius: 6, padding: '2px 8px' }}>
              <option value="all">All Types</option>
              <option value="completed">Completed</option>
              <option value="layby">Layby</option>
              <option value="active">Active</option>
            </select>
            <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)} style={{ fontSize: 15, borderRadius: 6, padding: '2px 8px' }}>
              <option value="all">All Customers</option>
              {customers.map(c => (
                <option key={c.id} value={String(c.id)}>{c.name} ({c.phone})</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Amount (min)"
              value={amountFilter}
              onChange={e => setAmountFilter(e.target.value)}
              style={{ fontSize: 15, borderRadius: 6, padding: '2px 8px', width: 120 }}
            />
          </div>
          <table style={{ width: '100%', color: '#fff', fontSize: 15 }}>
            <thead>
              <tr style={{ color: '#00b4d8' }}>
                <th>Created</th>
                <th>Status</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th className="customer-col">Customer</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customerLaybys
                .filter(l => {
                  // Sale type filter
                  if (saleTypeFilter !== 'all' && l.status !== saleTypeFilter) return false;
                  // Customer filter
                  if (customerFilter !== 'all' && String(l.customer_id) !== String(customerFilter)) return false;
                  // Amount filter (min total)
                  if (amountFilter && Number(l.total_amount) < Number(amountFilter)) return false;
                  return true;
                })
                .map(l => (
                  <tr key={l.id}>
                    <td>{new Date(l.created_at).toLocaleDateString()}</td>
                    <td>{l.status}</td>
                    <td>{Number(l.total_amount).toFixed(2)}</td>
                    <td>{Number(l.computed_paid ?? l.paid_amount ?? 0).toFixed(2)}</td>
                    <td>{Number(l.computed_outstanding ?? (Number(l.total_amount) - Number(l.paid_amount)) ?? 0).toFixed(2)}</td>
                    <td>{customers.find(c => String(c.id) === String(l.customer_id))?.name || '-'}</td>
                    <td></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {checkoutError && <div style={{ color: "#ff5252", marginBottom: 10 }}>{checkoutError}</div>}
      {checkoutSuccess && <div style={{ color: "#4caf50", marginBottom: 10 }}>{checkoutSuccess}</div>}
      {inventoryDeductedMsg && <div style={{ color: "#2196f3", marginBottom: 10 }}>{inventoryDeductedMsg}</div>}

      {/* Customer Modal */}
      {showCustomerModal && (
        <div className="pos-modal">
          <div className="pos-modal-content">
            {/* Customer Modal content goes here */}
          </div>
        </div>
      )}
    </div>
  );
}

function capitalizeWords(str) {
  return str.replace(/\b\w/g, char => char.toUpperCase());
}
