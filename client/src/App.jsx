import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { FaGithub } from "react-icons/fa";
import { RxExit } from "react-icons/rx";
import { FaTrophy, FaClock, FaVolumeUp, FaVolumeMute } from "react-icons/fa";
import toast from 'react-hot-toast';
import OnlinePlayers from './components/OnlinePlayers';
import './App.css';

function App() {
  const [username, setUsername] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [inviteeUsername, setInviteeUsername] = useState('');
  const [socket, setSocket] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState('');
  const [gameId, setGameId] = useState('');
  const [matrix, setMatrix] = useState([[], []]);
  const [message, setMessage] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  
  // New state variables
  const [score, setScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [gameTimer, setGameTimer] = useState(0);
  const [timerInterval, setTimerIntervalId] = useState(null);
  const [playerStats, setPlayerStats] = useState({ wins: 0, losses: 0 });
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // Audio refs
  const turnSoundRef = useRef(null);
  const completeSoundRef = useRef(null);
  const inviteSoundRef = useRef(null);
  const winSoundRef = useRef(null);

  const serverUrl = import.meta.env.VITE_APP_URL;

  useEffect(() => {
    const newSocket = io(`${serverUrl}`);
    setSocket(newSocket);

    // Load and initialize audio
    turnSoundRef.current = new Audio('./../sounds/turn.mp3');
    completeSoundRef.current = new Audio('./../sounds/complete.mp3');
    inviteSoundRef.current = new Audio('./../sounds/invite.mp3');
    winSoundRef.current = new Audio('./../sounds/win.mp3');

    newSocket.on('loggedIn', (data) => {
      toast.success('Logged in successfully!');
      setIsLoggedIn(true);
      if (data.stats) {
        setPlayerStats(data.stats);
      }
    });

    newSocket.on('gameInvite', (data) => {
      if (soundEnabled) inviteSoundRef.current.play();
      toast.success(`${data.from} invited you to play!`);
    });

    newSocket.on('startGame', (data) => {
      setGameId(data.gameId);
      setCurrentPlayer(data.playerId);
      setMatrix(data.matrix);
      setMessage('Game started!');
      setShowReset(true);
      setGameStarted(true);
      setScore(data.score);
      setOpponentScore(data.opponentScore);
      
      // Start game timer
      const interval = setInterval(() => {
        setGameTimer(prev => prev + 1);
      }, 1000);
      setTimerIntervalId(interval);
    });

    newSocket.on('updateMatrix', (data) => {
      setMatrix(data.matrix);
      setCurrentPlayer(data.currentPlayer);
      setMessage(`It's ${data.currentPlayer}'s turn!`);
      setScore(data.score);
      setOpponentScore(data.opponentScore);
      
      // Play sounds
      if (soundEnabled) {
        if (data.lineCompleted) {
          completeSoundRef.current.play();
        } else {
          turnSoundRef.current.play();
        }
      }
    });

    newSocket.on('gameOver', (data) => {
      clearInterval(timerInterval);
      setMessage(`${data.message} Game completed in ${formatTime(data.gameDuration)} with ${data.moveCount} moves.`);
      if (soundEnabled) winSoundRef.current.play();
      toast.success('Game over!');
      setShowReset(true);
      setPlayerStats(data.playerStats);
    });

    newSocket.on('turnChange', (playerId) => {
      setCurrentPlayer(playerId);
      setMessage(`It's ${playerId}'s turn!`);
      if (soundEnabled) turnSoundRef.current.play();
    });

    newSocket.on('opponentLeft', (data) => {
      clearInterval(timerInterval);
      if (soundEnabled) winSoundRef.current.play();
      toast.success(data.message);
      
      setMessage(`${data.message}`);
      setShowReset(true);
      
      if (data.playerStats) {
        setPlayerStats(data.playerStats);
      }
    });

    return () => {
      newSocket.disconnect();
      clearInterval(timerInterval);
    };
  }, []);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (username) {
      socket.emit('login', username);
    } else {
      toast.error('Please enter your username')
    }

    socket.on('loginFailed', (data) => {
      toast.error(data.message);
    });
  };

  const handleInvite = (e) => {
    e.preventDefault();
    if (inviteeUsername && inviteeUsername !== username) {
      socket.emit('invite', inviteeUsername);
    } else if (inviteeUsername === username) {
      toast.error('You cannot invite yourself!');
    }
  };

  const handleNumberClick = (rowIndex, colIndex) => {
    const selectedNumber = matrix[rowIndex][colIndex];
    if (username === currentPlayer && selectedNumber !== 'X') {
      socket.emit('numberSelected', { gameId, number: selectedNumber });
    }
  };

  const handleReset = () => {
    // If in a game, notify server about exiting
    if (gameStarted && gameId) {
      socket.emit('exitGame', { gameId });
    }
    
    setMatrix([[], []]);
    setShowReset(false);
    setMessage('');
    setInviteeUsername('');
    setGameStarted(false);
    setScore(0);
    setOpponentScore(0);
    setGameTimer(0);
    clearInterval(timerInterval);
  };

  const handleExit = () => {
    // Explicitly notify server that player is leaving the game
    if (gameId) {
      socket.emit('exitGame', { gameId });
    }
    
    handleReset();
  };

  const toggleSound = () => {
    setSoundEnabled(!soundEnabled);
  };

  const renderMatrix = (matrix) => {
    return matrix.map((row, rowIndex) => (
      <div key={rowIndex} className="matrix-row flex flex-row">
        {row.map((cell, colIndex) => (
          <div
            key={colIndex}
            className={`bg-[#191A2E] border-[1.5px] text-3xl font-semibold border-gray-300 py-2 text-[#F9F9F9] w-20 h-20 flex items-center justify-center cursor-pointer hover:bg-[#191A2E]/80 transition-all duration-300 ${cell === 'X' ? 'crossed' : ''}`}
            onClick={() => handleNumberClick(rowIndex, colIndex)}
          >
            {cell}
          </div>
        ))}
      </div>
    ));
  };

  return (
    <div className="app bg-[#191A2E] relative flex flex-col items-center justify-center h-screen">
      <OnlinePlayers />
      {!gameStarted && (
        <a className='absolute top-4 right-4 p-4' href='https://github.com/v1pinx/bingo-game' target='_blank' rel='noopener noreferrer'>
          <FaGithub className='text-[#F9F9F9] text-3xl cursor-pointer hover:text-[#E94560] transition-all duration-300' />
        </a>
      )}
      
      {/* Sound toggle button */}
      <div className='absolute top-4 left-4 p-4 cursor-pointer' onClick={toggleSound}>
        {soundEnabled ? 
          <FaVolumeUp className='text-[#F9F9F9] text-3xl hover:text-[#E94560] transition-all duration-300' /> :
          <FaVolumeMute className='text-[#F9F9F9] text-3xl hover:text-[#E94560] transition-all duration-300' />
        }
      </div>
      
      {!isLoggedIn ? (
        <div id="login" className='flex flex-col items-center justify-center h-screen space-y-4'>
          <h1 className='text-[#F9F9F9] text-5xl font-bold'>Ultimate Bingo Adventure</h1>
          <p className='text-gray-400 font-semibold text-md mt-[-10px]'>Play the ultimate bingo game with your friends</p>
          <form onSubmit={handleLogin} className='w-full space-y-4 mt-[5px]'>
            <input
              type="text"
              placeholder="Enter your username to login and see online players"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="border-[1.5px] border-gray-300 rounded-lg py-2 text-[#F9F9F9] w-full 
            outline-none focus:ring-1 focus:ring-[#E94560] focus:ring-offset-1 px-3"
            />
            <button id="loginButton" type='submit' className='bg-[#E94560] text-white font-semibold p-2 rounded-lg w-full cursor-pointer hover:bg-[#E94560]/80 transition-all duration-300'>
              Login
            </button>
          </form>
        </div>
      ) : (
        <>
          {!gameStarted ? (
            <div id="invite" className='flex flex-col items-center justify-center space-y-4 h-screen'>
              <h2 className='text-[#F9F9F9] text-5xl font-bold'>Invite a Friend</h2>
              <p className='text-gray-400 font-semibold text-md mt-[-10px]'>Enter your friend's username to invite them to play</p>
              
              {/* Player stats */}
              <div className='p-4 rounded-lg mt-2 w-full border border-white'>
                <h3 className='text-[#F9F9F9] text-xl font-bold flex items-center justify-center'>Your Stats</h3>
                <div className='flex justify-between mt-2'>
                  <div className='text-green-400'>Wins: {playerStats.wins}</div>
                  <div className='text-red-400'>Losses: {playerStats.losses}</div>
                  <div className='text-blue-400'>Win Rate: {playerStats.wins + playerStats.losses > 0 ? 
                    Math.round((playerStats.wins / (playerStats.wins + playerStats.losses)) * 100) : 0}%
                  </div>
                </div>
              </div>
              
              <form onSubmit={handleInvite} className='w-full space-y-4 mt-[5px]'>
                <input
                  type="text"
                  placeholder="Enter friend's username"
                  value={inviteeUsername}
                  onChange={(e) => setInviteeUsername(e.target.value.trim())}
                  className='border-[1.5px] border-gray-300 rounded-lg py-2 text-[#F9F9F9] w-full 
                outline-none focus:ring-1 focus:ring-[#E94560] focus:ring-offset-1 px-3'
                />
                <button id="inviteButton" type='submit' className='bg-[#E94560] text-white font-semibold p-2 rounded-lg w-full cursor-pointer hover:bg-[#E94560]/80 transition-all duration-300'>
                  Invite
                </button>
              </form>
            </div>
          ) : (
            <div id="game" className='flex flex-col items-center justify-center space-y-4'>
              <div className='absolute top-4 right-4 p-4 cursor-pointer' onClick={handleExit}>
                <RxExit className='text-[#F9F9F9] text-3xl hover:text-[#E94560] transition-all duration-300' title="Exit Game (opponent will win)" />
              </div>
              
              {/* Game info panel */}
              <div className='border border-white p-4 rounded-lg w-full flex justify-between items-center'>
                <div className='flex items-center'>
                  <FaClock className='text-[#F9F9F9] mr-2' />
                  <span className='text-[#F9F9F9]'>{formatTime(gameTimer)}</span>
                </div>
                <div className='flex space-x-6'>
                  <div className='text-green-400'>Your Score: <b>{score}</b></div>
                  <div className='text-red-400'>Opponent: <b>{opponentScore}</b></div>
                </div>
              </div>
              
              <h2 className='text-[#F9F9F9] text-4xl font-bold'>Your Game Board</h2>
              <p className='text-gray-400 font-semibold text-md'>Click on a box to make your move</p>
              <div id="matrix">{renderMatrix(matrix)}</div>
            </div>
          )}

          {showReset && (
            <div id="controls">
              <button id="resetButton" onClick={handleReset} className='bg-[#E94560] text-white font-semibold mt-4 p-2 rounded-lg w-full cursor-pointer hover:bg-[#E94560]/80 transition-all duration-300'>
                New Game
              </button>
            </div>
          )}

          <div id="message" className='text-[#F9F9F9] text-2xl font-semibold mt-4'>{message}</div>
        </>
      )}
    </div>
  );
}

export default App;