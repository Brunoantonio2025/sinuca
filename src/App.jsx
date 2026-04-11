import React, { useState, useEffect, useRef } from 'react';
import PoolGame from './components/PoolGame';
import { Play, User, Monitor, Trophy } from 'lucide-react';

export default function App() {
  const [gameState, setGameState] = useState('menu'); // menu, playing, gameover
  const [mode, setMode] = useState('pvp'); // pvp or pve

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center font-sans text-slate-100 overflow-hidden relative">
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600 rounded-full blur-[120px]"></div>
      </div>
      
      {gameState === 'menu' && (
        <div className="z-10 bg-slate-900/50 backdrop-blur-xl p-10 rounded-3xl border border-slate-800 shadow-2xl flex flex-col items-center max-w-md w-full mx-4">
          <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mb-6 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Trophy size={40} className="text-white" />
          </div>
          <h1 className="text-4xl font-extrabold mb-2 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
            Neon Pool // 8-Ball
          </h1>
          <p className="text-slate-400 mb-10 text-center text-sm">
            Experience premium billiards with stunning physics and neon aesthetics.
          </p>
          
          <div className="flex flex-col gap-4 w-full">
            <button 
              onClick={() => { setMode('pve'); setGameState('playing'); }}
              className="flex items-center justify-center gap-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white p-4 rounded-xl font-bold transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-500/25"
            >
              <Monitor size={20} />
              Play vs AI
            </button>
            <button 
              onClick={() => { setMode('pvp'); setGameState('playing'); }}
              className="flex items-center justify-center gap-3 bg-slate-800 hover:bg-slate-700 text-white p-4 rounded-xl font-bold transition-all transform hover:scale-[1.02] active:scale-[0.98] border border-slate-700"
            >
              <User size={20} />
              Play vs Friend
            </button>
          </div>
        </div>
      )}

      {gameState === 'playing' && (
        <PoolGame mode={mode} onExit={() => setGameState('menu')} />
      )}
    </div>
  );
}
