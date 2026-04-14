import React, { useEffect, useRef, useState } from 'react';
import { peerManager } from '../network/PeerManager';

export default function VoiceChat() {
  const [remoteStream, setRemoteStream] = useState(null);
  const [muted, setMuted] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    peerManager.onVoice = (stream) => {
      setRemoteStream(stream);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current && remoteStream) {
      audioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const toggleMute = () => {
    if (peerManager.myStream) {
      const audioTracks = peerManager.myStream.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks[0].enabled = muted; // if muted currently (true), enable it (true)
        setMuted(!muted);
      }
    }
  };

  return (
    <div style={{
      position:'absolute', bottom: 20, right: 20, display:'flex', gap: 12, alignItems:'center',
      background:'rgba(15,23,42,0.85)', padding:'10px 18px', borderRadius:24,
      boxShadow:'0 10px 30px rgba(0,0,0,0.5)', border:'1px solid rgba(255,255,255,0.1)', zIndex: 100
    }}>
      <audio ref={audioRef} autoPlay />
      
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: remoteStream ? '#4ade80' : '#f59e0b',
          boxShadow: `0 0 10px ${remoteStream ? '#4ade80' : '#f59e0b'}`
        }} />
        <span style={{ color:'#e2e8f0', fontSize:13, fontWeight:600 }}>
          {remoteStream ? 'Chat de Voz Online' : 'Conectando voz...'}
        </span>
      </div>

      <div style={{ width: 1, height: 20, background:'rgba(255,255,255,0.2)' }} />

      <button onClick={toggleMute} style={{
        background: muted ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)',
        color: muted ? '#ef4444' : '#fff',
        border: muted ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.2)',
        borderRadius: 16, padding:'6px 14px', cursor:'pointer', fontSize: 13, fontWeight: 'bold',
        display:'flex', alignItems:'center', gap: 6, transition: 'all 0.2s'
      }}>
        {muted ? '🔇 Muted' : '🎤 Unmute'}
      </button>
    </div>
  );
}
