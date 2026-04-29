export default function CarSVG({ className = '' }) {
  const spokes = (cx, cy, r1, r2, n, offset = 0) =>
    Array.from({ length: n }, (_, i) => {
      const a = ((i * 360) / n + offset) * (Math.PI / 180)
      return (
        <line key={i}
          x1={cx + Math.cos(a) * r1} y1={cy + Math.sin(a) * r1}
          x2={cx + Math.cos(a) * r2} y2={cy + Math.sin(a) * r2}
          stroke="#2a3e62" strokeWidth="7" strokeLinecap="round" />
      )
    })

  return (
    <svg viewBox="0 0 920 520" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* ── Filters ── */}
        <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow2" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="engGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>

        {/* ── Gradients ── */}
        <linearGradient id="body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#131e34" />
          <stop offset="100%" stopColor="#07101e" />
        </linearGradient>
        <linearGradient id="front" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#0b1525" />
          <stop offset="100%" stopColor="#131e34" />
        </linearGradient>
        <linearGradient id="roof" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#0b1424" />
          <stop offset="100%" stopColor="#111827" />
        </linearGradient>
        <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#1c3a6a" stopOpacity=".88" />
          <stop offset="100%" stopColor="#0b1c3a" stopOpacity=".94" />
        </linearGradient>
        <linearGradient id="hood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#0f1e38" stopOpacity=".72" />
          <stop offset="100%" stopColor="#07101e" stopOpacity=".88" />
        </linearGradient>
        <radialGradient id="wheel" cx="42%" cy="38%" r="60%">
          <stop offset="0%"   stopColor="#1e2d4a" />
          <stop offset="65%"  stopColor="#09111f" />
          <stop offset="100%" stopColor="#101828" />
        </radialGradient>
        <radialGradient id="rim" cx="40%" cy="35%" r="58%">
          <stop offset="0%"   stopColor="#3a506e" />
          <stop offset="100%" stopColor="#141e32" />
        </radialGradient>
        <radialGradient id="drlGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#3b82f6" stopOpacity=".6" />
          <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="engHeat" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#f59e0b" stopOpacity=".5" />
          <stop offset="100%" stopColor="#92400e" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ═══ MAIN BODY ═══ */}
      <path d="
        M 78,442
        L 858,442
        L 858,370
        C 856,344 844,315 824,292
        L 796,254
        C 778,228 756,200 730,178
        L 696,154
        L 282,144
        C 258,148 238,162 218,180
        L 158,225
        C 130,252 100,282 82,320
        L 78,368 Z
      " fill="url(#body)" />

      {/* ═══ FRONT FACE ═══ */}
      <path d="
        M 78,368
        L 78,442
        L 162,442
        L 162,225
        C 130,252 100,282 82,320 Z
      " fill="url(#front)" />

      {/* ═══ ROOF ═══ */}
      <path d="
        M 282,144
        L 302,96
        L 724,94
        L 696,154 Z
      " fill="url(#roof)" />

      {/* ═══ WINDOWS ═══ */}
      {/* Windshield */}
      <path d="M 282,144 L 302,96 L 405,92 L 372,138 Z" fill="url(#glass)" />
      {/* Front door window */}
      <path d="M 372,138 L 405,92 L 520,90 L 502,140 Z" fill="url(#glass)" opacity=".92" />
      {/* Rear door window */}
      <path d="M 502,140 L 520,90 L 645,90 L 634,144 Z" fill="url(#glass)" opacity=".86" />
      {/* Quarter window */}
      <path d="M 634,144 L 645,90 L 724,94 L 696,154 Z" fill="url(#glass)" opacity=".78" />

      {/* ═══ HOOD (semi-transparent, shows engine) ═══ */}
      <path d="
        M 82,320
        C 100,282 130,252 158,225
        L 218,180
        L 282,144
        L 372,138
        C 355,152 335,170 322,192
        C 308,215 302,244 300,268
        C 298,290 302,318 308,342
        L 292,348
        C 235,342 175,330 138,318
        C 112,310 92,316 80,348
        C 79,336 80,326 82,320 Z
      " fill="url(#hood)" />

      {/* ═══ ENGINE COMPONENTS (visible through hood) ═══ */}
      <g opacity=".7">
        {/* Engine block */}
        <rect x="112" y="272" width="80" height="52" rx="7"
              fill="#09142a" stroke="#1a3d6e" strokeWidth=".9" />
        {/* Valve cover */}
        <rect x="118" y="276" width="68" height="18" rx="4"
              fill="#0c1d3e" stroke="#1f4882" strokeWidth=".7" />
        {/* Valve cover bolts */}
        {[0,1,2,3].map(i => (
          <circle key={i} cx={124 + i * 16} cy={285} r="2.5"
                  fill="#1a3060" stroke="#243d66" strokeWidth=".5" />
        ))}
        {/* Air intake pipe */}
        <path d="M 192,275 C 208,268 228,264 244,268 L 244,290 C 228,286 208,290 192,292 Z"
              fill="#09122a" stroke="#152845" strokeWidth=".7" />
        {/* Coolant lines */}
        <path d="M 148,272 C 148,260 152,248 158,240" stroke="#1a4070" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <path d="M 164,272 C 165,258 170,246 178,236" stroke="#152f58" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <path d="M 178,272 C 182,256 190,244 200,234" stroke="#1a4070" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        {/* Alternator */}
        <circle cx="200" cy="300" r="10" fill="#09142a" stroke="#162e52" strokeWidth=".7" />
        <circle cx="200" cy="300" r="5"  fill="#0c1a35" />
        {/* Engine heat glow */}
        <ellipse cx="152" cy="298" rx="30" ry="20" fill="url(#engHeat)" filter="url(#engGlow)" />
      </g>

      {/* ═══ WHEEL ARCHES (dark shadow) ═══ */}
      <ellipse cx="248" cy="444" rx="84" ry="22" fill="#040b16" />
      <ellipse cx="700" cy="445" rx="84" ry="22" fill="#040b16" />

      {/* ═══ WHEELS ═══ */}
      {/* Rear wheel */}
      <circle cx="700" cy="444" r="70" fill="url(#wheel)" />
      <circle cx="700" cy="444" r="60" stroke="#182640" strokeWidth="1.5" fill="none" />
      {spokes(700, 444, 20, 56, 5, 10)}
      <circle cx="700" cy="444" r="20" fill="#152035" />
      <circle cx="700" cy="444" r="11" fill="#1e2d48" />
      <circle cx="700" cy="444" r="5"  fill="url(#rim)" />

      {/* Front wheel */}
      <circle cx="248" cy="444" r="70" fill="url(#wheel)" />
      <circle cx="248" cy="444" r="60" stroke="#182640" strokeWidth="1.5" fill="none" />
      {spokes(248, 444, 20, 56, 5, -8)}
      <circle cx="248" cy="444" r="20" fill="#152035" />
      <circle cx="248" cy="444" r="11" fill="#1e2d48" />
      <circle cx="248" cy="444" r="5"  fill="url(#rim)" />

      {/* ═══ GRILLE ═══ */}
      <rect x="78" y="328" width="26" height="68" rx="5" fill="#05090f" />
      {[0,1,2,3,4].map(i => (
        <line key={i} x1="78" y1={338 + i * 13} x2="103" y2={338 + i * 13}
              stroke="#192e56" strokeWidth="1.1" opacity=".85" />
      ))}
      <line x1="91" y1="328" x2="91" y2="396" stroke="#192e56" strokeWidth=".8" opacity=".7" />
      {/* Logo ring */}
      <circle cx="91" cy="362" r="9" stroke="#2563eb" strokeWidth="1.5" fill="none" opacity=".7" />
      <line   x1="82" y1="362" x2="100" y2="362" stroke="#2563eb" strokeWidth="1" opacity=".7" />

      {/* ═══ HEADLIGHTS ═══ */}
      {/* Housing */}
      <path d="M 82,298 L 122,284 L 158,278 L 162,296 L 124,304 L 82,313 Z"
            fill="#070d1e" stroke="#192e52" strokeWidth=".9" />
      {/* DRL strip — glowing blue line */}
      <line x1="86" y1="302" x2="156" y2="284"
            stroke="#3b82f6" strokeWidth="3" strokeLinecap="round"
            filter="url(#glow)" opacity=".88" />
      {/* DRL ambient glow */}
      <ellipse cx="118" cy="292" rx="28" ry="12"
               fill="url(#drlGrad)" opacity=".4" filter="url(#glow)" />
      {/* Low beam unit */}
      <ellipse cx="140" cy="290" rx="10" ry="7"
               fill="#0a1830" stroke="#1e3a6e" strokeWidth=".7" />

      {/* ═══ TAILLIGHTS ═══ */}
      <path d="M 858,292 L 830,282 L 820,332 L 858,336 Z"
            fill="#120406" stroke="#7f1d1d" strokeWidth=".9" />
      {/* Taillight glow strip */}
      <line x1="845" y1="287" x2="832" y2="330"
            stroke="#dc2626" strokeWidth="3" strokeLinecap="round" opacity=".65" />
      <line x1="845" y1="287" x2="832" y2="330"
            stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"
            filter="url(#glow2)" opacity=".5" />

      {/* ═══ EDGE HIGHLIGHT LINES (blue glow) ═══ */}
      {/* Roofline */}
      <path d="M 302,96 L 724,94"
            stroke="#3b82f6" strokeWidth="1.3" fill="none"
            filter="url(#glow2)" opacity=".65" />
      {/* A-pillar */}
      <path d="M 282,144 L 302,96"
            stroke="#2563eb" strokeWidth="1.2" fill="none"
            filter="url(#glow2)" opacity=".55" />
      {/* C-pillar */}
      <path d="M 696,154 L 724,94"
            stroke="#2563eb" strokeWidth="1.2" fill="none"
            filter="url(#glow2)" opacity=".55" />
      {/* Upper body edge */}
      <path d="M 158,225 L 218,180 L 282,144 L 696,154 L 730,178 L 796,254 L 824,292"
            stroke="#1d4ed8" strokeWidth="1.1" fill="none"
            filter="url(#glow2)" opacity=".55" />
      {/* Beltline / character line */}
      <path d="M 175,280 C 310,265 580,258 810,268"
            stroke="#1a3868" strokeWidth="1.1" fill="none" opacity=".6" />
      {/* Rocker panel */}
      <path d="M 162,400 C 360,394 640,396 820,404"
            stroke="#152840" strokeWidth="1" fill="none" opacity=".5" />
      {/* Front face top edge */}
      <line x1="78" y1="225" x2="162" y2="225"
            stroke="#1d4ed8" strokeWidth="1" filter="url(#glow2)" opacity=".4" />
      {/* Hood crease */}
      <path d="M 165,248 C 218,234 270,222 315,215"
            stroke="#1e3a6e" strokeWidth=".9" fill="none" opacity=".4" />

      {/* ═══ BUMPER DETAILS ═══ */}
      {/* Lower front grille / splitter */}
      <path d="M 78,390 L 162,388 L 162,406 L 78,408 Z"
            fill="#06090e" stroke="#122040" strokeWidth=".7" opacity=".9" />
      {/* Fog light */}
      <circle cx="148" cy="398" r="8" fill="#090e1c" stroke="#1a3060" strokeWidth=".7" />
      <circle cx="148" cy="398" r="4" fill="#0c172e" />
      {/* Rear diffuser */}
      <path d="M 800,422 L 858,422 L 858,442 L 800,442 Z"
            fill="#060a14" stroke="#0e1e36" strokeWidth=".6" opacity=".8" />
      {[0,1,2].map(i => (
        <line key={i} x1={810 + i * 16} y1="422" x2={810 + i * 16} y2="442"
              stroke="#122040" strokeWidth="1" opacity=".7" />
      ))}

      {/* ═══ SUBTLE REFLECTIONS on body ═══ */}
      <path d="M 400,160 C 500,158 620,160 700,165"
            stroke="#1a3060" strokeWidth="6" fill="none" opacity=".12" strokeLinecap="round" />
      <path d="M 300,200 C 400,192 580,190 720,198"
            stroke="#1e3a6e" strokeWidth="4" fill="none" opacity=".1" strokeLinecap="round" />
    </svg>
  )
}
