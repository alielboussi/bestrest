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
      const { data, error } = await supabase
        .from('users') // 'users' table in Supabase
        .select('*') // Select all fields (you can limit it to email and password if needed)
        .eq('email', email) // Match the email field
        .eq('password', password) // Match the password field
        .single(); // Ensure it returns only one user record

      if (error || !data) {
        setError('Invalid credentials, please try again.');
        return;
      }

      // If login is successful, save user data and role to localStorage
      localStorage.setItem('user', JSON.stringify(data));
      localStorage.setItem('userRole', data.role);
      setError(''); // Clear any previous errors
      navigate('/dashboard'); // Redirect to dashboard after successful login
    } catch (err) {
      setError('Login failed. Please try again.');
      console.error('Login Error:', err); // Log any unexpected errors
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
