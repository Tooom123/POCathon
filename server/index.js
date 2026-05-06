const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// lobbies[code] = { players: { [socketId]: PlayerState } }
const lobbies = {};

function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// Animal unlock thresholds in seconds
const ANIMAL_THRESHOLDS = [0, 60, 300, 600, 1200, 1800, 3600, 5400, 7200, 10800];

// Income per second per animal (mirrors client animals.ts)
const ANIMAL_INCOME = {
  chick: 0.5, bunny: 1, pig: 2, cat: 3.5,
  dog: 7, penguin: 12, beaver: 20, fox: 32,
  panda: 55, koala: 90, deer: 150, monkey: 240,
  parrot: 400, tiger: 650, lion: 1000,
  elephant: 1800, giraffe: 3000, polar: 5000,
};

// Income per second per decor item
const DECOR_INCOME = {
  'plant': 0.3,
  'flowers-tall': 1.5,
  'mushrooms': 4,
  'tree-pine': 12,
};

function getUnlockedCount(totalSeconds) {
  return ANIMAL_THRESHOLDS.filter(t => totalSeconds >= t).length;
}

function computeIncome(ownedAnimals, placedDecors) {
  const animals = (ownedAnimals || []).reduce((sum, id) => sum + (ANIMAL_INCOME[id] ?? 0), 0);
  const decors = (placedDecors || []).reduce((sum, d) => sum + (DECOR_INCOME[d?.id] ?? 0), 0);
  return animals + decors;
}

io.on('connection', (socket) => {
  console.log('connected', socket.id);

  // Heartbeat — client must respond within 35 s or be dropped
  const heartbeat = setInterval(() => {
    socket.emit('ping');
  }, 30000);

  socket.on('pong_ack', () => { /* still alive */ });

  // Create or join lobby
  socket.on('join_lobby', ({ code, playerName, lobbyName, ownedAnimals, islandLevel, placedDecors, totalWorkSeconds }) => {
    let lobbyCode = code ? code.toUpperCase() : generateCode();
    if (!lobbies[lobbyCode]) {
      lobbies[lobbyCode] = { players: {}, name: lobbyName || null };
    }

    const lobby = lobbies[lobbyCode];
    const incomePerSec = computeIncome(ownedAnimals, placedDecors);
    lobby.players[socket.id] = {
      id: socket.id,
      name: playerName || 'Joueur',
      totalWorkSeconds: totalWorkSeconds ?? 0,
      isFocusing: false,
      focusStartedAt: null,
      unlockedAnimals: 1,
      islandIndex: Object.keys(lobby.players).length,
      islandLevel: islandLevel ?? 1,
      ownedAnimals: ownedAnimals ?? ['bunny'],
      placedDecors: placedDecors ?? [],
      incomePerSec,
    };

    socket.join(lobbyCode);
    socket.data.lobbyCode = lobbyCode;
    socket.data.playerId = socket.id;

    socket.emit('lobby_joined', {
      code: lobbyCode,
      name: lobby.name,
      myId: socket.id,
      players: lobby.players,
    });

    socket.to(lobbyCode).emit('player_joined', lobby.players[socket.id]);
    console.log(`${playerName} joined lobby ${lobbyCode}`);
  });

  // Client can update its island/animal state
  socket.on('sync_state', ({ ownedAnimals, islandLevel, placedDecors }) => {
    const { lobbyCode } = socket.data;
    if (!lobbyCode || !lobbies[lobbyCode]) return;
    const player = lobbies[lobbyCode].players[socket.id];
    if (!player) return;
    player.ownedAnimals = ownedAnimals ?? player.ownedAnimals;
    player.islandLevel = islandLevel ?? player.islandLevel;
    if (placedDecors !== undefined) player.placedDecors = placedDecors;
    player.incomePerSec = computeIncome(player.ownedAnimals, player.placedDecors);
    io.to(lobbyCode).emit('player_updated', player);
  });

  // Start focus session
  socket.on('start_focus', () => {
    const { lobbyCode } = socket.data;
    if (!lobbyCode || !lobbies[lobbyCode]) return;
    const player = lobbies[lobbyCode].players[socket.id];
    if (!player || player.isFocusing) return;

    player.isFocusing = true;
    player.focusStartedAt = Date.now();
    io.to(lobbyCode).emit('player_updated', player);
  });

  // Stop focus session
  socket.on('stop_focus', () => {
    const { lobbyCode } = socket.data;
    if (!lobbyCode || !lobbies[lobbyCode]) return;
    const player = lobbies[lobbyCode].players[socket.id];
    if (!player || !player.isFocusing) return;

    const elapsed = Math.floor((Date.now() - player.focusStartedAt) / 1000);
    player.totalWorkSeconds += elapsed;
    player.isFocusing = false;
    player.focusStartedAt = null;
    player.unlockedAnimals = getUnlockedCount(player.totalWorkSeconds);

    io.to(lobbyCode).emit('player_updated', player);
  });

  // Periodic sync: client sends current elapsed so server can broadcast live
  socket.on('focus_tick', () => {
    const { lobbyCode } = socket.data;
    if (!lobbyCode || !lobbies[lobbyCode]) return;
    const player = lobbies[lobbyCode].players[socket.id];
    if (!player || !player.isFocusing) return;

    const elapsed = Math.floor((Date.now() - player.focusStartedAt) / 1000);
    const liveTotal = player.totalWorkSeconds + elapsed;
    const liveUnlocked = getUnlockedCount(liveTotal);

    socket.to(lobbyCode).emit('player_tick', {
      id: socket.id,
      liveTotal,
      liveUnlocked,
      isFocusing: true,
      incomePerSec: player.incomePerSec,
    });
  });

  socket.on('disconnect', () => {
    clearInterval(heartbeat);
    const { lobbyCode } = socket.data;
    if (!lobbyCode || !lobbies[lobbyCode]) return;

    // Commit any in-progress focus session before removing
    const player = lobbies[lobbyCode].players[socket.id];
    if (player?.isFocusing && player.focusStartedAt) {
      const elapsed = Math.floor((Date.now() - player.focusStartedAt) / 1000);
      player.totalWorkSeconds += elapsed;
      player.isFocusing = false;
      player.focusStartedAt = null;
    }

    delete lobbies[lobbyCode].players[socket.id];
    if (Object.keys(lobbies[lobbyCode].players).length === 0) {
      delete lobbies[lobbyCode];
    } else {
      io.to(lobbyCode).emit('player_left', socket.id);
    }
    console.log('disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
