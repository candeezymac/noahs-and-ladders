// ---- Board configuration -------------------------------------------------
const BOARD_SIZE = 100;

// [start, end] — landing on `start` sends you climbing up to `end`.
const LADDERS = [
  [22, 29], [26, 37], [36, 75], [40, 64],
  [59, 87], [66, 77], [70, 97], [78, 99],
];

// [start, end] — landing on `start` gets you gobbled by Noah, dropping you to `end`.
const NOAHS = [
  [17, 4], [43, 21], [46, 14], [51, 25],
  [54, 41], [63, 30], [95, 79],
];

const laddersMap = new Map(LADDERS);
const noahsMap = new Map(NOAHS);

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
const cellEls = new Map(); // square number -> DOM element

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
function squareToRowCol(square) {
  // square 1 is bottom-left; board snakes left-to-right, right-to-left, ...
  const rowFromBottom = Math.floor((square - 1) / 10); // 0..9
  const indexInRow = (square - 1) % 10;
  const col = rowFromBottom % 2 === 0 ? indexInRow : 9 - indexInRow;
  const rowFromTop = 9 - rowFromBottom; // grid row, 0 = top
  return { row: rowFromTop, col };
}

function buildBoard() {
  for (let square = 1; square <= BOARD_SIZE; square++) {
    const { row, col } = squareToRowCol(square);
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.style.gridRowStart = row + 1;
    cell.style.gridColumnStart = col + 1;

    const shade = (row + col) % 2 === 0 ? "shade-a" : "shade-b";
    cell.classList.add(shade);
    if (square === 100) cell.classList.add("win-cell");
    if (laddersMap.has(square)) cell.classList.add("ladder-start");
    if (noahsMap.has(square)) cell.classList.add("noah-start");
    for (const [, end] of LADDERS) {
      if (end === square) cell.classList.add("ladder-end");
    }
    for (const [, end] of NOAHS) {
      if (end === square) cell.classList.add("noah-end");
    }

    const num = document.createElement("span");
    num.className = "num";
    num.textContent = square;
    cell.appendChild(num);

    boardEl.appendChild(cell);
    cellEls.set(square, cell);
  }

  boardEl.appendChild(tokenEl);
  drawConnectors();
  placeToken(0, false);
}

function cellCenter(square) {
  const cell = cellEls.get(square);
  const boardRect = boardEl.getBoundingClientRect();
  const rect = cell.getBoundingClientRect();
  return {
    x: rect.left - boardRect.left + rect.width / 2,
    y: rect.top - boardRect.top + rect.height / 2,
  };
}

function drawConnectors() {
  const existing = boardEl.querySelector(".connector-svg");
  if (existing) existing.remove();

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("connector-svg");
  const rect = boardEl.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);

  const draw = (pairs, className) => {
    for (const [start, end] of pairs) {
      const a = cellCenter(start);
      const b = cellCenter(end);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", a.x);
      line.setAttribute("y1", a.y);
      line.setAttribute("x2", b.x);
      line.setAttribute("y2", b.y);
      line.classList.add("connector-line", className);
      svg.appendChild(line);
    }
  };

  draw(LADDERS, "ladder");
  draw(NOAHS, "noah");
  boardEl.insertBefore(svg, tokenEl);
}

// square 0 = the little starting spot just off square 1
function placeToken(square, animate = true) {
  tokenEl.style.transition = animate ? "left 0.28s ease, top 0.28s ease" : "none";
  let x, y;
  if (square <= 0) {
    const c = cellCenter(1);
    x = c.x - 22;
    y = c.y;
  } else {
    const c = cellCenter(square);
    x = c.x;
    y = c.y;
  }
  tokenEl.style.left = `${x - 11}px`;
  tokenEl.style.top = `${y - 11}px`;
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
    await sleep(180);
    tokenEl.classList.remove("bounce");
  }
  position = destination;
  updatePositionDisplay();

  if (position === BOARD_SIZE) {
    setMessage("You reached square 100!");
    await sleep(300);
    showWin();
    return;
  }

  if (laddersMap.has(position)) {
    const target = laddersMap.get(position);
    setMessage(`<span class="ladder-text">Ladder!</span> Climbing from ${position} up to ${target} 🪜`);
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

  gobbleOverlay.classList.add("show");
  await sleep(1100);
  gobbleOverlay.classList.remove("show");
}

function showWin() {
  winRolls.textContent = `Finished in ${rollCount} roll${rollCount === 1 ? "" : "s"}!`;
  winOverlay.classList.add("show");
  rollBtn.disabled = true;
}

function resetGame() {
  position = 0;
  rollCount = 0;
  isMoving = false;
  rollCountEl.textContent = "0";
  updatePositionDisplay();
  placeToken(0);
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
window.addEventListener("resize", drawConnectors);

buildBoard();
updatePositionDisplay();
