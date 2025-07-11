const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { startGameLoop } = require('./game');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*' }  // Allow from anywhere; restrict in production
});

// In-memory storage (replace with DB later)
const users = new Map();  // socket.id -> { balance: 1000 }
const activeBets = new Map();  // socket.id -> { bet: 10, cashedOutAt: null }

// Game state
let gameState = {
  phase: 'waiting',  // 'waiting', 'running', 'crashed'
  multiplier: 1,
  crashPoint: 0,
  countdown: 10,     // Seconds until round starts
};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  users.set(socket.id, { balance: 1000 });  // New user starts with $1000

  // Send initial state
  socket.emit('gameUpdate', { ...gameState, balance: users.get(socket.id).balance });

  socket.on('placeBet', (betAmount) => {
    if (gameState.phase !== 'waiting' || betAmount <= 0) return;
    const user = users.get(socket.id);
    if (betAmount > user.balance) return;

    user.balance -= betAmount;
    activeBets.set(socket.id, { bet: betAmount, cashedOutAt: null });
    socket.emit('balanceUpdate', user.balance);
    io.emit('betPlaced', { userId: socket.id, bet: betAmount });  // Broadcast to show others' bets
  });

  socket.on('cashOut', () => {
    if (gameState.phase !== 'running' || !activeBets.has(socket.id)) return;
    const bet = activeBets.get(socket.id);
    if (bet.cashedOutAt) return;  // Already cashed out

    bet.cashedOutAt = gameState.multiplier;
    const user = users.get(socket.id);
    const winnings = bet.bet * gameState.multiplier;
    user.balance += winnings;
    socket.emit('balanceUpdate', user.balance);
    socket.emit('cashOutSuccess', { multiplier: gameState.multiplier, winnings });
    io.emit('playerCashedOut', { userId: socket.id, multiplier: gameState.multiplier });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    users.delete(socket.id);
    activeBets.delete(socket.id);
  });
});

// Start the game loop (handles phases and broadcasts)
startGameLoop(io, gameState, activeBets, users);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));