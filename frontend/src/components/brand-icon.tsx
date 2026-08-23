import React from "react";

interface BrandIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
  glow?: boolean;
}

/**
 * ブロラボ (Brawl Lab) 公式アプリアイコン - Hexa-Shield Edition
 * ヘキサゴン・シールド × 勝利のエレクトリックボルト × サイバーパルスノード
 */
export function BurolaboIcon({ size = 32, className = "", glow = true, ...props }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 transition-all duration-300 ${className}`}
      {...props}
    >
      <defs>
        {/* 背景スクワークル グラデーション */}
        <linearGradient id="bl-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#181824" />
          <stop offset="100%" stopColor="#0c0d14" />
        </linearGradient>

        {/* 外枠ヘキサゴン グラデーション (シアン → インディゴ → パープル) */}
        <linearGradient id="bl-hexa-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="45%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>

        {/* ボルト グラデーション */}
        <linearGradient id="bl-bolt-grad" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>

        {/* ネオングローフィルター */}
        <filter id="bl-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* 1. スクワークル背景 */}
      <rect
        x="3"
        y="3"
        width="94"
        height="94"
        rx="24"
        fill="url(#bl-bg-grad)"
        stroke="#334155"
        strokeWidth="1.5"
      />

      {/* 2. アンビエントオーラ */}
      <circle cx="50" cy="50" r="28" fill="#818cf8" fillOpacity="0.22" filter="url(#bl-glow)" />

      {/* 3. 外枠ヘキサゴン (極太幾何学ライン) */}
      <polygon
        points="50,17 80,34 80,66 50,83 20,66 20,34"
        fill="none"
        stroke="url(#bl-hexa-grad)"
        strokeWidth="7.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        filter={glow ? "url(#bl-glow)" : undefined}
      />

      {/* 4. 中央のシャープ・エレクトリックボルト */}
      <path
        d="M54 26 L34 52 H50 L46 74 L66 48 H50 L54 26 Z"
        fill="url(#bl-bolt-grad)"
        filter={glow ? "url(#bl-glow)" : undefined}
      />

      {/* 5. 発光パルスノード */}
      <circle cx="50" cy="17" r="4" fill="#38bdf8" />
      <circle cx="80" cy="50" r="3.5" fill="#a855f7" />
      <circle cx="20" cy="50" r="3.5" fill="#38bdf8" />
      <circle cx="50" cy="83" r="4" fill="#c084fc" />
    </svg>
  );
}

export default BurolaboIcon;
