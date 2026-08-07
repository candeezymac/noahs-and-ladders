// ---- Board configuration -------------------------------------------------
const BOARD_SIZE = 32;
const LADDER_COUNT = 3;
const NOAH_COUNT = 3;

// [start, end] pairs — regenerated fresh on every load and every restart by
// applyBoardLayout(). Ladders send you up (start < end), Noahs drop you back
// down (start > end).
let LADDERS = [];
let NOAHS = [];
let laddersMap = new Map();
let noahsMap = new Map();

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Picks a random, non-overlapping set of ladder/Noah squares each call, so
// every game (and every restart) plays out on a different board. Squares 1
// and BOARD_SIZE are reserved (start and win squares).
function generateBoardLayout() {
  const used = new Set([1, BOARD_SIZE]);
  const pick = (min, max) => {
    let value;
    let attempts = 0;
    do {
      value = randInt(min, max);
      attempts++;
    } while (used.has(value) && attempts < 200);
    used.add(value);
    return value;
  };

  const ladders = [];
  for (let i = 0; i < LADDER_COUNT; i++) {
    const start = pick(2, BOARD_SIZE - 8);
    const end = pick(Math.min(start + 4, BOARD_SIZE - 1), Math.min(start + 14, BOARD_SIZE - 1));
    ladders.push([start, end]);
  }

  const noahs = [];
  for (let i = 0; i < NOAH_COUNT; i++) {
    const start = pick(8, BOARD_SIZE - 1);
    const end = pick(Math.max(2, start - 14), Math.max(2, start - 4));
    noahs.push([start, end]);
  }

  return { ladders, noahs };
}

function applyBoardLayout() {
  const layout = generateBoardLayout();
  LADDERS = layout.ladders;
  NOAHS = layout.noahs;
  laddersMap = new Map(LADDERS);
  noahsMap = new Map(NOAHS);
}

// Photos of Noah go in assets/images/noah/ — see README. If they aren't
// there, the game falls back to emoji so it still works out of the box.
const NOAH_IMAGES = [
  "assets/images/noah/noah1.jpg",
  "assets/images/noah/noah2.jpg",
  "assets/images/noah/noah3.jpg",
];

// ---- State -----------------------------------------------------------------
let position = 0; // 0 = not yet on the board
let rollCount = 0;
let isMoving = false;

// ---- DOM refs ---------------------------------------------------------------
const boardEl = document.getElementById("board");
const tokenEl = document.createElement("div");
tokenEl.className = "token";
tokenEl.textContent = "🙂";

const rollBtn = document.getElementById("rollBtn");
const restartBtn = document.getElementById("restartBtn");
const playAgainBtn = document.getElementById("playAgainBtn");
const dieEl = document.getElementById("die");
const pipGridEl = document.getElementById("pipGrid");
const positionDisplay = document.getElementById("positionDisplay");
const rollCountEl = document.getElementById("rollCount");
const messageEl = document.getElementById("message");
const gobbleOverlay = document.getElementById("gobbleOverlay");
const gobbleImg = document.getElementById("gobbleImg");
const gobbleFallback = document.getElementById("gobbleFallback");
const winOverlay = document.getElementById("winOverlay");
const winRolls = document.getElementById("winRolls");

const PIP_LAYOUTS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

// ---- Board building ----------------------------------------------------------
// All coordinates live in a virtual 0-100 x 0-100 space that maps directly
// onto the board's percentage/viewBox — the board container is a fixed 1:1
// square, so no pixel measuring or resize recalculation is needed.
const SVG_NS = "http://www.w3.org/2000/svg";
const COLS = 8;
const ROWS = 4;
const X_MIN = 9;
const X_MAX = 91;
const Y_BOTTOM = 91;
const Y_TOP = 9;
const COL_GAP = (X_MAX - X_MIN) / (COLS - 1);
const ROW_GAP = (Y_BOTTOM - Y_TOP) / (ROWS - 1);
const WAVE_AMPLITUDE = 6;

function computeSquarePositions() {
  const positions = new Map();
  for (let square = 1; square <= BOARD_SIZE; square++) {
    const row = Math.floor((square - 1) / COLS); // 0 = bottom row
    const colInRow = (square - 1) % COLS;
    const leftToRight = row % 2 === 0;
    const x = leftToRight
      ? X_MIN + colInRow * COL_GAP
      : X_MAX - colInRow * COL_GAP;
    const baseY = Y_BOTTOM - row * ROW_GAP;
    const wave = WAVE_AMPLITUDE * Math.sin((colInRow / (COLS - 1)) * Math.PI);
    const y = row % 2 === 0 ? baseY - wave : baseY + wave;
    positions.set(square, { x, y });
  }
  return positions;
}

const squarePositions = computeSquarePositions();

// Cycles through the available Noah photos for the on-board badges; falls
// back to an emoji per-badge if a given image file isn't there yet.
let noahBadgeIndex = 0;
function makeNoahBadge() {
  const badge = document.createElement("img");
  badge.className = "noah-badge";
  badge.alt = "Noah";
  badge.src = NOAH_IMAGES[noahBadgeIndex % NOAH_IMAGES.length];
  noahBadgeIndex++;
  badge.onerror = () => {
    badge.remove();
    fallback.hidden = false;
  };
  const fallback = document.createElement("span");
  fallback.className = "noah-badge-fallback";
  fallback.textContent = "😋";
  fallback.hidden = true;

  const wrap = document.createElement("span");
  wrap.className = "noah-badge-wrap";
  wrap.appendChild(badge);
  wrap.appendChild(fallback);
  return wrap;
}

function startPosition() {
  const first = squarePositions.get(1);
  return { x: Math.max(3, first.x - 6), y: first.y };
}

function buildBoard() {
  boardEl.innerHTML = "";
  noahBadgeIndex = 0;
  drawConnectors();

  for (let square = 1; square <= BOARD_SIZE; square++) {
    const { x, y } = squarePositions.get(square);
    const node = document.createElement("div");
    node.className = "node";
    node.style.left = `${x}%`;
    node.style.top = `${y}%`;

    if (square === BOARD_SIZE) {
      node.classList.add("win-cell");
    } else {
      node.classList.add(square % 2 === 0 ? "shade-a" : "shade-b");
    }
    if (laddersMap.has(square)) node.classList.add("ladder-start");
    if (noahsMap.has(square)) {
      node.classList.add("noah-start");
      node.appendChild(makeNoahBadge());
    }
    for (const [, end] of LADDERS) {
      if (end === square) node.classList.add("ladder-end");
    }
    for (const [, end] of NOAHS) {
      if (end === square) node.classList.add("noah-end");
    }

    const num = document.createElement("span");
    num.className = "num";
    num.textContent = square;
    node.appendChild(num);

    boardEl.appendChild(node);
  }

  boardEl.appendChild(tokenEl);
  placeToken(0, false);
}

function pointsInOrder() {
  const pts = [];
  for (let s = 1; s <= BOARD_SIZE; s++) pts.push(squarePositions.get(s));
  return pts;
}

// Smooths a polyline into a curve by drawing quadratic segments through
// the midpoints between consecutive points — gives the path a winding feel.
function smoothPathD(points) {
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x} ${points[i].y}, ${midX} ${midY}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function drawPath(svg) {
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", smoothPathD(pointsInOrder()));
  path.setAttribute("class", "board-road");
  svg.appendChild(path);
}

function drawNoahLine(svg, start, end) {
  const a = squarePositions.get(start);
  const b = squarePositions.get(end);
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", a.x);
  line.setAttribute("y1", a.y);
  line.setAttribute("x2", b.x);
  line.setAttribute("y2", b.y);
  line.setAttribute("class", "noah-connector");
  svg.appendChild(line);
}

// Draws an actual ladder graphic (two rails + rungs) between two squares.
function drawLadder(svg, start, end) {
  const a = squarePositions.get(start);
  const b = squarePositions.get(end);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len; // perpendicular unit vector
  const py = dx / len;
  const railOffset = 2;

  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("class", "ladder-graphic");

  const makeLine = (x1, y1, x2, y2, cls) => {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("class", cls);
    group.appendChild(line);
  };

  // rails (dark outline underneath a lighter wood-colored stroke)
  for (const sign of [1, -1]) {
    const x1 = a.x + px * railOffset * sign;
    const y1 = a.y + py * railOffset * sign;
    const x2 = b.x + px * railOffset * sign;
    const y2 = b.y + py * railOffset * sign;
    makeLine(x1, y1, x2, y2, "ladder-rail-outline");
    makeLine(x1, y1, x2, y2, "ladder-rail");
  }

  // evenly spaced rungs between the rails
  const rungCount = Math.max(3, Math.round(len / 6));
  for (let i = 1; i <= rungCount; i++) {
    const t = i / (rungCount + 1);
    const cx = a.x + dx * t;
    const cy = a.y + dy * t;
    makeLine(
      cx + px * railOffset, cy + py * railOffset,
      cx - px * railOffset, cy - py * railOffset,
      "ladder-rung"
    );
  }

  svg.appendChild(group);
}

function drawConnectors() {
  const existing = boardEl.querySelector(".connector-svg");
  if (existing) existing.remove();

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("connector-svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");

  drawPath(svg);
  for (const [start, end] of NOAHS) drawNoahLine(svg, start, end);
  for (const [start, end] of LADDERS) drawLadder(svg, start, end);

  boardEl.appendChild(svg);
}

// square 0 = the little starting spot just off square 1
function placeToken(square, animate = true) {
  tokenEl.style.transition = animate ? "left 0.336s ease, top 0.336s ease" : "none";
  const pos = square <= 0 ? startPosition() : squarePositions.get(square);
  tokenEl.style.left = `${pos.x}%`;
  tokenEl.style.top = `${pos.y}%`;
}

// ---- Sound effects --------------------------------------------------------
// All sound effects are synthesized with the Web Audio API (no audio files
// to fetch/host). AudioContext is created lazily on first use since browsers
// block audio until a user gesture — the dice roll button click covers that.
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// Plays a single tone with a short volume envelope (avoids clicks/pops) and
// an optional pitch slide from `freq` to `freqEnd`.
function playTone({ freq, freqEnd, duration = 0.15, type = "sine", volume = 0.2, startTime = 0 }) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const when = ctx.currentTime + startTime;

  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  if (freqEnd) {
    osc.frequency.exponentialRampToValueAtTime(freqEnd, when + duration);
  }

  gain.gain.setValueAtTime(volume, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(when);
  osc.stop(when + duration + 0.02);
}

function playDiceSound() {
  for (let i = 0; i < 6; i++) {
    playTone({
      freq: 280 + Math.random() * 420,
      duration: 0.05,
      type: "square",
      volume: 0.1,
      startTime: i * 0.06,
    });
  }
}

function playTickSound() {
  playTone({ freq: 900, duration: 0.045, type: "square", volume: 0.1 });
}

function playLadderSound() {
  const notes = [440, 554, 659, 880];
  notes.forEach((freq, i) => {
    playTone({ freq, duration: 0.12, type: "triangle", volume: 0.16, startTime: i * 0.09 });
  });
}

function playGobbleSound() {
  playTone({ freq: 600, freqEnd: 120, duration: 0.35, type: "sawtooth", volume: 0.2 });
  playTone({ freq: 300, freqEnd: 80, duration: 0.3, type: "square", volume: 0.12, startTime: 0.1 });
}

function playWinSound() {
  const notes = [523, 659, 784, 1046, 1318];
  notes.forEach((freq, i) => {
    playTone({ freq, duration: 0.25, type: "triangle", volume: 0.18, startTime: i * 0.12 });
  });
}

// ---- Dice ---------------------------------------------------------------------
function renderPips(value) {
  pipGridEl.innerHTML = "";
  const active = new Set(PIP_LAYOUTS[value] || []);
  for (let i = 0; i < 9; i++) {
    const pip = document.createElement("div");
    pip.className = "pip" + (active.has(i) ? " on" : "");
    pipGridEl.appendChild(pip);
  }
}

function rollDieValue() {
  return Math.floor(Math.random() * 6) + 1;
}

// ---- Game flow ------------------------------------------------------------------
function setMessage(text) {
  messageEl.innerHTML = text;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handleRoll() {
  if (isMoving) return;
  isMoving = true;
  rollBtn.disabled = true;

  dieEl.classList.remove("rolling");
  void dieEl.offsetWidth; // restart animation
  dieEl.classList.add("rolling");
  playDiceSound();

  // quick flicker through faces before landing on the real roll
  for (let i = 0; i < 5; i++) {
    renderPips(rollDieValue());
    await sleep(70);
  }
  const value = rollDieValue();
  renderPips(value);
  await sleep(120);

  rollCount++;
  rollCountEl.textContent = rollCount;

  await movePlayer(value);

  isMoving = false;
  if (position < BOARD_SIZE) {
    rollBtn.disabled = false;
  }
}

async function movePlayer(steps) {
  const destination = position + steps;

  if (destination > BOARD_SIZE) {
    setMessage(`Rolled a ${steps} — need exactly ${BOARD_SIZE - position} to finish. Stuck in place!`);
    return;
  }

  setMessage(`Rolled a ${steps}...`);

  // step-by-step walk so it feels like moving across the board
  for (let s = position + 1; s <= destination; s++) {
    placeToken(s);
    tokenEl.classList.add("bounce");
    playTickSound();
    await sleep(216);
    tokenEl.classList.remove("bounce");
  }
  position = destination;
  updatePositionDisplay();

  if (position === BOARD_SIZE) {
    setMessage(`You reached square ${BOARD_SIZE}!`);
    await sleep(300);
    showWin();
    return;
  }

  if (laddersMap.has(position)) {
    const target = laddersMap.get(position);
    setMessage(`<span class="ladder-text">Ladder!</span> Climbing from ${position} up to ${target} 🪜`);
    playLadderSound();
    await sleep(500);
    position = target;
    placeToken(position);
    updatePositionDisplay();
    await sleep(300);
    return;
  }

  if (noahsMap.has(position)) {
    const target = noahsMap.get(position);
    await showGobble(position, target);
    position = target;
    placeToken(position);
    updatePositionDisplay();
    setMessage(`<span class="noah-text">Gobbled!</span> Noah spat you out back at ${target} 😋`);
    return;
  }

  setMessage(`Landed on square ${position}.`);
}

function updatePositionDisplay() {
  positionDisplay.textContent = position === 0 ? "Start" : position;
}

let noahImageIndex = 0;
async function showGobble(fromSquare, toSquare) {
  const src = NOAH_IMAGES[noahImageIndex % NOAH_IMAGES.length];
  noahImageIndex++;

  gobbleImg.classList.remove("loaded");
  gobbleFallback.classList.remove("hidden");
  gobbleImg.onerror = () => {
    gobbleImg.classList.remove("loaded");
    gobbleFallback.classList.remove("hidden");
  };
  gobbleImg.onload = () => {
    gobbleImg.classList.add("loaded");
    gobbleFallback.classList.add("hidden");
  };
  gobbleImg.src = src;

  playGobbleSound();
  gobbleOverlay.classList.add("show");
  await sleep(2000);
  gobbleOverlay.classList.remove("show");
}

function showWin() {
  winRolls.textContent = `Finished in ${rollCount} roll${rollCount === 1 ? "" : "s"}!`;
  winOverlay.classList.add("show");
  rollBtn.disabled = true;
  playWinSound();
}

function resetGame() {
  position = 0;
  rollCount = 0;
  isMoving = false;
  noahImageIndex = 0;
  rollCountEl.textContent = "0";
  applyBoardLayout();
  buildBoard();
  updatePositionDisplay();
  renderPips(0);
  setMessage("Roll the dice to start climbing!");
  rollBtn.disabled = false;
  winOverlay.classList.remove("show");
  gobbleOverlay.classList.remove("show");
}

// ---- Wire up ----------------------------------------------------------------
rollBtn.addEventListener("click", handleRoll);
restartBtn.addEventListener("click", resetGame);
playAgainBtn.addEventListener("click", resetGame);

applyBoardLayout();
buildBoard();
updatePositionDisplay();
