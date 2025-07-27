import React, { useState, useEffect } from 'react';
import supabase from './supabase';
import './Categories.css';
import { useNavigate } from 'react-router-dom';

const initialForm = { name: '' };

const Categories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('categories').select('*');
      if (error) throw error;
      setCategories(data || []);
    } catch (err) {
      setError('Failed to fetch categories.');
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
          .from('categories')
          .update(form)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('categories')
          .insert([form]);
        if (error) throw error;
      }
      setForm(initialForm);
      setEditingId(null);
      fetchCategories();
    } catch (err) {
      setError('Failed to save category.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (category) => {
    setForm({ name: category.name || '' });
    setEditingId(category.id);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this category and all related products?')) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
      fetchCategories();
    } catch (err) {
      setError('Failed to delete category.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  return (
    <div className="categories-page-container">
      <h1 className="categories-title">Categories</h1>
      <form className="category-form" onSubmit={handleSubmit}>
        <input
          name="name"
          type="text"
          placeholder="Category Name"
          value={form.name}
          onChange={handleChange}
          required
        />
        <button type="submit" disabled={saving} className="save-btn">
          {editingId ? 'Update' : 'Add'}
        </button>
        {editingId && (
          <button type="button" onClick={handleCancelEdit} className="cancel-btn">Cancel</button>
        )}
      </form>
      {error && <div className="categories-error">{error}</div>}
      <div className="categories-table-wrapper">
        <table className="categories-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="2">Loading...</td></tr>
            ) : categories.length === 0 ? (
              <tr><td colSpan="2">No categories found.</td></tr>
            ) : (
              categories.map((category) => (
                <tr key={category.id} className={editingId === category.id ? 'editing-row' : ''}>
                  <td>{category.name}</td>
                  <td>
                    <button className="edit-btn" onClick={() => handleEdit(category)} disabled={saving}>Edit</button>
                    <button className="delete-btn" onClick={() => handleDelete(category.id)} disabled={saving}>Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <footer className="categories-footer">
        <button type="button" className="back-dashboard-btn" onClick={handleBack}>Back to Dashboard</button>
      </footer>
    </div>
  );
};

export default Categories;
