import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Editor } from './pages/Editor';
import { View } from './pages/View';
import { initParticlesEngine } from '@tsparticles/react';
//import { loadSlim } from '@tsparticles/slim';
import { loadAll } from '@tsparticles/all';
import { AppKitProvider } from './components/connect/components/AppKitProvider';

function App() {
  const [init, setInit] = useState(false);

  // this should be run only once per application lifetime
  useEffect(() => {
    initParticlesEngine(async (engine) => {
      // you can initiate the tsParticles instance (engine) here, adding custom shapes or presets
      // this loads the tsparticles package bundle, it's the easiest method for getting everything ready
      // starting from v2 you can add only the features you need reducing the bundle size
      await loadAll(engine);
      //await loadFull(engine);
      // await loadSlim(engine);
      //await loadBasic(engine);
    }).then(() => {
      setInit(true);
    });
  }, []);

  if (init) {
    return (
      <AppKitProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/:onelink" element={<View />} />
            <Route path="/:onelink/edit" element={<Editor />} />
            <Route path="/" element={<View />} />
          </Routes>
        </BrowserRouter>
      </AppKitProvider>
    );
  }
  return <></>;
}

export default App;
