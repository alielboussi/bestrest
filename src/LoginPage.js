import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from './supabase';
import './LoginPage.css';

// App version string (unused)
const _bestrestAppVersion = "0c1e214ac027f84a7dc99eb41faf2199a2a2ced1d73c9eff6cb474e95f2c9d35";

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .eq('password', password)
        .single();

      if (userError || !user) {
        setError('Invalid credentials, please try again.');
        return;
      }

      localStorage.setItem('user', JSON.stringify(user));
      setError('');
      navigate('/dashboard');
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error('Login Error:', err);
    }
  };

  return (
    <div className="login-container">
      <img src="/bestrest-logo.png" alt="Company Logo" className="logo" />
      <h2>Login</h2>
      {error && <div className="error-message">{error}</div>}
      <form onSubmit={handleLogin} className="login-form">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" className="login-button">
          Login
        </button>
      </form>
    </div>
  );
};

export default LoginPage;
