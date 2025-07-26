import React, { useState, useEffect } from 'react';
import supabase from './supabase';
import './Customers.css';
import { useNavigate } from 'react-router-dom';

const initialForm = { name: '', phone: '', address: '', city: '', tpin: '' };

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCustomers();
  }, []);

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

  // Capitalize first letter of each word in a string
  const capitalizeWords = (str) =>
    str.replace(/\b\w/g, (char) => char.toUpperCase()).replace(/\s+/g, ' ').trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Capitalize name before saving
      const formToSave = { ...form, name: capitalizeWords(form.name) };
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
      tpin: customer.tpin || ''
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

  return (
    <div className="customers-page-container">
      <h1 className="customers-title">Customers</h1>
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
          placeholder="Phone Number"
          value={form.phone}
          onChange={handleChange}
        />
        <input
          name="address"
          type="text"
          placeholder="Address"
          value={form.address}
          onChange={handleChange}
        />
        <input
          name="city"
          type="text"
          placeholder="City"
          value={form.city}
          onChange={handleChange}
        />
        <input
          name="tpin"
          type="text"
          placeholder="TPIN"
          value={form.tpin}
          onChange={handleChange}
        />
        <button type="submit" disabled={saving} className="save-btn">
          {editingId ? 'Update' : 'Add'}
        </button>
        {editingId && (
          <button type="button" onClick={handleCancelEdit} className="cancel-btn">Cancel</button>
        )}
      </form>
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
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6">Loading...</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan="6">No customers found.</td></tr>
            ) : (
              customers.map((customer) => (
                <tr key={customer.id} className={editingId === customer.id ? 'editing-row' : ''}>
                  <td>{customer.name}</td>
                  <td>{customer.phone}</td>
                  <td>{customer.address}</td>
                  <td>{customer.city}</td>
                  <td>{customer.tpin}</td>
                  <td>
                    <button className="edit-btn" onClick={() => handleEdit(customer)} disabled={saving}>Edit</button>
                    <button className="delete-btn" onClick={() => handleDelete(customer.id)} disabled={saving}>Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <footer className="customers-footer">
        <button type="button" className="back-dashboard-btn" onClick={handleBack}>Back to Dashboard</button>
      </footer>
    </div>
  );
};

export default Customers;
