export const BUNNY_PATTERN = `data:image/svg+xml,` + encodeURIComponent(`
<svg width='400' height='400' viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'>
  <g fill="none" stroke="#a78bfa" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.6">

    <!-- Jumping Bunny (Top Left) -->
    <g transform="translate(70, 80) rotate(-15)">
      <path d="M -15,5 C -25,5 -25,15 -15,15 C -5,15 -5,5 -15,5" />
      <ellipse cx="0" cy="0" rx="20" ry="15" />
      <circle cx="15" cy="-5" r="12" />
      <path d="M 12,-15 C 5,-35 20,-35 15,-15" />
      <path d="M 20,-12 C 25,-30 40,-25 22,-8" />
      <circle cx="18" cy="-5" r="1.5" fill="#a78bfa" stroke="none" />
      <circle cx="10" cy="0" r="2.5" fill="#f472b6" stroke="none" opacity="0.4"/>
      <path d="M 10,12 C 10,20 20,20 15,12" />
      <circle cx="-20" cy="-2" r="5" fill="#a78bfa" opacity="0.4" stroke="none" />
      <path d="M -30,0 L -45,0 M -28,8 L -38,12" stroke-dasharray="2 4" stroke-width="2" />
    </g>

    <!-- Carrot (Top Middle) -->
    <g transform="translate(200, 50) rotate(30)">
      <!-- Tail / Leaves now correctly attached to the flat end (x=-15) -->
      <path d="M -15,0 C -25,-10 -35,-5 -35,-5 M -15,0 C -30,0 -40,0 -40,0 M -15,0 C -25,10 -35,5 -35,5" stroke="#4ade80" />
      <!-- Carrot body: thick at x=-15, tip at x=25 -->
      <path d="M -15,-8 Q 15,-5 25,0 Q 15,5 -15,8 Q -20,0 -15,-8 Z" fill="#fb923c" fill-opacity="0.2" stroke="#fb923c" />
      <path d="M -5,-6 L -5,-1 M 5,-4 L 5,3 M 15,-2 L 15,1" stroke="#fb923c" />
    </g>

    <!-- Thinking Bunny (Top Right) -->
    <g transform="translate(330, 100)">
      <path d="M -15,20 C -15,5 15,5 15,20" />
      <circle cx="0" cy="0" r="15" />
      <path d="M -8,-12 C -15,-35 -5,-40 0,-15" />
      <path d="M 8,-12 C 15,-35 5,-40 0,-15" />
      <circle cx="-5" cy="0" r="1.5" fill="#a78bfa" stroke="none" />
      <circle cx="5" cy="0" r="1.5" fill="#a78bfa" stroke="none" />
      <circle cx="-10" cy="3" r="3" fill="#f472b6" stroke="none" opacity="0.4"/>
      <circle cx="10" cy="3" r="3" fill="#f472b6" stroke="none" opacity="0.4"/>
      <path d="M -2,4 Q 0,6 2,4" />
      <circle cx="20" cy="-10" r="2" />
      <circle cx="28" cy="-20" r="3" />
      <ellipse cx="45" cy="-35" rx="15" ry="10" fill="#a78bfa" fill-opacity="0.05" />
      <!-- Lightbulb inside think bubble -->
      <path d="M 45,-41 C 42,-41 40,-39 40,-36 C 40,-34 43,-33 43,-31 L 47,-31 C 47,-33 50,-34 50,-36 C 50,-39 48,-41 45,-41 Z" stroke="#fbbf24" stroke-width="1.5" fill="#fbbf24" fill-opacity="0.2"/>
      <path d="M 43,-31 L 47,-31 M 44,-29 L 46,-29" stroke="#fbbf24" stroke-width="1.5" />
    </g>

    <!-- Cabbage (Middle Left) -->
    <g transform="translate(60, 220) rotate(-15)">
      <path d="M 0,15 C -20,15 -28,-15 0,-15 C 28,-15 20,15 0,15 Z" fill="#4ade80" fill-opacity="0.15" stroke="#4ade80" />
      <path d="M -5,10 C -25,5 -15,-20 0,-5" stroke="#4ade80" />
      <path d="M 5,10 C 25,5 15,-20 0,-5" stroke="#4ade80" />
      <path d="M -10,-5 Q 0,5 10,-5" stroke="#4ade80" />
    </g>

    <!-- Working Bunny (Middle Right) -->
    <g transform="translate(250, 230)">
      <path d="M 0,-5 C -15,-5 -20,15 -20,20 L 20,20 C 20,15 15,-5 0,-5 Z" />
      <circle cx="-5" cy="-10" r="14" />
      <path d="M -12,-20 C -20,-40 -5,-45 -5,-23" />
      <path d="M 2,-20 C 15,-30 5,-40 -2,-23" />
      <circle cx="-10" cy="-10" r="3.5" />
      <circle cx="2" cy="-10" r="3.5" />
      <path d="M -6.5,-10 L -1.5,-10" />
      <circle cx="-14" cy="-5" r="2.5" fill="#f472b6" stroke="none" opacity="0.4"/>
      <circle cx="6" cy="-5" r="2.5" fill="#f472b6" stroke="none" opacity="0.4"/>
      <path d="M -6,-4 Q -4,-2 -2,-4" />
      <path d="M -30,20 L 30,20" stroke="#a78bfa" stroke-width="3"/>
      <!-- Laptop -->
      <path d="M 8,20 L 14,0 L 28,0 L 30,20 Z" fill="#60a5fa" fill-opacity="0.1" stroke="#60a5fa" />
      <path d="M 5,20 L 33,20" stroke="#60a5fa" stroke-width="3" />
      <path d="M 21,9 L 23,9" stroke="#60a5fa" stroke-linecap="round" />
    </g>

    <!-- Drawing/Painting Bunny (Bottom Left) -->
    <g transform="translate(140, 330)">
      <path d="M -15,10 C -15,-5 15,-5 15,10" />
      <circle cx="0" cy="0" r="14" />
      <!-- Smart floppy ear -->
      <path d="M -6,-12 C -8,-35 8,-35 2,-12" />
      <path d="M 6,-10 C 25,-15 25,5 10,-2" />
      <circle cx="-4" cy="-2" r="1.5" fill="#a78bfa" stroke="none" />
      <circle cx="6" cy="-2" r="1.5" fill="#a78bfa" stroke="none" />
      <circle cx="-8" cy="2" r="3" fill="#f472b6" stroke="none" opacity="0.4"/>
      <circle cx="10" cy="2" r="3" fill="#f472b6" stroke="none" opacity="0.4"/>
      <path d="M -1,2 Q 1,4 3,2" />
      <path d="M -25,12 C -35,5 -15,-10 -15,5 C -15,15 -25,20 -25,12 Z" fill="#f472b6" fill-opacity="0.1" stroke="#f472b6" />
      <circle cx="-20" cy="2" r="2" stroke="none" fill="#fbbf24" opacity="0.8"/>
      <circle cx="-16" cy="8" r="2" stroke="none" fill="#60a5fa" opacity="0.8"/>
      <circle cx="-22" cy="12" r="2" stroke="none" fill="#4ade80" opacity="0.8"/>
      <path d="M 12,5 L 20,5" stroke="#a78bfa" />
      <path d="M 20,5 L 30,-5" stroke="#fb923c" />
      <path d="M 30,-5 C 35,-10 38,-2 32,0 Z" fill="#ec4899" fill-opacity="0.4" stroke="#ec4899" />
    </g>

    <!-- Sleeping Bunny (Bottom Right) -->
    <g transform="translate(340, 340)">
      <path d="M -20,5 C -20,-15 15,-15 20,5 C 20,15 -20,15 -20,5 Z" fill="#a78bfa" fill-opacity="0.05" />
      <circle cx="-20" cy="5" r="5" fill="#a78bfa" opacity="0.4" stroke="none" />
      <path d="M 0,-5 C 20,-10 30,0 20,5" />
      <path d="M -5,-5 C 10,-10 20,-5 15,5" />
      <path d="M -2,2 Q 0,4 2,2" stroke-width="2"/>
      <path d="M -10,2 Q -8,4 -6,2" stroke-width="2"/>
      <circle cx="-4" cy="5" r="3" fill="#f472b6" stroke="none" opacity="0.4"/>
      <path d="M -10,-15 L -4,-15 L -10,-9 L -4,-9" stroke="#60a5fa" stroke-width="1.5" />
      <path d="M -20,-25 L -12,-25 L -20,-17 L -12,-17" stroke="#60a5fa" stroke-width="1.5" />
    </g>

    <!-- Happy Star / Sparkle elements -->
    <g transform="translate(180, 160) scale(0.6)" stroke="#f472b6" fill="#f472b6" fill-opacity="0.2" stroke-width="3">
      <circle cx="0" cy="-8" r="4" />
      <circle cx="8" cy="0" r="4" />
      <circle cx="0" cy="8" r="4" />
      <circle cx="-8" cy="0" r="4" />
      <circle cx="0" cy="0" r="4" fill="#fbbf24" stroke="none" />
    </g>
    <g transform="translate(360, 50) scale(0.5)" stroke="#c084fc" fill="#c084fc" fill-opacity="0.2" stroke-width="3">
      <circle cx="0" cy="-8" r="4" />
      <circle cx="8" cy="0" r="4" />
      <circle cx="0" cy="8" r="4" />
      <circle cx="-8" cy="0" r="4" />
      <circle cx="0" cy="0" r="4" fill="#60a5fa" stroke="none" />
    </g>
    <g transform="translate(40, 320) scale(0.5)" stroke="#4ade80" fill="#4ade80" fill-opacity="0.2" stroke-width="3">
      <circle cx="0" cy="-8" r="4" />
      <circle cx="8" cy="0" r="4" />
      <circle cx="0" cy="8" r="4" />
      <circle cx="-8" cy="0" r="4" />
      <circle cx="0" cy="0" r="4" fill="#fb923c" stroke="none" />
    </g>
    
    <g transform="translate(240, 370) scale(0.4)" stroke="#60a5fa" fill="#60a5fa" fill-opacity="0.2" stroke-width="3">
      <circle cx="0" cy="-8" r="4" />
      <circle cx="8" cy="0" r="4" />
      <circle cx="0" cy="8" r="4" />
      <circle cx="-8" cy="0" r="4" />
    </g>

    <!-- Decorative tiny shapes -->
    <path d="M 280,70 L 280,80 M 275,75 L 285,75" stroke="#fbbf24" stroke-width="2.5" />
    <path d="M 120,200 L 120,210 M 115,205 L 125,205" stroke="#fbbf24" stroke-width="2.5" />
    <path d="M 220,300 L 220,310 M 215,305 L 225,305" stroke="#f472b6" stroke-width="2.5" />
    <path d="M 30,120 L 30,130 M 25,125 L 35,125" stroke="#60a5fa" stroke-width="2.5" />
    <path d="M 320,220 L 320,228 M 316,224 L 324,224" stroke="#4ade80" stroke-width="2.5" />

    <circle cx="100" cy="380" r="2.5" fill="#fb923c" stroke="none" />
    <circle cx="150" cy="40" r="3.5" fill="#a78bfa" stroke="none" opacity="0.5" />
    <circle cx="380" cy="240" r="2.5" fill="#60a5fa" stroke="none" />
    <circle cx="20" cy="40" r="2" fill="#4ade80" stroke="none" />
    <circle cx="240" cy="130" r="3" fill="#f472b6" stroke="none" opacity="0.6"/>

  </g>
</svg>
`);

