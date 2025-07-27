
import React, { useEffect, useState } from "react";
import supabase from "./supabase";
import { useNavigate } from "react-router-dom";
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
        sale_id: selectedLayby.id,
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

  return (
    <div className="layby-mgmt-container">
      <button
        className="back-to-dashboard-btn"
        style={{
          fontSize: '0.95em',
          padding: '6px 18px',
          background: '#00bfff',
          color: '#fff',
          border: '2px solid #00bfff',
          borderRadius: 6,
          fontWeight: 600,
          boxShadow: '0 1px 4px #0003',
          cursor: 'pointer',
          transition: 'background 0.2s, color 0.2s',
          minWidth: 120,
          margin: '12px 0 18px 0',
        }}
        onClick={() => navigate('/dashboard')}
        onMouseOver={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#00bfff'; e.currentTarget.style.borderColor = '#00bfff'; }}
        onMouseOut={e => { e.currentTarget.style.background = '#00bfff'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#00bfff'; }}
      >Back to Dashboard</button>
      <h2>Layby Management</h2>
      {error && <div style={{ color: "#ff5252" }}>{error}</div>}
      {success && <div style={{ color: "#4caf50" }}>{success}</div>}
      <table className="pos-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Phone</th>
            <th>Total</th>
            <th>Paid</th>
            <th>Outstanding</th>
            <th>Reminder</th>
            <th>Notes</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {laybys.map(layby => (
            <tr key={layby.id} style={{ background: layby.outstanding === 0 ? '#0f2e1d' : undefined }}>
              <td>{layby.customerInfo?.name}</td>
              <td>{layby.customerInfo?.phone}</td>
              <td>{layby.total_amount}</td>
              <td>{layby.paid}</td>
              <td>{layby.outstanding}</td>
              <td>
                <input type="date" value={layby.reminder_date || ""} onChange={e => setReminderDate(e.target.value)} />
                <button onClick={() => handleSetReminder(layby.id)} disabled={!reminderDate}>Set</button>
              </td>
              <td style={{ minWidth: 120 }}>
                <input type="text" value={layby.id === selectedLayby?.id ? notes : layby.notes || ""}
                  onChange={e => {
                    setNotes(e.target.value);
                    setSelectedLayby(layby);
                  }}
                  placeholder="Add notes..."
                  style={{ width: 100, background: '#181f2f', color: '#4cafef', border: '1px solid #333' }}
                />
                <button style={{ background: '#4cafef', marginLeft: 4 }} onClick={() => handleUpdateNotes(layby.id)}>Save</button>
              </td>
              <td style={{ color: '#00bfff', fontSize: 13 }}>{layby.updated_at ? new Date(layby.updated_at).toLocaleString() : ''}</td>
              <td>
                <button onClick={() => setSelectedLayby(layby)} disabled={layby.outstanding === 0}>Add Payment</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
