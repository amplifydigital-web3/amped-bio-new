import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import type { MediaBlock as MediaBlockType, ThemeConfig } from '../../types/editor';

interface TokenPriceBlockProps {
  block: MediaBlockType;
  theme: ThemeConfig;
}

interface TokenData {
  name: string;
  symbol: string;
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  logoUrl: string;
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

function formatLargeNumber(num: number): string {
  if (num >= 1e9) {
    return `$${(num / 1e9).toFixed(2)}B`;
  }
  if (num >= 1e6) {
    return `$${(num / 1e6).toFixed(2)}M`;
  }
  return formatNumber(num);
}

export function TokenPriceBlock({ block, theme }: TokenPriceBlockProps) {
  const [tokenData, setTokenData] = useState<TokenData | null>(null);

  useEffect(() => {
    // In a real app, you would fetch this data from an API
    // This is mock data for demonstration

    // TODO MAKE THIS FETCH REAl TOKEN DATA
    if (block.content) {
      setTokenData({
        name: 'Ethereum',
        symbol: 'ETH',
        price: 2235.67,
        change24h: 2.45,
        marketCap: 268900000000,
        volume24h: 8750000000,
        logoUrl: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png'
      });
    }
  }, [block.content]);

  if (!block.content) {
    return (
      <div className="w-full p-6 rounded-lg bg-[#16C784]/10 border-2 border-dashed border-[#16C784]/20 flex flex-col items-center justify-center space-y-2">
        <DollarSign className="w-8 h-8 text-[#16C784]" />
        <p className="text-sm text-[#16C784]" style={{ fontFamily: theme.fontFamily }}>
          Add a token symbol to display price
        </p>
      </div>
    );
  }

  if (!tokenData) {
    return (
      <div className="w-full p-6 rounded-lg bg-white/50 backdrop-blur-sm animate-pulse">
        <div className="h-16 bg-gray-200 rounded-lg"></div>
      </div>
    );
  }

  const isPositive = tokenData.change24h >= 0;
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;
  const changeColor = isPositive ? 'text-[#16C784]' : 'text-[#EA3943]';
  const changeBg = isPositive ? 'bg-[#16C784]/10' : 'bg-[#EA3943]/10';

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center space-x-2 px-3">
        <DollarSign className="w-4 h-4 text-[#16C784]" />
        <span
          className="text-sm font-medium text-[#16C784]"
          style={{ fontFamily: theme.fontFamily }}
        >
          Token Price
        </span>
      </div>
      <div className="w-full rounded-lg overflow-hidden bg-white/50 backdrop-blur-sm p-4 space-y-4">
        {/* Token Header */}
        <div className="flex items-center space-x-3">
          <img
            src={tokenData.logoUrl}
            alt={tokenData.name}
            className="w-8 h-8 rounded-full"
          />
          <div>
            <h3
              className="font-semibold"
              style={{
                fontFamily: theme.fontFamily,
                color: theme.fontColor
              }}
            >
              {tokenData.name}
            </h3>
            <p
              className="text-sm text-gray-500"
              style={{ fontFamily: theme.fontFamily }}
            >
              {tokenData.symbol}
            </p>
          </div>
        </div>

        {/* Price and Change */}
        <div className="flex items-center justify-between">
          <div>
            <p
              className="text-2xl font-bold"
              style={{
                fontFamily: theme.fontFamily,
                color: theme.fontColor
              }}
            >
              {formatNumber(tokenData.price)}
            </p>
            <div className={`inline-flex items-center space-x-1 px-2 py-1 rounded-lg ${changeBg} ${changeColor}`}>
              <TrendIcon className="w-4 h-4" />
              <span className="text-sm font-medium">
                {tokenData.change24h > 0 ? '+' : ''}{tokenData.change24h}%
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="space-y-1">
              <div>
                <p
                  className="text-xs text-gray-500"
                  style={{ fontFamily: theme.fontFamily }}
                >
                  Market Cap
                </p>
                <p
                  className="font-medium"
                  style={{
                    fontFamily: theme.fontFamily,
                    color: theme.fontColor
                  }}
                >
                  {formatLargeNumber(tokenData.marketCap)}
                </p>
              </div>
              <div>
                <p
                  className="text-xs text-gray-500"
                  style={{ fontFamily: theme.fontFamily }}
                >
                  24h Volume
                </p>
                <p
                  className="font-medium"
                  style={{
                    fontFamily: theme.fontFamily,
                    color: theme.fontColor
                  }}
                >
                  {formatLargeNumber(tokenData.volume24h)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}