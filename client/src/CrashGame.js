import React, { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import CryptoJS from 'crypto-js';

const SOCKET_URL = 'http://localhost:3001';

const CANVAS_WIDTH = 840;
const CANVAS_HEIGHT = 560;
const SCALE = 2;
const FACTOR_X = CANVAS_WIDTH / 6;
const FACTOR_Y = CANVAS_HEIGHT / 4;
const MARGIN = 35;

// GameCanvas component: Handles canvas rendering and animation
const GameCanvas = ({ phase, multiplier, crashMultiplier, recentCrashes, countdown, updateParticles }) => {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const lastMultiplierRef = useRef(1);
  const lastUpdateTimeRef = useRef(Date.now());

  useEffect(() => {
    let frameId;
    const animate = () => {
      if (!canvasRef.current) return;
      const ctx = canvasRef.current.getContext('2d');

      let estimatedMultiplier = multiplier;
      let endMultiplier = multiplier;
      let end_t = 0;

      if (phase === 'running') {
        const now = Date.now();
        const timeSinceLastUpdate = (now - lastUpdateTimeRef.current) / 1000;
        estimatedMultiplier = lastMultiplierRef.current + (timeSinceLastUpdate * 0.1);
        endMultiplier = estimatedMultiplier;
      } else if (phase === 'crashed') {
        endMultiplier = crashMultiplier;
      }

      end_t = endMultiplier - 1;

      const numPoints = 200;
      const tempTrail = [];
      if (end_t > 0 && (phase === 'running' || phase === 'crashed')) {
        for (let i = 0; i <= numPoints; i++) {
          const ti = (i / numPoints) * end_t;
          const wx = ti * FACTOR_X;
          const wy = Math.pow(ti, 1.5) * (FACTOR_Y / 2);
          tempTrail.push({ worldX: wx, worldY: wy });
        }
      }

      let worldX = 0;
      let worldY = 0;
      if (end_t > 0) {
        worldX = end_t * FACTOR_X;
        worldY = Math.pow(end_t, 1.5) * (FACTOR_Y / 2);
      }

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

      ctx.beginPath();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4 * zoomScale;
      tempTrail.forEach((point, i) => {
        const drawX = point.worldX * zoomScale;
        const drawY = CANVAS_HEIGHT - point.worldY * zoomScale;
        if (i === 0) ctx.moveTo(drawX, drawY);
        else ctx.lineTo(drawX, drawY);
      });
      ctx.stroke();

      if (phase === 'running') {
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

      particlesRef.current.forEach(p => {
        p.worldX += p.vx;
        p.worldY += p.vy;
        p.life -= 0.02;
      });
      particlesRef.current = particlesRef.current.filter(p => p.life > 0);

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

      let displayText = '';
      if (phase === 'running') {
        displayText = `${estimatedMultiplier.toFixed(2)}x`;
      } else if (phase === 'crashed') {
        displayText = `Crashed at ${crashMultiplier.toFixed(2)}x`;
      } else if (phase === 'waiting') {
        displayText = `${countdown}s`;
      }

      if (displayText) {
        ctx.font = 'bold 48px Arial';
        ctx.fillStyle = phase === 'crashed' ? '#ff0000' : '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(displayText, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      }

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [phase, multiplier, crashMultiplier, recentCrashes, countdown, updateParticles]);

  return <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{ border: '2px solid #fff', background: '#333' }} />;
};

// NameInput component: Handles user name input
const NameInput = ({ nameInput, setNameInput, setMyName }) => (
  <div>
    Enter your name:
    <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} />
    <button onClick={setMyName}>Set Name</button>
  </div>
);

// BetControls component: Handles bet input and placement
const BetControls = ({ phase, bet, setBet, balance, hasBet, userName, placeBet }) => (
  <div style={{
    width: '200px',
    marginRight: '20px',
    padding: '10px',
    background: '#fff',
    border: '2px solid orange',
    borderRadius: '5px',
    color: '#000'
  }}>
    <div style={{ marginBottom: '10px' }}>
      Bet: $
      <input
        type="number"
        value={bet}
        min="1"
        max={balance}
        style={{ width: '60px' }}
        onChange={(e) => setBet(Math.max(1, Math.min(balance, parseFloat(e.target.value))))}
      />
    </div>
    <button
      onClick={placeBet}
      style={{
        padding: '10px 20px',
        fontSize: '1em',
        cursor: 'pointer',
        background: phase === 'running' ? '#cccccc' : '#007bff',
        color: '#fff',
        border: 'none',
        borderRadius: '5px',
        width: '100%'
      }}
      disabled={phase !== 'waiting' || bet > balance || bet <= 0 || hasBet || !userName}
    >
      Place Bet & Join
    </button>
  </div>
);

// CashOutButton component: Handles cash-out action
const CashOutButton = ({ phase, hasBet, cashOut }) => (
  phase === 'running' && hasBet && (
    <button
      onClick={cashOut}
      style={{
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
        borderRadius: '5px'
      }}
    >
      Cash Out
    </button>
  )
);

// Leaderboard component: Displays leaderboard data
const Leaderboard = ({ leaderboard }) => (
  <div style={{ marginLeft: '20px', width: '200px' }}>
    <h3>Leaderboard</h3>
    {leaderboard.map((entry, i) => (
      <div key={i}>{entry.name}: {entry.result} - ${entry.money}</div>
    ))}
  </div>
);

// CrashGame component: Main component orchestrating state and socket logic
const CrashGame = () => {
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
  const [crashMultiplier, setCrashMultiplier] = useState(0);
  const [roundId, setRoundId] = useState(0);
  const [serverSeedHash, setServerSeedHash] = useState('');
  const [revealedServerSeed, setRevealedServerSeed] = useState('');
  const socket = useRef(null);
  const lastMultiplierRef = useRef(1);
  const lastUpdateTimeRef = useRef(Date.now());
  const particlesRef = useRef([]);

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

    socket.current.on('waitingPhase', ({ countdown, roundId, serverSeedHash }) => {
      setPhase('waiting');
      setMultiplier(1);
      setCrashMultiplier(0);
      lastMultiplierRef.current = 1;
      lastUpdateTimeRef.current = Date.now();
      setCountdown(countdown);
      setHasBet(false);
      particlesRef.current = [];
      setRoundId(roundId);
      setServerSeedHash(serverSeedHash);
      setRevealedServerSeed('');
    });

    socket.current.on('gameStarted', () => {
      setPhase('running');
    });

    socket.current.on('gameCrashed', ({ crashPoint, serverSeed }) => {
      setPhase('crashed');
      setCrashMultiplier(crashPoint);
      setRevealedServerSeed(serverSeed);
    });

    socket.current.on('recentCrashes', (crashes) => {
      setRecentCrashes(crashes);
    });

    socket.current.on('recentCrashesUpdate', (crashes) => {
      setRecentCrashes(crashes);
    });

    socket.current.on('balanceUpdate', (newBalance) => setBalance(newBalance));
    socket.current.on('cashOutSuccess', ({ multiplier, winnings }) => {
      alert(`Cashed out at ${multiplier.toFixed(2)}x! Won $${winnings.toFixed(2)}`);
    });

    socket.current.on('leaderboardUpdate', (lb) => setLeaderboard(lb));
    socket.current.on('countdownUpdate', (newCountdown) => setCountdown(newCountdown));

    return () => socket.current.disconnect();
  }, []);

  useEffect(() => {
    if (phase === 'crashed') {
      const t = crashMultiplier - 1;
      const worldX = t * FACTOR_X;
      const worldY = Math.pow(t, 1.5) * (FACTOR_Y / 2);
      for (let i = 0; i < 400; i++) {
        particlesRef.current.push({
          worldX: worldX + (Math.random() - 0.5) * 40,
          worldY: worldY + (Math.random() - 0.5) * 40,
          vx: (Math.random() - 0.5) * 10,
          vy: (Math.random() - 0.5) * 10,
          life: 1.0,
        });
      }
    }
  }, [phase, crashMultiplier]);

  useEffect(() => {
    if (phase === 'crashed' && revealedServerSeed) {
      const computedHash = CryptoJS.SHA256(revealedServerSeed).toString(CryptoJS.enc.Hex);
      if (computedHash !== serverSeedHash) {
        console.error('Verification failed: Hash mismatch!');
        return;
      }
      const hmac = CryptoJS.HmacSHA256(roundId.toString(), revealedServerSeed);
      const hash = hmac.toString(CryptoJS.enc.Hex);
      const intValue = parseInt(hash.substr(0, 8), 16);
      const normalized = intValue / 0xffffffff;
      const computedCrash = 1 + normalized * 9;
      if (Math.abs(computedCrash - crashMultiplier) > 0.01) {
        console.error('Verification failed: Crash point mismatch!');
      } else {
        console.log('Provably fair verification passed!');
      }
    }
  }, [phase, revealedServerSeed, serverSeedHash, roundId, crashMultiplier]);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: 'Arial', background: '#222', color: '#fff' }}>
      <div style={{ margin: '10px', fontSize: '1.2em' }}>
        Balance: ${balance.toFixed(2)} | Phase: {phase}
      </div>
      {!userName && <NameInput nameInput={nameInput} setNameInput={setNameInput} setMyName={setMyName} />}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
        <BetControls phase={phase} bet={bet} setBet={setBet} balance={balance} hasBet={hasBet} userName={userName} placeBet={placeBet} />
        <GameCanvas
          phase={phase}
          multiplier={multiplier}
          crashMultiplier={crashMultiplier}
          recentCrashes={recentCrashes}
          countdown={countdown}
          updateParticles={updateParticles}
        />
        <Leaderboard leaderboard={leaderboard} />
      </div>
      <CashOutButton phase={phase} hasBet={hasBet} cashOut={cashOut} />
    </div>
  );
};

export default CrashGame;