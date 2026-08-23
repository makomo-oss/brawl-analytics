import React from "react";

interface BrandIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
  glow?: boolean;
}

/**
 * ブロラボ (Brawl Lab) 公式アプリアイコン - Optically Centered Edition
 * 完璧な幾何学・視覚重心アライメント
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
          <stop offset="0%" stopColor="#181826" />
          <stop offset="100%" stopColor="#0a0c14" />
        </linearGradient>

        {/* 外枠ヘキサゴン グラデーション (シアン → インディゴ → パープル) */}
        <linearGradient id="bl-hexa-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="45%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>

        {/* ボルト グラデーション */}
        <linearGradient id="bl-bolt-grad" x1="15%" y1="10%" x2="85%" y2="90%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>

        {/* ネオングローフィルター */}
        <filter id="bl-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* 1. スクワークル背景 (完全中央配置) */}
      <rect
        x="2"
        y="2"
        width="96"
        height="96"
        rx="24"
        fill="url(#bl-bg-grad)"
        stroke="#334155"
        strokeWidth="1.5"
      />

      {/* 2. アンビエントオーラ (完全中央 50, 50) */}
      <circle cx="50" cy="50" r="30" fill="#818cf8" fillOpacity="0.25" filter="url(#bl-glow)" />

      {/* 3. 外枠ヘキサゴン (視覚重心 50, 50 に完全一致) */}
      {/* 頂点: 上(50, 14), 右上(81, 32), 右下(81, 68), 下(50, 86), 左下(19, 68), 左上(19, 32) */}
      <polygon
        points="50,14 81,32 81,68 50,86 19,68 19,32"
        fill="none"
        stroke="url(#bl-hexa-grad)"
        strokeWidth="8"
        strokeLinejoin="round"
        strokeLinecap="round"
        filter={glow ? "url(#bl-glow)" : undefined}
      />

      {/* 4. 中央のエレクトリックボルト (中心 50, 50 に完全オプティカルセンタリング) */}
      {/* 上下・左右のバランスをミリ単位で幾何学計算 */}
      <path
        d="M55 24 L31 52 H49 L45 76 L69 48 H51 L55 24 Z"
        fill="url(#bl-bolt-grad)"
        filter={glow ? "url(#bl-glow)" : undefined}
      />

      {/* 5. 発光パルスノード (完全対称) */}
      <circle cx="50" cy="14" r="4.5" fill="#38bdf8" />
      <circle cx="81" cy="50" r="4" fill="#a855f7" />
      <circle cx="19" cy="50" r="4" fill="#38bdf8" />
      <circle cx="50" cy="86" r="4.5" fill="#c084fc" />
    </svg>
  );
}

export default BurolaboIcon;
