import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const [volume, setVolume] = useState(0.7)
  const audioCtxRef = useRef(null)
  const audioUnlockedRef = useRef(false)
  const backgroundNodesRef = useRef(null)
  const masterGainRef = useRef(null)
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false)
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false)
  const [hasActiveAudio, setHasActiveAudio] = useState(false)

  const winnerInfo = useMemo(() => calculateWinner(squares), [squares])
  const isDraw = squares.every(Boolean) && !winnerInfo
  const isRoundOver = Boolean(winnerInfo) || isDraw

  const ensureAudioContext = useCallback(() => audioCtxRef.current, [])

  const getMasterGain = useCallback(() => {
    const ctx = ensureAudioContext()
    if (!ctx) return null
    if (!masterGainRef.current) {
      const gain = ctx.createGain()
      const initialValue = Math.max(volume, 0.0001)
      gain.gain.setValueAtTime(initialValue, ctx.currentTime)
      gain.connect(ctx.destination)
      masterGainRef.current = gain
    }
    return masterGainRef.current
  }, [ensureAudioContext, volume])

  const unlockAudio = useCallback(() => {
    if (typeof window === 'undefined') return Promise.resolve(false)
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return Promise.resolve(false)

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContextClass()
    }

    const ctx = audioCtxRef.current
    if (ctx.state === 'running') {
      audioUnlockedRef.current = true
      getMasterGain()
      return Promise.resolve(true)
    }

    return ctx
      .resume()
      .then(() => {
        audioUnlockedRef.current = true
        getMasterGain()
        return true
      })
      .catch((error) => {
        console.warn('Audio context unlock failed:', error)
        return false
      })
  }, [getMasterGain])

  useEffect(() => {
    if (!audioCtxRef.current) return
    if (audioCtxRef.current.state !== 'running') return
    audioUnlockedRef.current = true
    getMasterGain()
  }, [getMasterGain, volume])

  const stopBackgroundMusic = useCallback(() => {
    const ctx = audioCtxRef.current
    const nodes = backgroundNodesRef.current
    if (!ctx || !nodes) {
      nodes?.intervalIds?.forEach((id) => clearInterval(id))
      backgroundNodesRef.current = null
      return
    }

    const { masterGain, lfo, lfoGain, pads, intervalIds } = nodes

    intervalIds?.forEach((id) => {
      clearInterval(id)
      clearTimeout(id)
    })

    const stopTime = ctx.currentTime + 0.4

    try {
      if (masterGain) {
        masterGain.gain.cancelScheduledValues(ctx.currentTime)
        masterGain.gain.exponentialRampToValueAtTime(0.0001, stopTime)
      }
    } catch {}

    pads?.forEach(({ osc }) => {
      try {
        osc.stop(stopTime)
      } catch {}
    })

    if (lfo) {
      try {
        lfo.stop(stopTime)
      } catch {}
    }

    setTimeout(() => {
      pads?.forEach(({ osc, gain }) => {
        try {
          osc.disconnect()
        } catch {}
        try {
          gain.disconnect()
        } catch {}
      })
      if (lfoGain) {
        try {
          lfoGain.disconnect()
        } catch {}
      }
      if (lfo) {
        try {
          lfo.disconnect()
        } catch {}
      }
      if (masterGain) {
        try {
          masterGain.disconnect()
        } catch {}
      }
      backgroundNodesRef.current = null
      setHasActiveAudio(false)
    }, 420)
  }, [])

  const startBackgroundMusic = useCallback(() => {
    const ctx = ensureAudioContext()
    if (!ctx) {
      console.warn('No audio context available for background music.')
      return
    }
    if (backgroundNodesRef.current) return

    const globalGain = getMasterGain()

    const musicBus = ctx.createGain()
    musicBus.gain.setValueAtTime(0.0001, ctx.currentTime)
    if (globalGain) {
      musicBus.connect(globalGain)
    } else {
      musicBus.connect(ctx.destination)
    }

    const padFrequencies = [220, 261.63, 329.63]
    const pads = padFrequencies.map((frequency, index) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = index === 0 ? 'triangle' : 'sine'
      osc.frequency.setValueAtTime(frequency, ctx.currentTime)

      const targetGain = 0.06 / (index + 1)
      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(targetGain, ctx.currentTime + 1)

      osc.connect(gain)
      gain.connect(musicBus)
      osc.start()
      return { osc, gain }
    })

    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    lfo.frequency.setValueAtTime(0.2, ctx.currentTime)
    lfoGain.gain.value = 0.01
    lfo.connect(lfoGain)
    lfoGain.connect(musicBus.gain)
    lfo.start()

    musicBus.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 1)

    const intervalIds = []
    let patternIndex = 0
    const melodyNotes = [392, 440, 523.25, 440]
    const playMelodyNote = () => {
      const now = ctx.currentTime
      const frequency = melodyNotes[patternIndex % melodyNotes.length]
      patternIndex += 1

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(frequency, now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.05, now + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8)

      osc.connect(gain)
      gain.connect(musicBus)

      osc.start(now)
      osc.stop(now + 0.9)
    }

    const bassNotes = [110, 146.83, 164.81, 98]
    let bassIndex = 0
    const playBassNote = () => {
      const now = ctx.currentTime
      const frequency = bassNotes[bassIndex % bassNotes.length]
      bassIndex += 1

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(frequency, now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.04, now + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2)

      osc.connect(gain)
      gain.connect(musicBus)

      osc.start(now)
      osc.stop(now + 1.3)
    }

    const sparkleNotes = [783.99, 659.25, 880, 698.46]
    const playSparkle = () => {
      const now = ctx.currentTime
      const note = sparkleNotes[Math.floor(Math.random() * sparkleNotes.length)]
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'triangle'
      osc.frequency.setValueAtTime(note, now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.03, now + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4)

      osc.connect(gain)
      gain.connect(musicBus)

      osc.start(now)
      osc.stop(now + 0.45)
    }

    intervalIds.push(setInterval(playMelodyNote, 1600))
    playMelodyNote()
    intervalIds.push(setInterval(playBassNote, 2400))
    intervalIds.push(setTimeout(playBassNote, 600))
    intervalIds.push(setInterval(playSparkle, 3200))

    backgroundNodesRef.current = { masterGain: musicBus, pads, lfo, lfoGain, intervalIds }
    setHasActiveAudio(true)
  }, [ensureAudioContext, getMasterGain])

  const playTone = useCallback(
    (frequency, duration = 0.12) => {
      const ctx = ensureAudioContext()
      if (!ctx) return
      const globalGain = getMasterGain()

      const startTone = () => {
        const startTime = ctx.currentTime
        const stopTime = startTime + duration

        const oscillator = ctx.createOscillator()
        const gainNode = ctx.createGain()

        oscillator.type = 'triangle'
        oscillator.frequency.setValueAtTime(frequency, startTime)
        gainNode.gain.setValueAtTime(0.001, startTime)
        gainNode.gain.exponentialRampToValueAtTime(0.24, startTime + 0.02)
        gainNode.gain.exponentialRampToValueAtTime(0.001, stopTime)

        oscillator.connect(gainNode)
        if (globalGain) {
          gainNode.connect(globalGain)
        } else {
          gainNode.connect(ctx.destination)
        }

        oscillator.start(startTime)
        oscillator.stop(stopTime + 0.02)
      }

      if (ctx.state === 'suspended') {
        ctx
          .resume()
          .then(() => {
            audioUnlockedRef.current = true
            startTone()
          })
          .catch(() => {})
        return
      }

      audioUnlockedRef.current = true
      startTone()
    },
    [ensureAudioContext, getMasterGain],
  )

  const playMoveSound = useCallback(() => playTone(540, 0.1), [playTone])
  const playWinSound = useCallback(() => playTone(720, 0.3), [playTone])
  const playDrawSound = useCallback(() => playTone(360, 0.25), [playTone])

  useEffect(() => {
    if (!gameStarted) {
      stopBackgroundMusic()
    }
  }, [gameStarted, stopBackgroundMusic])

  useEffect(() => {
    return () => {
      stopBackgroundMusic()
    }
  }, [stopBackgroundMusic])

  useEffect(() => {
    const ctx = audioCtxRef.current
    const masterGain = masterGainRef.current
    if (!ctx || !masterGain) return
    const target = Math.max(volume, 0.0001)
    masterGain.gain.cancelScheduledValues(ctx.currentTime)
    masterGain.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.12)
  }, [volume])

  useEffect(() => {
    if (!gameStarted) return
    if (hasRecordedResult) return

    if (winnerInfo) {
      setScores((prev) => ({
        ...prev,
        [winnerInfo.player]: prev[winnerInfo.player] + 1,
      }))
      playWinSound()
      setHasRecordedResult(true)
    } else if (isDraw) {
      setScores((prev) => ({
        ...prev,
        draws: prev.draws + 1,
      }))
      playDrawSound()
      setHasRecordedResult(true)
    }
  }, [winnerInfo, isDraw, hasRecordedResult, gameStarted, playWinSound, playDrawSound])

  const status = !gameStarted
    ? 'Ready to play? Hit Start Game!'
    : winnerInfo
      ? `🎉 ${winnerInfo.player} takes the round!`
      : isDraw
        ? "It's a draw! Start a new round."
        : `Next up: ${isXNext ? 'X' : 'O'}`

  const handleSquareClick = (index) => {
    if (!gameStarted || squares[index] || winnerInfo || isDraw) return
    unlockAudio()
      .then((unlocked) => {
        if (unlocked) {
          playMoveSound()
        }
      })
      .catch((error) => {
        console.warn('Unable to play move sound:', error)
      })

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
    unlockAudio()
      .then((unlocked) => {
        if (unlocked) {
          startBackgroundMusic()
        }
      })
      .catch((error) => {
        console.warn('Unable to start background music:', error)
      })
    setGameStarted(true)
    resetBoard()
  }

  const handleNewRound = () => {
    if (!gameStarted) return
    unlockAudio()
      .then((unlocked) => {
        if (unlocked) {
          startBackgroundMusic()
        }
      })
      .catch((error) => {
        console.warn('Unable to resume background music:', error)
      })
    resetBoard()
  }

  const handleResetAll = () => {
    resetBoard()
    stopBackgroundMusic()
    setGameStarted(false)
    setScores({ X: 0, O: 0, draws: 0 })
  }

  const handleVolumeChange = (event) => {
    setVolume(Number(event.target.value))
  }

  const handleOpenAudioModal = () => {
    if (!hasActiveAudio) return

    unlockAudio()
      .then((unlocked) => {
        if (unlocked) {
          setIsAudioModalOpen(true)
        }
      })
      .catch((error) => {
        console.warn('Unable to open audio modal:', error)
      })
  }

  const handleCloseAudioModal = () => {
    setIsAudioModalOpen(false)
  }

  const handleRequestReset = () => {
    setIsConfirmResetOpen(true)
  }

  const handleConfirmReset = () => {
    handleResetAll()
    setIsConfirmResetOpen(false)
  }

  const handleCancelReset = () => {
    setIsConfirmResetOpen(false)
  }

  const isModalActive = isAudioModalOpen || isConfirmResetOpen

  return (
    <div className="app">
      <div className={`app-content${isModalActive ? ' content-dimmed' : ''}`}>
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

        <div className="toolbar">
          <button
            className="icon-btn"
            type="button"
            onClick={handleOpenAudioModal}
          aria-haspopup="dialog"
          aria-expanded={isAudioModalOpen}
          aria-label="Open audio settings"
          disabled={!hasActiveAudio}
        >
          <span aria-hidden="true">🔊</span>
        </button>
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
              <button className="menu-btn" onClick={handleRequestReset}>
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

      {isAudioModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="audio-modal-title">
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="audio-modal-title">Audio Settings</h2>
              <button className="modal-close" type="button" onClick={handleCloseAudioModal} aria-label="Close audio settings">
                ×
              </button>
            </div>
            <div className="modal-body">
              <label className="volume-label" htmlFor="volume-slider">
                Volume
                <span className="volume-value">{Math.round(volume * 100)}%</span>
              </label>
              <input
                id="volume-slider"
                className="volume-slider"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={handleVolumeChange}
                aria-label="Adjust game volume"
              />
            </div>
          </div>
        </div>
      )}

      {isConfirmResetOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="reset-confirm-title">
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="reset-confirm-title">Reset scores?</h2>
              <button className="modal-close" type="button" onClick={handleCancelReset} aria-label="Cancel reset">
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-message">Are you sure you want to reset all scores? This cannot be undone.</p>
              <div className="modal-actions">
                <button className="modal-btn danger" type="button" onClick={handleConfirmReset}>
                  Yes, reset
                </button>
                <button className="modal-btn" type="button" onClick={handleCancelReset}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
