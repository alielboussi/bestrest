
import React, { useState, useEffect } from 'react';
import './PasswordPage.css';
import { FaRegEdit } from 'react-icons/fa';
import supabase from './supabase';

function generatePassword() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}



function PasswordPage() {
  const [password, setPassword] = useState('');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Fetch password from Supabase on mount
  useEffect(() => {
    async function fetchPassword() {
      setLoading(true);
      const { data, error } = await supabase
        .from('closing_stock_password')
        .select('password')
        .eq('id', 1)
        .single();
      if (data && data.password) {
        setPassword(data.password);
      }
      setLoading(false);
    }
    fetchPassword();
  }, []);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    // Always fetch latest password before checking
    const { data, error: fetchError } = await supabase
      .from('closing_stock_password')
      .select('password')
      .eq('id', 1)
      .single();
    setLoading(false);
    if (fetchError || !data || !data.password) {
      setError('Could not verify password. Try again.');
      return;
    }
    if (input === data.password) {
      localStorage.setItem('closingStockPasswordEntered', 'true');
      window.location.href = '/closing-stock';
    } else {
      setError('Incorrect password.');
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    const newPwd = generatePassword();
    // Upsert password to Supabase
    const { error } = await supabase
      .from('closing_stock_password')
      .upsert([{ id: 1, password: newPwd }], { onConflict: ['id'] });
    if (!error) {
      setPassword(newPwd);
      setInput('');
      setError('');
    } else {
      setError('Failed to generate password.');
    }
    setGenerating(false);
  };

  return (
    <div className="password-page-container">
      <h2 className="password-title">Closing Stock Password</h2>
      <form onSubmit={handleSubmit} style={{width:'100%', marginTop: 32}}>
        <input
          className="password-input"
          type="password"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Enter 6-digit password to access"
          maxLength={6}
          disabled={loading}
        />
        {error && <div className="password-error">{error}</div>}
        <button type="submit" className="password-submit-btn" disabled={loading}>
          {loading ? 'Checking...' : 'Submit'}
        </button>
        <button type="button" className="password-generate-btn" onClick={handleGenerate} disabled={generating || loading} style={{marginLeft: 12}}>
          {generating ? 'Generating...' : <><FaRegEdit style={{marginRight: 4}}/> Generate New Password</>}
        </button>
      </form>
      <div style={{marginTop: 18, color: '#888', fontSize: 13}}>
        <span>Current Password: </span>
        <span style={{fontWeight: 600, letterSpacing: 2}}>{password}</span>
      </div>
    </div>
  );
}

export default PasswordPage;
