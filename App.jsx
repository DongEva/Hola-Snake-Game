import React, { useState, useEffect, useRef, useCallback } from 'react';
import './index.css';

// --- 水果数据库 ---
const FRUITS = [
    { icon: '🍎', cn: '苹果', es: 'Manzana' },
    { icon: '🍌', cn: '香蕉', es: 'Plátano' },
    { icon: '🍇', cn: '葡萄', es: 'Uva' },
    { icon: '🍉', cn: '西瓜', es: 'Sandía' },
    { icon: '🍓', cn: '草莓', es: 'Fresa' },
    { icon: '🍒', cn: '樱桃', es: 'Cereza' },
    { icon: '🍑', cn: '桃子', es: 'Melocotón' },
    { icon: '🍊', cn: '橘子', es: 'Naranja' },
    { icon: '🍍', cn: '菠萝', es: 'Piña' },
    { icon: '🥝', cn: '猕猴桃', es: 'Kiwi' },
    { icon: '🍐', cn: '梨', es: 'Pera' },
    { icon: '🍋', cn: '柠檬', es: 'Limón' }
];

// --- 游戏配置 ---
const CANVAS_WIDTH = 320;
const CANVAS_HEIGHT = 352;
const GRID_SIZE = 16;
const TILE_COUNT_X = CANVAS_WIDTH / GRID_SIZE;
const TILE_COUNT_Y = CANVAS_HEIGHT / GRID_SIZE;
const FPS = 10;

function App() {
    const canvasRef = useRef(null);
    const [gameState, setGameState] = useState('START'); // START, RUNNING, GAMEOVER, VICTORY
    const [score, setScore] = useState(0);
    const [finalTime, setFinalTime] = useState('00:00:00');
    const [currentFruit, setCurrentFruit] = useState({ icon: '?', cn: '--', es: '--' });
    const [collectedFruits, setCollectedFruits] = useState(new Set());
    const [activeKeys, setActiveKeys] = useState({ up: false, down: false, left: false, right: false, start: false });
    const [popEffect, setPopEffect] = useState(false);
    
    // Gallery State
    const [galleryIndex, setGalleryIndex] = useState(0);
    const [timeLeft, setTimeLeft] = useState(30);

    // 游戏逻辑状态 (使用 ref 避免重渲染)
    const snakeRef = useRef([]);
    const foodRef = useRef({ x: 0, y: 0, type: null });
    const velocityRef = useRef({ x: 0, y: 0 });
    const nextVelocityRef = useRef({ x: 0, y: 0 });
    const gameIntervalRef = useRef(null);
    const startTimeRef = useRef(0);
    const audioCtxRef = useRef(null);
    const collectedFruitsRef = useRef(new Set()); // 用于逻辑判断
    const spanishVoiceRef = useRef(null); // Cache the voice object
    const galleryTimeoutRef = useRef(null);

    // --- 初始化语音 ---
    useEffect(() => {
        const loadVoice = () => {
            if (!('speechSynthesis' in window)) return;
            const voices = window.speechSynthesis.getVoices();
            
            // 策略 1: 优先寻找 Microsoft 的离线语音 (Edge特供优化)
            // Edge 的在线语音通常包含 "Online (Natural)"，虽然好听但延迟极高
            // 我们寻找不带 "Online" 关键字的西班牙语语音
            let esVoice = voices.find(v => 
                v.lang.startsWith('es') && 
                v.name.includes('Microsoft') && 
                !v.name.includes('Online')
            );

            // 策略 2: 寻找明确标记为本地服务的语音 (Chrome/Android)
            if (!esVoice) {
                esVoice = voices.find(v => v.lang.startsWith('es') && v.localService);
            }

            // 策略 3: 任何不带 "Online" 的西班牙语语音 (避免 Google 的云端语音)
            if (!esVoice) {
                esVoice = voices.find(v => v.lang.startsWith('es') && !v.name.includes('Online'));
            }

            // 策略 4: 最后的兜底
            if (!esVoice) {
                esVoice = voices.find(v => v.lang.startsWith('es'));
            }
            
            if (esVoice) {
                console.log("Selected Voice:", esVoice.name); // 调试用
                spanishVoiceRef.current = esVoice;
            }
        };

        loadVoice();
        // Chrome loads voices asynchronously
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = loadVoice;
        }
    }, []);

    // --- 音频 ---
    const initAudio = useCallback(() => {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        // Resume context if it's suspended (browser policy)
        if (audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume();
        }
    }, []);

    const speakSpanish = useCallback((text) => {
        if (!('speechSynthesis' in window)) return;
        
        // Cancel previous speech for seamless transition
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        // Use the cached voice if available, otherwise fallback to lang code
        if (spanishVoiceRef.current) {
            utterance.voice = spanishVoiceRef.current;
        }
        utterance.lang = 'es-ES'; 
        utterance.rate = 1.0; 
        
        window.speechSynthesis.speak(utterance);
    }, []);

    const playSound = useCallback((type) => {
        if (!audioCtxRef.current) return;
        const audioCtx = audioCtxRef.current;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        const now = audioCtx.currentTime;

        if (type === 'move') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.05);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.start();
            osc.stop(now + 0.05);
        } else if (type === 'eat') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.setValueAtTime(600, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.2);
            osc.start();
            osc.stop(now + 0.2);
        } else if (type === 'win') {
            [523.25, 659.25, 783.99].forEach((freq, i) => {
                const o = audioCtx.createOscillator();
                const g = audioCtx.createGain();
                o.type = 'square';
                o.connect(g);
                g.connect(audioCtx.destination);
                o.frequency.setValueAtTime(freq, now + i * 0.1);
                g.gain.setValueAtTime(0.1, now + i * 0.1);
                g.gain.linearRampToValueAtTime(0, now + i * 0.1 + 0.3);
                o.start(now + i * 0.1);
                o.stop(now + i * 0.1 + 0.3);
            });
        } else if (type === 'die') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(50, now + 0.5);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.5);
            osc.start();
            osc.stop(now + 0.5);
        }
    }, []);

    // --- 游戏辅助函数 ---
    const formatTime = (ms) => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const seconds = (totalSeconds % 60).toString().padStart(2, '0');
        const millis = Math.floor((ms % 1000) / 10).toString().padStart(2, '0');
        return `${minutes}:${seconds}:${millis}`;
    };

    const spawnFood = useCallback(() => {
        let valid = false;
        while (!valid) {
            const x = Math.floor(Math.random() * TILE_COUNT_X);
            const y = Math.floor(Math.random() * TILE_COUNT_Y);
            const onSnake = snakeRef.current.some(segment => segment.x === x && segment.y === y);
            if (!onSnake) {
                foodRef.current = {
                    x,
                    y,
                    type: FRUITS[Math.floor(Math.random() * FRUITS.length)]
                };
                valid = true;
            }
        }
    }, []);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        // Clear background
        ctx.fillStyle = '#9bbc0f';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Draw Food
        if (foodRef.current.type) {
            ctx.font = '14px "Segoe UI Emoji", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const centerX = foodRef.current.x * GRID_SIZE + GRID_SIZE / 2;
            const centerY = foodRef.current.y * GRID_SIZE + GRID_SIZE / 2 + 1;
            ctx.fillText(foodRef.current.type.icon, centerX, centerY);
        }

        // Draw Snake
        snakeRef.current.forEach((segment, index) => {
            const color = index === 0 ? '#0f380f' : '#306230';
            ctx.fillStyle = color;
            ctx.fillRect(segment.x * GRID_SIZE + 1, segment.y * GRID_SIZE + 1, GRID_SIZE - 2, GRID_SIZE - 2);
        });

        // Draw Score (in canvas, though we also have HTML UI)
        ctx.fillStyle = '#0f380f';
        ctx.font = '10px "Press Start 2P"';
        ctx.fillText(`SCORE:${score}`, 5, CANVAS_HEIGHT - 5);
    }, [score]);

    const gameOver = useCallback(() => {
        if (gameIntervalRef.current) clearInterval(gameIntervalRef.current);
        setGameState('GAMEOVER');
        setTimeLeft(5);
        playSound('die');
    }, [playSound]);

    const victory = useCallback(() => {
        if (gameIntervalRef.current) clearInterval(gameIntervalRef.current);
        playSound('win');
        const endTime = Date.now();
        const duration = endTime - startTimeRef.current;
        setFinalTime(formatTime(duration));
        setGameState('VICTORY');
        setTimeLeft(5);
    }, [playSound]);

    const update = useCallback(() => {
        if (gameState !== 'RUNNING') return;

        velocityRef.current = { ...nextVelocityRef.current };
        const head = { x: snakeRef.current[0].x + velocityRef.current.x, y: snakeRef.current[0].y + velocityRef.current.y };

        // Wall collision
        if (head.x < 0 || head.x >= TILE_COUNT_X || head.y < 0 || head.y >= TILE_COUNT_Y) {
            gameOver();
            return;
        }

        // Self collision
        if (snakeRef.current.some(segment => segment.x === head.x && segment.y === head.y)) {
            gameOver();
            return;
        }

        snakeRef.current.unshift(head);

        // Eat food
        if (head.x === foodRef.current.x && head.y === foodRef.current.y) {
            setScore(prev => prev + 10);
            playSound('eat');
            speakSpanish(foodRef.current.type.es);
            
            // Update UI info
            setCurrentFruit(foodRef.current.type);
            setPopEffect(true);
            setTimeout(() => setPopEffect(false), 200);

            // Update collection
            const fruitIcon = foodRef.current.type.icon;
            if (!collectedFruitsRef.current.has(fruitIcon)) {
                collectedFruitsRef.current.add(fruitIcon);
                setCollectedFruits(new Set(collectedFruitsRef.current)); // Update React state
                
                if (collectedFruitsRef.current.size === FRUITS.length) {
                    victory();
                    return; // Stop update
                }
            }

            spawnFood();
        } else {
            snakeRef.current.pop();
        }

        draw();
    }, [gameState, draw, gameOver, victory, playSound, spawnFood, speakSpanish]);

    const startGame = useCallback(() => {
        initAudio();
        
        // Warm up speech synthesis on user interaction to unlock audio on mobile/strict browsers
        if ('speechSynthesis' in window) {
            // Cancel any pending speech first
            window.speechSynthesis.cancel(); 
            const silent = new SpeechSynthesisUtterance('');
            silent.volume = 0; // Silent
            silent.rate = 10; // Fast
            window.speechSynthesis.speak(silent);
        }

        snakeRef.current = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
        velocityRef.current = { x: 1, y: 0 };
        nextVelocityRef.current = { x: 1, y: 0 };
        setScore(0);
        setGameState('RUNNING');
        
        collectedFruitsRef.current.clear();
        setCollectedFruits(new Set());
        
        startTimeRef.current = Date.now();
        setCurrentFruit({ icon: '?', cn: '--', es: '--' });

        spawnFood();
        
        if (gameIntervalRef.current) clearInterval(gameIntervalRef.current);
        gameIntervalRef.current = setInterval(update, 1000 / FPS);
        playSound('move');
    }, [initAudio, playSound, spawnFood, update]);

    // --- 自动返回待机 (倒计时) ---
    const resetGalleryTimer = useCallback(() => {
        setTimeLeft(30);
    }, []);

    // Timer Effect
    useEffect(() => {
        let interval = null;
        if (gameState === 'GALLERY') {
            interval = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        setGameState('START');
                        return 30;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else if (gameState === 'GAMEOVER' || gameState === 'VICTORY') {
            interval = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        setGameState('GALLERY');
                        setGalleryIndex(0);
                        return 30; // Reset to 30 for Gallery
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [gameState]);

    // Keyboard Input
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
            
            // Gallery Navigation
            if (gameState === 'GALLERY') {
                resetGalleryTimer();
                if (e.key === 'ArrowLeft') {
                    setGalleryIndex(prev => (prev - 1 + FRUITS.length) % FRUITS.length);
                } else if (e.key === 'ArrowRight') {
                    setGalleryIndex(prev => (prev + 1) % FRUITS.length);
                } else if (e.key === 'Enter' || e.key === ' ') {
                    startGame();
                }
                return;
            }

            // Start game or Enter Gallery from GameOver/Victory
            if (gameState !== 'RUNNING') {
                if (e.key === 'Enter' || e.key === ' ') {
                    if (gameState === 'GAMEOVER' || gameState === 'VICTORY') {
                        setGameState('GALLERY');
                        setGalleryIndex(0); // Start from first fruit
                        resetGalleryTimer();
                    } else {
                        startGame();
                    }
                }
                return;
            }
            
            if (gameState !== 'RUNNING') return;

            switch(e.key) {
                case 'ArrowUp': 
                    if (velocityRef.current.y === 0) nextVelocityRef.current = { x: 0, y: -1 }; 
                    setActiveKeys(prev => ({ ...prev, up: true }));
                    break;
                case 'ArrowDown': 
                    if (velocityRef.current.y === 0) nextVelocityRef.current = { x: 0, y: 1 }; 
                    setActiveKeys(prev => ({ ...prev, down: true }));
                    break;
                case 'ArrowLeft': 
                    if (velocityRef.current.x === 0) nextVelocityRef.current = { x: -1, y: 0 }; 
                    setActiveKeys(prev => ({ ...prev, left: true }));
                    break;
                case 'ArrowRight': 
                    if (velocityRef.current.x === 0) nextVelocityRef.current = { x: 1, y: 0 }; 
                    setActiveKeys(prev => ({ ...prev, right: true }));
                    break;
            }
        };

        const handleKeyUp = (e) => {
             switch(e.key) {
                case 'ArrowUp': setActiveKeys(prev => ({ ...prev, up: false })); break;
                case 'ArrowDown': setActiveKeys(prev => ({ ...prev, down: false })); break;
                case 'ArrowLeft': setActiveKeys(prev => ({ ...prev, left: false })); break;
                case 'ArrowRight': setActiveKeys(prev => ({ ...prev, right: false })); break;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('keyup', handleKeyUp);
        };
    }, [gameState, startGame]);

    // Gallery Auto-Speak
    useEffect(() => {
        if (gameState === 'GALLERY') {
            const fruit = FRUITS[galleryIndex];
            
            // Clear previous timeout
            if (galleryTimeoutRef.current) clearTimeout(galleryTimeoutRef.current);
            
            // Small delay to ensure state is settled and transition is smooth
            galleryTimeoutRef.current = setTimeout(() => {
                speakSpanish(fruit.es);
            }, 300);
            
            return () => {
                if (galleryTimeoutRef.current) clearTimeout(galleryTimeoutRef.current);
            };
        } else {
            // Clear timeout if leaving gallery
            if (galleryTimeoutRef.current) {
                clearTimeout(galleryTimeoutRef.current);
                galleryTimeoutRef.current = null;
            }
        }
    }, [gameState, galleryIndex, speakSpanish]);

    // Initial Draw & Cleanup
    useEffect(() => {
        // Initial draw just to fill background
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#9bbc0f';
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }
        return () => {
            if (gameIntervalRef.current) clearInterval(gameIntervalRef.current);
        };
    }, []);

    // Sync Game Loop
    useEffect(() => {
        if (gameState === 'RUNNING') {
             // Ensure interval is running with fresh closure if needed, 
             // but 'update' uses refs so it might be fine.
             // Actually, we set interval in startGame.
             // We just need to make sure 'update' function in interval is always fresh or uses refs.
             // Since 'update' is wrapped in useCallback with dependencies, if dependencies change, it changes.
             // But setInterval holds the old function.
             // Better approach: use a ref for the update function or just rely on refs inside update.
             // My 'update' relies heavily on refs, but calls 'draw' which depends on 'score'.
             // 'score' is state. So 'draw' changes. So 'update' changes.
             // So the interval will call a STALE update function if we don't clear it.
             // BUT, we used refs for game logic, so logic is fine.
             // Drawing score might show stale score if we use state score in draw called by stale update.
             // Fix: Use a ref for score inside draw? Or just pass score to draw?
             // Actually, the draw function is called inside update.
             // To avoid stale closures in setInterval, a common pattern is useInterval hook.
             // Or simply:
             if (gameIntervalRef.current) clearInterval(gameIntervalRef.current);
             gameIntervalRef.current = setInterval(update, 1000 / FPS);
        }
        return () => {
            if (gameIntervalRef.current) clearInterval(gameIntervalRef.current);
        }
    }, [gameState, update]);


    // Button Handlers
    const handleBtnPress = (direction) => {
        if (gameState === 'GALLERY') {
            resetGalleryTimer();
            if (direction === 'LEFT') {
                setGalleryIndex(prev => (prev - 1 + FRUITS.length) % FRUITS.length);
            } else if (direction === 'RIGHT') {
                setGalleryIndex(prev => (prev + 1) % FRUITS.length);
            } else if (direction === 'START') {
                startGame();
            }
            return;
        }

        if (gameState === 'GAMEOVER' || gameState === 'VICTORY') {
            if (direction === 'START') {
                startGame();
            }
            return;
        }

        if (gameState === 'START' && direction === 'START') {
            startGame();
            return;
        }

        if (gameState !== 'RUNNING') return;
        switch(direction) {
            case 'UP': if (velocityRef.current.y === 0) nextVelocityRef.current = { x: 0, y: -1 }; break;
            case 'DOWN': if (velocityRef.current.y === 0) nextVelocityRef.current = { x: 0, y: 1 }; break;
            case 'LEFT': if (velocityRef.current.x === 0) nextVelocityRef.current = { x: -1, y: 0 }; break;
            case 'RIGHT': if (velocityRef.current.x === 0) nextVelocityRef.current = { x: 1, y: 0 }; break;
        }
    };

    return (
        <div className="console-case">
            <div className="case-top-line"></div>
            <div className="brand-logo">DongEvan Trial</div>
            
            <div className="top-area">
                <div className="screen-bezel">
                    <div className="screen-container">
                        <canvas ref={canvasRef} width={320} height={352}></canvas>
                        <div className="scanlines"></div>
                        
                        {gameState === 'START' && (
                            <div className="game-ui">
                                <div className="title">SNAKE GAME</div>
                                <div className="blink">PRESS START</div>
                            </div>
                        )}

                        {gameState === 'GALLERY' && (
                            <div className="game-ui gallery-ui" style={{ backgroundColor: 'rgba(155, 188, 15, 0.95)', padding: '10px' }}>
                                <div className="title" style={{ 
                                    fontSize: '1rem', 
                                    position: 'absolute', 
                                    top: '20px', 
                                    width: '100%',
                                    textAlign: 'center'
                                }}>LEARNING GALLERY</div>
                                
                                <div style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'space-between', 
                                    width: '85%',
                                    margin: '10px auto',
                                    position: 'relative' // For absolute positioning of label
                                }}>
                                    {/* Left Arrow (CSS Triangle) */}
                                    <div style={{
                                        width: 0,
                                        height: 0,
                                        borderTop: '10px solid transparent',
                                        borderBottom: '10px solid transparent',
                                        borderRight: '15px solid #0f380f',
                                        filter: 'drop-shadow(2px 2px 0px rgba(0,0,0,0.2))',
                                        marginTop: '40px' // Moved down
                                    }}></div>

                                    {/* Icon Container */}
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ 
                                            fontSize: '6rem', 
                                            filter: collectedFruits.has(FRUITS[galleryIndex].icon) ? 'none' : 'grayscale(100%) opacity(0.5)',
                                            transition: 'all 0.3s'
                                        }}>
                                            {FRUITS[galleryIndex].icon}
                                        </div>
                                        
                                        {!collectedFruits.has(FRUITS[galleryIndex].icon) && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '50%',
                                                left: '50%',
                                                transform: 'translate(-50%, -50%) rotate(-15deg)',
                                                border: '3px solid #0f380f',
                                                color: '#9bbc0f',
                                                padding: '4px 8px',
                                                fontSize: '0.6rem',
                                                fontFamily: '"Press Start 2P", cursive',
                                                backgroundColor: '#0f380f',
                                                whiteSpace: 'nowrap',
                                                boxShadow: '2px 2px 0px rgba(0,0,0,0.2)',
                                                letterSpacing: '1px',
                                                zIndex: 10
                                            }}>
                                                UNCOLLECTED
                                            </div>
                                        )}
                                    </div>

                                    {/* Right Arrow (CSS Triangle) */}
                                    <div style={{
                                        width: 0,
                                        height: 0,
                                        borderTop: '10px solid transparent',
                                        borderBottom: '10px solid transparent',
                                        borderLeft: '15px solid #0f380f',
                                        filter: 'drop-shadow(2px 2px 0px rgba(0,0,0,0.2))',
                                        marginTop: '40px' // Moved down
                                    }}></div>
                                </div>
                                
                                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#0f380f', textAlign: 'center', width: '100%' }}>
                                    {FRUITS[galleryIndex].cn}
                                </div>
                                <div style={{ fontSize: '1.5rem', color: '#306230', textAlign: 'center', width: '100%' }}>
                                    {FRUITS[galleryIndex].es}
                                </div>

                                <div style={{ 
                                    position: 'absolute', 
                                    bottom: '4px', 
                                    width: '100%', 
                                    textAlign: 'center', 
                                    fontSize: '0.6rem', 
                                    color: '#0f380f',
                                    opacity: 0.8,
                                    fontFamily: '"Press Start 2P", cursive'
                                }}>
                                    AUTO-EXIT: {timeLeft}s
                                </div>
                            </div>
                        )}

                        {(gameState === 'GAMEOVER' || gameState === 'VICTORY') && (
                            <div className="game-ui">
                                <div className={`title ${gameState === 'GAMEOVER' ? 'blink-3' : ''}`} style={{ 
                                    color: gameState === 'GAMEOVER' ? '#9b0000' : '#0f380f',
                                    fontSize: '1.5rem' // Enlarged font size
                                }}>
                                    {gameState === 'GAMEOVER' ? 'GAME OVER!' : 'VICTORY!'}
                                </div>
                                
                                {gameState === 'VICTORY' && (
                                    <div style={{ display: 'block', margin: '10px 0', fontSize: '0.8rem' }}>
                                        TIME: <span>{finalTime}</span>
                                    </div>
                                )}

                                <div>SCORE: <span>{score}</span></div>
                                
                                <div style={{ 
                                    position: 'absolute',
                                    bottom: '30px',
                                    width: '100%',
                                    fontSize: '0.9rem', 
                                    display: 'flex', 
                                    flexDirection: 'row', 
                                    justifyContent: 'center',
                                    alignItems: 'baseline', 
                                    gap: '10px' 
                                }}>
                                    <div style={{ color: '#0f380f' }}>
                                        ENTERING GALLERY IN
                                    </div>
                                    <div className="blink-cut" style={{ fontSize: '0.9rem', color: '#0f380f', fontWeight: 'bold' }}>
                                        {timeLeft}s
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="info-panel">
                    <div className="panel-title">FRUIT INFO</div>
                    <div className={`fruit-display-box ${popEffect ? 'pop' : ''}`}>
                        {currentFruit.icon}
                    </div>
                    <div className="text-container">
                        <div>
                            <div className="fruit-label">CN 中文</div>
                            <div className="fruit-name">{currentFruit.cn}</div>
                        </div>
                        <div>
                            <div className="fruit-label">ES Español</div>
                            <div className="fruit-name">{currentFruit.es}</div>
                        </div>
                    </div>

                    <div className="collection-title">COLLECTION</div>
                    <div className="collection-grid">
                        {FRUITS.map(fruit => (
                            <div 
                                key={fruit.icon}
                                className={`collect-icon ${collectedFruits.has(fruit.icon) ? 'collected' : 'uncollected'}`}
                                title={`${fruit.cn} / ${fruit.es}`}
                            >
                                {fruit.icon}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="controls-area">
                <div className="d-pad">
                    <div className="d-center"></div>
                    <div 
                        className={`d-pad-part d-up ${activeKeys.up ? 'active' : ''}`} 
                        onPointerDown={(e) => { e.preventDefault(); handleBtnPress('UP'); setActiveKeys(p => ({...p, up: true})); }}
                        onPointerUp={() => setActiveKeys(p => ({...p, up: false}))}
                        onPointerLeave={() => setActiveKeys(p => ({...p, up: false}))}
                    ></div>
                    <div 
                        className={`d-pad-part d-down ${activeKeys.down ? 'active' : ''}`}
                        onPointerDown={(e) => { e.preventDefault(); handleBtnPress('DOWN'); setActiveKeys(p => ({...p, down: true})); }}
                        onPointerUp={() => setActiveKeys(p => ({...p, down: false}))}
                        onPointerLeave={() => setActiveKeys(p => ({...p, down: false}))}
                    ></div>
                    <div 
                        className={`d-pad-part d-left ${activeKeys.left ? 'active' : ''}`}
                        onPointerDown={(e) => { e.preventDefault(); handleBtnPress('LEFT'); setActiveKeys(p => ({...p, left: true})); }}
                        onPointerUp={() => setActiveKeys(p => ({...p, left: false}))}
                        onPointerLeave={() => setActiveKeys(p => ({...p, left: false}))}
                    ></div>
                    <div 
                        className={`d-pad-part d-right ${activeKeys.right ? 'active' : ''}`}
                        onPointerDown={(e) => { e.preventDefault(); handleBtnPress('RIGHT'); setActiveKeys(p => ({...p, right: true})); }}
                        onPointerUp={() => setActiveKeys(p => ({...p, right: false}))}
                        onPointerLeave={() => setActiveKeys(p => ({...p, right: false}))}
                    ></div>
                </div>

                <div className="action-area">
                    {gameState !== 'RUNNING' && (
                        <div className="reset-hint">
                            {gameState === 'START' ? 'PRESS TO START' : 'PRESS START TO RESET'}
                        </div>
                    )}
                    <div 
                        className={`btn-round ${activeKeys.start ? 'active' : ''}`}
                        onClick={() => handleBtnPress('START')}
                        onPointerDown={() => setActiveKeys(p => ({...p, start: true}))}
                        onPointerUp={() => setActiveKeys(p => ({...p, start: false}))}
                        onPointerLeave={() => setActiveKeys(p => ({...p, start: false}))}
                    ></div>
                </div>
            </div>

            <div className="speaker">
                {Array(18).fill(0).map((_, i) => <div key={i} className="speaker-hole"></div>)}
            </div>
        </div>
    );
}

export default App;
