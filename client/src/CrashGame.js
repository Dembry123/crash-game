import React, { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3001';

function CrashGame() {
  const [balance, setBalance] = useState(1000);
  const [bet, setBet] = useState(10);
  const [multiplier, setMultiplier] = useState(1);
  const [phase, setPhase] = useState('waiting');
  const [countdown, setCountdown] = useState(10);
  const [hasBet, setHasBet] = useState(false);
  const [userName, setUserName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);
  const [recentCrashes, setRecentCrashes] = useState([]);
  const canvasRef = useRef(null);
  const timeRef = useRef(0);
  const particlesRef = useRef([]);
  const trailRef = useRef([]);
  const socket = useRef(null);
  const lastMultiplierRef = useRef(1);
  const lastUpdateTimeRef = useRef(Date.now());

  const CANVAS_WIDTH = 840;
  const CANVAS_HEIGHT = 560;
  const SCALE = 2;
  const FACTOR_X = CANVAS_WIDTH / 6;
  const FACTOR_Y = CANVAS_HEIGHT / 4;
  const MARGIN = 35;

  const updateParticles = useCallback((worldX, worldY) => {
    if (phase === 'running' && particlesRef.current.length < 200) {
      for (let i = 0; i < 4; i++) {
        particlesRef.current.push({
          worldX: worldX + (Math.random() - 0.5) * 20,
          worldY: worldY - 20,
          vx: (Math.random() - 0.5) * 4,
          vy: -(2 + Math.random() * 4),
          life: 1.0,
        });
      }
    }
    particlesRef.current.forEach(p => {
      p.worldX += p.vx;
      p.worldY += p.vy;
      p.life -= 0.02;
      if (p.life < 0) console.warn('Negative life detected:', p.life);
    });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);
  }, [phase]);

  useEffect(() => {
    socket.current = io(SOCKET_URL);

    socket.current.on('gameUpdate', (data) => {
      setPhase(data.phase);
      setMultiplier(data.multiplier);
      setBalance(data.balance);
      setCountdown(data.countdown || 0);
      setUserName(data.name || '');
    });

    socket.current.on('userUpdate', (data) => {
      setBalance(data.balance);
      setUserName(data.name || '');
    });

    socket.current.on('multiplierUpdate', (newMultiplier) => {
      setMultiplier(newMultiplier);
      lastMultiplierRef.current = newMultiplier;
      lastUpdateTimeRef.current = Date.now();
    });

    socket.current.on('waitingPhase', ({ countdown }) => {
      setPhase('waiting');
      setCountdown(countdown);
      setHasBet(false);
      timeRef.current = 0;
      trailRef.current = [];
      particlesRef.current = [];
    });

    socket.current.on('gameStarted', () => {
      setPhase('running');
    });

    socket.current.on('gameCrashed', ({ crashPoint }) => {
      setPhase('crashed');
      setRecentCrashes(prev => [...prev, crashPoint].slice(-10));
    });

    socket.current.on('balanceUpdate', (newBalance) => setBalance(newBalance));
    socket.current.on('cashOutSuccess', ({ multiplier, winnings }) => {
      alert(`Cashed out at ${multiplier.toFixed(2)}x! Won $${winnings.toFixed(2)}`);
    });

    socket.current.on('leaderboardUpdate', (lb) => setLeaderboard(lb));

    return () => socket.current.disconnect();
  }, []);

  const setMyName = () => {
    if (nameInput.trim()) {
      socket.current.emit('setName', nameInput.trim());
      setNameInput('');
    }
  };

  const placeBet = () => {
    if (phase !== 'waiting' || bet > balance || bet <= 0 || hasBet || !userName) return;
    socket.current.emit('placeBet', bet);
    setHasBet(true);
  };

  const cashOut = () => {
    if (phase !== 'running' || !hasBet) return;
    socket.current.emit('cashOut');
  };

  useEffect(() => {
    let frameId;
    const animate = () => {
      if (!canvasRef.current) return;
      const ctx = canvasRef.current.getContext('2d');

      const now = Date.now();
      const timeSinceLastUpdate = (now - lastUpdateTimeRef.current) / 1000;
      const estimatedMultiplier = lastMultiplierRef.current + (timeSinceLastUpdate * 0.1);

      const t = estimatedMultiplier - 1;
      const worldX = t * FACTOR_X;
      const worldY = Math.pow(t, 1.5) * (FACTOR_Y / 2);

      let zoomScale = 1;
      if (worldX > 0 && worldY > 0) {
        const scaleX = (CANVAS_WIDTH - MARGIN) / worldX;
        const scaleY = (CANVAS_HEIGHT - MARGIN) / worldY;
        zoomScale = Math.min(1, Math.min(scaleX, scaleY));
      }

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.beginPath();
      ctx.moveTo(0, CANVAS_HEIGHT);
      ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.moveTo(0, CANVAS_HEIGHT);
      ctx.lineTo(0, 0);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = SCALE * zoomScale;
      ctx.stroke();

      if (phase === 'running' && (now - (trailRef.current[trailRef.current.length - 1]?.timestamp || 0) > 100)) {
        trailRef.current.push({ worldX, worldY, timestamp: now });
        if (trailRef.current.length > 400) trailRef.current.shift();
      }
      ctx.beginPath();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4 * zoomScale;
      trailRef.current.forEach((point, i) => {
        const drawX = point.worldX * zoomScale;
        const drawY = CANVAS_HEIGHT - point.worldY * zoomScale;
        if (i === 0) ctx.moveTo(drawX, drawY);
        else ctx.lineTo(drawX, drawY);
      });
      ctx.stroke();

      if (phase !== 'crashed') {
        const drawRocketX = worldX * zoomScale;
        const drawRocketY = CANVAS_HEIGHT - worldY * zoomScale;
        ctx.beginPath();
        ctx.arc(drawRocketX, drawRocketY, 10 * zoomScale, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
      }

      particlesRef.current.forEach(p => {
        const drawX = p.worldX * zoomScale;
        const drawY = CANVAS_HEIGHT - p.worldY * zoomScale;
        ctx.beginPath();
        ctx.arc(drawX, drawY, Math.max(0, 6 * p.life) * zoomScale, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 128, 0, ${Math.max(0, p.life)})`;
        ctx.fill();
      });

      if (phase === 'running') {
        updateParticles(worldX, worldY);
      }

      if (phase === 'crashed') {
        if (particlesRef.current.length < 400) {
          for (let i = 0; i < 100; i++) {
            particlesRef.current.push({
              worldX: worldX + (Math.random() - 0.5) * 40,
              worldY: worldY + (Math.random() - 0.5) * 40,
              vx: (Math.random() - 0.5) * 10,
              vy: (Math.random() - 0.5) * 10,
              life: 1.0,
            });
          }
        }
        particlesRef.current.forEach(p => {
          p.worldX += p.vx;
          p.worldY += p.vy;
          p.life -= 0.02;
        });
        particlesRef.current = particlesRef.current.filter(p => p.life > 0);
      }

      // Draw recent crash cards
      const cardWidth = 42;
      const cardHeight = 17.5;
      const spacing = 7;
      const marginRight = 7;
      const marginTop = 7;
      const numCards = recentCrashes.length;
      const totalWidth = numCards * cardWidth + (numCards - 1) * spacing;
      let startX = CANVAS_WIDTH - totalWidth - marginRight;
      for (let i = 0; i < numCards; i++) {
        const x = startX + i * (cardWidth + spacing);
        const y = marginTop;
        ctx.fillStyle = 'white';
        ctx.fillRect(x, y, cardWidth, cardHeight);
        ctx.strokeStyle = 'orange';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(x, y, cardWidth, cardHeight);
        const multi = recentCrashes[i];
        const text = `${multi.toFixed(2)}x`;
        ctx.font = '10px Arial';
        ctx.fillStyle = 'green';
        const textWidth = ctx.measureText(text).width;
        ctx.fillText(text, x + (cardWidth - textWidth)/2, y + cardHeight/2 + 3.5);
      }

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frameId);
  }, [phase, updateParticles, FACTOR_X, FACTOR_Y, recentCrashes]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: 'Arial', background: '#222', color: '#fff' }}>
      <div style={{ margin: '10px', fontSize: '1.2em' }}>
        Balance: ${balance.toFixed(2)} | Multiplier: {multiplier.toFixed(2)}x | Phase: {phase} | {phase === 'waiting' ? `Countdown: ${countdown}s` : ''}
        {userName && phase === 'waiting' && (
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
      {!userName ? (
        <div>
          Enter your name:
          <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} />
          <button onClick={setMyName}>Set Name</button>
        </div>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
        <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{ border: '2px solid #fff', background: '#333' }} />
        <div style={{ marginLeft: '20px', width: '200px' }}>
          <h3>Leaderboard</h3>
          {leaderboard.map((entry, i) => (
            <div key={i}>{entry.name}: {entry.result} - ${entry.money}</div>
          ))}
        </div>
      </div>
      {phase === 'running' && hasBet && (
        <button onClick={cashOut} style={{
          position: 'fixed',
          left: '20px',
          top: '50%',
          transform: 'translateY(-50%)',
          padding: '10px 20px',
          fontSize: '1em',
          cursor: 'pointer',
          background: '#28a745',
          color: '#fff',
          border: 'none',
          borderRadius: '5px',
        }}>
          Cash Out
        </button>
      )}
      {phase === 'waiting' && !hasBet && userName && (
        <button onClick={placeBet} style={{
          padding: '10px 20px',
          margin: '10px',
          fontSize: '1em',
          cursor: 'pointer',
          background: '#007bff',
          color: '#fff',
          border: 'none',
          borderRadius: '5px',
        }}>
          Place Bet & Join
        </button>
      )}
    </div>
  );
}

export default CrashGame;