import React, { useEffect, useRef, useState } from 'react';
import { initGame, cleanupGame } from '../game/GameEngine';
import VoiceChat from './VoiceChat';
import { peerManager } from '../network/PeerManager';

/* ── small ball icon for HUD ───────────────────────────────────────── */
function BallIcon({ color, stripe, number, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="-12 -12 24 24" style={{ display:'inline-block', flexShrink:0 }}>
      <defs>
        <radialGradient id={`bg${number}`} cx="38%" cy="33%" r="65%">
          <stop offset="0%" stopColor={stripe ? '#fff' : color} />
          <stop offset="100%" stopColor={stripe ? '#ddd' : shadeColor(color, -40)} />
        </radialGradient>
        <radialGradient id={`gl${number}`} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.8)" />
          <stop offset="40%" stopColor="rgba(255,255,255,0.1)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.2)" />
        </radialGradient>
        <clipPath id={`clip${number}`}>
          <circle cx="0" cy="0" r="11" />
        </clipPath>
      </defs>
      {/* base */}
      <circle cx="0" cy="0" r="11" fill={`url(#bg${number})`} />
      {stripe && (
        <rect x="-11" y="-4.5" width="22" height="9" fill={color} clipPath={`url(#clip${number})`} />
      )}
      {/* number disc */}
      {number > 0 && <circle cx="0" cy="0" r="5" fill="#fff" />}
      {number > 0 && <text x="0" y="0.7" textAnchor="middle" dominantBaseline="middle"
        fontSize={number >= 10 ? '4.5' : '5.5'} fontWeight="bold" fill="#111" fontFamily="Arial">{number}</text>}
      {/* gloss */}
      <circle cx="0" cy="0" r="11" fill={`url(#gl${number})`} />
    </svg>
  );
}

function shadeColor(hex, pct) {
  const num = parseInt(hex.replace('#',''), 16);
  const r   = Math.max(0, Math.min(255, (num>>16) + pct));
  const g   = Math.max(0, Math.min(255, ((num>>8)&255) + pct));
  const b   = Math.max(0, Math.min(255, (num&255) + pct));
  return `rgb(${r},${g},${b})`;
}


/* ── ball color map ──────────────────────────────────────────────── */
const BALL_COLORS = {
  1:'#f5c518', 2:'#3b82f6', 3:'#ef4444', 4:'#7c3aed',
  5:'#f97316', 6:'#16a34a', 7:'#9f1239', 8:'#111111',
  9:'#f5c518',10:'#3b82f6',11:'#ef4444',12:'#7c3aed',
  13:'#f97316',14:'#16a34a',15:'#9f1239',
};

const SOLID_BALLS  = [1,2,3,4,5,6,7,8];
const STRIPE_BALLS = [9,10,11,12,13,14,15];

function TinyBall({ number, stripe, potted }) {
  const color = BALL_COLORS[number] || '#888';
  return (
    <svg width={22} height={22} viewBox="-11 -11 22 22"
      style={{ opacity: potted ? 1 : 0.22, transition:'opacity 0.3s', flexShrink:0 }}>
      <defs>
        <radialGradient id={`tg${number}`} cx="38%" cy="33%" r="65%">
          <stop offset="0%" stopColor={stripe ? '#fff' : color} />
          <stop offset="100%" stopColor={stripe ? '#ddd' : shadeColor(color,-40)} />
        </radialGradient>
        <radialGradient id={`tgl${number}`} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.75)" />
          <stop offset="45%" stopColor="rgba(255,255,255,0.05)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.18)" />
        </radialGradient>
        <clipPath id={`tclip${number}`}><circle cx="0" cy="0" r="10"/></clipPath>
      </defs>
      <circle cx="0" cy="0" r="10" fill={`url(#tg${number})`}/>
      {stripe && <rect x="-11" y="-4" width="22" height="8" fill={color} clipPath={`url(#tclip${number})`}/>}
      <circle cx="0" cy="0" r="4.5" fill="#fff" opacity={0.9}/>
      <text x="0" y="0.6" textAnchor="middle" dominantBaseline="middle"
        fontSize={number>=10?'3.8':'4.5'} fontWeight="bold" fill="#111" fontFamily="Arial">{number}</text>
      <circle cx="0" cy="0" r="10" fill={`url(#tgl${number})`}/>
      {potted && <circle cx="0" cy="0" r="10" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1"/>}
    </svg>
  );
}

/* ── player panel ────────────────────────────────────────────────── */
function PlayerPanel({ label, type, potted, pottedBalls = [], active, avatarLetter }) {
  const balls   = type === 'SOLIDS' ? SOLID_BALLS : type === 'STRIPES' ? STRIPE_BALLS : [];
  const total   = balls.length;
  const typeColor = type === 'SOLIDS' ? '#f5c518' : type === 'STRIPES' ? '#60a5fa' : '#888';

  return (
    <div style={{
      display:'flex', flexDirection:'column', gap:8,
      background: active ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.38)',
      border: active ? '2px solid rgba(255,220,80,0.7)' : '2px solid rgba(255,255,255,0.06)',
      borderRadius:16, padding:'10px 16px', minWidth:230,
      boxShadow: active ? '0 0 20px rgba(255,220,80,0.25)' : 'none',
      transition:'all 0.25s ease',
    }}>
      {/* top row: avatar + name */}
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{
          width:38, height:38, borderRadius:'50%', flexShrink:0,
          background: active ? 'linear-gradient(135deg,#f5c518,#e8820c)' : 'linear-gradient(135deg,#334155,#1e293b)',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:18, fontWeight:800, color:'#fff',
          boxShadow: active ? '0 0 12px rgba(245,197,24,0.5)' : 'none',
          border: active ? '2px solid #f5c518' : '2px solid rgba(255,255,255,0.1)',
        }}>{avatarLetter}</div>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:13, fontWeight:700, color: active ? '#fff' : '#94a3b8', letterSpacing:'0.05em', textTransform:'uppercase' }}>{label}</span>
            {active && <span style={{ fontSize:9, background:'#f5c518', color:'#000', borderRadius:6, padding:'1px 6px', fontWeight:800, letterSpacing:'0.06em' }}>VEZ</span>}
          </div>
          <div style={{ fontSize:11, color: typeColor, fontWeight:700, marginTop:1 }}>
            {type ? `${type} · ${potted}/${total}` : '? Não atribuído'}
          </div>
        </div>
      </div>
      {/* ball row */}
      {balls.length > 0 ? (
        <div style={{ display:'flex', gap:3, flexWrap:'wrap', marginTop:2 }}>
          {balls.map(n => (
            <TinyBall key={n} number={n} stripe={n >= 9} potted={pottedBalls.includes(n)} />
          ))}
        </div>
      ) : (
        <div style={{ fontSize:11, color:'#475569', fontStyle:'italic' }}>Aguardando primeira bola...</div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
export default function PoolGame({ mode, playerName, onExit }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const [gs, setGs] = useState({
    turn:'Player 1', message:'Break!',
    p1Type:null, p2Type:null, winner:null,
    p1Potted:0, p2Potted:0,
  });

  useEffect(() => {
    if (!canvasRef.current) return;
    engineRef.current = initGame(canvasRef.current, mode, s => setGs(p => ({...p,...s})));
    return () => cleanupGame(engineRef.current);
  }, [mode]);

  // Nome real: se online, host = P1, guest = P2; senão "Player X"
  const myName   = playerName || 'Jogador';
  const isHost   = mode !== 'online' || (typeof peerManager !== 'undefined' && peerManager.isHost);
  const p1Label  = isHost ? myName : 'Player 1';
  const p2Label  = mode === 'pve' ? 'AI Bot' : (!isHost ? myName : 'Player 2');
  const p1Active = gs.turn === 'Player 1';
  const p2Active = !p1Active;

  return (
    <div style={{
      width:'100vw', height:'100vh', display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center',
      background:'radial-gradient(ellipse at 50% 0%, #0f2027 0%, #0a0a14 70%)',
      fontFamily:"'Inter','Segoe UI',Arial,sans-serif", overflow:'hidden', position:'relative',
      touchAction:'none', userSelect:'none',
    }}>
      {/* Background decoration */}
      <div style={{ position:'absolute', inset:0, pointerEvents:'none', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:'-15%', left:'-10%', width:500, height:500, background:'radial-gradient(circle, rgba(30,90,60,0.18) 0%, transparent 70%)', borderRadius:'50%' }} />
        <div style={{ position:'absolute', bottom:'-15%', right:'-10%', width:500, height:500, background:'radial-gradient(circle, rgba(20,60,120,0.18) 0%, transparent 70%)', borderRadius:'50%' }} />
      </div>

      {/* ── top HUD ────────────────────────────────────────────────── */}
      <div style={{
        display:'flex', 
        flexDirection: window.innerWidth < 700 ? 'column' : 'row',
        alignItems:'center', justifyContent:'space-between',
        width:'100%', maxWidth:1040, padding:'0 16px', marginBottom:14, zIndex:10,
        gap: 10
      }}>
        {/* Player 1 */}
        <PlayerPanel label={p1Label} type={gs.p1Type}
          potted={gs.p1Potted} pottedBalls={gs.p1PottedBalls || []} active={p1Active} avatarLetter={myName[0]?.toUpperCase() || 'P'} />

        {/* Centre - Compact on Mobile */}
        <div style={{ 
          display:'flex', 
          flexDirection: window.innerWidth < 700 ? 'row' : 'column',
          alignItems:'center', gap:10 
        }}>
          <div style={{
            background:'rgba(0,0,0,0.5)', border:'1px solid rgba(255,255,255,0.1)',
            borderRadius:12, padding:'4px 15px', textAlign:'center',
          }}>
            <div style={{
              fontSize: 11, color:'#f5c518', fontWeight:700, letterSpacing:'0.1em',
              textTransform:'uppercase',
            }}>Mesa 064</div>
            <div style={{ fontSize: 10, color:'#94a3b8' }}>{gs.message}</div>
          </div>
          <button onClick={onExit} style={{
            background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)',
            color:'#94a3b8', fontSize:11, borderRadius:8, padding:'4px 12px', cursor:'pointer',
          }}>← Sair</button>
        </div>

        {/* Player 2 / AI */}
        <PlayerPanel label={p2Label} type={gs.p2Type}
          potted={gs.p2Potted} pottedBalls={gs.p2PottedBalls || []} active={p2Active} avatarLetter={mode==='pve'?'🤖':'P'} />
      </div>

      {/* ── game area ──────────────────────────────────────────────── */}
      <div style={{ 
        position:'relative', 
        zIndex:10,
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        padding: '0 10px',
        touchAction:'none',
      }}>
        <div style={{
          position: 'relative',
          width: '100%',
          maxWidth: 1000,
          aspectRatio: '1000/520',
          touchAction:'none',
        }}>
          <canvas
            ref={canvasRef}
            width={1000}
            height={520}
            style={{
              width: '100%',
              height: '100%',
              display:'block',
              borderRadius:12,
              boxShadow:'0 20px 80px rgba(0,0,0,0.8), 0 0 0 3px rgba(255,255,255,0.05)',
              cursor:'crosshair',
              touchAction: 'none' // Importante para mobile não rolar a tela jogando
            }}
          />

          {/* ── game over overlay ─────────────────────────────────── */}
          {gs.winner && (
            <div style={{
              position:'absolute', inset:0, borderRadius:12,
              background:'rgba(0,0,0,0.82)', backdropFilter:'blur(8px)',
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20,
            }}>
              <div style={{
                width:70, height:70, borderRadius:'50%',
                background:'linear-gradient(135deg,#222,#000)',
                border:'4px solid rgba(255,255,255,0.12)',
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                <span style={{ fontSize:32 }}>🎱</span>
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{
                  fontSize:36, fontWeight:900, color:'#fff',
                  textShadow:'0 0 30px rgba(245,197,24,0.6)',
                }}>{gs.winner} Venceu!</div>
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={() => window.location.reload()} style={{
                  background:'linear-gradient(135deg,#f5c518,#e8820c)',
                  color:'#000', border:'none', borderRadius:10,
                  padding:'10px 24px', fontSize:14, fontWeight:800, cursor:'pointer',
                }}>Jogar Denovo</button>
                <button onClick={onExit} style={{
                  background:'rgba(255,255,255,0.08)', color:'#fff',
                  border:'1px solid rgba(255,255,255,0.15)', borderRadius:10,
                  padding:'10px 24px', fontSize:14, fontWeight:700, cursor:'pointer',
                }}>Sair</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── instructions ───────────────────────────────────────────── */}
      <div style={{
        marginTop:12, zIndex:10,
        display:'flex', alignItems:'center', gap:8,
        background:'rgba(0,0,0,0.35)', border:'1px solid rgba(255,255,255,0.07)',
        borderRadius:30, padding:'6px 18px',
        fontSize:10, color:'#64748b',
        maxWidth: '90%',
        textAlign: 'center'
      }}>
        <span>🎯 Arraste para trás para mirar • Solte para tacar</span>
      </div>

      {/* Voice Chat active in online mode */}
      {mode === 'online' && <VoiceChat />}
    </div>
  );
}
