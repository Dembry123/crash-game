// game.js
const crypto = require('crypto');

function generateServerSeed() {
  return crypto.randomBytes(32).toString('hex'); // Random 64-char hex seed
}

function generateCrashPoint(serverSeed, roundId) {
  const hmac = crypto.createHmac('sha256', serverSeed);
  hmac.update(roundId.toString());
  const hash = hmac.digest('hex');
  // Take first 8 chars (4 bytes) as int, map to 0-1 range, then scale to 1-10x
  const intValue = parseInt(hash.substr(0, 8), 16);
  const normalized = intValue / 0xffffffff; // Normalize to [0,1)
  return 1 + normalized * 9; // Uniform in [1,10)
}

function startGameLoop(io, gameState, activeBets, users, recentCrashes, incrementRoundId) {
  let interval;
  let serverSeed;
  let serverSeedHash;

  const updateMultiplier = () => {
    gameState.multiplier += 0.01;
    io.emit('multiplierUpdate', gameState.multiplier);

    if (gameState.multiplier >= gameState.crashPoint) {
      gameState.phase = 'crashed';
      io.emit('gameCrashed', { crashPoint: gameState.crashPoint, serverSeed }); // Reveal seed

      let leaderboard = [];
      activeBets.forEach((bet, userId) => {
        const user = users.get(userId);
        if (user) {
          const result = bet.cashedOutAt ? bet.cashedOutAt.toFixed(2) + 'x' : 'CRASHED';
          const money = bet.cashedOutAt ? (bet.bet * bet.cashedOutAt).toFixed(2) : '0.00';
          leaderboard.push({ name: user.name || 'Anonymous', result, money });
        }
      });
      io.emit('leaderboardUpdate', leaderboard);

      activeBets.clear();

      recentCrashes.push(gameState.crashPoint);
      if (recentCrashes.length > 10) recentCrashes.shift();
      io.emit('recentCrashesUpdate', recentCrashes);

      setTimeout(startWaitingPhase, 5000);
      return;
    }

    interval = setTimeout(updateMultiplier, 100);
  };

  const startRunningPhase = () => {
    gameState.phase = 'running';
    gameState.multiplier = 1;
    gameState.crashPoint = generateCrashPoint(serverSeed, gameState.roundId); // Use committed seed
    io.emit('gameStarted');
    updateMultiplier();
  };

  const countdownTick = () => {
    gameState.countdown -= 1;
    io.emit('countdownUpdate', gameState.countdown);

    if (gameState.countdown <= 0) {
      startRunningPhase();
      return;
    }

    setTimeout(countdownTick, 1000);
  };

  const startWaitingPhase = () => {
    clearTimeout(interval);
    gameState.phase = 'waiting';
    gameState.countdown = 10;
    gameState.roundId = incrementRoundId(); // Increment for new round
    serverSeed = generateServerSeed();
    serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
    io.emit('waitingPhase', { countdown: gameState.countdown, roundId: gameState.roundId, serverSeedHash }); // Broadcast hash for verification
    io.emit('leaderboardUpdate', []);
    countdownTick();
  };

  startWaitingPhase();
}

module.exports = { startGameLoop };