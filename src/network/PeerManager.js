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
    // Configura servidores STUN para conexão global
    const config = {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
        ]
      }
    };
    this.peer = new Peer(roomId, config);
    
    this.peer.on('open', (id) => {
      onReady(id);
    });

    this.peer.on('connection', (conn) => {
      if (this.conn) return; 
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
    
    await this.initMicrophone();
  }

  async join(hostId) {
    this.isHost = false;
    const config = {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
        ]
      }
    };
    this.peer = new Peer(config);
    
    return new Promise((resolve, reject) => {
      this.peer.on('open', async () => {
        this.conn = this.peer.connect(hostId);
        this.setupConn();
        
        await this.initMicrophone();
        
        if (this.myStream) {
          this.call = this.peer.call(hostId, this.myStream);
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
