function generateCrashPoint() {
  return 1 + Math.random() * 9;  // Same as your original
}

function startGameLoop(io, gameState, activeBets, users) {
  let interval;

  const updateMultiplier = () => {
    gameState.multiplier += 0.01;  // Increment slowly; adjust for realism (e.g., exponential)
    io.emit('multiplierUpdate', gameState.multiplier);

    if (gameState.multiplier >= gameState.crashPoint) {
      gameState.phase = 'crashed';
      io.emit('gameCrashed', { crashPoint: gameState.crashPoint });

      // Settle bets: losers get nothing, cashouts already handled
      activeBets.forEach((bet, userId) => {
        if (!bet.cashedOutAt) {
          // Lost the bet (do nothing, already deducted)
        }
        activeBets.delete(userId);  // Clear for next round
      });

      // Reset after 5 seconds
      setTimeout(startWaitingPhase, 5000);
      return;
    }

    interval = setTimeout(updateMultiplier, 100);  // Tick every 100ms; adjust
  };

  const startRunningPhase = () => {
    gameState.phase = 'running';
    gameState.multiplier = 1;
    gameState.crashPoint = generateCrashPoint();
    io.emit('gameStarted', { crashPoint: gameState.crashPoint });  // Don't send crashPoint to clients!
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
    clearTimeout(interval);  // Clean up
    gameState.phase = 'waiting';
    gameState.countdown = 10;
    io.emit('waitingPhase', { countdown: gameState.countdown });
    countdownTick();
  };

  // Initial start
  startWaitingPhase();
}

module.exports = { startGameLoop };