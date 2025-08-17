import React, { useState, useEffect } from 'react';
import supabase from './supabase';
import * as XLSX from 'xlsx';
import './Categories.css';
import { useNavigate } from 'react-router-dom';
// Levenshtein distance function for fuzzy matching
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
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

// Helper to normalize category names for comparison
const normalize = str => str.toLowerCase().replace(/\s+/g, '');

// Removed user permissions logic

const initialForm = { name: '' };

const Categories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const navigate = useNavigate();
  // Import by Excel logic
  const handleImportExcel = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet);
      // Fetch existing categories for validation
      const { data: existingCategories, error: fetchError } = await supabase.from('categories').select('id, name');
      if (fetchError) throw fetchError;
      // Helper to check for similar names (stricter)
      const normalize = str => str.toLowerCase().replace(/\s+/g, '');
      const isSimilar = (name, arr) => {
        const normName = normalize(name);
        return arr.some(cat => {
          const normCat = normalize(cat.name);
          // Levenshtein distance 1 or less
          if (levenshtein(normCat, normName) <= 1) return true;
          // Substring or superstring
          if (normCat.includes(normName) || normName.includes(normCat)) return true;
          return false;
        });
      };
      // Filter out duplicates and similar names
      // Capitalize first letter of each word and ensure spacing
      const formatCategoryName = (name) => {
        return name
          .trim()
          .split(/\s+/)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
      };

      const uniqueCategories = [];
      for (const row of rows) {
        if (!row.name) continue;
        const formattedName = formatCategoryName(row.name);
        // Check against existing categories
        if (isSimilar(formattedName, existingCategories)) continue;
        // Check against already queued for import
        if (isSimilar(formattedName, uniqueCategories)) continue;
        uniqueCategories.push({
          name: formattedName,
          id: row.id,
          created_at: row.created_at && row.created_at !== '' ? row.created_at : new Date().toISOString(),
          updated_at: row.updated_at && row.updated_at !== '' ? row.updated_at : new Date().toISOString()
        });
      }
      if (uniqueCategories.length === 0) {
        alert('No new unique categories to import.');
        setImporting(false);
        return;
      }
      // Remove undefined fields for Supabase
      const cleanCategories = uniqueCategories.map(cat => {
        const obj = {};
        if (cat.name) obj.name = cat.name;
        if (cat.id) obj.id = cat.id;
        if (cat.created_at) obj.created_at = cat.created_at;
        if (cat.updated_at) obj.updated_at = cat.updated_at;
        return obj;
      });
      const { error } = await supabase.from('categories').insert(cleanCategories);
      if (error) {
        alert('Import failed: ' + error.message);
      } else {
        alert('Import successful!');
        fetchCategories();
      }
    } catch (err) {
      alert('Error parsing file: ' + err.message);
    }
    setImporting(false);
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  // Removed permissions fetching logic

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
      const nameTrimmed = (form.name || '').trim();
      if (!nameTrimmed) {
        setError('Please enter a category name.');
        setSaving(false);
        return;
      }
      if (editingId) {
        const { error } = await supabase
          .from('categories')
          .update({ name: nameTrimmed })
          .eq('id', editingId);
        if (error) throw error;
      } else {
        // Manual duplicate check (case-insensitive exact)
        const { data: existingRows, error: fetchErr } = await supabase
          .from('categories')
          .select('id, name');
        if (fetchErr) throw fetchErr;
        const exists = (existingRows || []).some(c => (c.name || '').trim().toLowerCase() === nameTrimmed.toLowerCase());
        if (exists) {
          setError('Category name already exists.');
          setSaving(false);
          return;
        }
        const { error: insertErr } = await supabase
          .from('categories')
          .insert([{ name: nameTrimmed }]);
        if (insertErr) throw insertErr;
      }
      setForm(initialForm);
      setSearch('');
      setEditingId(null);
      fetchCategories();
    } catch (err) {
      setError('Failed to save category.' + (err?.message ? ` ${err.message}` : ''));
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

  // Filter categories by search (show all if search is empty)
  const filteredCategories = search.trim() === ''
    ? categories
    : categories.filter(cat =>
        cat.name.toLowerCase().includes(search.toLowerCase())
      );

  // All actions always accessible
  const canAdd = true;
  const canEdit = true;
  const canDelete = true;

  // Removed permission access check

  // Template download logic
  const handleDownloadTemplate = () => {
    // Create a simple template for categories
    const template = [
      { id: '', name: '', created_at: '', updated_at: '' }
    ];
    const worksheet = XLSX.utils.json_to_sheet(template);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'CategoriesTemplate');
    XLSX.writeFile(workbook, 'categories_template.xlsx');
  };

  // Ref for file input
  const fileInputRef = React.useRef();

  return (
    <div className="categories-page">
      <h2 className="categories-title">Categories</h2>
      <form className="category-form" onSubmit={handleSubmit}>
        <input
          name="name"
          type="text"
          placeholder="Search or Add Category"
          value={editingId ? form.name : search}
          onChange={e => {
            if (editingId) {
              setForm({ ...form, name: e.target.value });
            } else {
              setSearch(e.target.value);
              setForm({ ...form, name: e.target.value });
            }
          }}
          required
        />
        <button type="submit" disabled={saving} className="save-btn">
          {editingId ? 'Update' : 'Add'}
        </button>
        {editingId && (
          <button
            type="button"
            onClick={handleCancelEdit}
            className="cancel-btn"
          >
            Cancel
          </button>
        )}
      </form>
      {/* Import and Template Buttons */}
      <div style={{ marginBottom: 16, display: 'flex', gap: '8px', justifyContent: 'center' }}>
        <button
          disabled={importing}
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          style={{ minWidth: 150 }}
        >
          {importing ? 'Importing...' : 'Import by Excel'}
        </button>
        <button onClick={handleDownloadTemplate} type="button" style={{ minWidth: 150 }}>
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
            ) : filteredCategories.length === 0 ? (
              <tr><td colSpan="2">No categories found.</td></tr>
            ) : (
              filteredCategories.map((category) => (
                <tr key={category.id} className={editingId === category.id ? 'editing-row' : ''}>
                  <td>{category.name}</td>
                  <td>
                    <div className="actions-container">
                      {canEdit && <button className="edit-btn" onClick={() => handleEdit(category)} disabled={saving}>Edit</button>}
                      {canDelete && <button className="delete-btn" onClick={() => handleDelete(category.id)} disabled={saving}>Delete</button>}
                    </div>
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

export default Categories;
