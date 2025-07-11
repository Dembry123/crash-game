import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3001';  // Your server URL

function CrashGame() {
  const [balance, setBalance] = useState(1000);
  const [bet, setBet] = useState(10);
  const [multiplier, setMultiplier] = useState(1);
  const [phase, setPhase] = useState('waiting');
  const [countdown, setCountdown] = useState(10);
  const [hasBet, setHasBet] = useState(false);
  const canvasRef = useRef(null);
  const timeRef = useRef(0);
  const particlesRef = useRef([]);
  const trailRef = useRef([]);
  const socket = useRef(null);

  useEffect(() => {
    socket.current = io(SOCKET_URL);

    socket.current.on('gameUpdate', (data) => {
      setPhase(data.phase);
      setMultiplier(data.multiplier);
      setBalance(data.balance);
      setCountdown(data.countdown || 0);
    });

    socket.current.on('multiplierUpdate', (newMultiplier) => {
      setMultiplier(newMultiplier);
      // Update canvas here (adapt your drawGraph to use server multiplier)
      drawGraph(canvasRef.current.getContext('2d'));
    });

    socket.current.on('waitingPhase', ({ countdown }) => {
      setPhase('waiting');
      setCountdown(countdown);
      setHasBet(false);  // Reset for new round
      timeRef.current = 0;
      trailRef.current = [];
      particlesRef.current = [];
    });

    socket.current.on('gameStarted', () => {
      setPhase('running');
    });

    socket.current.on('gameCrashed', ({ crashPoint }) => {
      setPhase('crashed');
      alert(`Crashed at ${crashPoint.toFixed(2)}x!`);
      // Handle loss if not cashed out
    });

    socket.current.on('balanceUpdate', (newBalance) => setBalance(newBalance));
    socket.current.on('cashOutSuccess', ({ multiplier, winnings }) => {
      alert(`Cashed out at ${multiplier.toFixed(2)}x! Won $${winnings.toFixed(2)}`);
    });

    return () => socket.current.disconnect();
  }, []);

  const placeBet = () => {
    if (phase !== 'waiting' || bet > balance || bet <= 0 || hasBet) return;
    socket.current.emit('placeBet', bet);
    setHasBet(true);
  };

  const cashOut = () => {
    if (phase !== 'running' || !hasBet) return;
    socket.current.emit('cashOut');
  };

  // Adapt your drawGraph, updateParticles, etc., to use server-driven multiplier
  // Remove local animation loop; trigger draws on 'multiplierUpdate'
  const drawGraph = (ctx) => {
    // Your existing draw code, but use multiplier from state
    // For rocket position, derive from multiplier (e.g., inverse of your exp formula)
    const time = Math.log(multiplier) / 0.5;  // Approximate from your exp formula
    const rocketY = 400 - (Math.pow(Math.E, time * 0.5) * 100);
    const rocketX = (Math.pow(Math.E, time * 0.5) - 1) * 100;

    // Trail/particles as before...
    // ...
  };

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    drawGraph(ctx);
  }, [multiplier, phase]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: 'Arial', background: '#222', color: '#fff' }}>
      <div style={{ margin: '10px', fontSize: '1.2em' }}>
        Balance: ${balance.toFixed(2)} | Multiplier: {multiplier.toFixed(2)}x | Phase: {phase} | {phase === 'waiting' ? `Countdown: ${countdown}s` : ''}
        {phase === 'waiting' && (
          <>
            Bet: $
            <input
              type="number"
              value={bet}
              min="1"
              max={balance}
              style={{ width: '60px' }}
              onChange={(e) => setBet(Math.max(1, Math.min(balance, parseFloat(e.target.value))))}
            />
          </>
        )}
      </div>
      <canvas ref={canvasRef} width={600} height={400} style={{ border: '2px solid #fff', background: '#333' }} />
      {phase === 'running' && hasBet && (
        <button onClick={cashOut} style={{ /* your styles */ }}>
          Cash Out
        </button>
      )}
      {phase === 'waiting' && !hasBet && (
        <button onClick={placeBet} style={{ /* your styles */ }}>
          Place Bet & Join
        </button>
      )}
    </div>
  );
}

export default CrashGame;