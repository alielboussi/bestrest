import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from './supabase';
import './UnitsOfMeasure.css';

const UnitsOfMeasure = () => {
  const navigate = useNavigate();
  const [units, setUnits] = useState([]);
  const [name, setName] = useState('');
  const [abbreviation, setAbbreviation] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchUnits();
  }, []);

  const fetchUnits = async () => {
    const { data, error } = await supabase.from('unit_of_measure').select('*').order('created_at', { ascending: false });
    if (error) setError('Failed to fetch units');
    else setUnits(data || []);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() && !abbreviation.trim()) {
      return setError('Please enter at least one field (name or abbreviation).');
    }
    setError('');
    if (editingId) {
      await supabase.from('unit_of_measure').update({ name, abbreviation }).eq('id', editingId);
    } else {
      await supabase.from('unit_of_measure').insert({ name, abbreviation });
    }
    setName('');
    setAbbreviation('');
    setEditingId(null);
    fetchUnits();
  };

  const handleEdit = (unit) => {
    setName(unit.name);
    setAbbreviation(unit.abbreviation || '');
    setEditingId(unit.id);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this unit?')) return;
    await supabase.from('unit_of_measure').delete().eq('id', id);
    fetchUnits();
  };

  return (
    <div className="units-container">
      <h1>Units of Measure</h1>
      <form className="unit-form" onSubmit={handleSubmit}>
        <input type="text" placeholder="Name" value={name} onChange={e => setName(e.target.value)} required />
        <input type="text" placeholder="Abbreviation (optional)" value={abbreviation} onChange={e => setAbbreviation(e.target.value)} />
        <button type="submit">{editingId ? 'Update' : 'Add'}</button>
        {editingId && <button type="button" onClick={() => { setEditingId(null); setName(''); setAbbreviation(''); }}>Cancel</button>}
      </form>
      {error && <div className="units-error">{error}</div>}
      <table className="units-table">
        <thead>
          <tr><th>Name</th><th>Abbreviation</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {units.length === 0 ? (
            <tr><td colSpan={3}>No units found.</td></tr>
          ) : units.map(unit => (
            <tr key={unit.id}>
              <td>{unit.name}</td>
              <td>{unit.abbreviation || '-'}</td>
              <td>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <button onClick={() => handleEdit(unit)} style={{ background: '#27c46c', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.08rem', cursor: 'pointer', width: '120px', height: '44px', display: 'inline-block' }}>Edit</button>
                  <button onClick={() => handleDelete(unit.id)} className="delete-btn" style={{ width: '120px', height: '44px', display: 'inline-block', marginLeft: 0 }}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

    </div>
  );
};

export default UnitsOfMeasure;
