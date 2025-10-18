const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const port = 3000;

app.use(cors());

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let players = {};
let games = {};
let onlinePlayers = [];
let playerStats = {}; // Store player statistics (wins, losses)

io.on("connection", (socket) => {
  console.log("a user connected", socket.id);
  socket.on("login", (username) => {
    if (Object.values(players).includes(username)) {
      socket.emit("loginFailed", { message: "Username is already taken." });
      return;
    }

    players[socket.id] = username;
    onlinePlayers.push(username);
    
    // Initialize player stats if new player
    if (!playerStats[username]) {
      playerStats[username] = { wins: 0, losses: 0 };
    }

    socket.emit("loggedIn", { players: onlinePlayers, stats: playerStats[username] });
    io.emit("joined", onlinePlayers);
  });

  socket.on("invite", (inviteeUsername) => {
    const inviterUsername = players[socket.id];
    const inviteeSocketId = Object.keys(players).find(
      (key) => players[key] === inviteeUsername
    );

    if (inviteeSocketId && inviteeSocketId !== socket.id) {
      const gameId = `${inviterUsername}-${inviteeUsername}`;
      games[gameId] = {
        players: [socket.id, inviteeSocketId],
        playerNames: [inviterUsername, inviteeUsername],
        matrices: {
          [socket.id]: generateMatrix(),
          [inviteeSocketId]: generateMatrix(),
        },
        currentPlayer: socket.id,
        startTime: Date.now(),
        turnStartTime: Date.now(),
        moveCount: 0,
        scores: {
          [socket.id]: 0,
          [inviteeSocketId]: 0
        }
      };

      io.to(inviteeSocketId).emit("gameInvite", { 
        from: inviterUsername,
        gameId
      });

      io.to(socket.id).emit("startGame", {
        gameId,
        playerId: inviterUsername,
        matrix: games[gameId].matrices[socket.id],
        score: 0,
        opponentScore: 0
      });
      io.to(inviteeSocketId).emit("startGame", {
        gameId,
        playerId: inviteeUsername,
        matrix: games[gameId].matrices[inviteeSocketId],
        score: 0,
        opponentScore: 0
      });
    } else {
      socket.emit("inviteFailed", { message: "Player is not online." });
    }
  });

  socket.on("exitGame", ({ gameId }) => {
    const game = games[gameId];
    if (!game) return;

    const otherPlayerSocketId = game.players.find(id => id !== socket.id);
    if (otherPlayerSocketId) {
      handlePlayerExit(socket.id, otherPlayerSocketId, gameId);
    }
  });

  socket.on("numberSelected", ({ gameId, number }) => {
    const game = games[gameId];
    if (!game) return;
    
    const otherPlayerSocketId = game.players.find((id) => id !== socket.id);

    if (game.currentPlayer !== socket.id) {
      socket.emit("notYourTurn");
      return;
    }

    // Update turn timer
    const turnDuration = Date.now() - game.turnStartTime;
    game.turnStartTime = Date.now();
    game.moveCount++;

    // Cross the number on both matrices
    game.matrices[socket.id] = crossNumber(game.matrices[socket.id], number);
    game.matrices[otherPlayerSocketId] = crossNumber(
      game.matrices[otherPlayerSocketId],
      number
    );

    // Check if new lines have been completed
    const previousLinesPlayer = game.scores[socket.id] || 0;
    const previousLinesOpponent = game.scores[otherPlayerSocketId] || 0;
    
    const currentLinesPlayer = checkWin(game.matrices[socket.id]);
    const currentLinesOpponent = checkWin(game.matrices[otherPlayerSocketId]);
    
    // Update scores
    game.scores[socket.id] = currentLinesPlayer;
    game.scores[otherPlayerSocketId] = currentLinesOpponent;
    
    // Check if a new line was completed
    const playerCompletedNewLine = currentLinesPlayer > previousLinesPlayer;
    const opponentCompletedNewLine = currentLinesOpponent > previousLinesOpponent;

    io.to(socket.id).emit("updateMatrix", {
      matrix: game.matrices[socket.id],
      currentPlayer: players[otherPlayerSocketId],
      score: currentLinesPlayer,
      opponentScore: currentLinesOpponent,
      lineCompleted: playerCompletedNewLine
    });
    
    io.to(otherPlayerSocketId).emit("updateMatrix", {
      matrix: game.matrices[otherPlayerSocketId],
      currentPlayer: players[otherPlayerSocketId],
      score: currentLinesOpponent,
      opponentScore: currentLinesPlayer,
      lineCompleted: opponentCompletedNewLine
    });

    if (currentLinesPlayer >= 5) {
      // Game over: current player wins
      const winnerUsername = players[socket.id];
      const loserUsername = players[otherPlayerSocketId];
      
      // Update stats
      playerStats[winnerUsername].wins++;
      playerStats[loserUsername].losses++;
      
      const gameDuration = Math.floor((Date.now() - game.startTime) / 1000);
      
      io.to(game.players[0]).emit(
        "gameOver", {
          message: `${winnerUsername} wins!`,
          winner: winnerUsername,
          gameDuration,
          moveCount: game.moveCount,
          playerStats: playerStats[players[game.players[0]]]
        }
      );
      io.to(game.players[1]).emit(
        "gameOver", {
          message: `${winnerUsername} wins!`,
          winner: winnerUsername,
          gameDuration,
          moveCount: game.moveCount,
          playerStats: playerStats[players[game.players[1]]]
        }
      );
      
      delete games[gameId];
    } else if (currentLinesOpponent >= 5) {
      // Game over: opponent wins
      const winnerUsername = players[otherPlayerSocketId];
      const loserUsername = players[socket.id];
      
      // Update stats
      playerStats[winnerUsername].wins++;
      playerStats[loserUsername].losses++;
      
      const gameDuration = Math.floor((Date.now() - game.startTime) / 1000);
      
      io.to(game.players[0]).emit(
        "gameOver", {
          message: `${winnerUsername} wins!`,
          winner: winnerUsername,
          gameDuration,
          moveCount: game.moveCount,
          playerStats: playerStats[players[game.players[0]]]
        }
      );
      io.to(game.players[1]).emit(
        "gameOver", {
          message: `${winnerUsername} wins!`,
          winner: winnerUsername,
          gameDuration,
          moveCount: game.moveCount,
          playerStats: playerStats[players[game.players[1]]]
        }
      );
      
      delete games[gameId];
    } else {
      game.currentPlayer = otherPlayerSocketId;
      io.to(game.players[0]).emit("turnChange", players[game.currentPlayer]);
      io.to(game.players[1]).emit("turnChange", players[game.currentPlayer]);
    }
  });

  socket.on("disconnect", () => {
    console.log("user disconnected", socket.id);
    const username = players[socket.id];
    onlinePlayers = onlinePlayers.filter((player) => player !== username);
    io.emit("joined", onlinePlayers);
    
    // Find if user was in a game
    const gameId = Object.keys(games).find((gameId) =>
      games[gameId].players.includes(socket.id)
    );

    if (gameId) {
      const game = games[gameId];
      const otherPlayerSocketId = game.players.find((id) => id !== socket.id);

      if (otherPlayerSocketId) {
        handlePlayerExit(socket.id, otherPlayerSocketId, gameId);
      }
    }

    delete players[socket.id];
  });
  
  // Helper function to handle player exit
  function handlePlayerExit(exitingPlayerSocketId, remainingPlayerSocketId, gameId) {
    const game = games[gameId];
    if (!game) return;
    
    const exitingUsername = players[exitingPlayerSocketId];
    const winnerUsername = players[remainingPlayerSocketId];
    
    // Update stats - remaining player wins automatically
    if (winnerUsername && playerStats[winnerUsername]) {
      playerStats[winnerUsername].wins++;
    }
    
    if (exitingUsername && playerStats[exitingUsername]) {
      playerStats[exitingUsername].losses++;
    }
    
    const gameDuration = Math.floor((Date.now() - game.startTime) / 1000);
    
    // Notify the remaining player that they won
    io.to(remainingPlayerSocketId).emit("opponentLeft", {
      message: `Player ${exitingUsername} has left the game. You win!`,
      winner: winnerUsername,
      gameDuration,
      moveCount: game.moveCount,
      playerStats: playerStats[winnerUsername]
    });
    
    // Delete the game
    delete games[gameId];
  }
});

function generateMatrix() {
  const numbers = Array.from({ length: 25 }, (_, i) => i + 1).sort(
    () => Math.random() - 0.5
  );

  const matrix = [];
  for (let i = 0; i < 5; i++) {
    matrix.push(numbers.slice(i * 5, i * 5 + 5));
  }
  return matrix;
}

function crossNumber(matrix, number) {
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      if (matrix[i][j] === number) {
        matrix[i][j] = "X";
      }
    }
  }
  return matrix;
}

function checkWin(matrix) {
  let lines = 0;

  // Check rows
  matrix.forEach((row) => {
    if (row.every((cell) => cell === "X")) lines++;
  });

  // Check columns
  for (let i = 0; i < 5; i++) {
    if (matrix.every((row) => row[i] === "X")) lines++;
  }

  // Check diagonals
  if (matrix.every((row, i) => row[i] === "X")) lines++;
  if (matrix.every((row, i) => row[4 - i] === "X")) lines++;

  return lines;
}

app.get("/", (req, res) => {
  res.send("Server is running");
});

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});