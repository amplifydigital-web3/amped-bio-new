import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Editor } from './pages/Editor';
import { View } from './pages/View';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Editor />} />
        <Route path="/view" element={<View />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;