import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Editor } from './pages/Editor';
import { View } from './pages/View';
import { initParticlesEngine } from '@tsparticles/react';
//import { loadSlim } from '@tsparticles/slim';
import { loadAll } from '@tsparticles/all';

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
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<View />} />
          <Route path="/edit" element={<Editor />} />
        </Routes>
      </BrowserRouter>
    );
  }
  return <></>
}

export default App;