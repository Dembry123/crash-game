const crypto = require('crypto');

function generateServerSeed() {
  return crypto.randomBytes(32).toString('hex');
}

function generateCrashPoint(serverSeed, roundId) {
  const hmac = crypto.createHmac('sha256', serverSeed);
  hmac.update(roundId.toString());
  const hash = hmac.digest('hex');
  const intValue = parseInt(hash.substr(0, 8), 16);
  const normalized = intValue / 0xffffffff;
  return 1 + normalized * 9;
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
      console.log(`Crash at round ${gameState.roundId}: crashPoint=${gameState.crashPoint.toFixed(2)}, serverSeed=${serverSeed}`); // Log revealed seed and crash point
      io.emit('gameCrashed', { crashPoint: gameState.crashPoint, serverSeed });

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
    gameState.crashPoint = generateCrashPoint(serverSeed, gameState.roundId);
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
    gameState.roundId = incrementRoundId();
    serverSeed = generateServerSeed();
    serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
    console.log(`New round ${gameState.roundId}: serverSeed=${serverSeed}, serverSeedHash=${serverSeedHash}`); // Log seed and hash
    io.emit('waitingPhase', { countdown: gameState.countdown, roundId: gameState.roundId, serverSeedHash });
    io.emit('leaderboardUpdate', []);
    countdownTick();
  };

  startWaitingPhase();
}

module.exports = { startGameLoop };
/*
 * FIX: Added console.log statements to verify server-side generation of provably fair values.
 * - In startWaitingPhase: Logs serverSeed and serverSeedHash for each new round to confirm they are generated.
 * - In updateMultiplier: Logs the revealed serverSeed and crashPoint after a crash to verify the emitted values.
 * - These logs help debug whether the server is producing and emitting the correct seed/hash pairs.
 */