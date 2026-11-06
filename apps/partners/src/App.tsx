import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AuthProvider, Toaster } from "@repo/ui";
import { ConsoleGate } from "./ConsoleGate";
import { ConsoleShell } from "./ConsoleShell";
import { Overview } from "./pages/Overview";
import { Products } from "./pages/Products";
import { PayoutWallet } from "./pages/PayoutWallet";
import { Orders } from "./pages/Orders";
import { Developers } from "./pages/Developers";
import { Team } from "./pages/Team";

// Merchant Console at partners.amped.bio (Build Board #66, AB-5, decision M7; boards p1 to p7).
// Business sellers on AmpedPay manage products and prices, the payout wallet, orders and refunds,
// API keys and webhooks, and their team. Sign in with an Amped.Bio account that is a member.
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ConsoleGate>
          <Routes>
            <Route element={<ConsoleShell />}>
              <Route index element={<Overview />} />
              <Route path="products" element={<Products />} />
              <Route path="payout-wallet" element={<PayoutWallet />} />
              <Route path="orders" element={<Orders />} />
              <Route path="developers" element={<Developers />} />
              <Route path="team" element={<Team />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ConsoleGate>
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
