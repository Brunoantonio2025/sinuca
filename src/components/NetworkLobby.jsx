import React, { useState, useEffect } from 'react';
import { peerManager } from '../network/PeerManager';

export default function NetworkLobby({ onConnected, onCancel }) {
  const [role, setRole] = useState('guest'); // 'host', 'guest', 'adminAuth', 'hostScreen'
  const [hostId, setHostId] = useState('');
  const [joinId, setJoinId] = useState('');
  const [status, setStatus] = useState('');
  const [copied, setCopied] = useState(false);

  const [authPass, setAuthPass] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    peerManager.onConnected = () => {
      onConnected(); // Start game
    };
    return () => {
      peerManager.onConnected = null;
    };
  }, [onConnected]);

  const handleAdminVerify = () => {
    if (authPass === 'admin123') { // Simple admin password
      setIsAdmin(true);
      setRole('hostScreen');
    } else {
      setStatus('Senha incorreta!');
    }
  };

  const handleHost = async () => {
    setRole('host');
    setStatus('Iniciando sala e microfone...');
    try {
      await peerManager.startHost((id) => {
        setHostId(id);
        setStatus('Aguardando oponente conectar...');
      });
    } catch (e) {
      setStatus('Erro ao iniciar Host: ' + e.message);
    }
  };

  const handleJoin = async () => {
    if (!joinId) return;
    setStatus('Conectando e abrindo microfone...');
    try {
      await peerManager.join(joinId.trim().toUpperCase());
    } catch (e) {
      setStatus('Erro de Conexão. Verifique o código.');
    }
  };

  return (
    <div style={{
      display:'flex', flexDirection:'column', alignItems:'center', gap:20,
      background:'rgba(0,0,0,0.6)', padding: 40, borderRadius: 20,
      border:'1px solid rgba(255,255,255,0.1)', backdropFilter:'blur(10px)',
      WebkitBackdropFilter:'blur(10px)',
      zIndex: 10, maxWidth: 400, width: '100%', textAlign: 'center',
      boxShadow: '0 10px 40px rgba(0,0,0,0.8)'
    }}>
      <h2 style={{ margin:0, color:'#fff', fontSize:28, fontWeight:800 }}>Partida Online</h2>
      <p style={{ margin:0, color:'#94a3b8', fontSize:14 }}>
        {role === 'guest' ? 'Conecte-se a uma sala usando o código convite.' : 'Área de Administração'}
      </p>

      {role === 'adminAuth' && (
        <div style={{ width: '100%', marginTop: 10, display:'flex', flexDirection:'column', gap:10 }}>
          <input 
            type="password"
            placeholder="Senha de administrador" 
            value={authPass}
            onChange={e => setAuthPass(e.target.value)}
            style={inputStyle}
          />
          <button onClick={handleAdminVerify} style={btnStyle('#10b981')}>Autenticar</button>
        </div>
      )}

      {role === 'hostScreen' && isAdmin && (
        <div style={{ width: '100%', marginTop: 10, display:'flex', flexDirection:'column', gap:10 }}>
          <p style={{ color:'#10b981', margin:0, fontWeight:700 }}>Acesso Admin ✅</p>
          <button onClick={handleHost} style={btnStyle('#16a34a')}>Criar Sala Oficial</button>
        </div>
      )}

      {role === 'host' && isAdmin && (
        <div style={{ width: '100%', marginTop: 10 }}>
          {hostId ? (
            <div style={{ background:'rgba(0,0,0,0.5)', padding: 20, borderRadius: 12 }}>
              <p style={{ color:'#94a3b8', margin:'0 0 10px 0', fontSize:14 }}>Código da sua Sala:</p>
              <div style={{ display:'flex', gap:10 }}>
                <input readOnly value={hostId} style={inputStyle} />
                <button onClick={() => { navigator.clipboard.writeText(hostId); setCopied(true); }} style={copyBtnStyle}>
                  {copied ? '✔ Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {role === 'guest' && (
        <div style={{ width: '100%', marginTop: 10, display:'flex', flexDirection:'column', gap:10 }}>
          <input 
            placeholder="Digite o código da sala..." 
            value={joinId}
            onChange={e => {
              const val = e.target.value;
              if (val.toLowerCase() === '/admin') {
                setRole('adminAuth');
                setJoinId('');
              } else {
                setJoinId(val);
              }
            }}
            style={{ ...inputStyle, textTransform: 'uppercase' }}
          />
          <button onClick={handleJoin} style={btnStyle('#3b82f6')}>Conectar</button>
        </div>
      )}

      {status && <div style={{ color:'#f5d061', fontSize:14, fontWeight:'bold', marginTop:10 }}>{status}</div>}

      <button onClick={() => { peerManager.disconnect(); onCancel(); }} style={{ ...btnStyle('transparent'), border:'1px solid rgba(255,255,255,0.2)', marginTop: 10 }}>
        Cancelar e Voltar
      </button>
    </div>
  );
}

const btnStyle = (bg) => ({
  flex: 1, padding: '14px', borderRadius: 12, border: 'none', background: bg, 
  color: '#fff', fontSize: 16, fontWeight: 'bold', cursor: 'pointer',
  transition: 'transform 0.1s', width: '100%'
});
const inputStyle = {
  flex: 1, padding: '12px', borderRadius: 8, border: '1px solid #475569', 
  background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 16, textAlign:'center',
  fontWeight: 'bold', letterSpacing: '2px', width: '100%', boxSizing:'border-box'
};
const copyBtnStyle = {
  padding: '0 16px', borderRadius: 8, border: 'none', background: '#f5c518', 
  color: '#000', fontSize: 14, fontWeight: 'bold', cursor: 'pointer',
};
