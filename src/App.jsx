import { useEffect, useMemo, useState } from 'react'
import './App.css'

const WINNING_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

function Square({ value, onClick, highlighted, disabled }) {
  return (
    <button
      className={`square${highlighted ? ' highlighted' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={value ? `Square filled with ${value}` : 'Empty square'}
    >
      {value}
    </button>
  )
}

function Board({ squares, onSquareClick, winningLine, isGameOver, disabled }) {
  return (
    <div className="board">
      {squares.map((value, index) => (
        <Square
          key={index}
          value={value}
          onClick={() => onSquareClick(index)}
          highlighted={winningLine?.includes(index)}
          disabled={disabled || Boolean(value) || isGameOver}
        />
      ))}
    </div>
  )
}

function calculateWinner(squares) {
  for (const line of WINNING_LINES) {
    const [a, b, c] = line
    if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
      return { player: squares[a], line }
    }
  }
  return null
}

function App() {
  const [squares, setSquares] = useState(Array(9).fill(null))
  const [isXNext, setIsXNext] = useState(true)
  const [scores, setScores] = useState({ X: 0, O: 0, draws: 0 })
  const [gameStarted, setGameStarted] = useState(false)
  const [hasRecordedResult, setHasRecordedResult] = useState(false)

  const winnerInfo = useMemo(() => calculateWinner(squares), [squares])
  const isDraw = squares.every(Boolean) && !winnerInfo
  const isRoundOver = Boolean(winnerInfo) || isDraw

  useEffect(() => {
    if (!gameStarted) return
    if (hasRecordedResult) return

    if (winnerInfo) {
      setScores((prev) => ({
        ...prev,
        [winnerInfo.player]: prev[winnerInfo.player] + 1,
      }))
      setHasRecordedResult(true)
    } else if (isDraw) {
      setScores((prev) => ({
        ...prev,
        draws: prev.draws + 1,
      }))
      setHasRecordedResult(true)
    }
  }, [winnerInfo, isDraw, hasRecordedResult, gameStarted])

  const status = !gameStarted
    ? 'Ready to play? Hit Start Game!'
    : winnerInfo
      ? `🎉 ${winnerInfo.player} takes the round!`
      : isDraw
        ? "It's a draw! Start a new round."
        : `Next up: ${isXNext ? 'X' : 'O'}`

  const handleSquareClick = (index) => {
    if (!gameStarted || squares[index] || winnerInfo || isDraw) return

    setSquares((prevSquares) => {
      const nextSquares = [...prevSquares]
      nextSquares[index] = isXNext ? 'X' : 'O'
      return nextSquares
    })
    setIsXNext((prev) => !prev)
  }

  const resetBoard = () => {
    setSquares(Array(9).fill(null))
    setIsXNext(true)
    setHasRecordedResult(false)
  }

  const handleStartGame = () => {
    setGameStarted(true)
    resetBoard()
  }

  const handleNewRound = () => {
    if (!gameStarted) return
    resetBoard()
  }

  const handleResetAll = () => {
    resetBoard()
    setGameStarted(false)
    setScores({ X: 0, O: 0, draws: 0 })
  }

  return (
    <div className="app">
      <h1>Tic Tac Toe</h1>
      <div className="scoreboard">
        <div className="score">
          <span className="label">Player X</span>
          <span className="value">{scores.X}</span>
        </div>
        <div className="score">
          <span className="label">Draws</span>
          <span className="value">{scores.draws}</span>
        </div>
        <div className="score">
          <span className="label">Player O</span>
          <span className="value">{scores.O}</span>
        </div>
      </div>

      <div className="status-banner">
        <p className="status">{status}</p>
        {gameStarted && !isRoundOver && (
          <p className="next-player">
            {isXNext ? 'X' : 'O'} — your move. Aim for three in a row!
          </p>
        )}
      </div>

      <div className="menu">
        {!gameStarted ? (
          <button className="menu-btn primary" onClick={handleStartGame}>
            Start Game
          </button>
        ) : (
          <>
            <button className="menu-btn primary" onClick={handleNewRound}>
              New Round
            </button>
            <button className="menu-btn" onClick={handleResetAll}>
              Reset Scores
            </button>
          </>
        )}
      </div>

      <div className="game-panel">
        <Board
          squares={squares}
          onSquareClick={handleSquareClick}
          winningLine={winnerInfo?.line}
          isGameOver={isRoundOver}
          disabled={!gameStarted}
        />
      </div>
    </div>
  )
}

export default App
