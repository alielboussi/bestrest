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
    } catch (err) {
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
    <>
      <div className="locations-page-container">
        <h1 className="locations-title">Locations</h1>
        <form className="location-form" onSubmit={handleSubmit}>
          <input
            name="name"
            type="text"
            placeholder="Location Name"
            value={form.name}
            onChange={handleChange}
            required
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
          <button type="submit" disabled={saving} className="save-btn">
            {editingId ? 'Update' : 'Add'}
          </button>
          {editingId && (
            <button type="button" onClick={handleCancelEdit} className="cancel-btn">Cancel</button>
          )}
        </form>
        {error && <div style={{ color: 'red', marginBottom: 10 }}>{error}</div>}
        <div className="locations-table-wrapper">
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
              {loading ? (
                <tr><td colSpan="4">Loading...</td></tr>
              ) : locations.length === 0 ? (
                <tr><td colSpan="4">No locations found.</td></tr>
              ) : (
                locations.map((location) => (
                  <tr key={location.id} className={editingId === location.id ? 'editing-row' : ''}>
                    <td>{location.name}</td>
                    <td>{location.address}</td>
                    <td>{location.city}</td>
                    <td>
                      <button className="edit-btn" onClick={() => handleEdit(location)} disabled={saving}>Edit</button>
                      <button className="delete-btn" onClick={() => handleDelete(location.id)} disabled={saving}>Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{position: 'fixed', left: 0, right: 0, bottom: 18, display: 'flex', justifyContent: 'center', zIndex: 100}}>
        <button
          type="button"
          className="back-dashboard-btn"
          onClick={handleBack}
          aria-label="Back to Dashboard"
          style={{
            fontSize: '1em',
            padding: '6px 32px',
            background: '#00bfff',
            color: '#fff',
            border: '2px solid #00bfff',
            borderRadius: 16,
            fontWeight: 600,
            boxShadow: '0 1px 4px #0003',
            cursor: 'pointer',
            transition: 'background 0.2s, color 0.2s',
            minWidth: 120,
            margin: 0,
          }}
          onMouseOver={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#00bfff'; e.currentTarget.style.borderColor = '#00bfff'; }}
          onMouseOut={e => { e.currentTarget.style.background = '#00bfff'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#00bfff'; }}
        >
          <span style={{marginRight: 8}}>&larr;</span>Back to Dashboard
        </button>
      </div>
    </>
  );
};

export default Locations;
