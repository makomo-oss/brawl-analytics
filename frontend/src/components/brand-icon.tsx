import React from "react";

interface BrandIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
  glow?: boolean;
}

/**
 * ブロラボ (Brawl Lab) 公式アプリアイコン
 * 「ブロスタ (黄金スター)」×「ラボ (先端データ実験フラスコ)」を融合したシンボリックアイコン
 */
export function BurolaboIcon({ size = 32, className = "", glow = true, ...props }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 transition-transform duration-300 ${className}`}
      {...props}
    >
      <defs>
        {/* 背景スクワークル グラデーション */}
        <linearGradient id="bl-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e1035" />
          <stop offset="50%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#080e1a" />
        </linearGradient>

        {/* 外枠ボーダー ネオングラデーション */}
        <linearGradient id="bl-border-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c084fc" />
          <stop offset="50%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>

        {/* フラスコ ガラスグラデーション */}
        <linearGradient id="bl-flask-grad" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
          <stop offset="40%" stopColor="#818cf8" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#c084fc" stopOpacity="0.7" />
        </linearGradient>

        {/* フラスコ 液体グラデーション */}
        <linearGradient id="bl-liquid-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="50%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>

        {/* 黄金スター グラデーション */}
        <linearGradient id="bl-star-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>

        {/* グローフィルター */}
        <filter id="bl-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        {/* 強力なスターグロー */}
        <filter id="bl-star-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* 1. 背景スクワークル (iOS/モダンアプリアイコン形状) */}
      <rect
        x="2"
        y="2"
        width="96"
        height="96"
        rx="24"
        fill="url(#bl-bg-grad)"
        stroke="url(#bl-border-grad)"
        strokeWidth="2.5"
      />

      {/* 2. 背景のサイバーグリッド・オーラ */}
      <circle cx="50" cy="55" r="28" fill="#a855f7" fillOpacity="0.25" filter="url(#bl-glow)" />
      <circle cx="50" cy="65" r="20" fill="#38bdf8" fillOpacity="0.2" filter="url(#bl-glow)" />

      {/* 3. ラボ フラスコ本体 (エルレンマイヤーフラスコ) */}
      {/* フラスコの首 */}
      <path
        d="M44 22 H56 V36 L44 36 Z"
        fill="none"
        stroke="url(#bl-flask-grad)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* フラスコのリップ（口） */}
      <rect x="41" y="20" width="18" height="3.5" rx="1.75" fill="#38bdf8" />

      {/* フラスコの胴体 */}
      <path
        d="M44 36 L24 68 C21 73 24.5 79 30.5 79 H69.5 C75.5 79 79 73 76 68 L56 36 Z"
        fill="none"
        stroke="url(#bl-flask-grad)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* フラスコ内部のサイバー液体 */}
      <path
        d="M28.5 61 C35 58 42 63 50 60 C58 57 65 62 71.5 61 L74.5 67 C76.5 71 74 76 69.5 76 H30.5 C26 76 23.5 71 25.5 67 Z"
        fill="url(#bl-liquid-grad)"
        fillOpacity="0.6"
      />

      {/* 4. アナリティクス・データバー (フラスコ内部のサイバーデータ) */}
      <rect x="33" y="65" width="4" height="7" rx="1.5" fill="#38bdf8" fillOpacity="0.9" />
      <rect x="40" y="60" width="4" height="12" rx="1.5" fill="#818cf8" fillOpacity="0.9" />
      <rect x="56" y="58" width="4" height="14" rx="1.5" fill="#c084fc" fillOpacity="0.9" />
      <rect x="63" y="63" width="4" height="9" rx="1.5" fill="#38bdf8" fillOpacity="0.9" />

      {/* 5. 輝く黄金のブロスタ・スター (中心のコアエネルギー) */}
      <g filter={glow ? "url(#bl-star-glow)" : undefined}>
        {/* スター本体 (中央に配置) */}
        <polygon
          points="50,42 53.2,50.5 62.3,50.8 55.2,56.2 57.8,65 50,60 42.2,65 44.8,56.2 37.7,50.8 46.8,50.5"
          fill="url(#bl-star-grad)"
          stroke="#fff"
          strokeWidth="1"
        />
        {/* スター中心の輝き */}
        <circle cx="50" cy="54" r="3" fill="#ffffff" />
      </g>

      {/* 6. 上昇するエネルギー粒子・サイバーバブル */}
      <circle cx="47" cy="32" r="1.5" fill="#fde047" opacity="0.9" filter="url(#bl-glow)" />
      <circle cx="53" cy="27" r="1.2" fill="#38bdf8" opacity="0.8" />
      <circle cx="50" cy="16" r="1.8" fill="#c084fc" opacity="0.8" filter="url(#bl-glow)" />

      {/* 7. ガラスのハイライト光沢 */}
      <path
        d="M28 66 L45 38"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeOpacity="0.5"
      />
    </svg>
  );
}

export default BurolaboIcon;
