
import React, { useState } from 'react';
import './PasswordPage.css';
import { FaRegEdit } from 'react-icons/fa';

function generatePassword() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}


function PasswordPage() {
  const [password, setPassword] = useState(() => {
    let pwd = localStorage.getItem('closingStockPassword');
    if (!pwd) {
      pwd = generatePassword();
      localStorage.setItem('closingStockPassword', pwd);
    }
    return pwd;
  });
  const [input, setInput] = useState('');
  const [error, setError] = useState('');


  const handleSubmit = e => {
    e.preventDefault();
    if (input === password) {
      localStorage.setItem('closingStockPasswordEntered', 'true');
      window.location.href = '/closing-stock';
    } else {
      setError('Incorrect password.');
    }
  };

  const handleGenerate = () => {
    const newPwd = generatePassword();
    setPassword(newPwd);
    localStorage.setItem('closingStockPassword', newPwd);
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
        />
        {error && <div className="password-error">{error}</div>}
        <button type="submit" className="password-submit-btn">
          Submit
        </button>
      </form>
    </div>
  );
}

export default PasswordPage;
