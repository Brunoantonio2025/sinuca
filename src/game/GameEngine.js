import Matter from 'matter-js';
import confetti from 'canvas-confetti';
import { peerManager } from '../network/PeerManager';

const { Engine, Runner, World, Bodies, Body, Events, Composite } = Matter;

/* ─────────────────────────────────────────────────────────────
   TABLE LAYOUT  (all in virtual canvas pixels)
   W × H  =  1000 × 520
   RAIL   =  55   – wood outside the cushion
   FELT   =  inner green surface
   POCKET =  circle at each corner + 2 mid sides
───────────────────────────────────────────────────────────── */
const W       = 1000;
const H       = 520;
const RAIL    = 55;          // wood rail thickness
const CUSH    = 16;          // cushion depth (physics wall thickness)
const PR      = 22;          // pocket radius (visual)
const PS      = 18;          // pocket sensor radius (physics)
const BALL_R  = 13;

/* --- MESA CONSTANTS (Unified for Physics & Visuals) --- */
const JAW = 16;  // Largura da boca
const CD  = 16;  // Profundidade da tabela
const PC  = 22;  // Separação das caçapas de canto
const PM  = 20;  // Separação das caçapas do meio

/* field edges after rail */
const FX  = RAIL;            // field left
const FY  = RAIL;            // field top
const FW  = W - RAIL * 2;   // field width
const FH  = H - RAIL * 2;   // field height

/* pocket positions (all exactly at the field edge) */
const POCKETS = [
  { x: FX,       y: FY,     corner: true  },   // TL
  { x: W / 2,    y: FY,     corner: false },   // TM  ← top middle
  { x: W - FX,   y: FY,     corner: true  },   // TR
  { x: FX,       y: H - FY, corner: true  },   // BL
  { x: W / 2,    y: H - FY, corner: false },   // BM  ← bottom middle
  { x: W - FX,   y: H - FY, corner: true  },   // BR
];

// Realistic pool cushion: ~0.75 restitution (rubber absorbs ~25% energy per bounce)
const WALL  = { isStatic: true, restitution: 0.75, friction: 0.0, label: 'wall' };

// Realistic felt friction: balls travel ~2/3 table on a hard shot and stop naturally
// frictionAir 0.018 = felt rolling resistance coefficient ~0.01 scaled to canvas speed
const BOPT  = { 
  restitution: 0.99,   // ball-to-ball: barely any energy loss, nearly perfect elastic
  friction: 0,         // zero friction between balls eliminates 'throw' effect
  frictionStatic: 0,
  frictionAir: 0.013,  // REDUZIDO (era 0.018): pano um pouco mais rápido, rolam mais suaves
  density: 0.0012,     // heavier balls = more momentum, more realistic spread
  label: 'ball' 
};

/* ─────────────────────────────────────────────────────────────
   BALL DATASET  (1–15 + cue)
───────────────────────────────────────────────────────────── */
const BALL_DATA = [
  null,                                                 // idx 0 = cue
  { n:1,  c:'#f5c518', s:false },
  { n:2,  c:'#1040e0', s:false },
  { n:3,  c:'#e01010', s:false },
  { n:4,  c:'#8b1a8b', s:false },
  { n:5,  c:'#ff6a00', s:false },
  { n:6,  c:'#147a14', s:false },
  { n:7,  c:'#9b1010', s:false },
  { n:8,  c:'#111111', s:false },
  { n:9,  c:'#f5c518', s:true  },
  { n:10, c:'#1040e0', s:true  },
  { n:11, c:'#e01010', s:true  },
  { n:12, c:'#8b1a8b', s:true  },
  { n:13, c:'#ff6a00', s:true  },
  { n:14, c:'#147a14', s:true  },
  { n:15, c:'#9b1010', s:true  },
];
const RACK_ORDER = [1,9,2,10,8,3,11,4,12,13,5,14,6,15,7];

/* ═══════════════════════════════════════════════════════════ */
export function initGame(canvas, mode, onStateChange) {
  canvas.width  = W;
  canvas.height = H;

  const engine = Engine.create({ 
    gravity: { x:0, y:0 }, 
    enableSleeping:false 
  });
  const world  = engine.world;
  const ctx    = canvas.getContext('2d');
  let   animId;
  let   framesSinceShoot = -1;

  const myRole = mode === 'online' ? (peerManager.isHost ? 'Player 1' : 'Player 2') : null;

  if (mode === 'online') {
    peerManager.onData = (data) => {
      if (data.type === 'aim') {
        gs.aimStart = data.aimStart;
        gs.aimCur = data.aimCur;
        gs.isAiming = data.isAiming;
        gs.powerPct = data.powerPct;
        if (data.cuePos && gs.cueBallInHand) {
          moveCueBall(data.cuePos.x, data.cuePos.y);
        }
      } else if (data.type === 'shoot') {
        shoot(data.dx, data.dy, data.power);
      } else if (data.type === 'sync' && !peerManager.isHost) {
        // Apply Host state
        data.balls.forEach(db => {
          const b = gs.balls.find(lb => lb.id === db.id);
          if (b) {
            Body.setPosition(b, db.pos);
            Body.setVelocity(b, {x:0, y:0});
            Body.setAngularVelocity(b, 0);
          }
        });
        gs.turn = data.turn;
        gs.message = data.message;
        gs.winner = data.winner;
        gs.p1Type = data.p1Type;
        gs.p2Type = data.p2Type;
        gs.p1Potted = data.p1Potted;
        gs.p2Potted = data.p2Potted;
        gs.p1PottedBalls = data.p1PottedBalls || [];
        gs.p2PottedBalls = data.p2PottedBalls || [];
        gs.cueBallInHand = data.cueBallInHand;
        onStateChange(snap());
      }
    };
  }

  /* ══════════════════════════════════════════════════════════
     MOTOR DE SOM — modelo físico PCM (oscilador harmônico amortecido)
     Sem arquivos externos. Buffers gerados como esferas de resina
     fenólica reais: ataque instantâneo, decay ultra-rápido, frequências
     medidas em bolas de sinuca padrão (57 mm / 170 g).
  ══════════════════════════════════════════════════════════ */
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const sr = audioCtx.sampleRate;

  // Saída master com leve compressão para evitar clipping no break
  const masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.82;
  const masterComp = audioCtx.createDynamicsCompressor();
  masterComp.threshold.value = -8;
  masterComp.knee.value      = 4;
  masterComp.ratio.value     = 5;
  masterComp.attack.value    = 0.0005;
  masterComp.release.value   = 0.08;
  masterGain.connect(masterComp);
  masterComp.connect(audioCtx.destination);

  function resume() { if (audioCtx.state === 'suspended') audioCtx.resume(); }

  /* ─── Gera buffer PCM com modelo físico ───────────────────
     Oscilador harmônico amortecido:
       x(t) = A · e^(-γt) · [ Σ aₙ·sin(2π·fₙ·t) ] + ε(t)·e^(-δt)
     onde ε(t) é ruído de textura (microfissuras na superfície)     */
  function genPCM(durationSec, partials, noiseMix, noiseDecay) {
    const n   = Math.ceil(sr * durationSec);
    const buf = audioCtx.createBuffer(1, n, sr);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let s = 0;
      for (const [freq, amp, decay] of partials) {
        s += amp * Math.exp(-decay * t) * Math.sin(2 * Math.PI * freq * t);
      }
      // Ruído de textura (crack de superfície) — decai muito rápido
      s += (Math.random() * 2 - 1) * noiseMix * Math.exp(-noiseDecay * t);
      d[i] = s;
    }
    return buf;
  }

  /* ─── Bola × Bola ─────────────────────────────────────────
     Resina fenólica, diâmetro 57mm. Frequências reais medidas:
     modo fundamental ~3800 Hz, 2° ~6200 Hz, 3° ~9500 Hz.
     Tempo de contato Hertziano: ~1-2 ms → decay γ ≈ 300-400/s    */
  const BALL_HIT_BUFS = Array.from({ length: 6 }, (_, k) => {
    const pitch = 0.92 + k * 0.03; // leve variação entre buffers
    return genPCM(
      0.014,
      [
        [3800 * pitch,  0.55, 340],
        [6200 * pitch,  0.28, 480],
        [9500 * pitch,  0.14, 620],
        [12800 * pitch, 0.07, 800],
      ],
      0.18,   // ruído de textura (click seco)
      1200    // decay do ruído muito rápido — imperceptível depois de 1ms
    );
  });
  let _ballHitIdx = 0;

  /* ─── Bola × Tabela (borracha/trilho) ────────────────────
     Borracha sintética: amortece altas freq, ressoa em médios-baixos.
     Contato mais longo (~15ms) → decay mais lento                  */
  const RAIL_HIT_BUF = genPCM(
    0.028,
    [
      [820,  0.50, 95],
      [1640, 0.30, 140],
      [2700, 0.15, 220],
      [400,  0.25, 60],
    ],
    0.30,
    350
  );

  /* ─── Bola caindo na caçapa ──────────────────────────────
     3 fases sobrepostas no mesmo buffer:
     (1) Impacto inicial no couro/borracha da borda
     (2) Componente oca da caçapa (caixa ressonante ~130 Hz)
     (3) Rolamento e deslizamento                              */
  const POCKET_BUF = (() => {
    const dur = 0.55;
    const n   = Math.ceil(sr * dur);
    const buf = audioCtx.createBuffer(1, n, sr);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / sr;

      // (1) Impacto na borda — click médio
      const impact = (Math.random() * 2 - 1) * 0.8 * Math.exp(-90 * t)
        + Math.sin(2 * Math.PI * 1100 * t) * 0.35 * Math.exp(-160 * t);

      // (2) Ressonância oca da caçapa — grave decrescente
      const hollow =
          Math.sin(2 * Math.PI * 128 * t) * 0.55 * Math.exp(-7 * t)
        + Math.sin(2 * Math.PI * 256 * t) * 0.22 * Math.exp(-12 * t);

      // (3) Rolamento (começa 30ms depois)
      const rollT  = Math.max(0, t - 0.03);
      const rollEnv = rollT * Math.exp(-10 * rollT);
      const roll    = (Math.random() * 2 - 1) * rollEnv * 0.28;

      d[i] = impact + hollow + roll;
    }
    return buf;
  })();

  /* ─── Tacada: taco × bola branca ─────────────────────────
     O taco (fibra de vidro / madeira) tem crack agudo (5-8 kHz)
     + transfere energia para a bola (componente em 3-4 kHz).
     Mais curto que colisão bola-bola (tip de couro amortece) */
  const CUE_STRIKE_BUF = genPCM(
    0.018,
    [
      [5200, 0.55, 520],
      [3100, 0.38, 280],
      [7800, 0.18, 700],
      [1400, 0.25, 160],
    ],
    0.45,
    900
  );

  /* ─── Reprodução com pitch shift ─────────────────────────── */
  function playBuf(buf, vol, pitch) {
    try {
      resume();
      const src = audioCtx.createBufferSource();
      src.buffer        = buf;
      src.playbackRate.value = pitch;
      const g = audioCtx.createGain();
      g.gain.value = Math.max(0, Math.min(2, vol));
      src.connect(g);
      g.connect(masterGain);
      src.start();
    } catch (_) {}
  }

  // Colisão bola × bola
  function playBallHit(force) {
    const vol   = Math.pow(Math.min(force, 1), 0.6) * 1.1;
    // Rotação entre os 6 buffers + pitch aleatório → sem repetição perceptível
    const buf   = BALL_HIT_BUFS[_ballHitIdx++ % BALL_HIT_BUFS.length];
    const pitch = 0.82 + Math.random() * 0.36;
    playBuf(buf, vol, pitch);
  }

  // Bola × tabela
  function playRailHit(force) {
    const vol   = Math.pow(Math.min(force, 1), 0.7) * 0.75;
    const pitch = 0.75 + Math.random() * 0.50;
    playBuf(RAIL_HIT_BUF, vol, pitch);
  }

  // Caçapa
  function playPocket() {
    playBuf(POCKET_BUF, 0.95, 0.88 + Math.random() * 0.24);
  }

  // Tacada
  function playCueStrike(power) {
    const vol   = Math.pow(Math.min(power, 1), 0.5) * 1.0;
    const pitch = 0.78 + power * 0.44;
    playBuf(CUE_STRIKE_BUF, vol, pitch);
  }

  /* ─── Dispatcher de colisões ─────────────────────────────── */
  let _lastClackTime = 0;
  Events.on(engine, 'collisionStart', ev => {
    ev.pairs.forEach(p => {
      if (p.bodyA.label === 'ball' && p.bodyB.label === 'ball') {
        const dv    = Math.hypot(
          p.bodyA.velocity.x - p.bodyB.velocity.x,
          p.bodyA.velocity.y - p.bodyB.velocity.y
        );
        const force = Math.min(1, dv / 10);
        const now   = audioCtx.currentTime;
        // Throttle 35ms — evita saturar no break com 15 bolas ao mesmo tempo
        if (force > 0.03 && now - _lastClackTime > 0.035) {
          _lastClackTime = now;
          playBallHit(force);
        }
      }
      if (
        (p.bodyA.label === 'ball' || p.bodyB.label === 'ball') &&
        (p.bodyA.label === 'wall' || p.bodyB.label === 'wall')
      ) {
        const b     = p.bodyA.label === 'ball' ? p.bodyA : p.bodyB;
        const force = Math.min(1, b.speed / 10);
        if (force > 0.07) playRailHit(force);
      }
    });
  });

  /* ── build physics walls (trapezoids matching the visual angled cushions) ── */
  // Já definidos no topo: JAW, CD, PC, PM

  const mkCush = (pts, label='wall') => {
    // Manually calculate centroid to ensure perfect positioning without poly-decomp dependency
    let cx = 0, cy = 0;
    pts.forEach(p => { cx += p.x; cy += p.y; });
    cx /= pts.length; cy /= pts.length;
    
    // Shift points to be relative to centroid for Bodies.fromVertices
    const relPts = pts.map(p => ({ x: p.x - cx, y: p.y - cy }));
    return Bodies.fromVertices(cx, cy, [relPts], { ...WALL, label });
  };

  const topL = mkCush([{x: FX + PC, y: FY}, {x: W/2 - PM, y: FY}, {x: W/2 - PM - JAW, y: FY + CD}, {x: FX + PC + JAW, y: FY + CD}]);
  const topR = mkCush([{x: W/2 + PM, y: FY}, {x: W - FX - PC, y: FY}, {x: W - FX - PC - JAW, y: FY + CD}, {x: W/2 + PM + JAW, y: FY + CD}]);
  const botL = mkCush([{x: FX + PC, y: H - FY}, {x: W/2 - PM, y: H - FY}, {x: W/2 - PM - JAW, y: H - FY - CD}, {x: FX + PC + JAW, y: H - FY - CD}]);
  const botR = mkCush([{x: W/2 + PM, y: H - FY}, {x: W - FX - PC, y: H - FY}, {x: W - FX - PC - JAW, y: H - FY - CD}, {x: W/2 + PM + JAW, y: H - FY - CD}]);
  const lCush = mkCush([{x: FX, y: FY + PC}, {x: FX, y: H - FY - PC}, {x: FX + CD, y: H - FY - PC - JAW}, {x: FX + CD, y: FY + PC + JAW}]);
  const rCush = mkCush([{x: W - FX, y: FY + PC}, {x: W - FX, y: H - FY - PC}, {x: W - FX - CD, y: H - FY - PC - JAW}, {x: W - FX - CD, y: FY + PC + JAW}]);

  // Outer safety boundaries to prevent any ball from gliding "outside" the wood
  const outT = Bodies.rectangle(W/2, -50, W+200, 100, { isStatic:true, label:'out' });
  const outB = Bodies.rectangle(W/2, H+50, W+200, 100, { isStatic:true, label:'out' });
  const outL = Bodies.rectangle(-50, H/2, 100, H+200, { isStatic:true, label:'out' });
  const outR = Bodies.rectangle(W+50, H/2, 100, H+200, { isStatic:true, label:'out' });

  World.add(world, [topL, topR, botL, botR, lCush, rCush, outT, outB, outL, outR]);

  /* pocket sensors — posicionados rigorosamente DENTRO dos buracos
     garantindo que bolas passando reta pela tabela não sejam "sugadas". */
  const INSET_CORNER = PR + 2; 
  const INSET_MID = PR + 4;
  
  const pocketBodies = POCKETS.map((p, i) => {
    let px = p.x;
    let py = p.y;
    // Empurra os sensores para FORA da área de jogo, para dentro dos buracos
    if (i === 0) { px -= INSET_CORNER; py -= INSET_CORNER; } // TL
    if (i === 1) { py -= INSET_MID; }                        // TM
    if (i === 2) { px += INSET_CORNER; py -= INSET_CORNER; } // TR
    if (i === 3) { px -= INSET_CORNER; py += INSET_CORNER; } // BL
    if (i === 4) { py += INSET_MID; }                        // BM
    if (i === 5) { px += INSET_CORNER; py += INSET_CORNER; } // BR

    // O raio do sensor é reduzido para garantir que a bola tenha que "entrar" 
    // um pouco na caçapa antes da queda ser validada
    const r = p.corner ? PR - 4 : PR - 6;
    return Bodies.circle(px, py, r, { isSensor: true, isStatic: true, label: 'pocket', pocketIndex: i, isCorner: p.corner });
  });
  World.add(world, pocketBodies);

  /* ── game state ─────────────────────────────────────────── */
  const gs = {
    turn:'Player 1', message:'Break!',
    p1Type:null, p2Type:null,
    winner:null,
    balls:[], cueBall:null,
    isAiming:false, aimStart:null, aimCur:null,
    turnState:'idle',
    mode,
    fallingBalls:[], pottedThisTurn:[],
    powerPct:0,
    p1Potted:0, p2Potted:0,
    p1PottedBalls:[], p2PottedBalls:[],
    cueBallInHand:false, draggingCue:false,
    settleFrames:0, shotsTaken:0,
    debug: true, // Enable physics debug visualization
  };

  function snap() {
    return {
      turn:gs.turn, message:gs.message,
      p1Type: gs.p1Type ? (gs.p1Type==='solid'?'SOLIDS':'STRIPES') : null,
      p2Type: gs.p2Type ? (gs.p2Type==='solid'?'SOLIDS':'STRIPES') : null,
      winner:gs.winner, powerPct:gs.powerPct,
      p1Potted:gs.p1Potted, p2Potted:gs.p2Potted,
      p1PottedBalls:[...gs.p1PottedBalls],
      p2PottedBalls:[...gs.p2PottedBalls],
    };
  }

  /* ── balls ─────────────────────────────────────────────── */
  function mkBall(x, y, type, color, number, isStripe) {
    const b = Bodies.circle(x, y, BALL_R, {
      ...BOPT, label:'ball',
      ballType:type, ballColor:color, ballNumber:number, isStripe,
    }, 128); // 128 lados para garantir que seja um círculo quase perfeito!
    
    // Explicitly set non-static and non-sleeping
    Body.setStatic(b, false);
    b.isSleeping = false;
    
    // 3D orientation vectors
    const yaw = Math.random() * Math.PI * 2;
    const pitch = Math.random() * Math.PI * 2;
    b.up      = { x: Math.sin(pitch)*Math.cos(yaw), y: Math.sin(pitch)*Math.sin(yaw), z: Math.cos(pitch) };
    b.right   = { x: -Math.sin(yaw), y: Math.cos(yaw), z: 0 };
    b.forward = { x: -Math.cos(pitch)*Math.cos(yaw), y: -Math.cos(pitch)*Math.sin(yaw), z: Math.sin(pitch) };

    gs.balls.push(b);
    World.add(world, b); // Add immediately to world
    return b;
  }

  // Create Cue Ball
  gs.cueBall = mkBall(W * 0.25, H / 2, 'cue', '#f2f0e0', 0, false);

  // Rack formation
  const rackX = W * 0.68;
  const sp    = BALL_R * 2 + 0.4;
  let bi = 0;
  for (let col = 0; col < 5; col++) {
    for (let row = 0; row <= col; row++) {
      const rx = rackX + col * sp * 0.866;
      const ry = H/2 - col*sp/2 + row*sp;
      const d  = BALL_DATA[RACK_ORDER[bi]];
      if (d) {
        mkBall(rx, ry, d.s ? 'stripe' : 'solid', d.c, d.n, d.s);
        bi++;
      }
    }
  }

  console.log(`[PHYSICS] Initialized with ${gs.balls.length} balls and ${Composite.allBodies(world).length} bodies in world.`);
  onStateChange(snap());

  /* ── canvas coordinate helper ───────────────────────────── */
  function toCanvas(e) {
    const r  = canvas.getBoundingClientRect();
    const sx = W / r.width;
    const sy = H / r.height;
    return { x:(e.clientX - r.left)*sx, y:(e.clientY - r.top)*sy };
  }

  /* ── input ─────────────────────────────────────────────── */
  function onMouseDown(e) {
    if (gs.winner || gs.turnState !== 'idle') return;
    if (mode === 'pve' && gs.turn === 'AI') return;
    if (mode === 'online' && gs.turn !== myRole) return;
    
    const p = toCanvas(e);
    
    // Check if clicking near cue ball for dragging
    const distToCue = Math.hypot(p.x - gs.cueBall.position.x, p.y - gs.cueBall.position.y);
    if (gs.cueBallInHand && distToCue < BALL_R * 2) { 
      gs.draggingCue = true; 
      moveCueBall(p.x, p.y); 
      return; 
    }
    
    gs.isAiming = true;
    gs.aimStart = p;
    gs.aimCur   = p;
    
    if (mode === 'online') {
      peerManager.send({
        type: 'aim',
        isAiming: gs.isAiming,
        aimStart: gs.aimStart,
        aimCur: gs.aimCur,
        powerPct: gs.powerPct,
        cuePos: gs.draggingCue ? gs.cueBall.position : null,
      });
    }

    onStateChange(snap());
  }

  function onMouseMove(e) {
    if (mode === 'online' && gs.turn !== myRole) return;
    const p = toCanvas(e);
    if (gs.draggingCue) { 
      moveCueBall(p.x, p.y); 
      onStateChange(snap());
      return; 
    }
    gs.aimCur = p;
    const dx = gs.aimStart.x - p.x;
    const dy = gs.aimStart.y - p.y;
    gs.powerPct = Math.min(Math.hypot(dx, dy) / 160, 1);
    
    if (mode === 'online') {
      peerManager.send({
        type: 'aim',
        isAiming: gs.isAiming,
        aimStart: gs.aimStart,
        aimCur: gs.aimCur,
        powerPct: gs.powerPct,
        cuePos: gs.draggingCue ? gs.cueBall.position : null,
      });
    }

    onStateChange(snap());
  }

  function onMouseUp(e) {
    if (mode === 'online' && gs.turn !== myRole) return;
    if (gs.draggingCue) { 
      gs.draggingCue = false; 
      gs.cueBallInHand = false; 
      onStateChange(snap());
      return; 
    }
    if (!gs.isAiming) return;
    
    gs.isAiming = false;
    const dx = gs.aimStart.x - gs.aimCur.x;
    const dy = gs.aimStart.y - gs.aimCur.y;
    const power = gs.powerPct;
    gs.powerPct = 0;
    
    if (Math.hypot(dx, dy) > 5) {
      if (mode === 'online') {
        peerManager.send({ type: 'shoot', dx, dy, power });
      }
      shoot(dx, dy, power);
    } else {
      if (mode === 'online') {
        peerManager.send({
          type: 'aim',
          isAiming: false,
          aimStart: null, aimCur: null, powerPct: 0
        });
      }
    }
    onStateChange(snap());
  }

  // Use window for all to ensure capture during drags off canvas
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup',   onMouseUp);

  function moveCueBall(x, y) {
    x = Math.max(FX + BALL_R + 4, Math.min(W - FX - BALL_R - 4, x));
    y = Math.max(FY + BALL_R + 4, Math.min(H - FY - BALL_R - 4, y));
    Body.setPosition(gs.cueBall, { x, y });
    Body.setVelocity(gs.cueBall,  { x:0, y:0 });
  }

  /* ── shoot ─────────────────────────────────────────────── */
  function shoot(dx, dy, forcedPower = null) {
    const dist  = Math.hypot(dx, dy);
    const power = forcedPower !== null ? forcedPower : Math.min(dist / 160, 1);
    const angle = Math.atan2(dy, dx);

    // Force wake all balls
    gs.balls.forEach(b => {
      Body.setStatic(b, false);
      b.isSleeping = false;
    });

    // Som da tacada — taco batendo na bola branca
    playCueStrike(power);

    // Max ~22 px/frame feels like a professional-force break on this canvas scale
    // A pro break sends the cue ball ~2-3 table lengths — calibrated here
    const velVal = power * 22;
    Body.setVelocity(gs.cueBall, { 
      x: Math.cos(angle) * velVal, 
      y: Math.sin(angle) * velVal 
    });
    
    gs.turnState      = 'moving';
    gs.message        = 'Rolling…';
    gs.pottedThisTurn = [];
    gs.settleFrames   = 0;
    gs.shotsTaken++;
    framesSinceShoot  = 0; // Trigger diagnostics
    onStateChange(snap());
  }

  /* ── pocket collisions ──────────────────────────────────── */
  Events.on(engine, 'collisionStart', ev => {
    ev.pairs.forEach(({ bodyA, bodyB }) => {
      let pocketBody = null, ball = null;
      if ((bodyA.label === 'pocket' || bodyA.label === 'out') && bodyB.label === 'ball') {
        pocketBody = bodyA; ball = bodyB;
      } else if ((bodyB.label === 'pocket' || bodyB.label === 'out') && bodyA.label === 'ball') {
        pocketBody = bodyB; ball = bodyA;
      }
      if (!pocketBody || !ball) return;

      const pi = pocketBody.pocketIndex || 0;

      // Caçapas do meio: exige apenas que a bola NÃO esteja saindo da caçapa.
      // Qualquer bola que entre (vy<0 p/ top, vy>0 p/ bottom) é capturada.
      // A verificação de direção é mínima para não bloquear ângulos válidos.
      if (pi === 1 || pi === 4) {
        const vy = ball.velocity.y;
        const speed = Math.hypot(ball.velocity.x, vy);
        if (speed > 0.5) {
          const perpComponent = (pi === 1) ? -vy : vy;
          if (perpComponent < -0.1) return; // saindo da caçapa — ignorar
        }
      }

      trigPocket(ball, pi);
    });
  });

  function trigPocket(ball, pi) {
    // Evita processar a mesma bola duas vezes (ex: bola branca que já saiu)
    if (gs.fallingBalls.find(f => f.id===ball.id)) return;
    if (!gs.balls.find(b => b.id===ball.id)) return; // já foi removida
    Composite.remove(world, ball);
    gs.balls = gs.balls.filter(b => b.id !== ball.id);
    gs.fallingBalls.push({
      id:ball.id, position:{...ball.position}, angle: ball.angle || 0,
      ballColor:ball.ballColor, ballType:ball.ballType,
      ballNumber:ball.ballNumber, isStripe:ball.isStripe,
      up: ball.up ? {...ball.up} : undefined,
      right: ball.right ? {...ball.right} : undefined,
      forward: ball.forward ? {...ball.forward} : undefined,
      scale:1, vx:ball.velocity.x*0.2, vy:ball.velocity.y*0.2,
    });
    gs.pottedThisTurn.push({ ballType:ball.ballType, ballNumber:ball.ballNumber });
    playPocket();
  }

  /* ── game loop ──────────────────────────────────────────── */
  Events.on(engine, 'beforeUpdate', () => {
    gs.fallingBalls.forEach(f => {
      f.scale = Math.max(0, f.scale - 0.05);
      f.position.x += f.vx;
      f.position.y += f.vy;
    });
    gs.fallingBalls = gs.fallingBalls.filter(f => f.scale > 0);

    /* --- Physics Movement Control --- */
    gs.balls.forEach(b => {
      const spd = b.speed;
      
      // Hard stop at EXTREMELY low speed — eliminates imperceptible creeping
      // 0.03 px/frame is virtually undetectable. 0.35 was causing sudden artificial freezing.
      if (spd > 0 && spd < 0.03) {
        Body.setVelocity(b, { x: 0, y: 0 });
        Body.setAngularVelocity(b, 0);
      }

      // Update 3D rotation ONLY if moving significantly
      if (spd > 0.05) {
        if (b.lastRotPos) {
          const pdx = b.position.x - b.lastRotPos.x;
          const pdy = b.position.y - b.lastRotPos.y;
          const pdist = Math.hypot(pdx, pdy);
          if (pdist > 0.01) {
            const rotAng = pdist / BALL_R;
            const axis   = { x: -pdy/pdist, y: pdx/pdist };
            const cos = Math.cos(rotAng), sin = Math.sin(rotAng);
            
            [b.up, b.right, b.forward].forEach(v => {
              if (!v) return;
              const dot = v.x*axis.x + v.y*axis.y;
              const cross = { x:-v.z*axis.y, y:v.z*axis.x, z:v.x*axis.y - v.y*axis.x };
              const vx=v.x, vy=v.y, vz=v.z;
              v.x = vx*cos + cross.x*sin + axis.x*dot*(1-cos);
              v.y = vy*cos + cross.y*sin + axis.y*dot*(1-cos);
              v.z = vz*cos + cross.z*sin;
            });
          }
        }
        b.lastRotPos = { ...b.position };
      }
    });

    if (gs.turnState === 'moving') {
      gs.settleFrames++;
      
      if (gs.settleFrames > 20) {
        const stillMoving = gs.balls.some(b => b.speed > 0.35);
        if (!stillMoving && gs.fallingBalls.length === 0) {
          if (gs.settleFrames > 60) endTurn();
        }
      }
    }
  });

  /* ── turn end ────────────────────────────────────────────── */
  function endTurn() {
    if (gs.turnState !== 'moving') return;
    gs.turnState = 'idle';

    const other = gs.turn==='Player 1' ? (mode==='pve'?'AI':'Player 2') : 'Player 1';
    let keepTurn=false, scratch=false;

    for (const p of gs.pottedThisTurn) {
      if (p.ballType === 'cue') {
        scratch = true;
      } else {
        if (!gs.p1Type) {
          if (gs.turn==='Player 1') { gs.p1Type=p.ballType; gs.p2Type=p.ballType==='solid'?'stripe':'solid'; }
          else                       { gs.p2Type=p.ballType; gs.p1Type=p.ballType==='solid'?'stripe':'solid'; }
          keepTurn = true;
        } else {
          const mine = gs.turn==='Player 1' ? gs.p1Type : gs.p2Type;
          if (p.ballType === mine) keepTurn = true;
        }
        if (p.ballType === gs.p1Type) {
          gs.p1Potted++;
          gs.p1PottedBalls.push(p.ballNumber);
        } else if (p.ballType === gs.p2Type) {
          gs.p2Potted++;
          gs.p2PottedBalls.push(p.ballNumber);
        }
      }
    }
    gs.pottedThisTurn = [];

    if (gs.p1Type && gs.p2Type) {
      const p1Won = !gs.balls.some(b => b.ballType === gs.p1Type && b.label === 'ball');
      const p2Won = !gs.balls.some(b => b.ballType === gs.p2Type && b.label === 'ball');

      if (p1Won && p2Won) {
        const winner = gs.turn === 'Player 1' ? (scratch ? 'Player 2' : 'Player 1') : (scratch ? 'Player 1' : 'Player 2');
        gs.message = `Todas as bolas encaçapadas! Vitória de ${winner}!`;
        finish(winner);
        return;
      } else if (p1Won) {
        gs.message = `Parabéns! Player 1 encaçapou todas as bolas. Vitória!`;
        finish('Player 1');
        return;
      } else if (p2Won) {
        const titleOther = mode === 'pve' ? 'AI' : 'Player 2';
        gs.message = `Parabéns! ${titleOther} encaçapou todas as bolas. Vitória!`;
        finish(titleOther);
        return;
      }
    }

    if (scratch) {
      placeCueBall(W * 0.25, H / 2);
      gs.cueBallInHand = false;
      gs.turn    = other;
      gs.message = `Falta! A bola branca caiu. Vez de ${other}.`;
    } else if (keepTurn) {
      gs.message = `Bola encaçapada! Jogue novamente.`;
    } else {
      gs.turn    = other;
      gs.message = `Vez de ${other}`;
    }

    onStateChange(snap());

    if (mode === 'online' && peerManager.isHost) {
      peerManager.send({
        type: 'sync',
        balls: gs.balls.map(b => ({ id: b.id, pos: { x: b.position.x, y: b.position.y } })),
        turn: gs.turn,
        message: gs.message,
        winner: gs.winner,
        p1Type: gs.p1Type,
        p2Type: gs.p2Type,
        p1Potted: gs.p1Potted,
        p2Potted: gs.p2Potted,
        p1PottedBalls: gs.p1PottedBalls,
        p2PottedBalls: gs.p2PottedBalls,
        cueBallInHand: gs.cueBallInHand
      });
    }

    if (mode==='pve' && gs.turn==='AI' && !gs.winner) setTimeout(aiShoot, 1200);
  }

  function placeCueBall(x, y) {
    Composite.remove(world, gs.cueBall);
    gs.balls = gs.balls.filter(b => b.id !== gs.cueBall.id);
    Body.setPosition(gs.cueBall, {x, y});
    Body.setVelocity(gs.cueBall, {x:0, y:0});
    Body.setAngularVelocity(gs.cueBall, 0);
    Body.setAngle(gs.cueBall, 0);
    gs.balls.push(gs.cueBall);
    Composite.add(world, gs.cueBall);
  }

  function aiShoot() {
    if (gs.winner) return;
    gs.message = 'Bot is thinking...';
    onStateChange(snap());

    const suit = gs.p2Type;
    const targets = gs.balls.filter(b => b.ballType !== 'cue' && (!suit || b.ballType === suit));
    if (targets.length === 0) return;

    let bestShot = null;
    let maxQuality = -1;

    targets.forEach(ball => {
      POCKETS.forEach(poc => {
        const dx = poc.x - ball.position.x;
        const dy = poc.y - ball.position.y;
        const distToPocket = Math.hypot(dx, dy);
        const angleToPocket = Math.atan2(dy, dx);

        const impactX = ball.position.x - Math.cos(angleToPocket) * (BALL_R * 2);
        const impactY = ball.position.y - Math.sin(angleToPocket) * (BALL_R * 2);

        const cueDx = impactX - gs.cueBall.position.x;
        const cueDy = impactY - gs.cueBall.position.y;
        const distToImpact = Math.hypot(cueDx, cueDy);
        const angleToImpact = Math.atan2(cueDy, cueDx);

        const dot = (Math.cos(angleToPocket) * Math.cos(angleToImpact)) + (Math.sin(angleToPocket) * Math.sin(angleToImpact));
        if (dot > 0.5) {
          const quality = dot / distToImpact;
          if (quality > maxQuality) {
            maxQuality = quality;
            bestShot = { angle: angleToImpact, dist: distToImpact, pull: Math.min(60 + distToImpact/5, 120) };
          }
        }
      });
    });

    if (!bestShot) {
      const t = targets[Math.floor(Math.random()*targets.length)];
      const ang = Math.atan2(t.position.y - gs.cueBall.position.y, t.position.x - gs.cueBall.position.x);
      bestShot = { angle: ang, pull: 80 };
    }

    gs.isAiming = true;
    gs.aimStart = { x: gs.cueBall.position.x, y: gs.cueBall.position.y };
    gs.aimCur   = { x: gs.cueBall.position.x, y: gs.cueBall.position.y };
    
    let currentPull = 0;
    const aimInterval = setInterval(() => {
      if (gs.winner || gs.turnState !== 'idle') { clearInterval(aimInterval); gs.isAiming = false; return; }
      currentPull += 4;
      gs.aimCur.x = gs.cueBall.position.x - Math.cos(bestShot.angle) * currentPull;
      gs.aimCur.y = gs.cueBall.position.y - Math.sin(bestShot.angle) * currentPull;
      gs.powerPct = Math.min(currentPull / 160, 1);
      onStateChange(snap());

      if (currentPull >= bestShot.pull) {
        clearInterval(aimInterval);
        gs.isAiming = false;
        gs.powerPct = 0;
        const sDx = gs.aimStart.x - gs.aimCur.x;
        const sDy = gs.aimStart.y - gs.aimCur.y;
        shoot(sDx, sDy);
      }
    }, 25);
  }

  function finish(winner) {
    gs.winner  = winner;
    gs.message = 'Game Over!';
    onStateChange(snap());
    confetti({ particleCount:180, spread:110, origin:{y:0.6} });
  }

  /* ════════════════════════════════════════════════════════
     RENDERING
  ════════════════════════════════════════════════════════ */

  /* ── table ─────────────────────────────────────────────── */
  function drawTable() {
    // ─── 1. Void background ───────────────────────────────
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, W, H);

    // ─── 2. RAIL — deep burgundy red ─────────────────────
    ctx.save();
    roundRect(ctx, 0, 0, W, H, 10); ctx.clip();

    // Base rail colour
    const railBase = ctx.createLinearGradient(0, 0, 0, H);
    railBase.addColorStop(0,    '#6b1010');
    railBase.addColorStop(0.12, '#8c1c1c');
    railBase.addColorStop(0.5,  '#7a1616');
    railBase.addColorStop(0.88, '#8c1c1c');
    railBase.addColorStop(1,    '#4e0c0c');
    ctx.fillStyle = railBase;
    ctx.fillRect(0, 0, W, H);

    // Top rail horizontal grain lines
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, FY); ctx.clip();
    for (let y = 2; y < FY; y += 3) {
      ctx.strokeStyle = `rgba(0,0,0,${0.05 + 0.04 * Math.sin(y * 0.4)})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.restore();

    // Bottom rail horizontal grain
    ctx.save();
    ctx.beginPath(); ctx.rect(0, H - FY, W, FY); ctx.clip();
    for (let y = H - FY; y < H; y += 3) {
      ctx.strokeStyle = `rgba(0,0,0,${0.05 + 0.04 * Math.sin(y * 0.4)})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.restore();

    // Left / Right rail vertical grain
    ctx.save();
    ctx.beginPath(); ctx.rect(0, FY, FX, FH); ctx.clip();
    ctx.beginPath(); ctx.rect(FX + FW, FY, FX, FH); ctx.clip();
    for (let x = 2; x < FX; x += 3) {
      ctx.strokeStyle = `rgba(0,0,0,${0.05 + 0.04 * Math.sin(x * 0.4)})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(x, FY); ctx.lineTo(x, FY + FH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W - x, FY); ctx.lineTo(W - x, FY + FH); ctx.stroke();
    }
    ctx.restore();

    // Overhead lamp highlight on top rail
    const topSheen = ctx.createLinearGradient(W/2, 0, W/2, FY);
    topSheen.addColorStop(0,   'rgba(255,180,180,0.12)');
    topSheen.addColorStop(1,   'rgba(255,180,180,0)');
    ctx.fillStyle = topSheen; ctx.fillRect(0, 0, W, FY);

    ctx.restore(); // end rail clip

    // Outer bevel (thin gold line)
    ctx.strokeStyle = 'rgba(220,120,120,0.55)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, 1, 1, W-2, H-2, 10); ctx.stroke();

    // Inner shadow (felt sits lower than rail)
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = 3;
    ctx.strokeRect(FX - 2, FY - 2, FW + 4, FH + 4);

    // ─── 3. BLUE FELT ────────────────────────────────────
    // Classic light sky-blue pool cloth (Simonis 760 blue)
    const felt = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(FW,FH) * 0.75);
    felt.addColorStop(0,    '#72c0d8');
    felt.addColorStop(0.45, '#5aaac4');
    felt.addColorStop(0.80, '#3e8ba8');
    felt.addColorStop(1,    '#276280');
    ctx.fillStyle = felt;
    ctx.fillRect(FX, FY, FW, FH);

    // Very subtle overhead lamp hotspot
    const lamp = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, FH * 0.6);
    lamp.addColorStop(0,   'rgba(255,255,255,0.06)');
    lamp.addColorStop(0.5, 'rgba(255,255,255,0.02)');
    lamp.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = lamp; ctx.fillRect(FX, FY, FW, FH);

    // ─── 4. CUSHION SHADOW on felt edges ─────────────────
    ctx.save();
    ctx.beginPath(); ctx.rect(FX, FY, FW, FH); ctx.clip();
    const shW = 18;
    [
      { x:FX,        y:FY,        w:FW,  h:shW, gx:0,    gy:FY,    gx2:0,    gy2:FY+shW   },
      { x:FX,        y:FY+FH-shW, w:FW,  h:shW, gx:0,    gy:FY+FH, gx2:0,    gy2:FY+FH-shW },
      { x:FX,        y:FY,        w:shW, h:FH,  gx:FX,   gy:0,     gx2:FX+shW, gy2:0      },
      { x:FX+FW-shW, y:FY,        w:shW, h:FH,  gx:FX+FW,gy:0,     gx2:FX+FW-shW, gy2:0  },
    ].forEach(e => {
      const g = ctx.createLinearGradient(e.gx, e.gy, e.gx2, e.gy2);
      g.addColorStop(0, 'rgba(0,0,0,0.50)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(e.x, e.y, e.w, e.h);
    });
    ctx.restore();

    // ─── 5. TABLE MARKINGS ───────────────────────────────
    // Baulk / head string — solid white line (like the reference image)
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(W * 0.25, FY + 2); ctx.lineTo(W * 0.25, FY + FH - 2);
    ctx.stroke();

    // Head spot
    ctx.fillStyle = 'rgba(255,255,255,0.50)';
    ctx.beginPath(); ctx.arc(W * 0.25, H / 2, 3, 0, Math.PI * 2); ctx.fill();

    // Foot spot (small cross)
    const fx = W * 0.75, fy = H / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(fx-5, fy); ctx.lineTo(fx+5, fy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fx, fy-5); ctx.lineTo(fx, fy+5); ctx.stroke();

    // ─── 6. RUBBER CUSHIONS ─────────────────────────────
    // Slightly darker blue, clearly distinct from felt
    const drawCushion = (pts, gx0, gy0, gx1, gy1) => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();

      const cg = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      cg.addColorStop(0,    '#0e2e40');   // rail side — near black
      cg.addColorStop(0.28, '#1d5a78');   // dark rubber
      cg.addColorStop(0.58, '#2880a8');   // lighter face
      cg.addColorStop(0.82, '#1a5070');
      cg.addColorStop(1,    '#0e2a3c');   // felt side
      ctx.fillStyle = cg; ctx.fill();

      // Sheen on rubber face
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath(); ctx.clip();
      const sg = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      sg.addColorStop(0,    'rgba(255,255,255,0)');
      sg.addColorStop(0.45, 'rgba(255,255,255,0.11)');
      sg.addColorStop(0.65, 'rgba(255,255,255,0.04)');
      sg.addColorStop(1,    'rgba(255,255,255,0)');
      ctx.fillStyle = sg; ctx.fill();
      ctx.restore();

      // Bright edge line at rail top
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1; ctx.stroke();
    };

    drawCushion([{x:FX+PC,y:FY},{x:W/2-PM,y:FY},{x:W/2-PM-JAW,y:FY+CD},{x:FX+PC+JAW,y:FY+CD}],         0,FY,0,FY+CD);
    drawCushion([{x:W/2+PM,y:FY},{x:W-FX-PC,y:FY},{x:W-FX-PC-JAW,y:FY+CD},{x:W/2+PM+JAW,y:FY+CD}],     0,FY,0,FY+CD);
    drawCushion([{x:FX+PC,y:H-FY},{x:W/2-PM,y:H-FY},{x:W/2-PM-JAW,y:H-FY-CD},{x:FX+PC+JAW,y:H-FY-CD}],    0,H-FY,0,H-FY-CD);
    drawCushion([{x:W/2+PM,y:H-FY},{x:W-FX-PC,y:H-FY},{x:W-FX-PC-JAW,y:H-FY-CD},{x:W/2+PM+JAW,y:H-FY-CD}],0,H-FY,0,H-FY-CD);
    drawCushion([{x:FX,y:FY+PC},{x:FX,y:H-FY-PC},{x:FX+CD,y:H-FY-PC-JAW},{x:FX+CD,y:FY+PC+JAW}],           FX,0,FX+CD,0);
    drawCushion([{x:W-FX,y:FY+PC},{x:W-FX,y:H-FY-PC},{x:W-FX-CD,y:H-FY-PC-JAW},{x:W-FX-CD,y:FY+PC+JAW}],  W-FX,0,W-FX-CD,0);

    // ─── 7. DIAMOND SIGHTS ───────────────────────────────
    const drawDiamond = (x, y) => {
      ctx.save();
      ctx.translate(x, y); ctx.rotate(Math.PI / 4);
      const pg = ctx.createLinearGradient(-3,-3,3,3);
      pg.addColorStop(0,   '#f0e8c8');
      pg.addColorStop(0.5, '#c8a850');
      pg.addColorStop(1,   '#7a5820');
      ctx.fillStyle = pg;
      ctx.fillRect(-2.8, -2.8, 5.6, 5.6);
      ctx.restore();
      // Specular
      ctx.fillStyle = 'rgba(255,252,230,0.9)';
      ctx.beginPath(); ctx.arc(x-0.6, y-0.6, 0.9, 0, Math.PI*2); ctx.fill();
    };

    const rYt = FY * 0.44, rYb = H - FY * 0.44;
    const rXl = FX * 0.40, rXr = W - FX * 0.40;
    const qW = FW / 4, qH = FH / 4;
    for (let i = 1; i <= 3; i++) {
      drawDiamond(FX + qW * i, rYt);
      drawDiamond(FX + qW * i, rYb);
      drawDiamond(FX + FW/2 + qW * i, rYt);
      drawDiamond(FX + FW/2 + qW * i, rYb);
    }
    for (let i = 1; i <= 3; i++) {
      drawDiamond(rXl, FY + qH * i);
      drawDiamond(rXr, FY + qH * i);
    }

    // ─── 8. POCKET OPENINGS ─────────────────────────────
    POCKETS.forEach((p, idx) => {
      const isMid = (idx === 1 || idx === 4);
      const r = isMid ? PR - 1 : PR + 3;

      ctx.save();
      ctx.translate(p.x, p.y);

      // Determine outward angle and rotation
      let rot = 0;
      if (idx === 0) rot = -Math.PI * 0.75; // TL
      if (idx === 1) rot = -Math.PI * 0.5;  // TM
      if (idx === 2) rot = -Math.PI * 0.25; // TR
      if (idx === 3) rot = Math.PI * 0.75;  // BL
      if (idx === 4) rot = Math.PI * 0.5;   // BM
      if (idx === 5) rot = Math.PI * 0.25;  // BR
      ctx.rotate(rot);

      // Dark rubber outer collar (plastic liner)
      ctx.beginPath(); ctx.arc(0, 0, r + 4, 0, Math.PI*2);
      ctx.fillStyle = '#111317';
      ctx.fill();

      // Metallic rim (semi-circle on the outer side covering the wood)
      ctx.beginPath();
      ctx.arc(0, 0, r + 7, -Math.PI * 0.65, Math.PI * 0.65);
      const mg = ctx.createLinearGradient(-15, -15, 15, 15);
      mg.addColorStop(0, '#4a4a4a');
      mg.addColorStop(0.5, '#cecece');
      mg.addColorStop(1, '#2a2a2a');
      ctx.strokeStyle = mg;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Inner rim highlight
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, -Math.PI * 0.6, Math.PI * 0.6);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Pocket cut-out drop (void)
      // We offset the void slightly outward to give a 3D drop effect
      ctx.beginPath(); ctx.arc(1, 0, r, 0, Math.PI*2);
      ctx.fillStyle = '#050505';
      ctx.fill();
      
      // Subtle inner depth ring for absolute blackness
      ctx.beginPath(); ctx.arc(1, 0, r, 0, Math.PI*2);
      const depth = ctx.createRadialGradient(1, 0, r - 5, 1, 0, r);
      depth.addColorStop(0, 'rgba(0,0,0,0)');
      depth.addColorStop(1, 'rgba(0,0,0,0.9)');
      ctx.fillStyle = depth;
      ctx.fill();

      ctx.restore();
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y);   ctx.arcTo(x+w, y,   x+w, y+r,   r);
    ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
    ctx.lineTo(x+r, y+h);   ctx.arcTo(x, y+h,   x, y+h-r,   r);
    ctx.lineTo(x, y+r);     ctx.arcTo(x, y,     x+r, y,      r);
    ctx.closePath();
  }

  /* ── single ball ─────────────────────────────────────────── */
  function drawPoleMap(ctx, normal, radius, color, number = null, textUp = null) {
    if (normal.z < - (radius / BALL_R)) return;

    const cx = normal.x * BALL_R;
    const cy = normal.y * BALL_R;
    const angle = Math.atan2(normal.y, normal.x);
    
    const rMinor = radius * Math.abs(normal.z);
    const rMajor = radius;
    
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rMinor, rMajor, angle, 0, Math.PI * 2);
    ctx.fill();

    if (number !== null && number > 0 && normal.z > 0) {
      ctx.save();
      ctx.translate(cx, cy);
      
      let rotAngle = 0;
      if (textUp) {
        rotAngle = Math.atan2(textUp.y, textUp.x) + Math.PI/2; 
      }
      
      ctx.rotate(angle);
      ctx.scale(normal.z, 1);
      ctx.rotate(-angle);
      
      ctx.rotate(rotAngle);
      
      ctx.fillStyle = '#111';
      ctx.font = `bold ${number >= 10 ? 7.5 : 9}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(number, 0, 0);
      
      if (number === 6 || number === 9) {
        ctx.fillRect(-3, 4, 6, 1);
      }
      
      ctx.restore();
    }
  }

  function drawBall(info, scale=1) {
    const { position:pos, ballColor:color, ballType:type, ballNumber:num, isStripe:stripe, velocity:vel } = info;
    const up = info.up || {x:0,y:0,z:1};
    const right = info.right || {x:1,y:0,z:0};
    const forward = info.forward || {x:0,y:-1,z:0};
    const speed = Math.hypot(vel.x, vel.y);

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.scale(scale, scale);

    /* 1. Motion Blur (Tail) */
    if (speed > 1.5 && scale === 1) {
      ctx.globalAlpha = Math.min(0.3, speed / 30);
      for (let i = 1; i < 4; i++) {
        ctx.save();
        ctx.translate(-vel.x * i * 0.4, -vel.y * i * 0.4);
        ctx.beginPath();
        ctx.arc(0, 0, BALL_R * (1 - i*0.1), 0, Math.PI*2);
        ctx.fillStyle = (type==='cue') ? '#fdfdf4' : color;
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    /* 2. Soft Contact Shadow & Ambient Occlusion */
    ctx.save();
    const shadowGrad = ctx.createRadialGradient(2, 2, 0, 2, 2, BALL_R * 1.5);
    shadowGrad.addColorStop(0, 'rgba(0,0,0,0.4)');
    shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(2, 2, BALL_R * 1.3, BALL_R * 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.ellipse(0, BALL_R-2, BALL_R*0.6, BALL_R*0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(0, 0, BALL_R, 0, Math.PI*2);
    ctx.clip(); 

    // 3. Base Color & Diffuse Shading
    if (type === 'cue') {
       ctx.fillStyle = '#fdfdf4';
    } else {
       ctx.fillStyle = color;
    }
    ctx.fill();

    const elements = [];
    if (stripe) {
      elements.push({ norm: up, r: 0.72, col: '#fdfdfd' });
      elements.push({ norm: {x:-up.x, y:-up.y, z:-up.z}, r: 0.72, col: '#fdfdfd' });
      elements.push({ norm: right, r: 0.44, col: '#fdfdfd', num: num, txtUp: up });
      elements.push({ norm: {x:-right.x, y:-right.y, z:-right.z}, r: 0.44, col: '#fdfdfd', num: num, txtUp: {x:-up.x, y:-up.y, z:-up.z} });
    } else if (type === 'cue') {
      // Small dots on the cue ball to show the spin realism
      elements.push({ norm: up, r: 0.18, col: 'rgba(210, 40, 40, 0.85)' });
      elements.push({ norm: {x:-up.x, y:-up.y, z:-up.z}, r: 0.18, col: 'rgba(210, 40, 40, 0.85)' });
      elements.push({ norm: right, r: 0.18, col: 'rgba(40, 80, 200, 0.85)' });
      elements.push({ norm: {x:-right.x, y:-right.y, z:-right.z}, r: 0.18, col: 'rgba(40, 80, 200, 0.85)' });
    } else {
      // Solid balls: base color filled, add number caps
      elements.push({ norm: up, r: 0.44, col: '#fff', num: num, txtUp: forward });
      elements.push({ norm: {x:-up.x, y:-up.y, z:-up.z}, r: 0.44, col: '#fff', num: num, txtUp: {x:-forward.x, y:-forward.y, z:-forward.z} });
    }
    
    // Sort elements by z depth to render back-to-front for perfect 3D occlusion
    elements.sort((a,b) => a.norm.z - b.norm.z);
    elements.forEach(e => drawPoleMap(ctx, e.norm, BALL_R * e.r, e.col, e.num, e.txtUp));

    // Glossy specular highlight
    const gloss = ctx.createRadialGradient(-BALL_R*0.35,-BALL_R*0.35,BALL_R*0.05, -BALL_R*0.1,-BALL_R*0.2,BALL_R);
    gloss.addColorStop(0,   'rgba(255,255,255,0.9)');
    gloss.addColorStop(0.25,'rgba(255,255,255,0.3)');
    gloss.addColorStop(0.6, 'rgba(0,0,0,0.05)');
    gloss.addColorStop(0.9, 'rgba(0,0,0,0.6)');
    gloss.addColorStop(1,   'rgba(0,0,0,0.8)');
    ctx.fillStyle = gloss;
    ctx.fillRect(-BALL_R, -BALL_R, BALL_R*2, BALL_R*2);

    ctx.restore();
  }

  /* ── helper for aiming prediction ───────────────────────── */
  function getAimPrediction(cp, angle) {
    let hit = null;
    let minD = Infinity;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);

    // Ball intersections
    gs.balls.forEach(b => {
      if (b.id === gs.cueBall.id || b.speed > 0.1) return;
      const bx = b.position.x - cp.x;
      const by = b.position.y - cp.y;
      const proj = bx * ux + by * uy;
      if (proj <= 0) return; // behind
      
      const distSq = (bx * bx + by * by) - (proj * proj);
      const rSumSq = (BALL_R * 2) * (BALL_R * 2);
      if (distSq < rSumSq) {
        const dt = Math.sqrt(rSumSq - distSq);
        const impactDist = proj - dt;
        if (impactDist > 0 && impactDist < minD) {
          minD = impactDist;
          hit = { type: 'ball', ball: b };
        }
      }
    });

    // Wall intersections
    const lb = FX + CUSH + BALL_R;
    const rb = W - FX - CUSH - BALL_R;
    const tb = FY + CUSH + BALL_R;
    const bb = H - FY - CUSH - BALL_R;

    if (ux > 0.0001) {
      const d = (rb - cp.x) / ux;
      if (d > 0 && d < minD) { minD = d; hit = { type: 'wall', nx: -1, ny: 0 }; }
    } else if (ux < -0.0001) {
      const d = (lb - cp.x) / ux;
      if (d > 0 && d < minD) { minD = d; hit = { type: 'wall', nx: 1, ny: 0 }; }
    }
    if (uy > 0.0001) {
      const d = (bb - cp.y) / uy;
      if (d > 0 && d < minD) { minD = d; hit = { type: 'wall', nx: 0, ny: -1 }; }
    } else if (uy < -0.0001) {
      const d = (tb - cp.y) / uy;
      if (d > 0 && d < minD) { minD = d; hit = { type: 'wall', nx: 0, ny: 1 }; }
    }

    if (!hit) return null;

    const ix = cp.x + ux * minD;
    const iy = cp.y + uy * minD;
    let targetVec = null;
    let cueVec = null;

    if (hit.type === 'ball') {
      // targetVec: vetor do CENTRO da bola-alvo saindo na direção do impacto.
      // ix,iy é o centro da bola branca no impacto. O vetor correto é:
      // centro da bola-alvo − centro da bola branca no impacto = exatamente
      // o eixo ao longo do qual a força é transferida (linha dos centros).
      const nx = hit.ball.position.x - ix;
      const ny = hit.ball.position.y - iy;
      const len = Math.hypot(nx, ny);
      if (len < 0.001) return null;
      targetVec = { x: nx / len, y: ny / len };

      // cueVec: deflexão da bola branca = componente perpendicular à linha dos centros
      const dot  = ux * targetVec.x + uy * targetVec.y;
      cueVec = { x: ux - targetVec.x * dot, y: uy - targetVec.y * dot };
      const clen = Math.hypot(cueVec.x, cueVec.y);
      if (clen > 0.001) { cueVec.x /= clen; cueVec.y /= clen; }
      else              { cueVec = null; } // tiro direto: sem deflexão lateral
    }

    return { ix, iy, hit, targetVec, cueVec };
  }

  /* ── aiming / cue stick ──────────────────────────────────── */
  function drawAim() {
    if (!gs.isAiming || gs.turnState !== 'idle' || !gs.aimStart) return;
    const dx = gs.aimStart.x - gs.aimCur.x;
    const dy = gs.aimStart.y - gs.aimCur.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) return;

    const cp    = gs.cueBall.position;
    const angle = Math.atan2(dy, dx);
    const cos   = Math.cos(angle);
    const sin   = Math.sin(angle);

    /* Draw Aim Prediction */
    ctx.save();
    const pred = getAimPrediction(cp, angle);
    if (pred) {
      // Line to impact
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cp.x + cos * BALL_R, cp.y + sin * BALL_R);
      ctx.lineTo(pred.ix, pred.iy);
      ctx.stroke();

      // Ghost ball at impact
      ctx.beginPath();
      ctx.arc(pred.ix, pred.iy, BALL_R, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.stroke();

      if (pred.hit.type === 'ball') {
        // Centro real da bola-alvo (ponto de onde a trajetória dela parte)
        const bcx = pred.hit.ball.position.x;
        const bcy = pred.hit.ball.position.y;

        // Linha de trajetória da bola-alvo (parte do centro dela)
        ctx.beginPath();
        ctx.moveTo(bcx + pred.targetVec.x * BALL_R, bcy + pred.targetVec.y * BALL_R);
        ctx.lineTo(bcx + pred.targetVec.x * 160, bcy + pred.targetVec.y * 160);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.stroke();

        // Deflexão da bola branca (parte do ponto de impacto)
        ctx.beginPath();
        ctx.moveTo(pred.ix + pred.cueVec.x * BALL_R, pred.iy + pred.cueVec.y * BALL_R);
        ctx.lineTo(pred.ix + pred.cueVec.x * 70, pred.iy + pred.cueVec.y * 70);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.stroke();
      }
    } else {
      /* Fallback dashed guide line */
      ctx.setLineDash([6, 8]);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(cp.x + cos*BALL_R, cp.y + sin*BALL_R);
      ctx.lineTo(cp.x + cos*400,    cp.y + sin*400);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    /* ── Barra de Força Moderna (Bottom Center) ── */
    if (gs.powerPct > 0) {
      const barW = 320;
      const barH = 10;
      const barX = W / 2 - barW / 2;
      const barY = H - 35; // Posicionada na borda de madeira inferior

      // Fundo escuro da barra
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      roundRect(ctx, barX, barY, barW, barH, 5);
      ctx.fill();

      // Preenchimento com gradiente de força
      const fillW = Math.max(10, barW * gs.powerPct);
      const powerGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      powerGrad.addColorStop(0, '#00ffaa');   // Verde (fraco)
      powerGrad.addColorStop(0.5, '#ffee00'); // Amarelo (médio)
      powerGrad.addColorStop(1, '#ff3300');   // Vermelho (forte)

      ctx.save();
      ctx.fillStyle = powerGrad;
      
      // Brilho neon (glow) proporcional à força
      ctx.shadowColor = (gs.powerPct > 0.8) ? '#ff3300' : (gs.powerPct > 0.4 ? '#ffee00' : '#00ffaa');
      ctx.shadowBlur = 8 + (12 * Math.pow(gs.powerPct, 2)); // Brilha mais nas forças altas
      
      // Clip e draw do preenchimento para respeitar arredondamento
      ctx.beginPath();
      ctx.moveTo(barX+5, barY);
      ctx.lineTo(barX+fillW-5, barY);   ctx.arcTo(barX+fillW, barY,   barX+fillW, barY+5,   5);
      ctx.lineTo(barX+fillW, barY+barH-5); ctx.arcTo(barX+fillW, barY+barH, barX+fillW-5, barY+barH, 5);
      ctx.lineTo(barX+5, barY+barH);   ctx.arcTo(barX, barY+barH,   barX, barY+barH-5,   5);
      ctx.lineTo(barX, barY+5);     ctx.arcTo(barX, barY,     barX+5, barY,      5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Borda elegante iluminada
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      roundRect(ctx, barX, barY, barW, barH, 5);
      ctx.stroke();

      // Texto de porcentagem em cima da barra
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`FORÇA: ${Math.round(gs.powerPct * 100)}%`, W / 2, barY - 12);
    }
    /* cue stick */
    ctx.save();
    ctx.translate(cp.x, cp.y);
    ctx.rotate(angle);

    const pull    = Math.min(dist * 0.5, 110);
    const tipGap  = BALL_R + 3 + pull;
    const stickL  = 340;

    const shGrad = ctx.createLinearGradient(-tipGap-stickL, 0, -tipGap, 0);
    shGrad.addColorStop(0,    '#1a0802');
    shGrad.addColorStop(0.08, '#3a1a08');
    shGrad.addColorStop(0.5,  '#7a4822');
    shGrad.addColorStop(0.88, '#c88850');
    shGrad.addColorStop(1,    '#e8c080');

    /* tapered body */
    ctx.beginPath();
    ctx.moveTo(-tipGap - stickL, -7);
    ctx.lineTo(-tipGap - stickL,  7);
    ctx.lineTo(-tipGap,            2.5);
    ctx.lineTo(-tipGap,           -2.5);
    ctx.closePath();
    ctx.fillStyle = shGrad;
    ctx.fill();

    /* wrap rings */
    [0.08, 0.14, 0.20].forEach(t => {
      const rx = -tipGap - stickL*(1-t);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth   = 1.5;
      ctx.beginPath(); ctx.moveTo(rx,-7); ctx.lineTo(rx,7); ctx.stroke();
    });

    /* ferrule */
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(-tipGap-6, -2.5, 5, 5);

    /* chalk tip */
    ctx.fillStyle = '#3a7bd5';
    ctx.fillRect(-tipGap-1, -2.5, 4, 5);

    ctx.restore();
  }

  /* ── in-hand cue ball overlay ────────────────────────────── */
  function drawInHand() {
    if (!gs.cueBallInHand) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(80,200,255,0.65)';
    ctx.lineWidth   = 2;
    ctx.setLineDash([7, 7]);
    ctx.strokeRect(FX+4, FY+4, FW-8, FH-8);
    ctx.setLineDash([]);
    const cp = gs.cueBall.position;
    const glow = ctx.createRadialGradient(cp.x,cp.y,BALL_R,cp.x,cp.y,BALL_R+14);
    glow.addColorStop(0,'rgba(80,200,255,0.4)');
    glow.addColorStop(1,'rgba(80,200,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cp.x, cp.y, BALL_R+14, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  /* ── physics debug ─────────────────────────────────────── */
  function drawDebug() {
    if (!gs.debug) return;
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.4)';
    ctx.lineWidth = 1;
    const bodies = Composite.allBodies(world);
    bodies.forEach(b => {
      ctx.beginPath();
      const vertices = b.vertices;
      ctx.moveTo(vertices[0].x, vertices[0].y);
      for (let i = 1; i < vertices.length; i++) ctx.lineTo(vertices[i].x, vertices[i].y);
      ctx.closePath();
      ctx.stroke();
    });
  }

  /* ── main render loop ────────────────────────────────────── */
  function render() {
    animId = requestAnimationFrame(render);
    
    // Explicit physics update synchronized with render
    Engine.update(engine, 1000 / 60);

    ctx.clearRect(0, 0, W, H);
    drawTable();
    gs.balls.forEach(b       => drawBall(b));
    gs.fallingBalls.forEach(f => drawBall(f, f.scale));
    drawAim();
    drawInHand();
    // drawDebug();
  }

  render();

  /* ── cleanup ─────────────────────────────────────────────── */
  return {
    engine,
    stop() {
      cancelAnimationFrame(animId);
      Engine.clear(engine);
      /* properly remove NAMED listener references */
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
    },
  };
}

export function cleanupGame(game) { if (game) game.stop(); }
