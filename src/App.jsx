import React, { useState, useEffect } from 'react';
import PoolGame from './components/PoolGame';
import { peerManager } from './network/PeerManager';
import { db } from './firebase';
import { collection, onSnapshot, setDoc, doc, deleteDoc } from 'firebase/firestore';

export default function App() {
  const [gameState, setGameState] = useState('menu');
  const [isAdmin, setIsAdmin] = useState(false);
  const [status, setStatus] = useState('');
  
  const [currentTableId, setCurrentTableId] = useState(null);
  
  // Custom Table states
  const [activeTables, setActiveTables] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableValue, setNewTableValue] = useState('');

  // Sincroniza mesas ativas com o Firebase
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tables'), (snapshot) => {
      const tables = [];
      snapshot.forEach(d => tables.push(d.data()));
      setActiveTables(tables);
    });
    return () => unsub();
  }, []);

  // LIMPEZA AUTOMÁTICA: Libera a mesa se o usuário sair ou recarregar
  useEffect(() => {
    const cleanup = async () => {
      if (currentTableId) {
        // Marcamos como 'open' para outros poderem entrar
        await setDoc(doc(db, 'tables', currentTableId), { status: 'open' }, { merge: true });
      }
    };

    const handleBeforeUnload = (e) => {
      cleanup();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      cleanup();
    };
  }, [currentTableId]);

  // Easter egg para virar Admin (typing ou via URL)
  useEffect(() => {
    // Checa se acessou por localhost:5173/admin ou VPS/admin
    if (window.location.pathname.toLowerCase().includes('/admin')) {
      setIsAdmin(true);
      setStatus('Modo Administrador Ativo.');
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

  const handleHostSubmit = async () => {
    if (!newTableName) return;
    const tableId = 'MESA-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    
    setStatus(`Criando mesa ${newTableName}...`);
    
    try {
      const tableObj = { 
        id: tableId, 
        name: newTableName, 
        value: newTableValue || 'Amistoso',
        baseHue: Math.floor(Math.random() * 360),
        status: 'open' 
      };
      
      await setDoc(doc(db, 'tables', tableId), tableObj);
      
      setShowCreateModal(false);
      setNewTableName('');
      setNewTableValue('');
      setStatus(`Mesa ${tableObj.name} criada!`);
      setTimeout(() => setStatus(''), 2000);
    } catch (e) {
      setStatus(`Erro: ${e.message}`);
    }
  };

  const handleJoinTable = async (table) => {
    if (isAdmin) return; 
    
    peerManager.onConnected = () => {
      setGameState('playing');
    };

    if (table.status === 'open') {
      setStatus(`Iniciando mesa...`);
      try {
        await peerManager.startHost(table.id, async () => {
          await setDoc(doc(db, 'tables', table.id), { status: 'waiting' }, { merge: true });
          setCurrentTableId(table.id);
          setStatus(`Aguardando oponente...`);
        });
      } catch (e) {
        setStatus("Erro ao iniciar. Tente outra mesa.");
      }
    } 
    else if (table.status === 'waiting') {
      setStatus(`Conectando...`);
      try {
        await peerManager.join(table.id);
        await setDoc(doc(db, 'tables', table.id), { status: 'full' }, { merge: true });
        setCurrentTableId(table.id);
      } catch (e) {
        setStatus(`Erro ao conectar. Mesa cheia?`);
      }
    } else {
      setStatus("Esta mesa está em jogo.");
    }
  };

  const handleDeleteTable = async (tableId) => {
    try {
      await deleteDoc(doc(db, 'tables', tableId));
      setStatus("Mesa excluída.");
      setTimeout(() => setStatus(''), 1000);
    } catch (e) {
      setStatus("Erro ao excluir.");
    }
  };

  return (
    <div style={{
      minHeight:'100vh', width:'100vw', overflow:'hidden', position:'relative',
      background:'radial-gradient(ellipse at 50% 0%, #0d1f17 0%, #060810 70%)',
      fontFamily:"'Inter','Segoe UI',Arial,sans-serif", color:'#fff',
      display:'flex', alignItems:'center', justifyContent:'center',
    }}>
      {/* Background felt texture illusion */}
      <div style={{
        position:'absolute', inset:0, pointerEvents:'none',
        backgroundImage:`repeating-linear-gradient(
          0deg, transparent, transparent 3px,
          rgba(0,80,30,0.04) 3px, rgba(0,80,30,0.04) 4px
        ), repeating-linear-gradient(
          90deg, transparent, transparent 3px,
          rgba(0,80,30,0.04) 3px, rgba(0,80,30,0.04) 4px
        )`,
      }} />

      {/* Glow blobs */}
      <div style={{ position:'absolute', top:'-10%', left:'20%', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle,rgba(30,100,60,0.22),transparent 70%)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:'-10%', right:'15%', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle,rgba(20,50,110,0.18),transparent 70%)', pointerEvents:'none' }} />

      {gameState === 'menu' && (
        <div style={{
          display:'flex', flexDirection:'column', alignItems:'center', gap:0,
          zIndex:10, animation: 'fadeIn 0.8s ease-out', width: '90%', maxWidth: 800
        }}>
          {/* Logo area */}
          <div style={{ marginBottom:40, textAlign:'center' }}>
            <div style={{ 
              fontSize:80, lineHeight:1, marginBottom:16, 
              display:'inline-block',
              filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.5))'
            }}>🎱</div>
            <h1 style={{
              fontSize:56, fontWeight:900, margin:0, letterSpacing:'-0.03em',
              background:'linear-gradient(135deg, #f5d061 0%, #e68e1a 50%, #ffffff 100%)',
              WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
              backgroundClip:'text',
              textShadow:'0px 10px 30px rgba(230, 142, 26, 0.2)',
              lineHeight:1.1,
            }}>Mesa 064</h1>
            <p style={{ color: isAdmin ? '#f5d061' : '#10b981', fontSize:14, fontWeight:800, margin:'8px 0 0', letterSpacing:'0.25em', textTransform:'uppercase', transition:'color 0.5s' }}>
              {isAdmin ? 'Painel de Controle Admin' : 'Saguão Principal'}
            </p>
          </div>

          {/* Tables list / Admin controls */}
          <div style={{ display:'flex', flexDirection:'column', gap:16, width: '100%', alignItems:'center', minHeight: 180 }}>
            {isAdmin ? (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }}>
                {!showCreateModal ? (
                  <button 
                    onClick={() => setShowCreateModal(true)}
                    style={{
                      padding: '20px 40px', fontSize: 20, fontWeight: 'bold',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      border: 'none', borderRadius: 30, color: '#fff',
                      cursor: 'pointer', boxShadow: '0 10px 30px rgba(16, 185, 129, 0.4)',
                      transition: 'transform 0.2s',
                    }}
                    onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                    onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                  >
                    ➕ Criar Nova Mesa
                  </button>
                ) : (
                  <div style={{
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    backdropFilter:'blur(10px)', padding: 30, borderRadius: 20,
                    display: 'flex', flexDirection: 'column', gap: 15, width: '100%', maxWidth: 450,
                    animation: 'fadeIn 0.3s'
                  }}>
                    <h3 style={{ margin: 0, color: '#f5d061', textAlign: 'center' }}>Configurações da Mesa</h3>
                    <input 
                      placeholder="Nome da Mesa (ex: Desafio Elite)"
                      value={newTableName}
                      onChange={e => setNewTableName(e.target.value)}
                      style={{ padding: '14px 16px', borderRadius: 10, border: 'none', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 16, outline: 'none' }}
                    />
                    <input 
                      placeholder="Valor da Partida (ex: R$ 50,00)"
                      value={newTableValue}
                      onChange={e => setNewTableValue(e.target.value)}
                      style={{ padding: '14px 16px', borderRadius: 10, border: 'none', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 16, outline: 'none' }}
                    />
                    <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                      <button onClick={handleHostSubmit} style={{ flex: 1, padding: 14, borderRadius: 10, border: 'none', background: '#10b981', color: '#fff', fontWeight: 'bold', cursor: 'pointer', fontSize: 16 }}>Confirmar Criação</button>
                      <button onClick={() => setShowCreateModal(false)} style={{ padding: 14, borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 'bold', cursor: 'pointer', fontSize: 16 }}>Cancelar</button>
                    </div>
                  </div>
                )}

                {/* Lista de mesas para o Admin gerenciar */}
                {activeTables.length > 0 && (
                  <div style={{ width: '100%', marginTop: 20 }}>
                    <h4 style={{ color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontSize: 12, letterSpacing: '2px', marginBottom: 15, textAlign: 'center' }}>Mesas em Aberto no Momento</h4>
                    <div style={{ display: 'flex', flexWrap:'wrap', gap: 12, justifyContent: 'center' }}>
                      {activeTables.map(t => (
                        <div key={t.id} style={{ 
                          background: 'rgba(255,255,255,0.03)', padding: '12px 20px', borderRadius: 15, 
                          display:'flex', alignItems:'center', gap: 15, border: '1px solid rgba(255,255,255,0.05)'
                        }}>
                          <span style={{ fontWeight: 'bold' }}>{t.name}</span>
                          <span style={{ opacity: 0.5, fontSize: 13 }}>{t.value}</span>
                          <button 
                            onClick={() => handleDeleteTable(t.id)}
                            style={{ 
                              background: '#ef4444', border: 'none', borderRadius: 8, padding: '5px 10px', 
                              color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 'bold'
                            }}
                          >
                            🗑️ Excluir
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap:'wrap', gap:16, width:'100%', justifyContent:'center' }}>
                {activeTables.length > 0 ? (
                  activeTables.map(t => (
                    <TableCard
                      key={t.id}
                      tableData={t}
                      onClick={() => handleJoinTable(t)}
                    />
                  ))
                ) : (
                  <div style={{ 
                    width:'100%', textAlign:'center', color:'rgba(255,255,255,0.4)', 
                    fontSize:16, border:'1px dashed rgba(255,255,255,0.1)', 
                    borderRadius:20, display:'flex', alignItems:'center', justifyContent:'center',
                    padding: '40px 0'
                  }}>
                    Nenhuma mesa ativa no momento.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Status Message */}
          <div style={{ height: 40, marginTop: 20 }}>
            {status && (
              <div style={{
                background:'rgba(0,0,0,0.6)', padding:'10px 20px', borderRadius:20,
                border:`1px solid ${isAdmin ? 'rgba(245, 208, 97, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                color: isAdmin ? '#f5d061' : '#10b981',
                fontSize: 14, fontWeight: 'bold', backdropFilter:'blur(5px)',
                animation:'fadeIn 0.3s ease-out'
              }}>
                {status}
              </div>
            )}
          </div>
        </div>
      )}

      {gameState === 'playing' && (
        <PoolGame mode="online" onExit={async () => {
          if (currentTableId) {
            await setDoc(doc(db, 'tables', currentTableId), { status: 'open' }, { merge: true });
            setCurrentTableId(null);
          }
          peerManager.disconnect();
          setGameState('menu');
          setStatus('');
        }} />
      )}
    </div>
  );
}

function TableCard({ tableData, onClick }) {
  const [hover, setHover] = useState(false);
  const baseHue = tableData.baseHue || 150;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position:'relative',
        display:'flex', flexDirection:'column', alignItems:'center', gap:10,
        background: hover ? `linear-gradient(135deg, hsla(${baseHue}, 50%, 15%, 0.8), hsla(${baseHue}, 40%, 8%, 0.8))` : `linear-gradient(135deg, hsla(${baseHue}, 30%, 12%, 0.4), hsla(${baseHue}, 20%, 6%, 0.4))`,
        border:`1px solid hsla(${baseHue}, 60%, 50%, ${hover ? '0.5' : '0.1'})`,
        backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)',
        borderRadius:20, padding:'24px 20px', cursor:'pointer',
        boxShadow: hover ? `0 12px 40px hsla(${baseHue}, 60%, 50%, 0.2), inset 0 0 0 1px hsla(${baseHue}, 60%, 50%, 0.2)` : `0 4px 20px rgba(0,0,0,0.3)`,
        transform: hover ? 'translateY(-3px)' : 'translateY(0)',
        transition:'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)', textAlign:'center',
        width:'46%',
        overflow:'hidden'
      }}
    >
      {/* Glossy inner reflection */}
      <div style={{
        position:'absolute', top:0, left:0, right:0, height:'40%',
        background:'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 100%)',
        pointerEvents:'none'
      }} />

      <div style={{
        width:70, height:70, borderRadius:'50%',
        background:`hsla(${baseHue}, 60%, 50%, 0.1)`,
        display:'flex', alignItems:'center', justifyContent:'center',
        border:`2px solid hsla(${baseHue}, 60%, 50%, 0.3)`,
        boxShadow:`inset 0 0 20px hsla(${baseHue}, 60%, 50%, 0.1)`,
        transition:'transform 0.3s ease',
        transform: hover ? 'scale(1.1) rotate(10deg)' : 'scale(1) rotate(0deg)'
      }}>
        <div style={{ fontSize:32, filter:'drop-shadow(0 4px 8px rgba(0,0,0,0.5))' }}>🎱</div>
      </div>
      
      <div style={{ zIndex: 1, marginTop: 5 }}>
        <div style={{ fontSize:18, fontWeight:900, color:'#fff', letterSpacing:'-0.02em', lineHeight: 1.2 }}>
          {tableData.name}
        </div>
        <div style={{ fontSize:13, color:`hsla(${baseHue}, 60%, 70%, 1)`, marginTop:4, fontWeight:700 }}>
          {tableData.value}
        </div>
      </div>
    </button>
  );
}
