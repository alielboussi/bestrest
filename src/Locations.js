import React, { useState, useEffect } from 'react';
import supabase from './supabase';
import './Locations.css';
import { useNavigate } from 'react-router-dom';

const initialForm = { name: '', address: '', city: '' };

const Locations = () => {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('locations').select('*');
      if (error) throw error;
      setLocations(data || []);
          <h2 style={{textAlign: 'center', fontWeight: 600, margin: '32px 0 24px 0', color: '#fff', fontSize: '2.2rem'}}>Locations</h2>
      setError('Failed to fetch locations.');
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from('locations')
          .update(form)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('locations')
          .insert([form]);
        if (error) throw error;
      }
      setForm(initialForm);
      setEditingId(null);
      fetchLocations();
    } catch (err) {
      setError('Failed to save location.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (location) => {
    setForm({
      name: location.name || '',
      address: location.address || '',
      city: location.city || ''
    });
    setEditingId(location.id);
  };
            <button type="button" className="back-dashboard-btn" style={{position: 'absolute', right: 32, bottom: 32}} onClick={handleBack}>← Back to Dashboard</button>
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this location and all related data?')) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('locations').delete().eq('id', id);
      if (error) throw error;
      fetchLocations();
    } catch (err) {
      setError('Failed to delete location.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  return (
    <div className="locations-page">
      <h2>Locations</h2>
      <div className="location-form">
        <input
          type="text"
          placeholder="Location Name"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
        />
        <input
          type="text"
          placeholder="Address"
          value={form.address}
          onChange={e => setForm({ ...form, address: e.target.value })}
        />
        <input
          type="text"
          placeholder="City"
          value={form.city}
          onChange={e => setForm({ ...form, city: e.target.value })}
        />
        <button className="add-btn" onClick={handleSubmit}>{editingId ? 'Update' : 'Add'}</button>
      </div>
          {error && (!locations || locations.length === 0) && (
            <div className="error-message">{error}</div>
          )}
      <table className="locations-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Address</th>
            <th>City</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {locations.map(loc => (
            <tr key={loc.id}>
              <td>{loc.name}</td>
              <td>{loc.address}</td>
              <td>{loc.city}</td>
              <td>
                <div className="actions-container">
                  <button className="edit-btn" onClick={() => handleEdit(loc)}>Edit</button>
                  <button className="delete-btn" onClick={() => handleDelete(loc.id)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Locations;
