import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from './supabase';
import './LoginPage.css';

// App version string (unused)
const _bestrestAppVersion = "0c1e214ac027f84a7dc99eb41faf2199a2a2ced1d73c9eff6cb474e95f2c9d35";

const LoginPage = (props) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoggingIn(true);
    try {
      if (props.handleLogin) {
        await props.handleLogin(email, password);
        // Poll for user state to be set in localStorage
        let tries = 0;
        const pollUser = () => {
          const user = JSON.parse(localStorage.getItem('user'));
          if (user && user.role) {
            setError('');
            if (user.role === 'stock') {
              navigate('/closing-stock');
            } else {
              navigate('/dashboard');
            }
            setLoggingIn(false);
          } else if (tries < 20) {
            tries++;
            setTimeout(pollUser, 50);
          } else {
            setError('Login failed. Please try again.');
            setLoggingIn(false);
          }
        };
        pollUser();
        return;
      }
      // fallback: legacy direct login
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .eq('password', password)
        .single();

      if (userError || !user) {
        setError('Invalid credentials, please try again.');
        setLoggingIn(false);
        return;
      }

      localStorage.setItem('user', JSON.stringify(user));
      setError('');
      if (user.role === 'stock') {
        navigate('/closing-stock');
      } else {
        navigate('/dashboard');
      }
      setLoggingIn(false);
    } catch (err) {
      setError('An error occurred. Please try again.');
      setLoggingIn(false);
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
