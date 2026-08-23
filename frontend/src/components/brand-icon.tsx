import React from "react";

interface BrandIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
  glow?: boolean;
}

/**
 * ブロラボ (Brawl Lab) 公式アプリアイコン - Modern Minimal Geometric Edition
 * ラボフラスコの幾何学アングル × 輝くスター（AI / ブロスタ）を融合した洗練されたテックシンボル
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
        <linearGradient id="bl-modern-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#131127" />
          <stop offset="50%" stopColor="#0b0f19" />
          <stop offset="100%" stopColor="#05070d" />
        </linearGradient>

        {/* 外枠境界線 */}
        <linearGradient id="bl-modern-border" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.6" />
          <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.5" />
        </linearGradient>

        {/* メインシンボル グラデーション (フラスコフレーム) */}
        <linearGradient id="bl-symbol-grad" x1="15%" y1="10%" x2="85%" y2="90%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="35%" stopColor="#818cf8" />
          <stop offset="70%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#f43f5e" />
        </linearGradient>

        {/* スター・コア グラデーション */}
        <linearGradient id="bl-star-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor="#fde047" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>

        {/* ネオングロー */}
        <filter id="bl-modern-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* 1. スクワークル背景 (Apple/モダンアプリ規格) */}
      <rect
        x="3"
        y="3"
        width="94"
        height="94"
        rx="22"
        fill="url(#bl-modern-bg)"
        stroke="url(#bl-modern-border)"
        strokeWidth="1.5"
      />

      {/* 2. 背景のソフトなアンビエントオーラ */}
      <circle cx="50" cy="52" r="26" fill="#818cf8" fillOpacity="0.18" filter="url(#bl-modern-glow)" />

      {/* 3. ミニマル幾何学フラスコ (太いクリーンな連続ストローク) */}
      <path
        d="M44 23 H56 V33 L73 66 C76.5 73 71.5 81 63.5 81 H36.5 C28.5 81 23.5 73 27 66 L44 33 V23 Z"
        fill="none"
        stroke="url(#bl-symbol-grad)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* フラスコのトップバー */}
      <line
        x1="41"
        y1="23"
        x2="59"
        y2="23"
        stroke="url(#bl-symbol-grad)"
        strokeWidth="7"
        strokeLinecap="round"
      />

      {/* 4. 中央のモダン4点スター (AI & ブロスタのコアエネルギー) */}
      <g filter={glow ? "url(#bl-modern-glow)" : undefined}>
        {/* スタイリッシュな4点スター (幾何学的スパーク) */}
        <path
          d="M50 43 C50 49 54 53 60 53 C54 53 50 57 50 63 C50 57 46 53 40 53 C46 53 50 49 50 43 Z"
          fill="url(#bl-star-grad)"
        />
        {/* コアドット */}
        <circle cx="50" cy="53" r="2.2" fill="#ffffff" />
      </g>

      {/* 5. 底部のアナリティクス水平アクセントバー */}
      <line
        x1="40"
        y1="72"
        x2="60"
        y2="72"
        stroke="#38bdf8"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeOpacity="0.8"
      />
    </svg>
  );
}

export default BurolaboIcon;
