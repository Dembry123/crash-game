import React, { useState, useEffect, useRef, useCallback } from 'react';

function CrashGame() {
  const [balance, setBalance] = useState(1000);
  const [bet, setBet] = useState(10);
  const [multiplier, setMultiplier] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [crashPoint, setCrashPoint] = useState(0);
  const canvasRef = useRef(null);
  const timeRef = useRef(0);
  const particlesRef = useRef([]);
  const trailRef = useRef([]);

  const startGame = useCallback(() => {
    if (isPlaying || bet > balance || bet <= 0) return;
    setIsPlaying(true);
    setBalance(balance - bet);
    setMultiplier(1);
    timeRef.current = 0;
    particlesRef.current = [];
    trailRef.current = [];
    setCrashPoint(1 + Math.random() * 9);
  }, [isPlaying, balance, bet]);

  const cashOut = useCallback(() => {
    if (!isPlaying) return;
    setIsPlaying(false);
    setBalance(balance + bet * multiplier);
    alert(`Cashed out at ${multiplier.toFixed(2)}x! Won $${(bet * multiplier).toFixed(2)}`);
  }, [isPlaying, balance, bet, multiplier]);

  const crash = useCallback(() => {
    setIsPlaying(false);
    alert(`Crashed at ${crashPoint.toFixed(2)}x! You lost $${bet.toFixed(2)}`);
  }, [crashPoint, bet]);

  const updateParticles = useCallback((rocketX, rocketY) => {
    if (isPlaying && particlesRef.current.length < 100) {
      for (let i = 0; i < 2; i++) {
        particlesRef.current.push({
          x: rocketX + (Math.random() - 0.5) * 10,
          y: rocketY + 10,
          vx: (Math.random() - 0.5) * 2,
          vy: 1 + Math.random() * 2,
          life: 1.0,
        });
      }
    }
    particlesRef.current.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;
      if (p.life < 0) console.warn('Negative life detected:', p.life);
    });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);
  }, [isPlaying]);

  const drawGraph = useCallback((ctx) => {
    ctx.clearRect(0, 0, 600, 400);
    // Axes
    ctx.beginPath();
    ctx.moveTo(0, 400);
    ctx.lineTo(600, 400);
    ctx.moveTo(0, 400);
    ctx.lineTo(0, 0);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Particles
    particlesRef.current.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0, 3 * p.life), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 128, 0, ${Math.max(0, p.life)})`;
      ctx.fill();
    });

    // Rocket (dot) following exponential curve from bottom left
    const rocketY = 400 - (Math.pow(Math.E, timeRef.current * 0.5) * 100);
    const rocketX = 0 + (Math.pow(Math.E, timeRef.current * 0.5) - 1) * 100; 
    
    // Add current position to trail
    if (isPlaying) {
      trailRef.current.push({ x: rocketX, y: rocketY });
    }

    // Draw trail
    ctx.beginPath();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    trailRef.current.forEach((point, i) => {
      if (i === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();

    // Draw rocket
    ctx.beginPath();
    ctx.arc(rocketX, rocketY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // Update particles with rocket's new position
    updateParticles(rocketX, rocketY);
  }, [updateParticles, isPlaying]);

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    let animationFrame;

    const animate = () => {
      timeRef.current += 0.016;
      const newMultiplier = 1 + Math.pow(Math.E, timeRef.current * 0.5);
      setMultiplier(newMultiplier);
      drawGraph(ctx);
      if (newMultiplier >= crashPoint) {
        crash();
        return;
      }
      animationFrame = requestAnimationFrame(animate);
    };

    if (isPlaying) animate();

    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, crashPoint, crash, drawGraph]);

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    drawGraph(ctx);
  }, [drawGraph]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !isPlaying) startGame();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, startGame]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: 'Arial', background: '#222', color: '#fff' }}>
      <div style={{ margin: '10px', fontSize: '1.2em' }}>
        Balance: ${balance.toFixed(2)} | Multiplier: {multiplier.toFixed(2)}x | Bet: $
        <input
          type="number"
          value={bet}
          min="1"
          max={balance}
          style={{ width: '60px' }}
          onChange={(e) => setBet(Math.max(1, Math.min(balance, parseFloat(e.target.value))))}
        />
      </div>
      <canvas ref={canvasRef} width={600} height={400} style={{ border: '2px solid #fff', background: '#333' }} />
      <button
        disabled={!isPlaying}
        onClick={cashOut}
        style={{
          padding: '10px 20px',
          margin: '10px',
          fontSize: '1em',
          cursor: isPlaying ? 'pointer' : 'not-allowed',
          background: isPlaying ? '#28a745' : '#555',
          color: '#fff',
          border: 'none',
          borderRadius: '5px',
        }}
      >
        Cash Out
      </button>
      <button
        onClick={startGame}
        style={{
          padding: '10px 20px',
          margin: '10px',
          fontSize: '1em',
          cursor: 'pointer',
          background: '#007bff',
          color: '#fff',
          border: 'none',
          borderRadius: '5px',
        }}
      >
        Start Game (SPACE)
      </button>
    </div>
  );
}

export default CrashGame;