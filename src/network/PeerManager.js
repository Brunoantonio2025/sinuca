import { Peer } from 'peerjs';

class PeerManager {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.call = null;
    this.myStream = null;
    
    this.onData = null;
    this.onVoice = null;
    this.onConnected = null;
    this.onError = null;
    
    this.isHost = false;
  }

  generateId() {
    return 'SINUCA-' + Math.random().toString(36).substr(2, 6).toUpperCase();
  }

  async initMicrophone() {
    try {
      this.myStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (e) {
      console.warn("Sem permissão ou sem microfone disponível.", e);
    }
  }

  async startHost(roomId, onReady) {
    this.isHost = true;
    const globalRoomId = 'SINUCA_V1_' + roomId; // Prefixo único para seu app
    
    const config = {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ]
      }
    };
    
    this.peer = new Peer(globalRoomId, config);
    
    this.peer.on('open', (id) => {
      onReady(id);
    });

    this.peer.on('connection', (conn) => {
      this.conn = conn;
      this.setupConn();
      if (this.onConnected) this.onConnected();
    });

    this.peer.on('call', (call) => {
      this.call = call;
      call.answer(this.myStream);
      call.on('stream', (remoteStream) => {
        if (this.onVoice) this.onVoice(remoteStream);
      });
    });
    
    // Tenta microfone mas não trava se falhar (comum em HTTP)
    await this.initMicrophone();
  }

  async join(roomId) {
    this.isHost = false;
    const globalRoomId = 'SINUCA_V1_' + roomId;
    
    const config = {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ]
      }
    };
    
    this.peer = new Peer(config);
    
    return new Promise((resolve, reject) => {
      this.peer.on('open', async () => {
        this.conn = this.peer.connect(globalRoomId);
        this.setupConn();
        
        await this.initMicrophone();
        
        if (this.myStream) {
          this.call = this.peer.call(globalRoomId, this.myStream);
          this.call.on('stream', (remoteStream) => {
            if (this.onVoice) this.onVoice(remoteStream);
          });
        }
        
        this.conn.on('open', () => {
          if (this.onConnected) this.onConnected();
          resolve();
        });
        
        this.peer.on('error', (err) => reject(err));
      });
    });
  }

  setupConn() {
    this.conn.on('data', (data) => {
      if (this.onData) this.onData(data);
    });
  }

  send(data) {
    if (this.conn && this.conn.open) {
      this.conn.send(data);
    }
  }

  disconnect() {
    if (this.myStream) this.myStream.getTracks().forEach(t => t.stop());
    if (this.conn) this.conn.close();
    if (this.call) this.call.close();
    if (this.peer) this.peer.destroy();
    
    this.peer = null;
    this.conn = null;
    this.call = null;
    this.myStream = null;
  }
}

export const peerManager = new PeerManager();
