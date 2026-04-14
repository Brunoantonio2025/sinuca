import React, { useState, useEffect, useRef } from 'react';
import PoolGame from './components/PoolGame';
import { peerManager } from './network/PeerManager';
import { db } from './firebase';
import { collection, onSnapshot, setDoc, doc, deleteDoc } from 'firebase/firestore';

/* ─── Chaves de sessão no localStorage ──────────────────────────── */
const SESSION_KEY  = 'sinuca_session';
const NAME_KEY     = 'sinuca_player_name';

function saveSession(tableId, tableData, role) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ tableId, tableData, role, ts: Date.now() }));
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    // Expira após 2 horas
    if (s && Date.now() - s.ts < 2 * 60 * 60 * 1000) return s;
  } catch {}
  return null;
}

/* ─── Modal de Nome ─────────────────────────────────────────────── */
function NameModal({ tableData, onConfirm, onCancel }) {
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) || '');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleConfirm = () => {
    const n = name.trim();
    if (!n) return;
    localStorage.setItem(NAME_KEY, n);
    onConfirm(n);
  };

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:9999, display:'flex',
      alignItems:'center', justifyContent:'center',
      background:'rgba(0,0,0,0.75)', backdropFilter:'blur(6px)',
      animation:'fadeIn 0.25s ease-out',
    }}>
      <div style={{
        background:'linear-gradient(160deg,#0f1f14,#081020)',
        border:'1px solid rgba(245,208,97,0.25)', borderRadius:24,
        padding:'36px 32px', width:'90%', maxWidth:420,
        boxShadow:'0 30px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)',
        display:'flex', flexDirection:'column', gap:20, alignItems:'center',
      }}>
        {/* Ícone da mesa */}
        <div style={{
          width:64, height:64, borderRadius:'50%',
          background:'linear-gradient(135deg,#1a3a24,#0c1a10)',
          display:'flex', alignItems:'center', justifyContent:'center',
          border:'2px solid rgba(16,185,129,0.4)',
          boxShadow:'0 0 24px rgba(16,185,129,0.2)',
          fontSize:30,
        }}>🎱</div>

        <div style={{ textAlign:'center', lineHeight:1.4 }}>
          <div style={{ fontSize:22, fontWeight:900, color:'#fff', marginBottom:4 }}>
            Entrar na Mesa
          </div>
          <div style={{ fontSize:14, color:'rgba(245,208,97,0.8)', fontWeight:700 }}>
            {tableData?.name} · {tableData?.value}
          </div>
        </div>

        <div style={{ width:'100%' }}>
          <label style={{ fontSize:11, color:'rgba(255,255,255,0.4)', letterSpacing:'0.12em', textTransform:'uppercase', display:'block', marginBottom:8 }}>
            Seu Nome de Jogador
          </label>
          <input
            ref={inputRef}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleConfirm()}
            placeholder="Ex: Bruno, King, Fenômeno..."
            maxLength={20}
            style={{
              width:'100%', padding:'14px 16px', borderRadius:12,
              border:'1px solid rgba(255,255,255,0.1)',
              background:'rgba(0,0,0,0.5)', color:'#fff', fontSize:16,
              outline:'none', boxSizing:'border-box',
              transition:'border 0.2s',
            }}
            onFocus={e => e.target.style.borderColor='rgba(16,185,129,0.5)'}
            onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.1)'}
          />
        </div>

        <div style={{ display:'flex', gap:10, width:'100%' }}>
          <button
            onClick={onCancel}
            style={{
              flex:1, padding:'13px 0', borderRadius:12,
              background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)',
              color:'rgba(255,255,255,0.6)', fontSize:14, fontWeight:700, cursor:'pointer',
              transition:'background 0.2s',
            }}
            onMouseEnter={e => e.target.style.background='rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.target.style.background='rgba(255,255,255,0.06)'}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!name.trim()}
            style={{
              flex:2, padding:'13px 0', borderRadius:12,
              background: name.trim() ? 'linear-gradient(135deg,#10b981,#059669)' : 'rgba(255,255,255,0.08)',
              border:'none', color: name.trim() ? '#fff' : 'rgba(255,255,255,0.3)',
              fontSize:15, fontWeight:800, cursor: name.trim() ? 'pointer' : 'default',
              boxShadow: name.trim() ? '0 8px 24px rgba(16,185,129,0.35)' : 'none',
              transition:'all 0.2s',
            }}
          >
            ✓ Entrar na Mesa
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Reconnect Banner ──────────────────────────────────────────── */
function ReconnectBanner({ session, onRejoin, onDismiss }) {
  return (
    <div style={{
      position:'fixed', top:16, left:'50%', transform:'translateX(-50%)',
      zIndex:9000, display:'flex', alignItems:'center', gap:12,
      background:'linear-gradient(135deg,#0f2a1c,#081020)',
      border:'1px solid rgba(16,185,129,0.4)',
      borderRadius:16, padding:'12px 20px',
      boxShadow:'0 12px 40px rgba(0,0,0,0.6)',
      animation:'slideDown 0.4s cubic-bezier(0.2,0.8,0.2,1)',
      maxWidth:'90vw',
    }}>
      <span style={{ fontSize:18 }}>🎱</span>
      <div>
        <div style={{ fontSize:13, fontWeight:800, color:'#fff' }}>
          Você tem uma sessão ativa!
        </div>
        <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)' }}>
          Mesa: {session.tableData?.name}
        </div>
      </div>
      <button
        onClick={onRejoin}
        style={{
          padding:'8px 16px', borderRadius:10,
          background:'linear-gradient(135deg,#10b981,#059669)',
          border:'none', color:'#fff', fontSize:13, fontWeight:800, cursor:'pointer',
        }}
      >
        Voltar ao Jogo
      </button>
      <button
        onClick={onDismiss}
        style={{
          padding:'8px 12px', borderRadius:10,
          background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)',
          color:'rgba(255,255,255,0.5)', fontSize:12, cursor:'pointer',
        }}
      >
        ✕
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
export default function App() {
  const [gameState, setGameState]       = useState('menu');
  const [isAdmin, setIsAdmin]           = useState(false);
  const [status, setStatus]             = useState('');
  const [currentTableId, setCurrentTableId] = useState(null);
  const [activeTables, setActiveTables] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableValue, setNewTableValue] = useState('');
  const [playerName, setPlayerName]     = useState(() => localStorage.getItem(NAME_KEY) || '');

  // Modal de nome
  const [nameModalTable, setNameModalTable] = useState(null); // table que quer entrar

  // Banner de reconexão
  const [savedSession, setSavedSession] = useState(null);

  /* ── Ao montar: verifica sessão salva ─────────────────────────── */
  useEffect(() => {
    const s = loadSession();
    if (s) setSavedSession(s);
  }, []);

  /* ── Sincroniza mesas com Firebase ──────────────────────────────── */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tables'), (snapshot) => {
      const tables = [];
      snapshot.forEach(d => tables.push(d.data()));
      setActiveTables(tables);
    });
    return () => unsub();
  }, []);

  /* ── Limpeza quando sai/recarrega ─────────────────────────────── */
  useEffect(() => {
    const cleanup = async () => {
      if (currentTableId) {
        await setDoc(doc(db, 'tables', currentTableId), { status: 'open' }, { merge: true });
      }
    };
    window.addEventListener('beforeunload', cleanup);
    return () => {
      window.removeEventListener('beforeunload', cleanup);
      cleanup();
    };
  }, [currentTableId]);

  /* ── Admin easter egg ─────────────────────────────────────────── */
  useEffect(() => {
    if (window.location.pathname.toLowerCase().includes('/admin')) {
      setIsAdmin(true);
    }
    let buffer = '';
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      buffer += e.key;
      if (buffer.length > 20) buffer = buffer.slice(-20);
      if (buffer.toLowerCase().endsWith('/admin')) {
        setIsAdmin(true);
        setStatus('Modo Administrador Desbloqueado!');
        setTimeout(() => setStatus(''), 4000);
      }
    };
    window.addEventListener('keypress', handleKey);
    return () => window.removeEventListener('keypress', handleKey);
  }, []);

  /* ── Entrar numa mesa (após confirmar nome) ──────────────────── */
  const doJoinTable = async (table, name) => {
    setPlayerName(name);

    peerManager.onConnected = () => {
      setGameState('playing');
    };

    if (table.status === 'open' || table.status === undefined) {
      setStatus('Iniciando mesa...');
      try {
        await peerManager.startHost(table.id, async () => {
          await setDoc(doc(db, 'tables', table.id), { status: 'waiting', p1: name }, { merge: true });
          setCurrentTableId(table.id);
          saveSession(table.id, table, 'host');
          setStatus('Aguardando oponente...');
        });
      } catch (e) {
        setStatus('Erro ao iniciar. Tente outra mesa.');
      }
    } else if (table.status === 'waiting') {
      setStatus('Conectando...');
      try {
        await peerManager.join(table.id);
        await setDoc(doc(db, 'tables', table.id), { status: 'full', p2: name }, { merge: true });
        setCurrentTableId(table.id);
        saveSession(table.id, table, 'guest');
      } catch (e) {
        setStatus('Erro ao conectar. Mesa cheia?');
      }
    } else {
      setStatus('Esta mesa está em jogo.');
    }
  };

  /* ── Disparado quando clica numa mesa (abre modal de nome) ─────── */
  const handleJoinTable = (table) => {
    setSavedSession(null);
    setNameModalTable(table);
  };

  /* ── Confirmação no modal de nome ──────────────────────────────── */
  const handleNameConfirm = (name) => {
    const table = nameModalTable;
    setNameModalTable(null);
    doJoinTable(table, name);
  };

  /* ── Rejoinar sessão salva ──────────────────────────────────────── */
  const handleRejoin = async () => {
    const s = savedSession;
    setSavedSession(null);
    if (!s) return;

    // Encontra a mesa no Firebase
    const table = activeTables.find(t => t.id === s.tableId) || s.tableData;
    if (!table) { setStatus('Mesa não encontrada.'); return; }

    const name = localStorage.getItem(NAME_KEY) || playerName || 'Jogador';
    doJoinTable(table, name);
  };

  /* ── Criar mesa (Admin) ─────────────────────────────────────────── */
  const handleHostSubmit = async () => {
    if (!newTableName) return;
    const tableId = 'MESA-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    setStatus(`Criando mesa ${newTableName}...`);
    try {
      const tableObj = {
        id: tableId, name: newTableName,
        value: newTableValue || 'Amistoso',
        baseHue: Math.floor(Math.random() * 360), status: 'open',
      };
      await setDoc(doc(db, 'tables', tableId), tableObj);
      setShowCreateModal(false);
      setNewTableName(''); setNewTableValue('');
      setStatus(`Mesa ${tableObj.name} criada!`);
      setTimeout(() => setStatus(''), 2000);
    } catch (e) { setStatus(`Erro: ${e.message}`); }
  };

  const handleDeleteTable = async (tableId) => {
    try {
      await deleteDoc(doc(db, 'tables', tableId));
      setStatus('Mesa excluída.');
      setTimeout(() => setStatus(''), 1000);
    } catch { setStatus('Erro ao excluir.'); }
  };

  const handleResetAllTables = async () => {
    setStatus('Resetando todas as mesas...');
    try {
      await Promise.all(activeTables.map(t =>
        setDoc(doc(db, 'tables', t.id), { status: 'open' }, { merge: true })
      ));
      clearSession();
      setStatus('Todas as mesas estão LIVRES agora!');
      setTimeout(() => setStatus(''), 2000);
    } catch { setStatus('Erro ao resetar mesas.'); }
  };

  /* ── Sair do jogo ───────────────────────────────────────────────── */
  const handleExit = async () => {
    if (currentTableId) {
      await setDoc(doc(db, 'tables', currentTableId), { status: 'open' }, { merge: true });
      setCurrentTableId(null);
    }
    clearSession();
    peerManager.disconnect();
    setGameState('menu');
    setStatus('');
  };

  /* ══════════════════════════════════════════════════════════════════ */
  return (
    <div style={{
      minHeight:'100vh', width:'100vw', overflow:'hidden', position:'relative',
      background:'radial-gradient(ellipse at 50% 0%, #0d1f17 0%, #060810 70%)',
      fontFamily:"'Inter','Segoe UI',Arial,sans-serif", color:'#fff',
      display:'flex', alignItems:'center', justifyContent:'center',
    }}>
      <style>{`
        @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideDown { from{opacity:0;transform:translateX(-50%) translateY(-20px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
      `}</style>

      {/* Felt texture */}
      <div style={{ position:'absolute', inset:0, pointerEvents:'none',
        backgroundImage:`repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,80,30,0.04) 3px,rgba(0,80,30,0.04) 4px),
          repeating-linear-gradient(90deg,transparent,transparent 3px,rgba(0,80,30,0.04) 3px,rgba(0,80,30,0.04) 4px)`,
      }} />
      <div style={{ position:'absolute', top:'-10%', left:'20%', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle,rgba(30,100,60,0.22),transparent 70%)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:'-10%', right:'15%', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle,rgba(20,50,110,0.18),transparent 70%)', pointerEvents:'none' }} />

      {/* ── Banner de Reconexão ──────────────────────────────────── */}
      {gameState === 'menu' && savedSession && (
        <ReconnectBanner
          session={savedSession}
          onRejoin={handleRejoin}
          onDismiss={() => { setSavedSession(null); clearSession(); }}
        />
      )}

      {/* ── Modal de Nome ───────────────────────────────────────── */}
      {nameModalTable && (
        <NameModal
          tableData={nameModalTable}
          onConfirm={handleNameConfirm}
          onCancel={() => setNameModalTable(null)}
        />
      )}

      {/* ── Menu ────────────────────────────────────────────────── */}
      {gameState === 'menu' && (
        <div style={{
          display:'flex', flexDirection:'column', alignItems:'center', gap:0,
          zIndex:10, animation:'fadeIn 0.8s ease-out', width:'90%', maxWidth:800,
        }}>
          {/* Logo */}
          <div style={{ marginBottom:40, textAlign:'center' }}>
            <div style={{ fontSize:80, lineHeight:1, marginBottom:16, display:'inline-block', filter:'drop-shadow(0 10px 20px rgba(0,0,0,0.5))' }}>🎱</div>
            <h1 style={{
              fontSize:56, fontWeight:900, margin:0, letterSpacing:'-0.03em',
              background:'linear-gradient(135deg, #f5d061 0%, #e68e1a 50%, #ffffff 100%)',
              WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
              backgroundClip:'text', lineHeight:1.1,
            }}>Mesa 064</h1>
            <p style={{ color: isAdmin ? '#f5d061' : '#10b981', fontSize:14, fontWeight:800, margin:'8px 0 0', letterSpacing:'0.25em', textTransform:'uppercase', transition:'color 0.5s' }}>
              {isAdmin ? 'Painel de Controle Admin' : 'Saguão Principal'}
            </p>
          </div>

          {/* Nome salvo */}
          {playerName && !isAdmin && (
            <div style={{
              display:'flex', alignItems:'center', gap:8, marginBottom:16,
              background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.2)',
              borderRadius:20, padding:'6px 16px', fontSize:13, color:'#10b981',
            }}>
              <span>👤</span>
              <span>Bem-vindo de volta, <strong>{playerName}</strong>!</span>
              <button
                onClick={() => { setPlayerName(''); localStorage.removeItem(NAME_KEY); }}
                style={{ background:'none', border:'none', color:'rgba(255,255,255,0.3)', cursor:'pointer', fontSize:12, padding:'0 4px' }}
              >✕</button>
            </div>
          )}

          {/* Mesas / Admin */}
          <div style={{ display:'flex', flexDirection:'column', gap:16, width:'100%', alignItems:'center', minHeight:180 }}>
            {isAdmin ? (
              <div style={{ width:'100%', display:'flex', flexDirection:'column', alignItems:'center', gap:30 }}>
                {!showCreateModal ? (
                  <div style={{ display:'flex', gap:10 }}>
                    <button onClick={() => setShowCreateModal(true)} style={{ padding:'16px 30px', fontSize:16, fontWeight:'bold', background:'linear-gradient(135deg, #10b981, #059669)', border:'none', borderRadius:20, color:'#fff', cursor:'pointer' }}>
                      ➕ Criar Mesa
                    </button>
                    <button onClick={handleResetAllTables} style={{ padding:'16px 30px', fontSize:16, fontWeight:'bold', background:'linear-gradient(135deg, #ec4899, #be185d)', border:'none', borderRadius:20, color:'#fff', cursor:'pointer' }}>
                      🔄 Resetar Todas
                    </button>
                  </div>
                ) : (
                  <div style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', backdropFilter:'blur(10px)', padding:30, borderRadius:20, display:'flex', flexDirection:'column', gap:15, width:'100%', maxWidth:450 }}>
                    <h3 style={{ margin:0, color:'#f5d061', textAlign:'center' }}>Configurações da Mesa</h3>
                    <input placeholder="Nome da Mesa (ex: Desafio Elite)" value={newTableName} onChange={e => setNewTableName(e.target.value)} style={{ padding:'14px 16px', borderRadius:10, border:'none', background:'rgba(0,0,0,0.5)', color:'#fff', fontSize:16, outline:'none' }} />
                    <input placeholder="Valor da Partida (ex: R$ 50,00)" value={newTableValue} onChange={e => setNewTableValue(e.target.value)} style={{ padding:'14px 16px', borderRadius:10, border:'none', background:'rgba(0,0,0,0.5)', color:'#fff', fontSize:16, outline:'none' }} />
                    <div style={{ display:'flex', gap:10, marginTop:10 }}>
                      <button onClick={handleHostSubmit} style={{ flex:1, padding:14, borderRadius:10, border:'none', background:'#10b981', color:'#fff', fontWeight:'bold', cursor:'pointer', fontSize:16 }}>Confirmar Criação</button>
                      <button onClick={() => setShowCreateModal(false)} style={{ padding:14, borderRadius:10, border:'none', background:'#ef4444', color:'#fff', fontWeight:'bold', cursor:'pointer', fontSize:16 }}>Cancelar</button>
                    </div>
                  </div>
                )}
                {activeTables.length > 0 && (
                  <div style={{ width:'100%', marginTop:20 }}>
                    <h4 style={{ color:'rgba(255,255,255,0.4)', textTransform:'uppercase', fontSize:12, letterSpacing:'2px', marginBottom:15, textAlign:'center' }}>Mesas em Aberto</h4>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:12, justifyContent:'center' }}>
                      {activeTables.map(t => (
                        <div key={t.id} style={{ background:'rgba(255,255,255,0.03)', padding:'12px 20px', borderRadius:15, display:'flex', alignItems:'center', gap:15, border:'1px solid rgba(255,255,255,0.05)' }}>
                          <span style={{ fontWeight:'bold' }}>{t.name}</span>
                          <span style={{ opacity:0.5, fontSize:13 }}>{t.value}</span>
                          <button onClick={() => handleDeleteTable(t.id)} style={{ background:'#ef4444', border:'none', borderRadius:8, padding:'5px 10px', color:'#fff', cursor:'pointer', fontSize:12, fontWeight:'bold' }}>🗑️ Excluir</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display:'flex', flexWrap:'wrap', gap:16, width:'100%', justifyContent:'center' }}>
                {activeTables.length > 0 ? (
                  activeTables.map(t => (
                    <TableCard key={t.id} tableData={t} onClick={() => handleJoinTable(t)} />
                  ))
                ) : (
                  <div style={{ width:'100%', textAlign:'center', color:'rgba(255,255,255,0.4)', fontSize:16, border:'1px dashed rgba(255,255,255,0.1)', borderRadius:20, display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 0' }}>
                    Nenhuma mesa ativa no momento.
                  </div>
                )}
              </div>
            )}
          </div>

          {!isAdmin && (
            <button onClick={handleResetAllTables} style={{ marginTop:40, background:'transparent', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.3)', padding:'8px 20px', borderRadius:20, cursor:'pointer', fontSize:11 }}>
              Mesa travada? Clique aqui para destravar
            </button>
          )}

          <div style={{ height:40, marginTop:20 }}>
            {status && (
              <div style={{ background:'rgba(0,0,0,0.6)', padding:'10px 20px', borderRadius:20, border:`1px solid ${isAdmin ? 'rgba(245,208,97,0.3)' : 'rgba(16,185,129,0.3)'}`, color: isAdmin ? '#f5d061' : '#10b981', fontSize:14, fontWeight:'bold', backdropFilter:'blur(5px)', animation:'fadeIn 0.3s' }}>
                {status}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Jogo ───────────────────────────────────────────────── */}
      {gameState === 'playing' && (
        <PoolGame
          mode="online"
          playerName={playerName}
          onExit={handleExit}
        />
      )}
    </div>
  );
}

/* ─── TableCard ─────────────────────────────────────────────────── */
function TableCard({ tableData, onClick }) {
  const [hover, setHover] = useState(false);
  const baseHue = tableData.baseHue || 150;
  const statusLabel = tableData.status === 'waiting' ? '⏳ Aguardando' : tableData.status === 'full' ? '🔴 Lotada' : '🟢 Livre';
  const statusColor = tableData.status === 'waiting' ? '#f59e0b' : tableData.status === 'full' ? '#ef4444' : '#10b981';

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position:'relative', display:'flex', flexDirection:'column', alignItems:'center', gap:10,
        background: hover ? `linear-gradient(135deg, hsla(${baseHue},50%,15%,0.8), hsla(${baseHue},40%,8%,0.8))` : `linear-gradient(135deg, hsla(${baseHue},30%,12%,0.4), hsla(${baseHue},20%,6%,0.4))`,
        border:`1px solid hsla(${baseHue},60%,50%,${hover?'0.5':'0.1'})`,
        backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)',
        borderRadius:20, padding:'24px 20px', cursor:'pointer',
        boxShadow: hover ? `0 12px 40px hsla(${baseHue},60%,50%,0.2),inset 0 0 0 1px hsla(${baseHue},60%,50%,0.2)` : '0 4px 20px rgba(0,0,0,0.3)',
        transform: hover ? 'translateY(-3px)' : 'translateY(0)',
        transition:'all 0.3s cubic-bezier(0.2,0.8,0.2,1)', textAlign:'center',
        width:'46%', overflow:'hidden',
      }}
    >
      <div style={{ position:'absolute', top:0, left:0, right:0, height:'40%', background:'linear-gradient(180deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0) 100%)', pointerEvents:'none' }} />
      <div style={{ width:70, height:70, borderRadius:'50%', background:`hsla(${baseHue},60%,50%,0.1)`, display:'flex', alignItems:'center', justifyContent:'center', border:`2px solid hsla(${baseHue},60%,50%,0.3)`, boxShadow:`inset 0 0 20px hsla(${baseHue},60%,50%,0.1)`, transition:'transform 0.3s ease', transform: hover ? 'scale(1.1) rotate(10deg)' : 'scale(1) rotate(0deg)' }}>
        <div style={{ fontSize:32, filter:'drop-shadow(0 4px 8px rgba(0,0,0,0.5))' }}>🎱</div>
      </div>
      <div style={{ zIndex:1, marginTop:5 }}>
        <div style={{ fontSize:18, fontWeight:900, color:'#fff', letterSpacing:'-0.02em', lineHeight:1.2 }}>{tableData.name}</div>
        <div style={{ fontSize:13, color:`hsla(${baseHue},60%,70%,1)`, marginTop:4, fontWeight:700 }}>{tableData.value}</div>
        <div style={{ fontSize:11, color: statusColor, marginTop:6, fontWeight:700 }}>{statusLabel}</div>
        {(tableData.p1 || tableData.p2) && (
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', marginTop:4 }}>
            {tableData.p1 && `👤 ${tableData.p1}`}{tableData.p1 && tableData.p2 && ' vs '}{tableData.p2 && `${tableData.p2}`}
          </div>
        )}
      </div>
    </button>
  );
}
