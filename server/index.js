// index.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { startGameLoop } = require('./game');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*' }
});

const users = new Map();
const activeBets = new Map();

let gameState = {
  phase: 'waiting',
  multiplier: 1,
  crashPoint: 0,
  countdown: 10,
};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  users.set(socket.id, { balance: 1000, name: null });

  const user = users.get(socket.id);
  socket.emit('gameUpdate', { ...gameState, balance: user.balance, name: user.name });

  socket.on('setName', (name) => {
    const user = users.get(socket.id);
    if (name && typeof name === 'string' && name.trim() && !user.name) {
      user.name = name.trim();
      socket.emit('userUpdate', { balance: user.balance, name: user.name });
    }
  });

  socket.on('placeBet', (betAmount) => {
    const user = users.get(socket.id);
    if (gameState.phase !== 'waiting' || betAmount <= 0 || !user.name) return;
    if (betAmount > user.balance) return;

    user.balance -= betAmount;
    activeBets.set(socket.id, { bet: betAmount, cashedOutAt: null });
    socket.emit('balanceUpdate', user.balance);
    io.emit('betPlaced', { userId: socket.id, bet: betAmount });
  });

  socket.on('cashOut', () => {
    if (gameState.phase !== 'running' || !activeBets.has(socket.id)) return;
    const bet = activeBets.get(socket.id);
    if (bet.cashedOutAt) return;

    bet.cashedOutAt = gameState.multiplier;
    const user = users.get(socket.id);
    const winnings = bet.bet * gameState.multiplier;
    user.balance += winnings;
    socket.emit('balanceUpdate', user.balance);
    socket.emit('cashOutSuccess', { multiplier: gameState.multiplier, winnings });
    io.emit('playerCashedOut', { userId: socket.id, multiplier: gameState.multiplier });

    let leaderboard = [];
    activeBets.forEach((bet, userId) => {
      if (bet.cashedOutAt) {
        const user = users.get(userId);
        if (user) {
          const result = bet.cashedOutAt.toFixed(2) + 'x';
          const money = (bet.bet * bet.cashedOutAt).toFixed(2);
          leaderboard.push({ name: user.name || 'Anonymous', result, money });
        }
      }
    });
    io.emit('leaderboardUpdate', leaderboard);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    users.delete(socket.id);
    activeBets.delete(socket.id);
  });
});

startGameLoop(io, gameState, activeBets, users);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));