import { Chess } from '../vendor/chess.js';
import { extendedFingerTips } from './logic/gestures.js';

const KEY_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"],
  ['Shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', 'Backspace'],
  ['Tab', 'Space', 'Enter'],
];
const CARD_FACES = ['✦', '◈', '✿', '☼', '⬡', '♧', '☾', '✺'];

export class ExperienceHub {
  constructor(root, app) {
    this.root = root; this.app = app; this.active = null; this.raf = 0;
    this.root.addEventListener('click', (event) => this.onClick(event));
    this.root.addEventListener('submit', (event) => this.onSubmit(event));
    this.root.addEventListener('keydown', (event) => this.onKeyDown(event));
    document.querySelectorAll('[data-experience]').forEach((button) => {
      button.addEventListener('click', () => this.open(button.dataset.experience));
    });
  }

  open(mode) {
    this.close(false);
    this.active = mode; this.app.stopDemo(); this.app.ctl.suppressStateGestures = true;
    this.root.classList.add(`mode-${mode}`);
    if (this.app.quiz) this.app.stopQuiz();
    const titles = { draw: 'Particle drawing', keyboard: 'Gesture keyboard', assistant: 'Ask Ollama', games: 'Games' };
    this.root.innerHTML = `<div class="experience-shell mode-${mode}"><header class="experience-head"><div><p class="mode-eyebrow">LIVE IT / STUDIO MODE</p><h2 id="experienceTitle">${titles[mode]}</h2></div><button class="mode-close" type="button" data-action="close" aria-label="Close mode">×</button></header><main class="experience-main"></main><div class="gesture-cursor" aria-hidden="true"></div><p class="mode-hint" aria-live="polite"></p></div>`;
    this.root.hidden = false;
    if (mode === 'draw') this.mountDraw();
    else if (mode === 'keyboard') this.mountKeyboard();
    else if (mode === 'assistant') this.mountAssistant();
    else this.mountGames();
    this.root.querySelector('[data-action="close"]').focus();
  }

  close(restore = true) {
    cancelAnimationFrame(this.raf); this.raf = 0;
    clearInterval(this.snakeTimer); this.snakeTimer = null;
    clearTimeout(this.memoryTimer); this.memoryTimer = null;
    if (this.drawResize) window.removeEventListener('resize', this.drawResize);
    this.drawResize = null; this.drawCanvas = null; this.drawCtx = null;
    this.drawFingerPositions?.clear();
    this.keyboardTouches?.clear(); this.keyboardCursors?.clear();
    this.gestureTarget?.classList.remove('gesture-hovered');
    this.gestureTarget = null;
    if (!this.active) return;
    this.active = null; this.app.ctl.suppressStateGestures = false; this.root.hidden = true;
    this.root.classList.remove('mode-draw', 'mode-keyboard');
    this.root.replaceChildren();
    if (restore) this.app.$('catalogToggle').focus();
  }

  onClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'close') { this.close(); return; }
    if (action === 'clear-drawing') { this.clearDrawing(); return; }
    if (action === 'copy-text') { this.copyText(); return; }
    if (action === 'game') { this.openGame(event.target.closest('[data-game]').dataset.game); return; }
    if (action === 'snake-start') { this.startSnake(); return; }
    if (action === 'direction') { this.setDirection(event.target.dataset.direction); return; }
    if (action === 'chess-square') { this.selectChessSquare(event.target.dataset.square); return; }
    if (action === 'memory-card') { this.flipCard(Number(event.target.dataset.index)); return; }
    if (action === 'draw-color') { this.drawColor = event.target.dataset.color; this.root.querySelectorAll('[data-action="draw-color"]').forEach((b) => b.classList.toggle('selected', b === event.target)); }
    if (event.target.closest('.virtual-key')) this.pressKey(event.target.closest('.virtual-key').dataset.key);
  }

  onSubmit(event) {
    if (event.target.id !== 'assistantForm') return;
    event.preventDefault(); this.askAssistant();
  }

  onKeyDown(event) {
    if (event.key === 'Escape') { this.close(); return; }
    if (this.active === 'games' && this.game === 'snake') {
      const dirs = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      if (dirs[event.key]) { event.preventDefault(); this.setDirection(dirs[event.key]); }
    }
  }

  update(ctl) {
    if (!this.active) return;
    const hands = [
      ctl.handVisible(this.app.t) && ctl.landmarks,
      ctl.secondVisible(this.app.t) && ctl.second,
    ].filter(Boolean);
    const point = this.app.gestureScreenPosition(hands[0] || null, ctl.pinch);
    const cursor = this.root.querySelector('.gesture-cursor');
    if (cursor) {
      cursor.hidden = !point || this.active === 'keyboard';
      if (point) { cursor.style.left = `${point.x}px`; cursor.style.top = `${point.y}px`; }
    }
    const target = point ? document.elementFromPoint(point.x, point.y)?.closest(
      'button, a[href], input, select, textarea, [role="button"]',
    ) || null : null;
    const usableTarget = target && !target.disabled && target.getAttribute('aria-disabled') !== 'true' ? target : null;
    if (usableTarget !== this.gestureTarget) {
      this.gestureTarget?.classList.remove('gesture-hovered');
      this.gestureTarget = usableTarget;
      usableTarget?.classList.add('gesture-hovered');
    }
    if (ctl.pinchStart && usableTarget) {
      this.app.activateGestureTarget(usableTarget, point.x, point.y);
      ctl.pinchStart = false;
    }
    if (this.active === 'draw') {
      const activeFingers = new Set();
      hands.forEach((lm, handIndex) => {
        for (const tip of extendedFingerTips(lm, ctl.gestureProfile)) {
          const id = `${handIndex}:${tip}`, { x, y } = this.app.screenPosition(lm[tip]);
          const previous = this.drawFingerPositions.get(id);
          if (previous) this.addDrawingStroke(previous, { x, y });
          else this.addDrawingParticle(x, y);
          this.drawFingerPositions.set(id, { x, y });
          activeFingers.add(id);
        }
      });
      for (const id of this.drawFingerPositions.keys()) if (!activeFingers.has(id)) this.drawFingerPositions.delete(id);
    }
    if (this.active === 'keyboard') {
      this.updateKeyboard(hands, ctl.gestureProfile);
    }
    ctl.pinchStart = false;
  }

  mountDraw() {
    this.root.querySelector('.experience-main').innerHTML = `<div class="draw-toolbar"><span>Move any extended fingertip to paint with globe particles</span><div class="draw-colors">${['#e3b46f', '#72c7a2', '#f08270', '#e9e3d6'].map((color, i) => `<button data-action="draw-color" data-color="${color}" class="color-choice ${i === 0 ? 'selected' : ''}" style="--swatch:${color}" aria-label="Brush color ${i + 1}"></button>`).join('')}<button data-action="clear-drawing" class="quiet-button">Clear</button></div></div><div class="draw-surface"><canvas aria-label="Particle drawing canvas"></canvas><p class="draw-empty">Point, drag or draw with a mouse</p></div>`;
    this.drawCanvas = this.root.querySelector('.draw-surface canvas'); this.drawCtx = this.drawCanvas.getContext('2d');
    this.drawPoints = []; this.drawColor = '#e3b46f'; this.drawDown = false; this.drawFingerPositions = new Map();
    this.resizeDraw();
    this.drawCanvas.addEventListener('pointerdown', (event) => { this.drawDown = true; this.drawPointerPosition = null; this.drawCanvas.setPointerCapture(event.pointerId); this.drawAtEvent(event); });
    this.drawCanvas.addEventListener('pointermove', (event) => { if (this.drawDown) this.drawAtEvent(event); });
    this.drawCanvas.addEventListener('pointerup', () => { this.drawDown = false; this.drawPointerPosition = null; });
    this.drawCanvas.addEventListener('pointercancel', () => { this.drawDown = false; this.drawPointerPosition = null; });
    this.drawResize = () => this.resizeDraw(); window.addEventListener('resize', this.drawResize);
    this.drawLoop();
  }

  resizeDraw() {
    if (!this.drawCanvas) return;
    const rect = this.drawCanvas.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    this.drawCanvas.width = Math.max(1, Math.round(rect.width * dpr)); this.drawCanvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.drawCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  addDrawingParticle(x, y) {
    const rect = this.drawCanvas.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
    const localX = x - rect.left, localY = y - rect.top;
    for (let i = 0; i < 5; i++) {
      const angle = Math.random() * Math.PI * 2, spread = 2 + Math.random() * 8;
      this.drawPoints.push({
        x: localX + Math.cos(angle) * spread, y: localY + Math.sin(angle) * spread,
        r: 1.2 + Math.random() * 1.2, color: this.drawColor,
        phase: Math.random() * Math.PI * 2, drift: 0.5 + Math.random() * 2,
      });
    }
    if (this.drawPoints.length > 24000) this.drawPoints.splice(0, 5);
    this.root.querySelector('.draw-empty')?.remove();
  }

  addDrawingStroke(from, to) {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    if (distance < 1.5) return;
    const steps = Math.max(1, Math.ceil(distance / 4));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this.addDrawingParticle(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    }
  }

  drawAtEvent(event) {
    const point = { x: event.clientX, y: event.clientY };
    if (this.drawPointerPosition) this.addDrawingStroke(this.drawPointerPosition, point);
    else this.addDrawingParticle(point.x, point.y);
    this.drawPointerPosition = point;
  }
  clearDrawing() {
    this.drawPoints = []; this.drawFingerPositions.clear(); this.drawPointerPosition = null;
    this.drawCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
  }

  drawLoop() {
    if (this.active !== 'draw') return;
    const rect = this.drawCanvas.getBoundingClientRect();
    this.drawCtx.clearRect(0, 0, rect.width, rect.height);
    const time = performance.now() / 1000;
    for (const point of this.drawPoints) {
      const pulse = 0.65 + 0.35 * Math.sin(time * 2 + point.phase);
      const driftX = Math.cos(time + point.phase) * point.drift, driftY = Math.sin(time + point.phase) * point.drift;
      this.drawCtx.globalAlpha = 0.7 + pulse * 0.3; this.drawCtx.fillStyle = point.color;
      this.drawCtx.shadowBlur = 10; this.drawCtx.shadowColor = point.color;
      this.drawCtx.beginPath(); this.drawCtx.arc(point.x + driftX, point.y + driftY, point.r * pulse, 0, Math.PI * 2); this.drawCtx.fill();
    }
    this.drawCtx.globalAlpha = 1; this.drawCtx.shadowBlur = 0;
    this.raf = requestAnimationFrame(() => this.drawLoop());
  }

  mountKeyboard() {
    this.root.querySelector('.experience-main').innerHTML = `<div class="keyboard-copy"><textarea class="keyboard-output" aria-label="Typed text" placeholder="Your text appears here…"></textarea><div class="keyboard-actions"><span class="keyboard-finger-count" aria-live="polite">0 fingers detected · hold a key steady for 3 seconds</span><button class="quiet-button" data-action="copy-text">Copy text</button></div></div><div class="virtual-keyboard">${KEY_ROWS.map((row) => `<div class="key-row">${row.map((key) => `<button type="button" class="virtual-key ${['Space', 'Backspace', 'Enter', 'Shift', 'Tab'].includes(key) ? 'key-wide' : ''}" data-key="${key}" aria-label="${key}">${key === 'Space' ? 'space' : key}</button>`).join('')}</div>`).join('')}</div>`;
    this.keyboardShift = false;
    this.keyboardTouches = new Map();
    this.keyboardCursors = new Map();
    this.root.querySelector('.keyboard-output').focus();
  }

  updateKeyboard(hands, profile) {
    const now = this.app.t;
    const activeTouches = new Set(), hoveredKeys = new Set(), ready = [];
    let fingerCount = 0;
    hands.forEach((lm, handIndex) => {
      for (const tip of extendedFingerTips(lm, profile)) {
        fingerCount++;
        const id = `${handIndex}:${tip}`, { x, y } = this.app.screenPosition(lm[tip]);
        const key = document.elementFromPoint(x, y)?.closest('.virtual-key') || null;
        if (!key) continue;
        activeTouches.add(id); hoveredKeys.add(key);
        let touch = this.keyboardTouches.get(id);
        if (!touch || touch.key !== key || Math.hypot(x - touch.x, y - touch.y) > 18) {
          touch = { key, x, y, startedAt: now, pressed: false };
          this.keyboardTouches.set(id, touch);
        }
        if (!touch.pressed && now - touch.startedAt >= 3) ready.push({ id, touch });
        this.showKeyboardCursor(id, x, y, touch.pressed ? 1 : Math.min((now - touch.startedAt) / 3, 1));
      }
    });

    for (const id of this.keyboardTouches.keys()) if (!activeTouches.has(id)) this.keyboardTouches.delete(id);
    for (const [id, cursor] of this.keyboardCursors) {
      if (!activeTouches.has(id)) { cursor.remove(); this.keyboardCursors.delete(id); }
    }
    this.root.querySelectorAll('.virtual-key.hovered').forEach((key) => key.classList.remove('hovered'));
    hoveredKeys.forEach((key) => key.classList.add('hovered'));
    const count = this.root.querySelector('.keyboard-finger-count');
    if (count) count.textContent = `${fingerCount} ${fingerCount === 1 ? 'finger' : 'fingers'} detected · hold each key steady for 3 seconds`;

    const pressedKeys = new Set();
    for (const { id, touch } of ready) {
      if (pressedKeys.has(touch.key)) {
        touch.pressed = true;
        continue;
      }
      touch.key.click();
      touch.pressed = true;
      pressedKeys.add(touch.key);
    }
  }

  showKeyboardCursor(id, x, y, progress) {
    let cursor = this.keyboardCursors.get(id);
    if (!cursor) {
      cursor = document.createElement('div');
      cursor.className = 'gesture-cursor keyboard-finger-cursor';
      cursor.setAttribute('aria-hidden', 'true');
      this.root.querySelector('.experience-shell').append(cursor);
      this.keyboardCursors.set(id, cursor);
    }
    cursor.style.left = `${x}px`; cursor.style.top = `${y}px`;
    cursor.style.setProperty('--progress', `${progress * 100}%`);
  }

  pressKey(key) {
    const output = this.root.querySelector('.keyboard-output');
    if (!output) return;
    if (key === 'Shift') { this.keyboardShift = !this.keyboardShift; return; }
    if (key === 'Backspace') {
      const start = output.selectionStart, end = output.selectionEnd;
      if (start === end && start > 0) output.setRangeText('', start - 1, end, 'end'); else output.setRangeText('', start, end, 'end');
    } else {
      const value = key === 'Space' ? ' ' : key === 'Enter' ? '\n' : key === 'Tab' ? '\t' : this.keyboardShift ? key.toUpperCase() : key;
      output.setRangeText(value, output.selectionStart, output.selectionEnd, 'end');
      this.keyboardShift = false;
    }
    output.dispatchEvent(new Event('input', { bubbles: true })); output.focus();
  }

  async copyText() {
    const text = this.root.querySelector('.keyboard-output').value;
    try { await navigator.clipboard.writeText(text); this.setHint('Copied. Paste into Word, Excel or another app.'); }
    catch { this.setHint('Clipboard access is unavailable in this browser. Select the text and copy it manually.'); }
  }

  mountAssistant() {
    this.messages = [];
    this.root.querySelector('.experience-main').innerHTML = `<div class="assistant-wrap"><div class="assistant-transcript" aria-live="polite"><div class="assistant-empty">Ask a question to begin.</div></div><form id="assistantForm"><label for="assistantPrompt">Your question</label><textarea id="assistantPrompt" rows="3" required placeholder="Ask a question…"></textarea><button class="primary-action" type="submit">Ask local model <span aria-hidden="true">↗</span></button></form></div>`;
  }

  async askAssistant() {
    const prompt = this.root.querySelector('#assistantPrompt'), transcript = this.root.querySelector('.assistant-transcript');
    const question = prompt.value.trim(); if (!question) return;
    prompt.value = ''; this.messages.push({ role: 'user', content: question });
    this.renderMessages(); this.setHint('Waiting for Ollama…');
    try {
      const response = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: this.messages }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The assistant could not answer.');
      this.messages.push({ role: 'assistant', content: result.answer }); this.renderMessages(); this.setHint(`Answered by ${result.model}.`);
    } catch (error) { this.messages.pop(); this.renderMessages(); this.setHint(error.message); }
    transcript.scrollTop = transcript.scrollHeight;
  }

  renderMessages() {
    const transcript = this.root.querySelector('.assistant-transcript');
    transcript.innerHTML = this.messages.map((message) => `<article class="chat-message ${message.role}"><b>${message.role === 'user' ? 'You' : 'Ollama'}</b><p></p></article>`).join('') || '<div class="assistant-empty">Ask a question to begin.</div>';
    transcript.querySelectorAll('.chat-message p').forEach((p, index) => { p.textContent = this.messages[index].content; });
    transcript.scrollTop = transcript.scrollHeight;
  }

  mountGames() {
    this.root.querySelector('.experience-main').innerHTML = `<div class="game-tabs"><button data-game="snake">Snake</button><button data-game="chess">Chess</button><button data-game="memory">Memory cards</button></div><div class="game-stage"><p class="game-intro">Choose a game to begin.</p></div>`;
    this.root.querySelectorAll('[data-game]').forEach((button) => button.addEventListener('click', () => this.openGame(button.dataset.game)));
  }

  openGame(game) {
    this.game = game; clearInterval(this.snakeTimer); this.snakeTimer = null;
    clearTimeout(this.memoryTimer); this.memoryTimer = null;
    const stage = this.root.querySelector('.game-stage');
    this.root.querySelectorAll('[data-game]').forEach((button) => button.classList.toggle('selected', button.dataset.game === game));
    if (game === 'snake') this.mountSnake(stage);
    else if (game === 'chess') this.mountChess(stage);
    else this.mountMemory(stage);
  }

  mountSnake(stage) {
    this.snake = [[7, 7], [6, 7], [5, 7]]; this.snakeDirection = 'right'; this.food = [13, 6]; this.snakeScore = 0; this.snakeRunning = false;
    stage.innerHTML = `<div class="snake-layout"><div class="snake-board" role="grid" aria-label="Snake board"></div><aside class="snake-controls"><p>Score <b class="snake-score">0</b></p><button class="primary-action" data-action="snake-start">Start game</button><div class="dpad"><button data-action="direction" data-direction="up" aria-label="Up">↑</button><button data-action="direction" data-direction="left" aria-label="Left">←</button><button data-action="direction" data-direction="down" aria-label="Down">↓</button><button data-action="direction" data-direction="right" aria-label="Right">→</button></div><p class="game-hint">Use arrow keys or point and pinch a direction.</p></aside></div>`;
    this.paintSnake();
  }

  startSnake() {
    this.snake = [[7, 7], [6, 7], [5, 7]]; this.snakeDirection = 'right'; this.food = [13, 6]; this.snakeScore = 0; this.snakeRunning = true;
    this.root.querySelector('.snake-score').textContent = '0'; this.root.querySelector('[data-action="snake-start"]').textContent = 'Restart';
    clearInterval(this.snakeTimer); this.snakeTimer = setInterval(() => this.tickSnake(), 140);
  }

  setDirection(direction) {
    const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
    if (this.game === 'snake' && opposite[this.snakeDirection] !== direction) this.snakeDirection = direction;
  }

  tickSnake() {
    if (!this.snakeRunning) return;
    const step = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[this.snakeDirection];
    const head = [this.snake[0][0] + step[0], this.snake[0][1] + step[1]];
    const ate = head[0] === this.food[0] && head[1] === this.food[1];
    if (head[0] < 0 || head[0] >= 20 || head[1] < 0 || head[1] >= 14 || this.snake.slice(0, ate ? undefined : -1).some(([x, y]) => x === head[0] && y === head[1])) {
      this.snakeRunning = false; clearInterval(this.snakeTimer); this.setHint('Game over. Restart Snake to play again.'); return;
    }
    this.snake.unshift(head); if (ate) { this.snakeScore++; this.root.querySelector('.snake-score').textContent = this.snakeScore; this.food = [Math.floor(Math.random() * 20), Math.floor(Math.random() * 14)]; } else this.snake.pop();
    this.paintSnake();
  }

  paintSnake() {
    const board = this.root.querySelector('.snake-board'); if (!board) return;
    const snake = new Set(this.snake.map(([x, y]) => `${x},${y}`));
    board.innerHTML = Array.from({ length: 280 }, (_, i) => {
      const x = i % 20, y = Math.floor(i / 20), pos = `${x},${y}`;
      return `<span class="snake-cell ${snake.has(pos) ? 'snake-body' : ''} ${this.food[0] === x && this.food[1] === y ? 'snake-food' : ''}"></span>`;
    }).join('');
  }

  mountChess(stage) {
    this.chess = new Chess(); this.chessSelected = null; this.drawChess(stage);
  }

  drawChess(stage = this.root.querySelector('.game-stage')) {
    if (!stage || !this.chess) return;
    const board = this.chess.board(), symbols = { wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙', bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟' };
    const cells = board.flatMap((row, r) => row.map((piece, c) => {
      const square = `${'abcdefgh'[c]}${8 - r}`, legal = this.chessSelected && this.chess.moves({ square: this.chessSelected, verbose: true }).some((move) => move.to === square);
      return `<button class="chess-square ${(r + c) % 2 ? 'dark' : 'light'} ${this.chessSelected === square ? 'selected' : ''} ${legal ? 'legal' : ''}" data-action="chess-square" data-square="${square}" aria-label="${square}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ''}">${piece ? symbols[piece.color + piece.type] : ''}</button>`;
    })).join('');
    const status = this.chess.isCheckmate() ? `Checkmate. ${this.chess.turn() === 'w' ? 'Black' : 'White'} wins.` : this.chess.isDraw() ? 'Draw.' : `${this.chess.turn() === 'w' ? 'White' : 'Black'} to move${this.chess.isCheck() ? ' · check' : ''}.`;
    stage.innerHTML = `<div class="chess-layout"><div class="chess-board">${cells}</div><aside><p class="chess-status">${status}</p><p class="game-hint">Two players. Select a piece, then a highlighted square. Point and pinch also work.</p><button class="quiet-button" data-action="game" data-game="chess">New game</button></aside></div>`;
  }

  selectChessSquare(square) {
    if (!this.chess) return;
    if (this.chessSelected) {
      const moves = this.chess.moves({ square: this.chessSelected, verbose: true });
      if (moves.some((move) => move.to === square)) {
        try { this.chess.move({ from: this.chessSelected, to: square, promotion: 'q' }); } catch { /* an illegal move leaves selection unchanged */ }
        this.chessSelected = null; this.drawChess(); return;
      }
    }
    const piece = this.chess.get(square);
    this.chessSelected = piece?.color === this.chess.turn() ? square : null;
    this.drawChess();
  }

  mountMemory(stage) {
    this.memoryCards = [...CARD_FACES, ...CARD_FACES].map((face, index) => ({ face, index, matched: false, revealed: false })).sort(() => Math.random() - 0.5);
    this.memoryOpen = []; this.memoryLock = false; this.memoryPairs = 0;
    stage.innerHTML = `<div class="memory-head"><span>Pairs found: <b class="memory-score">0</b> / ${CARD_FACES.length}</span><button class="quiet-button" data-action="game" data-game="memory">New game</button></div><div class="memory-board"></div>`;
    this.paintMemory();
  }

  flipCard(index) {
    const card = this.memoryCards?.[index]; if (!card || card.matched || card.revealed || this.memoryLock) return;
    card.revealed = true; this.memoryOpen.push(card); this.paintMemory();
    if (this.memoryOpen.length === 2) {
      this.memoryLock = true;
      this.memoryTimer = setTimeout(() => {
        const [a, b] = this.memoryOpen;
        if (a.face === b.face) { a.matched = true; b.matched = true; this.memoryPairs++; this.root.querySelector('.memory-score').textContent = this.memoryPairs; }
        else { a.revealed = false; b.revealed = false; }
        this.memoryOpen = []; this.memoryLock = false; this.paintMemory();
      }, 650);
    }
  }

  paintMemory() {
    const board = this.root.querySelector('.memory-board'); if (!board) return;
    board.innerHTML = this.memoryCards.map((card, index) => `<button class="memory-card ${card.revealed || card.matched ? 'revealed' : ''}" data-action="memory-card" data-index="${index}" aria-label="${card.revealed || card.matched ? card.face : 'Hidden card'}">${card.revealed || card.matched ? card.face : '·'}</button>`).join('');
  }

  setHint(message) { const hint = this.root.querySelector('.mode-hint'); if (hint) hint.textContent = message; }
}