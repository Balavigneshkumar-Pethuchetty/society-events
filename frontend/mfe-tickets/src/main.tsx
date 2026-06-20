import React from 'react';
import ReactDOM from 'react-dom/client';
import { TicketsApp } from './TicketsApp';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TicketsApp token={null} />
  </React.StrictMode>
);
