import { Layout } from '../components/Layout';
import { Toaster } from 'react-hot-toast';

export function Editor() {
  return (
    <div className="h-screen">
      <Layout />
      <Toaster position="top-center" />
    </div>
  );
}