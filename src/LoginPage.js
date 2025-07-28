import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom'; // For redirecting after login
import supabase from './supabase'; // Your Supabase client
import './LoginPage.css'; // CSS file to style the login page

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate(); // For navigating after login

  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      // Query the 'users' table for the entered email and password
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

      // Get the user's role_id from user_roles table
      const { data: userRoleRow, error: roleError } = await supabase
        .from('user_roles')
        .select('role_id')
        .eq('user_id', user.id)
        .single();

      if (roleError || !userRoleRow) {
      setError('Login failed. Please try again.');
      console.error('Login Error:', err);
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
