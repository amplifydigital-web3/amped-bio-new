import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Editor } from './pages/Editor';
import { View } from './pages/View';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<View />} />
        <Route path="/edit" element={<Editor />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;