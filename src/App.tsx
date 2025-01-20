import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Editor } from './pages/Editor';
import { View } from './pages/View';
import { AppKitProvider } from './components/connect/components/AppKitProvider';

function App() {
  return (
    <AppKitProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Editor />} />
          <Route path="/view" element={<View />} />
        </Routes>
      </BrowserRouter>
    </AppKitProvider>
  );
}

export default App;
