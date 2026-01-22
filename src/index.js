import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// This is the standard entry point that starts the App.js brain
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
