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

  // Fetch password from company_settings on mount
  useEffect(() => {
    async function fetchPassword() {
      setLoading(true);
      const { data, error } = await supabase
        .from('company_settings')
        .select('closing_stock_password')
        .eq('id', 1)
        .single();
      if (data && data.closing_stock_password) {
        setPassword(data.closing_stock_password);
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
      .from('company_settings')
      .select('closing_stock_password')
      .eq('id', 1)
      .single();
    setLoading(false);
    if (fetchError || !data || !data.closing_stock_password) {
      setError('Could not verify password. Try again.');
      return;
    }
    if (input === data.closing_stock_password) {
      localStorage.setItem('closingStockPasswordEntered', 'true');
      window.location.href = '/closing-stock';
    } else {
      setError('Incorrect password.');
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    const newPwd = generatePassword();
    // Fetch the existing row to get all NOT NULL columns
    const { data: existingRow, error: fetchError } = await supabase
      .from('company_settings')
      .select('*')
      .eq('id', 1)
      .single();
    if (fetchError || !existingRow) {
      setError('Failed to fetch company settings row.');
      setGenerating(false);
      return;
    }
    // Upsert with all existing values, only updating closing_stock_password
    const upsertData = { ...existingRow, closing_stock_password: newPwd };
    const { data, error } = await supabase
      .from('company_settings')
      .upsert(upsertData);
    console.log('Upsert result:', { data, error });
    if (!error) {
      setPassword(newPwd);
      setInput('');
      setError('');
    } else {
      setError('Failed to generate password.' + (error?.message ? ' ' + error.message : ''));
      console.error('Supabase upsert error:', error);
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
        {/* Password generation button removed for security reasons */}
      </form>
      {/* Current password display removed for security reasons */}
    </div>
  );
}

export default PasswordPage;
