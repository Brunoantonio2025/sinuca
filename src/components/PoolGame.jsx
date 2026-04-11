import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw, Info, Trophy } from 'lucide-react';
import { initGame, cleanupGame } from '../game/GameEngine';

export default function PoolGame({ mode, onExit }) {
  const canvasRef = useRef(null);
  const [gameState, setGameState] = useState({
    turn: 'Player 1',
    message: 'Break!',
    p1Type: null, // 'solids' or 'stripes'
    p2Type: null,
    winner: null,
  });

  useEffect(() => {
    if (!canvasRef.current) return;
    
    // Initialize game engine
    const engine = initGame(canvasRef.current, mode, (state) => {
      setGameState(prev => ({...prev, ...state}));
    });

    return () => {
      cleanupGame(engine);
    };
  }, [mode]);

  return (
    <div className="flex flex-col items-center justify-center w-full h-full p-4 z-10 relative">
      {/* Top Header */}
      <div className="w-full max-w-5xl flex justify-between items-center mb-6 bg-slate-900/50 backdrop-blur-md p-4 rounded-2xl border border-slate-800 shadow-xl">
        <button 
          onClick={onExit}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-800"
        >
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>

        <div className="flex flex-col items-center">
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            {gameState.winner ? `Game Over` : `${gameState.turn}'s Turn`}
          </h2>
          <p className="text-slate-300 font-medium text-sm mt-1">{gameState.message}</p>
        </div>

        <div className="flex gap-4">
          <div className="flex flex-col items-end">
            <span className="text-xs text-slate-500 uppercase tracking-wider font-bold">Player 1</span>
            <span className={`text-sm font-bold ${gameState.p1Type ? (gameState.p1Type === 'SOLIDS' ? 'text-yellow-400' : 'text-blue-400') : 'text-slate-500'}`}>
              {gameState.p1Type || 'Unassigned'}
            </span>
          </div>
          <div className="w-px h-8 bg-slate-700"></div>
          <div className="flex flex-col items-start">
            <span className="text-xs text-slate-500 uppercase tracking-wider font-bold">
              {mode === 'pve' ? 'AI' : 'Player 2'}
            </span>
            <span className={`text-sm font-bold ${gameState.p2Type ? (gameState.p2Type === 'SOLIDS' ? 'text-yellow-400' : 'text-blue-400') : 'text-slate-500'}`}>
              {gameState.p2Type || 'Unassigned'}
            </span>
          </div>
        </div>
      </div>

      {/* Game Area */}
      <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-blue-900/20 ring-4 ring-slate-800">
        <canvas 
          ref={canvasRef} 
          width={1000} 
          height={500} 
          className="bg-slate-950 block cursor-crosshair"
          title="Drag mouse away from white ball to aim and set power. Release to shoot."
        />
        
        {/* Game Over Overlay */}
        {gameState.winner && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 z-20">
            <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full mb-6 flex items-center justify-center shadow-lg shadow-green-500/30">
              <Trophy size={32} className="text-white" />
            </div>
            <h2 className="text-5xl font-black mb-4 tracking-tight text-white drop-shadow-md">
              {gameState.winner} Wins!
            </h2>
            <div className="flex gap-4 mt-8">
              <button 
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white px-6 py-3 rounded-xl font-bold transition-transform hover:scale-105 shadow-lg"
              >
                <RefreshCw size={20} />
                Play Again
              </button>
              <button 
                onClick={onExit}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-xl font-bold transition-transform hover:scale-105 border border-slate-700"
              >
                Exit to Menu
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Instructions */}
      <div className="mt-8 flex items-center gap-3 text-slate-400 text-sm bg-slate-900/40 py-2 px-4 rounded-full border border-slate-800/50">
        <Info size={16} className="text-blue-400" />
        <p>Drag the mouse away from the white ball to aim and specify power. Release to shoot.</p>
      </div>
    </div>
  );
}
// wait, Trophy is used but not imported in PoolGame. Let's fix that.
