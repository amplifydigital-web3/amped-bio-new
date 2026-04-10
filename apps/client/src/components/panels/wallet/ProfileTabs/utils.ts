export const formatAddress = (address: string) => {
  if (!address) return "";
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

export const formatHash = (hash: string) => {
  if (!hash) return "";
  return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`;
};

export const timeAgo = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  let interval = seconds / 31536000;
  if (interval > 1) return `${Math.floor(interval)} years ago`;
  interval = seconds / 2592000;
  if (interval > 1) return `${Math.floor(interval)} months ago`;
  interval = seconds / 86400;
  if (interval > 1) return `${Math.floor(interval)} days ago`;
  interval = seconds / 3600;
  if (interval > 1) return `${Math.floor(interval)} hours ago`;
  interval = seconds / 60;
  if (interval > 1) return `${Math.floor(interval)} minutes ago`;
  return `${Math.floor(seconds)} seconds ago`;
};

export const formatValue = (value: string, symbol?: string) => {
  try {
    const ethValue = parseFloat(value) / Math.pow(10, 18);
    return `${ethValue.toFixed(4)} ${symbol || "REVO"}`;
  } catch (e) {
    return "N/A";
  }
};

export const formatFee = (fee: string, symbol?: string) => {
  try {
    const feeValue = fee.startsWith("0x") ? parseInt(fee, 16) : parseFloat(fee);
    const ethValue = feeValue / Math.pow(10, 18);
    return `${ethValue.toFixed(6)} ${symbol || "REVO"}`;
  } catch (e) {
    return "N/A";
  }
};

export const getMethodSelector = (data: string): string | null => {
  if (!data || data === "0x" || data.length < 10) return null;
  return data.substring(0, 10);
};
