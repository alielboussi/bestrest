import React, { useState, useEffect } from 'react';
import supabase from './supabase';
import './Customers.css';
import { useNavigate } from 'react-router-dom';
// Removed user permissions logic

const initialForm = { name: '', phone: '', address: '', city: '', tpin: '', currency: 'K', opening_balance: '' };

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  // Removed user permissions state
  const navigate = useNavigate();

  useEffect(() => {
    fetchCustomers();
  }, []);

  // Removed permissions fetching logic

  const fetchCustomers = async () => {
    setLoading(true);
    try {
  const { data, error } = await supabase.from('customers').select('*');
      if (error) throw error;
      setCustomers(data || []);
    } catch (err) {
      setError('Failed to fetch customers.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/dashboard');
  };

  const handleChange = (e) => {
  setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Capitalize first letter of each word in a string, ensure single spaces
  const capitalizeWords = (str) =>
    str
      .replace(/\s+/g, ' ') // collapse multiple spaces
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Capitalize name and normalize fields before saving
      const buildPayload = (f) => {
        const { opening_balance, currency, ...rest } = f;
        const payload = { ...rest, name: capitalizeWords(f.name) };
        if (currency && currency.trim() !== '') payload.currency = currency;
        // Only set opening_balance if provided; otherwise let DB default (0) apply
        if (opening_balance !== '' && opening_balance !== null && opening_balance !== undefined) {
          const num = Number(opening_balance);
          if (!Number.isNaN(num)) payload.opening_balance = num;
        }
        return payload;
      };
      const formToSave = buildPayload(form);
      // Phone, address, city, tpin are optional
      if (editingId) {
        // Update
        const { error } = await supabase
          .from('customers')
          .update(formToSave)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase
          .from('customers')
          .insert([formToSave]);
        if (error) throw error;
      }
      setForm(initialForm);
      setEditingId(null);
      fetchCustomers();
    } catch (err) {
      setError('Failed to save customer.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (customer) => {
    setForm({
      name: customer.name || '',
      phone: customer.phone || '',
      address: customer.address || '',
      city: customer.city || '',
  tpin: customer.tpin || '',
  currency: customer.currency || 'K',
  opening_balance: customer.opening_balance ?? ''
    });
    setEditingId(customer.id);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this customer?')) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      fetchCustomers();
    } catch (err) {
      setError('Failed to delete customer.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  // Removed permission helpers
  const canAdd = true;
  const canEdit = true;
  const canDelete = true;

  // Removed permission access check

  return (
    <div className="customers-page-container">
      <h1 className="customers-title">Customers</h1>
      <button onClick={handleBack}>Back to Dashboard</button>
      {/* Only show Add Customer if allowed */}
      {canAdd && (
        <form className="customer-form" onSubmit={handleSubmit}>
          <input
            name="name"
            type="text"
            placeholder="Name or Business Name"
            value={form.name}
            onChange={handleChange}
            required
          />
          <input
            name="phone"
            type="text"
            placeholder="Phone Number (optional)"
            value={form.phone}
            onChange={handleChange}
          />
          <input
            name="address"
            type="text"
            placeholder="Address (optional)"
            value={form.address}
            onChange={handleChange}
          />
          <input
            name="city"
            type="text"
            placeholder="City (optional)"
            value={form.city}
            onChange={handleChange}
          />
          <input
            name="tpin"
            type="text"
            placeholder="TPIN (optional)"
            value={form.tpin}
            onChange={handleChange}
          />
          <select
            name="currency"
            value={form.currency}
            onChange={handleChange}
            title="Customer currency"
          >
            <option value="K">K (Kwacha)</option>
            <option value="$">$ (USD)</option>
            <option value="R">R (Rand)</option>
            <option value="€">€ (EUR)</option>
            <option value="£">£ (GBP)</option>
          </select>
          <input
            name="opening_balance"
            type="number"
            step="0.01"
            placeholder="Starting Due Balance (optional)"
            value={form.opening_balance}
            onChange={handleChange}
            title="Initial layby due balance for this customer"
          />
          <button type="submit" disabled={saving} className="save-btn">
            {editingId ? 'Update' : 'Add'}
          </button>
          {editingId && (
            <button type="button" onClick={handleCancelEdit} className="cancel-btn">Cancel</button>
          )}
        </form>
      )}
      {error && <div style={{ color: 'red', marginBottom: 10 }}>{error}</div>}
      <div className="customers-table-wrapper">
        <table className="customers-table">
          <thead>
            <tr>
              <th>Name/Business</th>
              <th>Phone</th>
              <th>Address</th>
              <th>City</th>
              <th>TPIN</th>
        <th>Currency</th>
        <th>Starting Due</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
        <tr><td colSpan="8">Loading...</td></tr>
            ) : customers.length === 0 ? (
        <tr><td colSpan="8">No customers found.</td></tr>
            ) : (
              customers.map((customer) => (
                <tr key={customer.id} className={editingId === customer.id ? 'editing-row' : ''}>
                  <td>{customer.name}</td>
                  <td>{customer.phone}</td>
                  <td>{customer.address}</td>
                  <td>{customer.city}</td>
                  <td>{customer.tpin}</td>
          <td>{customer.currency || 'K'}</td>
          <td>{customer.opening_balance ? `${customer.currency || 'K'} ${Number(customer.opening_balance).toLocaleString()}` : ''}</td>
                  <td>
                    {canEdit && <button className="edit-btn" onClick={() => handleEdit(customer)} disabled={saving}>Edit</button>}
                    {canDelete && <button className="delete-btn" onClick={() => handleDelete(customer.id)} disabled={saving}>Delete</button>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Customers;
