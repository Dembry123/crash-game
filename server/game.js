// game.js
function generateCrashPoint() {
  return 1 + Math.random() * 9;
}

function startGameLoop(io, gameState, activeBets, users) {
  let interval;

  const updateMultiplier = () => {
    gameState.multiplier += 0.01;
    io.emit('multiplierUpdate', gameState.multiplier);

    if (gameState.multiplier >= gameState.crashPoint) {
      gameState.phase = 'crashed';
      io.emit('gameCrashed', { crashPoint: gameState.crashPoint });

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

      setTimeout(startWaitingPhase, 5000);
      return;
    }

    interval = setTimeout(updateMultiplier, 100);
  };

  const startRunningPhase = () => {
    gameState.phase = 'running';
    gameState.multiplier = 1;
    gameState.crashPoint = generateCrashPoint();
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
    io.emit('waitingPhase', { countdown: gameState.countdown });
    io.emit('leaderboardUpdate', []);
    countdownTick();
  };

  startWaitingPhase();
}

module.exports = { startGameLoop };