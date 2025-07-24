import React, { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import CryptoJS from 'crypto-js'; // Added for client-side cryptographic verification (install via npm i crypto-js if needed)

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
  const socket = useRef(null);
  const lastMultiplierRef = useRef(1);
  const lastUpdateTimeRef = useRef(Date.now());
  const [crashMultiplier, setCrashMultiplier] = useState(0); // Store crash point for 'crashed' phase

  /*
   * Added states for provably fair verification:
   * - roundId: Unique ID for each game round, received from server.
   * - serverSeedHash: Pre-committed hash of the secret seed, received during waiting phase.
   * - revealedServerSeed: The actual seed revealed after crash, used for client-side verification.
   */
  const [roundId, setRoundId] = useState(0);
  const [serverSeedHash, setServerSeedHash] = useState('');
  const [revealedServerSeed, setRevealedServerSeed] = useState('');

  const CANVAS_WIDTH = 840;
  const CANVAS_HEIGHT = 560;
  const SCALE = 2;
  const FACTOR_X = CANVAS_WIDTH / 6;
  const FACTOR_Y = CANVAS_HEIGHT / 4;
  const MARGIN = 35;

  /*
   * Extracted particle addition logic for exhaust into updateParticles.
   * Particle updates (movement, life decay, filtering) are always performed in the animate loop,
   * regardless of phase, to ensure existing particles continue to update and fade after a crash.
   */
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

    /*
     * Updated 'waitingPhase' handler to receive and set roundId and serverSeedHash for provably fair commitment.
     * This allows clients to know the committed hash before betting/running phase.
     */
    socket.current.on('waitingPhase', ({ countdown, roundId, serverSeedHash }) => {
      setPhase('waiting');
      setMultiplier(1);
      setCrashMultiplier(0); // Reset for next round
      lastMultiplierRef.current = 1;
      lastUpdateTimeRef.current = Date.now();
      setCountdown(countdown);
      setHasBet(false);
      timeRef.current = 0;
      particlesRef.current = [];
      setRoundId(roundId);
      setServerSeedHash(serverSeedHash);
      setRevealedServerSeed(''); // Reset revealed seed for new round
    });

    socket.current.on('gameStarted', () => {
      setPhase('running');
    });

    /*
     * Updated 'gameCrashed' handler to receive the revealed serverSeed along with crashPoint.
     * This triggers the verification useEffect below.
     */
    socket.current.on('gameCrashed', ({ crashPoint, serverSeed }) => {
      setPhase('crashed');
      setCrashMultiplier(crashPoint);
      setRevealedServerSeed(serverSeed);
    });

    socket.current.on('recentCrashes', (crashes) => {
      setRecentCrashes(crashes); // Receive initial crash history from server
    });

    socket.current.on('recentCrashesUpdate', (crashes) => {
      setRecentCrashes(crashes); // Update crash history after each crash
    });

    socket.current.on('balanceUpdate', (newBalance) => setBalance(newBalance));
    socket.current.on('cashOutSuccess', ({ multiplier, winnings }) => {
      alert(`Cashed out at ${multiplier.toFixed(2)}x! Won $${winnings.toFixed(2)}`);
    });

    socket.current.on('leaderboardUpdate', (lb) => setLeaderboard(lb));

    socket.current.on('countdownUpdate', (newCountdown) => {
      setCountdown(newCountdown);
    });

    return () => socket.current.disconnect();
  }, []);

  /*
   * Handle one-time explosion particle creation when phase changes to 'crashed'.
   * Particles are added at the fixed crash position based on the crashMultiplier.
   */
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
  }, [phase, crashMultiplier, FACTOR_X, FACTOR_Y]);

  /*
   * Added provably fair verification logic:
   * - Triggers after crash when revealedServerSeed is set.
   * - First, recomputes the SHA-256 hash of the revealed seed and checks if it matches the pre-committed serverSeedHash.
   * - Then, recomputes the crash point using HMAC-SHA256 (with seed as key, roundId as message).
   * - Extracts first 8 hex chars as integer, normalizes to [0,1), scales to [1,10).
   * - Compares the computed crash point to the server-provided crashMultiplier (with floating-point tolerance).
   * - Logs success or failure to console; in production, this could be shown in UI (e.g., a verification modal).
   */
  useEffect(() => {
    if (phase === 'crashed' && revealedServerSeed) {
      // Recompute commitment hash
      const computedHash = CryptoJS.SHA256(revealedServerSeed).toString(CryptoJS.enc.Hex);
      if (computedHash !== serverSeedHash) {
        console.error('Verification failed: Hash mismatch!');
        return;
      }
      // Recompute crash point (duplicate of server formula)
      const hmac = CryptoJS.HmacSHA256(roundId.toString(), revealedServerSeed);
      const hash = hmac.toString(CryptoJS.enc.Hex);
      const intValue = parseInt(hash.substr(0, 8), 16);
      const normalized = intValue / 0xffffffff; // 0xffffffff is 2^32 - 1
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

      // Generate trail points on the fly (deterministic curve)
      const numPoints = 200; // Adjustable; enough for smoothness without performance hit
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

      // Draw the trail using tempTrail
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

      // Draw rocket only if running (at end position)
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

      // Draw the dynamic text (multiplier or countdown) in the middle of the canvas
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
        ctx.fillStyle = phase === 'crashed' ? '#ff0000' : '#ffffff'; // Red for crashed, white otherwise
        ctx.textAlign = 'center';
        ctx.fillText(displayText, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      }

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frameId);
  }, [phase, multiplier, crashMultiplier, updateParticles, recentCrashes, FACTOR_X, FACTOR_Y, countdown]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: 'Arial', background: '#222', color: '#fff' }}>
      <div style={{ margin: '10px', fontSize: '1.2em' }}>
        Balance: ${balance.toFixed(2)} | Phase: {phase}
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

/*
 * FIX: Integrated provably fair verification into the client code.
 * - Added import for CryptoJS to handle SHA256 and HMAC-SHA256 on the client side (browser-compatible crypto).
 * - Added states: roundId, serverSeedHash, revealedServerSeed to store provably fair data.
 * - Updated socket handlers: 'waitingPhase' now sets roundId and serverSeedHash; 'gameCrashed' sets revealedServerSeed.
 * - Added a useEffect that runs after crash to verify: checks if hash of revealed seed matches committed hash, then recomputes crash point using HMAC-SHA256(seed, roundId), extracts/normalizes/scales, and compares to server-provided crashMultiplier.
 * - Logs verification result to console; no UI changes yet, but could be extended (e.g., add a button to trigger/show results).
 * - No changes to animation or other logic; verification is passive and doesn't affect gameplay.
 */