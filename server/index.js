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

function getUnlockedCount(totalSeconds) {
  return ANIMAL_THRESHOLDS.filter(t => totalSeconds >= t).length;
}

io.on('connection', (socket) => {
  console.log('connected', socket.id);

  // Create or join lobby
  socket.on('join_lobby', ({ code, playerName }) => {
    let lobbyCode = code ? code.toUpperCase() : generateCode();
    if (!lobbies[lobbyCode]) {
      lobbies[lobbyCode] = { players: {} };
    }

    const lobby = lobbies[lobbyCode];
    lobby.players[socket.id] = {
      id: socket.id,
      name: playerName || 'Joueur',
      totalWorkSeconds: 0,
      isFocusing: false,
      focusStartedAt: null,
      unlockedAnimals: 1,
      islandIndex: Object.keys(lobby.players).length,
    };

    socket.join(lobbyCode);
    socket.data.lobbyCode = lobbyCode;
    socket.data.playerId = socket.id;

    socket.emit('lobby_joined', {
      code: lobbyCode,
      myId: socket.id,
      players: lobby.players,
    });

    socket.to(lobbyCode).emit('player_joined', lobby.players[socket.id]);
    console.log(`${playerName} joined lobby ${lobbyCode}`);
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
    });
  });

  socket.on('disconnect', () => {
    const { lobbyCode } = socket.data;
    if (!lobbyCode || !lobbies[lobbyCode]) return;
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
