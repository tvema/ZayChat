export const BUNNY_PATTERN = `data:image/svg+xml,` + encodeURIComponent(`
<svg width='400' height='400' viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'>
  <g fill="none" stroke="#a78bfa" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.6">
    <!-- Jumping Bunny -->
    <g transform="translate(70, 70) rotate(-15)">
      <path d="M -5,-15 C -15,-35 0,-40 5,-20" />
      <path d="M 5,-15 C 15,-35 25,-25 10,-10" />
      <ellipse cx="5" cy="0" rx="20" ry="15" />
      <circle cx="-18" cy="2" r="5" fill="#a78bfa" opacity="0.4" stroke="none" />
      <path d="M 17,-3 Q 15,-1 17,2" />
      <path d="M -5,10 C -10,20 -20,20 -20,20" />
      <path d="M 15,10 C 20,20 30,15 30,15" />
      <path d="M -35,-5 L -45,-5 M -30,5 L -40,10" stroke-dasharray="2 4" />
    </g>

    <!-- Carrot -->
    <g transform="translate(200, 50) rotate(30)">
      <path d="M -15,0 L 15,-8 C 20,-8 20,8 15,8 Z" fill="#fb923c" fill-opacity="0.2" stroke="#fb923c" />
      <path d="M -5,-3 L -5,3 M 5,-5 L 5,5" stroke="#fb923c" />
      <path d="M -15,-2 C -25,-10 -35,-5 -35,-5" stroke="#4ade80" />
      <path d="M -15,2 C -25,10 -35,5 -35,5" stroke="#4ade80" />
      <path d="M -15,0 C -30,0 -40,0 -40,0" stroke="#4ade80" />
    </g>

    <!-- Thinking Bunny -->
    <g transform="translate(320, 110)">
      <path d="M -8,-10 C -15,-30 -5,-35 0,-15" />
      <path d="M 8,-10 C 15,-30 5,-35 0,-15" />
      <circle cx="0" cy="5" r="15" />
      <path d="M -5,2 Q -3,0 -1,2" />
      <path d="M 1,2 Q 3,0 5,2" />
      <circle cx="-8" cy="6" r="3" fill="#f472b6" stroke="none" opacity="0.4"/>
      <circle cx="8" cy="6" r="3" fill="#f472b6" stroke="none" opacity="0.4"/>
      <path d="M -2,7 Q 0,9 2,7" />
      <circle cx="15" cy="-8" r="2" />
      <circle cx="22" cy="-15" r="3" />
      <ellipse cx="40" cy="-28" rx="18" ry="12" />
      <path d="M 40,-33 A 3 3 0 1 1 39,-25" />
      <circle cx="40" cy="-21" r="1" fill="#a78bfa" stroke="none"/>
    </g>

    <!-- Cabbage -->
    <g transform="translate(80, 230)">
      <circle cx="0" cy="0" r="14" fill="#4ade80" fill-opacity="0.15" stroke="#4ade80" />
      <path d="M -14,0 C -25,-20 0,-25 5,-10" stroke="#4ade80" />
      <path d="M 14,0 C 25,-20 0,-25 -5,-10" stroke="#4ade80" />
      <path d="M -10,10 C -20,25 0,30 10,15" stroke="#4ade80" />
      <path d="M 10,10 C 20,25 0,30 -10,15" stroke="#4ade80" />
    </g>

    <!-- Working Bunny -->
    <g transform="translate(260, 240)">
      <path d="M 5,-12 C -5,-30 10,-35 15,-15" />
      <path d="M 18,-12 C 28,-25 15,-30 15,-15" />
      <ellipse cx="12" cy="2" rx="14" ry="16" />
      <circle cx="4" cy="-2" r="4" />
      <path d="M 0, -2 L -6, -2" />
      <path d="M 8, -2 L 12, -2" />
      <circle cx="4" cy="-2" r="1.5" fill="#a78bfa" stroke="none"/>
      <path d="M -25,18 L -3,18 L -8,0 L -25,0 Z" fill="#60a5fa" fill-opacity="0.1" stroke="#60a5fa" />
      <path d="M -30,18 L 2,18" stroke="#60a5fa" stroke-width="3" />
      <path d="M -10,8 L -18,8" stroke="#60a5fa" />
      <path d="M -40,22 L 30,22" />
      <rect x="20" y="10" width="8" height="10" rx="1" />
      <path d="M 28,12 C 32,12 32,18 28,18" />
      <path d="M 22,6 C 24,2 26,8 24,0" stroke-dasharray="2 2" stroke="#fbbf24"/>
      <path d="M 4,12 L -4,16" />
    </g>

    <!-- Drawing Bunny -->
    <g transform="translate(130, 340)">
      <path d="M -5,-12 C -25,-15 -25,10 -15,12" />
      <path d="M 8,-14 C 10,-35 30,-25 20,-8" />
      <circle cx="5" cy="5" r="16" />
      <path d="M -2,0 Q -4,-2 -6,0" />
      <circle cx="-5" cy="5" r="3" fill="#f472b6" stroke="none" opacity="0.4"/>
      <path d="M -5,8 Q -2,10 0,8" />
      <path d="M -11,8 C -20,5 -25,10 -25,10" />
      <path d="M 12,12 C 25,12 25,25 15,25 C 5,25 5,12 12,12 Z" fill="#f472b6" fill-opacity="0.1" stroke="#f472b6"/>
      <circle cx="10" cy="18" r="2" stroke="none" fill="#f472b6" />
      <path d="M -20,2 L -32,14" />
      <path d="M -32,14 C -38,18 -42,12 -38,8 Z" fill="#ec4899" fill-opacity="0.4" stroke="#ec4899" />
      <path d="M -65,-5 L -45,-15 L -45,25 L -65,15 Z" fill="#60a5fa" fill-opacity="0.05" />
      <path d="M -55,10 L -55,35" /> 
      <path d="M -60,35 L -50,35" />
      <path d="M -55,-2 L -57,8 M -52,0 L -54,5" stroke="#ec4899"/>
    </g>

    <!-- Sleeping Bunny -->
    <g transform="translate(350, 360)">
      <path d="M 15,0 C 35,0 35,10 20,5" />
      <path d="M 10,3 C 30,10 30,15 15,10" />
      <ellipse cx="0" cy="5" rx="18" ry="12" />
      <path d="M -4,2 Q -1,5 2,2" />
      <path d="M -10,-10 L -4,-10 L -10,-4 L -4,-4" />
      <path d="M -18,-18 L -12,-18 L -18,-12 L -12,-12" />
      <circle cx="18" cy="8" r="4" fill="#a78bfa" opacity="0.4" stroke="none" />
    </g>

    <!-- Sparkles & Flowers -->
    <g transform="translate(40, 270) scale(0.6)" stroke="#f472b6" fill="#f472b6" fill-opacity="0.2" stroke-width="4">
      <circle cx="0" cy="0" r="3" />
      <circle cx="0" cy="-8" r="4" />
      <circle cx="0" cy="8" r="4" />
      <circle cx="-8" cy="0" r="4" />
      <circle cx="8" cy="0" r="4" />
    </g>
    <g transform="translate(360, 40) scale(0.5)" stroke="#c084fc" fill="#c084fc" fill-opacity="0.2" stroke-width="4">
      <circle cx="0" cy="0" r="3" />
      <circle cx="0" cy="-8" r="4" />
      <circle cx="0" cy="8" r="4" />
      <circle cx="-8" cy="0" r="4" />
      <circle cx="8" cy="0" r="4" />
    </g>
    <g transform="translate(180, 150) scale(0.4)" stroke="#60a5fa" fill="#60a5fa" fill-opacity="0.2" stroke-width="4">
      <circle cx="0" cy="0" r="3" />
      <circle cx="0" cy="-8" r="4" />
      <circle cx="0" cy="8" r="4" />
      <circle cx="-8" cy="0" r="4" />
      <circle cx="8" cy="0" r="4" />
    </g>

    <path d="M 280,70 L 280,80 M 275,75 L 285,75" stroke="#fbbf24" stroke-width="3" />
    <path d="M 120,180 L 120,190 M 115,185 L 125,185" stroke="#fbbf24" stroke-width="3" />
    <path d="M 220,320 L 220,330 M 215,325 L 225,325" stroke="#f472b6" stroke-width="3" />
    <path d="M 50,150 L 50,160 M 45,155 L 55,155" stroke="#60a5fa" stroke-width="3" />
    <path d="M 280,300 L 280,308 M 276,304 L 284,304" stroke="#4ade80" stroke-width="3" />

    <circle cx="80" cy="380" r="2" fill="#fb923c" stroke="none" />
    <circle cx="150" cy="20" r="3" fill="#a78bfa" stroke="none" />
    <circle cx="380" cy="220" r="2" fill="#60a5fa" stroke="none" />
    <circle cx="20" cy="20" r="2" fill="#4ade80" stroke="none" />
  </g>
</svg>
`);
