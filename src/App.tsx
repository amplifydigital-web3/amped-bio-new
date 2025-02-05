import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Editor } from './pages/Editor';
import { View } from './pages/View';
import { AppKitProvider } from './components/connect/components/AppKitProvider';

function App() {
  return (
    <AppKitProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<View />} />
          <Route path="/edit" element={<Editor />} />
        </Routes>
      </BrowserRouter>
    </AppKitProvider>
  );
}

export default App;
