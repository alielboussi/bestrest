
import React, { useEffect, useState } from "react";
import supabase from "./supabase";
import { useNavigate } from "react-router-dom";
import { exportLaybyPDF, exportLaybyCSV } from "./exportLaybyUtils";
import "./LaybyManagement.css";

export default function LaybyManagement() {
  const [laybys, setLaybys] = useState([]);
  const [selectedLayby, setSelectedLayby] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [receipt, setReceipt] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  // Fetch all layby sales with outstanding balances
  useEffect(() => {
    async function fetchLaybys() {
      // 1. Get all laybys (not completed)
      const { data: laybys, error } = await supabase
        .from("laybys")
        .select("id, customer_id, sale_id, total_amount, paid_amount, status, notes, updated_at")
        .not("status", "eq", "completed");
      if (error) return setError(error.message);

      // 2. Get all sales for these laybys
      const saleIds = (laybys || []).map(l => l.sale_id).filter(Boolean);
      let salesMap = {};
      if (saleIds.length) {
        const { data: sales } = await supabase
          .from("sales")
          .select("id, down_payment, created_at, reminder_date")
          .in("id", saleIds);
        salesMap = (sales || []).reduce((acc, s) => {
          acc[s.id] = s;
          return acc;
        }, {});
      }

      // 3. Get all payments for these sales
      let paymentsMap = {};
      if (saleIds.length) {
        const { data: payments } = await supabase
          .from("sales_payments")
          .select("sale_id, amount")
          .in("sale_id", saleIds);
        paymentsMap = (payments || []).reduce((acc, p) => {
          acc[p.sale_id] = (acc[p.sale_id] || 0) + Number(p.amount || 0);
          return acc;
        }, {});
      }

      // 4. Get all customers for these laybys
      const customerIds = Array.from(new Set((laybys || []).map(l => l.customer_id).filter(Boolean)));
      let customersMap = {};
      if (customerIds.length) {
        const { data: customers } = await supabase
          .from("customers")
          .select("id, name, phone")
          .in("id", customerIds);
        customersMap = (customers || []).reduce((acc, c) => {
          acc[c.id] = c;
          return acc;
        }, {});
      }

      // 5. Build layby list
      const laybyList = (laybys || []).map(layby => {
        const sale = salesMap[layby.sale_id] || {};
        const paid = (paymentsMap[layby.sale_id] || 0) + Number(sale.down_payment || 0);
        return {
          ...layby,
          total_amount: layby.total_amount,
          paid,
          outstanding: Number(layby.total_amount) - paid,
          reminder_date: sale.reminder_date,
          customerInfo: customersMap[layby.customer_id] || {},
        };
      });
      setLaybys(laybyList);
    }
    fetchLaybys();
  }, [success]);

  // Add payment to layby
  async function handleAddPayment(e) {
    /*
    ⠀⠀⠀⠀⠀⠀⠀⡀⡀⠀⠀⠀⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
    ⠀⠀⠀⠀⠀⠀⠀⠑⠑⢄⠀⠀⠀⠀⢸⠘⠀⠀⡀⠄⡲⠁⠀⠀⠀⠀⠀⠀⠀⠀
    ⡀⠀⠀⡀⠀⡀⠀⠀⠀⠀⠑⢄⠀⢠⢃⠠⠐⠁⠀⡢⠁⠀⠀⠀⠀⠀⡀⠀⡀⠀
    ⠀⠀⡀⠀⠀⠀⠀⠈⠀⠀⡀⡠⢹⠪⡀⠀⠀⡀⠢⠁⠀⣀⠀⠠⠈⠀⠀⠀⠀⠀
    ⠈⠀⠀⠀⠈⠀⠈⠀⡎⡆⠁⢠⠃⠀⠈⠢⡀⢠⢃⠠⠊⠂⠃⠀⠀⠀⡀⠂⠈⠀
    ⠠⠀⠂⠈⠀⠀⠂⠀⠀⠀⢀⠂⠀⠀⢀⡠⢜⠣⡁⠀⠀⠀⡀⠠⠀⠂⠀⠀⠀⠠
    ⠀⠀⠀⠀⠠⠀⠠⠀⠂⢀⠎⢀⠔⠊⠁⢠⠂⠀⠈⠢⡠⠀⠀⠀⠀⠀⠀⡀⠂⠀
    ⡀⠂⠈⠀⠀⡀⠀⠀⡀⠎⠊⠀⠀⠀⢔⡡⠀⠀⠀⠀⠈⢒⡢⠈⠀⠈⠀⠀⠀⠀
    ⠀⠀⠀⠠⠀⠀⠀⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠠⠀⠀⠀⠀⡀⠠⠀⠀⠂⠀
    */
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    if (!selectedLayby || !paymentAmount || !paymentDate) {
      setError("All fields required.");
      setLoading(false);
      return;
    }
    // Insert payment
    const { error } = await supabase.from("sales_payments").insert([
      {
        sale_id: selectedLayby.sale_id, // Use sale_id (integer), not layby.id (UUID)
        amount: paymentAmount,
        payment_type: "layby",
        currency: "K",
        payment_date: paymentDate,
        reference: receipt,
      },
    ]);
    // Update layby updated_at
    await supabase.from("laybys").update({ updated_at: new Date().toISOString() }).eq("id", selectedLayby.id);
    if (error) setError(error.message);
    else setSuccess("Payment added!");
    setLoading(false);
    setPaymentAmount("");
    setPaymentDate("");
    setReceipt("");
    setSelectedLayby(null);
  }

  // Set reminder for next payment
  async function handleSetReminder(laybyId) {
    if (!reminderDate) return;
    setLoading(true);
    const { error } = await supabase.from("sales").update({ reminder_date: reminderDate, updated_at: new Date().toISOString() }).eq("id", laybyId);
    if (error) setError(error.message);
    else setSuccess("Reminder set!");
    setLoading(false);
    setReminderDate("");
  }

  // Update notes for a layby
  async function handleUpdateNotes(laybyId) {
    setLoading(true);
    const { error } = await supabase.from("laybys").update({ notes, updated_at: new Date().toISOString() }).eq("id", laybyId);
    if (error) setError(error.message);
    else setSuccess("Notes updated!");
    setLoading(false);
  }

  // Export handlers
  async function handleExport(type) {
    if (!selectedLayby) return;
    // Fetch products for this layby (from sales_items)
    const { data: saleItems } = await supabase
      .from("sales_items")
      .select("product_id, quantity, unit_price, product:products(name, sku)")
      .eq("sale_id", selectedLayby.sale_id);
    const products = (saleItems || []).map(i => ({
      name: i.product?.name || '',
      sku: i.product?.sku || '',
      qty: i.quantity,
      price: i.unit_price
    }));
    // Fetch payments for this layby
    const { data: payments } = await supabase
      .from("sales_payments")
      .select("amount, payment_date")
      .eq("sale_id", selectedLayby.sale_id);
    // Get customer details
    const customer = selectedLayby.customerInfo || {};
    // Prepare data
    const logoUrl = window.location.origin + '/bestrest-logo.png';
    const companyName = 'BestRest';
    if (type === 'pdf') {
      exportLaybyPDF({ companyName, logoUrl, customer, layby: selectedLayby, products, payments });
    } else {
      const csv = exportLaybyCSV({ customer, layby: selectedLayby, products, payments });
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `layby_statement_${customer.name || 'customer'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  // Filter and sort laybys for display
  const filteredLaybys = laybys
    .filter(layby => {
      const name = layby.customerInfo?.name?.toLowerCase() || "";
      const phone = layby.customerInfo?.phone?.toLowerCase() || "";
      return (
        name.includes(search.toLowerCase()) ||
        phone.includes(search.toLowerCase())
      );
    })
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
    .slice(0, 5);

  return (
    <div className="layby-mgmt-container" style={{ maxWidth: 1050, margin: '32px auto', background: '#181c20', borderRadius: 14, padding: '24px 12px 18px 12px', boxShadow: '0 2px 12px rgba(0,0,0,0.13)' }}>
      <h2 style={{ fontSize: '2.1rem', color: '#4caf50', textAlign: 'center', marginBottom: 28 }}>Layby Management</h2>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search customer name or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #333', background: '#23272f', color: '#fff', fontSize: '1rem', minWidth: 220 }}
        />
      </div>
      {error && <div style={{ color: "#ff5252", marginBottom: 10 }}>{error}</div>}
      {success && <div style={{ color: "#4caf50", marginBottom: 10 }}>{success}</div>}
      {/* Export buttons for each layby row */}
      <div style={{ width: '100%', background: 'transparent', borderRadius: 8, overflowX: 'visible' }}>
        <table className="pos-table" style={{ width: '100%', minWidth: 600, background: '#23272f', borderRadius: 8, margin: '0 auto', fontSize: '0.86rem' }}>
          <thead>
            <tr>
              <th className="text-col">Customer</th>
              <th className="text-col">Phone</th>
              <th className="num-col">Total</th>
              <th className="num-col">Paid</th>
              <th className="num-col">Outstanding</th>
              <th className="num-col">Reminder</th>
              <th className="text-col">Updated</th>
              <th className="action-col">Actions</th>
              <th className="action-col">Export</th>
            </tr>
          </thead>
          <tbody>
            {filteredLaybys.map(layby => (
              <tr key={layby.id} style={{ background: layby.outstanding === 0 ? '#0f2e1d' : undefined }}>
                <td className="text-col">{layby.customerInfo?.name}</td>
                <td className="text-col">{layby.customerInfo?.phone}</td>
                <td className="num-col">{layby.total_amount}</td>
                <td className="num-col">{layby.paid}</td>
                <td className="num-col">{layby.outstanding}</td>
                <td className="num-col">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="date" value={layby.reminder_date || ""} onChange={e => setReminderDate(e.target.value)} style={{ background: '#181f2f', color: '#fff', border: '1px solid #333', borderRadius: 4, padding: '1px 2px', minWidth: 70, maxWidth: 90, fontSize: '0.8rem' }} />
                    <button style={{ background: '#00bfff', color: '#fff', borderRadius: 4, padding: '1px 2px', fontWeight: 600, fontSize: '0.8rem', minWidth: 70, maxWidth: 90 }} onClick={() => handleSetReminder(layby.id)} disabled={!reminderDate}>Set</button>
                  </div>
                </td>
                <td className="text-col" style={{ color: '#00bfff', fontSize: 13 }}>{layby.updated_at ? new Date(layby.updated_at).toLocaleDateString('en-GB') : ''}</td>
                <td className="action-col">
                  <button style={{ background: '#00bfff', color: '#fff', borderRadius: 4, padding: '1px 2px', fontWeight: 600, fontSize: '0.8rem', minWidth: 70, maxWidth: 90 }} onClick={() => setSelectedLayby(layby)} disabled={layby.outstanding === 0}>Add Payment</button>
                </td>
                <td className="action-col">
                  <button style={{ background: '#00bfff', color: '#fff', borderRadius: 4, padding: '1px 2px', fontWeight: 600, fontSize: '0.8rem', minWidth: 70, maxWidth: 90, marginRight: 2 }} onClick={async () => {
                    // Fetch products for this layby (from sales_items)
                    const { data: saleItems } = await supabase
                      .from("sales_items")
                      .select("product_id, quantity, unit_price, product:products(name, sku)")
                      .eq("sale_id", layby.sale_id);
                    const products = (saleItems || []).map(i => ({
                      name: i.product?.name || '',
                      sku: i.product?.sku || '',
                      qty: i.quantity,
                      price: i.unit_price
                    }));
                    // Fetch payments for this layby
                    const { data: payments } = await supabase
                      .from("sales_payments")
                      .select("amount, payment_date")
                      .eq("sale_id", layby.sale_id);
                    // Fetch sale to get currency
                    const { data: saleRows } = await supabase
                      .from("sales")
                      .select("currency")
                      .eq("id", layby.sale_id)
                      .single();
                    const currency = saleRows?.currency || 'K';
                    const customer = layby.customerInfo || {};
                    const logoUrl = window.location.origin + '/bestrest-logo.png';
                    const companyName = 'BestRest';
                    exportLaybyPDF({ companyName, logoUrl, customer, layby, products, payments, currency });
                  }}>PDF</button>
                  <button style={{ background: '#4caf50', color: '#fff', borderRadius: 4, padding: '1px 2px', fontWeight: 600, fontSize: '0.8rem', minWidth: 70, maxWidth: 90 }} onClick={async () => {
                    const { data: saleItems } = await supabase
                      .from("sales_items")
                      .select("product_id, quantity, unit_price, product:products(name, sku)")
                      .eq("sale_id", layby.sale_id);
                    const products = (saleItems || []).map(i => ({
                      name: i.product?.name || '',
                      sku: i.product?.sku || '',
                      qty: i.quantity,
                      price: i.unit_price
                    }));
                    const { data: payments } = await supabase
                      .from("sales_payments")
                      .select("amount, payment_date")
                      .eq("sale_id", layby.sale_id);
                    const customer = layby.customerInfo || {};
                    const csv = exportLaybyCSV({ customer, layby, products, payments });
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `layby_statement_${customer.name || 'customer'}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}>CSV</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedLayby && (
        <form onSubmit={handleAddPayment} style={{ marginTop: 24, background: '#23272f', padding: 18, borderRadius: 8 }}>
          <h3>Add Payment for {selectedLayby.customerInfo?.name}</h3>
          <input type="number" placeholder="Amount" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} required />
          <input type="date" placeholder="Date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required />
          <input type="text" placeholder="Receipt #" value={receipt} onChange={e => setReceipt(e.target.value)} />
          <button type="submit" disabled={loading}>{loading ? "Processing..." : "Add Payment"}</button>
          <button type="button" style={{ marginLeft: 8 }} onClick={() => setSelectedLayby(null)}>Cancel</button>
        </form>
      )}
    </div>
  );
}
