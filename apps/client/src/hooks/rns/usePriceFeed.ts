// import { PRICE_FEED_URL } from "@/config/rns/constants";
// import { useEffect, useState } from "react";

// export default function usePriceFeed() {
//   const [ethPrice, setEthPrice] = useState<string>("");
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);

//   useEffect(() => {
//     const fetchEthUsdPrice = async () => {
//       try {
//         const res = await fetch(PRICE_FEED_URL as string);
//         const result = await res.json();

//         setEthPrice(result.result.ethusd);
//       } catch {
//         setError("Failed to fetch price");
//       } finally {
//         setLoading(false);
//       }
//     };
//     fetchEthUsdPrice();
//   }, []);

//   return { ethPrice, loading, error };
// }
