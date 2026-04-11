import Matter from 'matter-js';
import confetti from 'canvas-confetti';

const { Engine, Render, Runner, World, Bodies, Body, Events, Vector, Composite } = Matter;

export function initGame(canvas, mode, onStateChange) {
  const width = 1000;
  const height = 500;
  
  const engine = Engine.create({
    gravity: { x: 0, y: 0, scale: 0 },
    enableSleeping: true
  });
  
  const world = engine.world;
  const ctx = canvas.getContext('2d');
  
  let animationFrameId;
  const runner = Runner.create();
  
  // Game State
  const gameState = {
    turn: 'Player 1',
    message: 'Break!',
    p1Type: null,
    p2Type: null,
    winner: null,
    balls: [],
    cueBall: null,
    isAiming: false,
    aimStartPos: null,
    aimCurrentPos: null,
    turnState: 'idle',
    mode: mode,
    fallingBalls: [],
    ballsPottedThisTurn: []
  };
  
  function getStateSnapshot() {
    return {
      turn: gameState.turn,
      message: gameState.message,
      p1Type: gameState.p1Type ? (gameState.p1Type === 'solid' ? 'SOLIDS' : 'STRIPES') : null,
      p2Type: gameState.p2Type ? (gameState.p2Type === 'solid' ? 'SOLIDS' : 'STRIPES') : null,
      winner: gameState.winner
    };
  }

  onStateChange(getStateSnapshot());
  
  // --- PHYSICS CONFIGURATION ---
  const borderThickness = 60;
  const cushionThickness = 22;
  const pocketRadius = 30; // Slightly larger for gameplay ease
  const ballRadius = 14;
  
  const ballOptions = {
    restitution: 0.92,
    friction: 0.005,
    frictionAir: 0.015, // Rolling resistance
    density: 0.002,
    slop: 0.01
  };

  const wallOptions = { 
    isStatic: true, 
    restitution: 0.85,
    friction: 0.1 
  };

  // Build inner cushions
  const topCushion = Bodies.rectangle(width/2, borderThickness - cushionThickness/2, width - pocketRadius*4, cushionThickness, wallOptions);
  const bottomCushion = Bodies.rectangle(width/2, height - borderThickness + cushionThickness/2, width - pocketRadius*4, cushionThickness, wallOptions);
  const leftCushion = Bodies.rectangle(borderThickness - cushionThickness/2, height/2, cushionThickness, height - pocketRadius*4, wallOptions);
  const rightCushion = Bodies.rectangle(width - borderThickness + cushionThickness/2, height/2, cushionThickness, height - pocketRadius*4, wallOptions);

  World.add(world, [topCushion, bottomCushion, leftCushion, rightCushion]);

  // Pockets
  const pocketOptions = { isSensor: true, isStatic: true, label: 'pocket' };
  const pockets = [
    { x: borderThickness - 5, y: borderThickness - 5 }, 
    { x: width/2, y: borderThickness - 15 }, 
    { x: width - borderThickness + 5, y: borderThickness - 5 }, 
    { x: borderThickness - 5, y: height - borderThickness + 5 }, 
    { x: width/2, y: height - borderThickness + 15 }, 
    { x: width - borderThickness + 5, y: height - borderThickness + 5 }, 
  ];
  
  const pocketBodies = pockets.map((p, i) => Bodies.circle(p.x, p.y, pocketRadius - 5, { ...pocketOptions, pocketIndex: i }));
  World.add(world, pocketBodies);

  // --- BALL CONFIGURATION ---
  const createBall = (x, y, type, color, number) => {
    const b = Bodies.circle(x, y, ballRadius, { ...ballOptions, label: 'ball', ballType: type, ballColor: color, ballNumber: number });
    gameState.balls.push(b);
    return b;
  };

  // Cue ball
  gameState.cueBall = createBall(width * 0.25, height / 2, 'cue', '#FFFFFF', 0);
  
  // Rack setup
  const rackStartX = width * 0.7;
  const rows = 5;
  const spacing = ballRadius * 2 + 0.2;
  
  const colors = [
    '#FFD700', '#0000FF', '#FF0000', '#800080', '#FFA500', '#008000', '#800000', '#000000',
    '#FFD700', '#0000FF', '#FF0000', '#800080', '#FFA500', '#008000', '#800000'
  ];
  const types = ['solid', 'solid', 'solid', 'solid', 'solid', 'solid', 'solid', '8ball', 'stripe', 'stripe', 'stripe', 'stripe', 'stripe', 'stripe', 'stripe'];
  const rackOrder = [1, 9, 2, 10, 8, 3, 11, 4, 12, 13, 5, 14, 6, 15, 7];
  
  let ballIdx = 0;
  for (let col = 0; col < rows; col++) {
    for (let row = 0; row <= col; row++) {
      const x = rackStartX + col * (spacing * 0.88);
      const y = (height / 2) - (col * spacing / 2) + row * spacing;
      const num = rackOrder[ballIdx];
      createBall(x, y, types[num - 1], colors[num - 1], num);
      ballIdx++;
    }
  }

  World.add(world, gameState.balls);
  
  // --- INTERACTION ---
  const handleMouseDown = (e) => {
    if (gameState.winner || gameState.turnState !== 'idle') return;
    if (mode === 'pve' && gameState.turn === 'AI') return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Check if clicked near cue ball or anywhere (usually clicks anywhere to aim)
    gameState.isAiming = true;
    gameState.aimStartPos = { x, y };
    gameState.aimCurrentPos = { x, y };
  };
  
  const handleMouseMove = (e) => {
    if (!gameState.isAiming) return;
    const rect = canvas.getBoundingClientRect();
    gameState.aimCurrentPos = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };
  
  const handleMouseUp = (e) => {
    if (!gameState.isAiming) return;
    gameState.isAiming = false;
    
    const dx = gameState.aimStartPos.x - gameState.aimCurrentPos.x;
    const dy = gameState.aimStartPos.y - gameState.aimCurrentPos.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    
    if (dist > 10) {
      // Powerful force calculation
      const forceScale = 0.0004; 
      const maxForce = 0.06;
      shoot(dx, dy, Math.min(dist * forceScale, maxForce));
    }
  };

  canvas.addEventListener('mousedown', handleMouseDown);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
  
  function shoot(dx, dy, force) {
    const angle = Math.atan2(dy, dx);
    const fx = Math.cos(angle) * force;
    const fy = Math.sin(angle) * force;
    
    Body.applyForce(gameState.cueBall, gameState.cueBall.position, { x: fx, y: fy });
    gameState.turnState = 'moving';
    gameState.message = 'Balls are rolling...';
    gameState.ballsPottedThisTurn = [];
    onStateChange(getStateSnapshot());
  }
  
  // --- COLLISION EVENTS ---
  Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach(({ bodyA, bodyB }) => {
      if (bodyA.label === 'pocket' && bodyB.label === 'ball') triggerPocket(bodyB, bodyA.pocketIndex);
      if (bodyB.label === 'pocket' && bodyA.label === 'ball') triggerPocket(bodyA, bodyB.pocketIndex);
    });
  });
  
  function triggerPocket(ball, pocketIndex) {
    if (gameState.fallingBalls.find(fb => fb.id === ball.id)) return;

    Composite.remove(world, ball);
    
    gameState.fallingBalls.push({
      id: ball.id,
      position: { ...ball.position },
      ballColor: ball.ballColor,
      ballType: ball.ballType,
      ballNumber: ball.ballNumber,
      scale: 1,
      targetPocket: pockets[pocketIndex],
      speedX: ball.velocity.x * 0.3,
      speedY: ball.velocity.y * 0.3
    });

    gameState.ballsPottedThisTurn.push({ ballType: ball.ballType });
    
    // Remote from logic list
    gameState.balls = gameState.balls.filter(b => b.id !== ball.id);
  }

  // --- GAME LOOP & LOGIC ---
  Events.on(engine, 'beforeUpdate', () => {
    // Process falling animations
    gameState.fallingBalls.forEach(fb => {
      fb.scale = Math.max(0, fb.scale - 0.05);
      fb.position.x += fb.speedX;
      fb.position.y += fb.speedY;
    });
    gameState.fallingBalls = gameState.fallingBalls.filter(fb => fb.scale > 0);

    // Turn logic
    if (gameState.turnState === 'moving') {
      let isMoving = false;
      for (const ball of gameState.balls) {
        if (ball.speed < 0.2) {
          Body.setVelocity(ball, { x: 0, y: 0 });
          Body.setAngularVelocity(ball, 0);
        } else {
          isMoving = true;
        }
      }
      if (!isMoving && gameState.fallingBalls.length === 0) {
        handleTurnEnd();
      }
    }
  });
  
  function handleTurnEnd() {
    if (gameState.turnState !== 'moving') return;
    gameState.turnState = 'idle';
    
    let nextTurn = gameState.turn === 'Player 1' ? (mode === 'pve' ? 'AI' : 'Player 2') : 'Player 1';
    let keepTurn = false;
    let scratch = false;
    let eightBallPotted = false;
    
    const potted = gameState.ballsPottedThisTurn;
    gameState.ballsPottedThisTurn = [];
    
    for (const p of potted) {
      if (p.ballType === 'cue') {
        scratch = true;
      } else if (p.ballType === '8ball') {
        eightBallPotted = true;
      } else {
        if (!gameState.p1Type) {
          // Assign types
          if (gameState.turn === 'Player 1') {
            gameState.p1Type = p.ballType;
            gameState.p2Type = p.ballType === 'solid' ? 'stripe' : 'solid';
          } else {
            gameState.p2Type = p.ballType;
            gameState.p1Type = p.ballType === 'solid' ? 'stripe' : 'solid';
          }
          keepTurn = true;
        } else {
          const ownSuit = gameState.turn === 'Player 1' ? gameState.p1Type : gameState.p2Type;
          if (p.ballType === ownSuit) keepTurn = true;
        }
      }
    }
    
    if (eightBallPotted) {
      const ownSuit = gameState.turn === 'Player 1' ? gameState.p1Type : gameState.p2Type;
      const hasRemaining = gameState.balls.some(b => b.ballType === ownSuit);
      if (scratch || hasRemaining || !ownSuit) {
        finishGame(nextTurn);
      } else {
        finishGame(gameState.turn);
      }
      return;
    }

    if (scratch) {
      // Reposition Cue Ball
      const cueX = width * 0.25;
      const cueY = height / 2;
      Body.setPosition(gameState.cueBall, { x: cueX, y: cueY });
      Body.setVelocity(gameState.cueBall, { x: 0, y: 0 });
      Composite.add(world, gameState.cueBall);
      gameState.balls.push(gameState.cueBall);

      gameState.message = `Scratch! ${nextTurn}'s turn (Ball-in-hand)`;
      gameState.turn = nextTurn;
    } else if (keepTurn) {
      gameState.message = `${gameState.turn} pockets! Shoot again.`;
    } else {
      gameState.turn = nextTurn;
      gameState.message = `${gameState.turn}'s turn.`;
    }
    
    onStateChange(getStateSnapshot());
    
    if (mode === 'pve' && gameState.turn === 'AI' && !gameState.winner) {
      setTimeout(playAITurn, 1200);
    }
  }

  function playAITurn() {
    if (gameState.winner) return;
    const mySuit = gameState.p2Type;
    let target = null;
    
    if (mySuit) {
      target = gameState.balls.find(b => b.ballType === mySuit);
    }
    if (!target) target = gameState.balls.find(b => b.ballType !== 'cue' && b.ballType !== '8ball');
    if (!target) target = gameState.balls.find(b => b.ballType === '8ball');
    
    if (target) {
      const dx = target.position.x - gameState.cueBall.position.x;
      const dy = target.position.y - gameState.cueBall.position.y;
      // AI hits with a bit of error and decent force
      const error = (Math.random() - 0.5) * 4;
      shoot(dx + error, dy + error, 0.02 + Math.random() * 0.02);
    }
  }

  function finishGame(winner) {
    gameState.winner = winner;
    gameState.message = "Game Over!";
    onStateChange(getStateSnapshot());
    confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 } });
  }

  // --- RENDERING ---
  function render() {
    animationFrameId = requestAnimationFrame(render);
    ctx.clearRect(0, 0, width, height);
    
    // Background Table
    ctx.fillStyle = '#1a3c2a'; // Darker felt
    ctx.fillRect(0, 0, width, height);
    
    // Rails
    ctx.fillStyle = '#3d2516'; // Wood grain
    ctx.fillRect(0, 0, width, borderThickness);
    ctx.fillRect(0, height - borderThickness, width, borderThickness);
    ctx.fillRect(0, 0, borderThickness, height);
    ctx.fillRect(width - borderThickness, 0, borderThickness, height);
    
    // Inner Felt
    ctx.fillStyle = '#0a5c36';
    ctx.fillRect(borderThickness, borderThickness, width - borderThickness*2, height - borderThickness*2);
    
    // Pockets
    ctx.fillStyle = '#050505';
    pockets.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, pocketRadius, 0, Math.PI * 2);
      ctx.fill();
      // Pocket rim
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 3;
      ctx.stroke();
    });

    // Render Balls
    const drawBall = (b, scale = 1) => {
      ctx.save();
      ctx.translate(b.position.x, b.position.y);
      ctx.scale(scale, scale);
      
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(4, 4, ballRadius, 0, Math.PI * 2);
      ctx.fill();
      
      // Base
      ctx.fillStyle = b.ballColor;
      ctx.beginPath();
      ctx.arc(0, 0, ballRadius, 0, Math.PI * 2);
      ctx.fill();
      
      // Detail for stripes
      if (b.ballType === 'stripe') {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(0, 0, ballRadius, -0.6, 0.6);
        ctx.arc(0, 0, ballRadius, Math.PI - 0.6, Math.PI + 0.6);
        ctx.fill();
      }
      
      // Number disc
      if (b.ballNumber > 0) {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(0, 0, ballRadius * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.ballNumber, 0, 0);
      }
      
      // Reflection
      const grad = ctx.createRadialGradient(-ballRadius*0.3, -ballRadius*0.3, 1, -ballRadius*0.2, -ballRadius*0.2, ballRadius);
      grad.addColorStop(0, 'rgba(255,255,255,0.4)');
      grad.addColorStop(1, 'rgba(0,0,0,0.2)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, ballRadius, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();
    };

    gameState.balls.forEach(b => drawBall(b));
    gameState.fallingBalls.forEach(fb => drawBall(fb, fb.scale));
    
    // Aiming
    if (gameState.isAiming && gameState.turnState === 'idle') {
      const dx = gameState.aimStartPos.x - gameState.aimCurrentPos.x;
      const dy = gameState.aimStartPos.y - gameState.aimCurrentPos.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      if (dist > 10) {
        const cuePos = gameState.cueBall.position;
        const angle = Math.atan2(dy, dx);
        
        // Aim line
        ctx.beginPath();
        ctx.setLineDash([5, 5]);
        ctx.moveTo(cuePos.x, cuePos.y);
        ctx.lineTo(cuePos.x + Math.cos(angle) * 300, cuePos.y + Math.sin(angle) * 300);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Cue Stick
        ctx.save();
        ctx.translate(cuePos.x, cuePos.y);
        ctx.rotate(angle);
        
        const stickPull = Math.min(dist * 0.5, 100);
        const stickLength = 300;
        const gradStick = ctx.createLinearGradient(-stickPull - stickLength, 0, -stickPull, 0);
        gradStick.addColorStop(0, '#2d1a0e');
        gradStick.addColorStop(0.8, '#633e24');
        gradStick.addColorStop(1, '#d4a373');
        
        ctx.fillStyle = gradStick;
        ctx.fillRect(-stickPull - stickLength, -4, stickLength, 8);
        
        // Tip
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(-stickPull - 5, -3, 5, 6);
        ctx.fillStyle = '#1e3a8a'; // Blue chalk
        ctx.fillRect(-stickPull - 2, -3, 2, 6);
        
        ctx.restore();
      }
    }
  }

  Runner.run(runner, engine);
  render();

  return {
    engine,
    stop: () => {
      cancelAnimationFrame(animationFrameId);
      Runner.stop(runner);
      Engine.clear(engine);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
  };
}

export function cleanupGame(game) {
  if (game) game.stop();
}
