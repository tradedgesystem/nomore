(function() {
  const engine = new ChessEngine({ depth: 3 });
  let observer = null;
  let overlayCanvas = null;
  let overlayCtx = null;
  let sidebar = null;
  let lastEvaluation = null;
  let analyzeTimeout = null;

  function init() {
    const boardEl = findBoard();
    if (!boardEl) {
      setTimeout(init, 1000);
      return;
    }
    setupOverlay(boardEl);
    setupSidebar();
    observeBoard(boardEl);
    analyzeBoard(boardEl);
    window.addEventListener('resize', () => resizeOverlay(boardEl));
  }

  function findBoard() {
    return document.querySelector('chess-board') || document.querySelector('.board') || document.querySelector('div[class*="board"]');
  }

  function setupOverlay(boardEl) {
    overlayCanvas = document.createElement('canvas');
    overlayCanvas.id = 'chess-assistant-overlay';
    overlayCanvas.style.position = 'absolute';
    overlayCanvas.style.pointerEvents = 'none';
    overlayCanvas.style.top = '0';
    overlayCanvas.style.left = '0';
    overlayCanvas.width = boardEl.clientWidth;
    overlayCanvas.height = boardEl.clientHeight;
    boardEl.style.position = 'relative';
    boardEl.appendChild(overlayCanvas);
    overlayCtx = overlayCanvas.getContext('2d');
    resizeOverlay(boardEl);
  }

  function resizeOverlay(boardEl) {
    if (!overlayCanvas) return;
    const rect = boardEl.getBoundingClientRect();
    overlayCanvas.width = rect.width;
    overlayCanvas.height = rect.height;
    overlayCanvas.style.width = `${rect.width}px`;
    overlayCanvas.style.height = `${rect.height}px`;
    overlayCanvas.style.position = 'absolute';
    overlayCanvas.style.top = '0';
    overlayCanvas.style.left = '0';
  }

  function setupSidebar() {
    sidebar = document.createElement('div');
    sidebar.id = 'chess-assistant-sidebar';
    sidebar.innerHTML = `
      <h3>Chess Assistant</h3>
      <div class="ca-row" id="ca-best-move">Best move: ...</div>
      <div class="ca-row" id="ca-eval">Evaluation: ...</div>
      <div class="ca-row" id="ca-depth">Depth: ...</div>
      <div class="ca-row" id="ca-blunder">Blunder risk: ...</div>
    `;
    document.body.appendChild(sidebar);
  }

  function observeBoard(boardEl) {
    observer = new MutationObserver(() => {
      if (analyzeTimeout) clearTimeout(analyzeTimeout);
      analyzeTimeout = setTimeout(() => analyzeBoard(boardEl), 400);
    });
    observer.observe(boardEl, { childList: true, subtree: true, attributes: true });
  }

  function analyzeBoard(boardEl) {
    const position = extractPosition(boardEl);
    if (!position) return;
    resizeOverlay(boardEl);
    const fen = readFenFromDom(boardEl) || buildFEN(position);
    const result = engine.analyzePosition(fen, { depth: 3 });
    updateSidebar(result);
    drawArrow(boardEl, result.moveObject, position.orientation);
  }

  function readFenFromDom(boardEl) {
    const fenAttr = boardEl.getAttribute('data-fen');
    if (fenAttr && fenAttr.includes(' ')) {
      return fenAttr.trim();
    }
    return null;
  }

  function extractPosition(boardEl) {
    const boardGrid = Array.from({ length: 8 }, () => Array(8).fill(''));
    const pieces = boardEl.querySelectorAll('[data-piece], .piece');
    pieces.forEach(el => {
      const info = readPiece(el);
      if (!info) return;
      const square = info.square;
      if (!square) return;
      const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
      const rank = parseInt(square[1], 10) - 1;
      if (file < 0 || file > 7 || rank < 0 || rank > 7) return;
      boardGrid[rank][file] = info.piece;
    });
    const orientation = boardEl.getAttribute('data-board-orientation') || 'white';
    const turn = detectTurn(boardEl);
    const castling = detectCastling(boardGrid, boardEl);
    const enPassant = detectEnPassant(boardGrid);
    return { boardGrid, orientation, turn, castling, enPassant };
  }

  function detectTurn(boardEl) {
    const fenAttr = boardEl.getAttribute('data-fen');
    if (fenAttr && fenAttr.includes(' ')) {
      const parts = fenAttr.trim().split(' ');
      if (parts[1]) return parts[1];
    }
    const moves = document.querySelectorAll('.vertical-move-list .move-text-component');
    if (moves && moves.length) {
      return moves.length % 2 === 0 ? 'w' : 'b';
    }
    return 'w';
  }

  function detectCastling(grid, boardEl) {
    const fenAttr = boardEl.getAttribute('data-fen');
    if (fenAttr && fenAttr.includes(' ')) {
      const parts = fenAttr.trim().split(' ');
      if (parts[2]) return parts[2];
    }
    const castling = [];
    if (grid[0][4] === 'K' && grid[0][7] === 'R') castling.push('K');
    if (grid[0][4] === 'K' && grid[0][0] === 'R') castling.push('Q');
    if (grid[7][4] === 'k' && grid[7][7] === 'r') castling.push('k');
    if (grid[7][4] === 'k' && grid[7][0] === 'r') castling.push('q');
    return castling.length ? castling.join('') : '-';
  }

  function detectEnPassant(grid) {
    const moves = document.querySelectorAll('.vertical-move-list .move-text-component');
    if (!moves || moves.length === 0) return '-';
    const lastMove = moves[moves.length - 1].textContent.trim();
    const simplePawnPush = lastMove.match(/^([a-h])([45])$/);
    if (!simplePawnPush) return '-';
    const file = simplePawnPush[1];
    const rank = parseInt(simplePawnPush[2], 10);
    // white pawn from rank 2 -> 4 creates target on rank 3; black from 7 -> 5 creates target on rank 6
    if (rank === 4 && grid[3][file.charCodeAt(0) - 97] === 'P') {
      return `${file}3`;
    }
    if (rank === 5 && grid[4][file.charCodeAt(0) - 97] === 'p') {
      return `${file}6`;
    }
    return '-';
  }

  function buildFEN(position) {
    const { boardGrid, turn, castling, enPassant } = position;
    let fenBoard = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const piece = boardGrid[r][f];
        if (piece) {
          if (empty > 0) {
            fenBoard += empty;
            empty = 0;
          }
          fenBoard += piece;
        } else {
          empty++;
        }
      }
      if (empty > 0) fenBoard += empty;
      if (r !== 0) fenBoard += '/';
    }
    const ep = enPassant || '-';
    const halfmove = '0';
    const fullmove = `${Math.max(1, Math.ceil(document.querySelectorAll('.vertical-move-list .move-text-component').length / 2))}`;
    return `${fenBoard} ${turn} ${castling} ${ep} ${halfmove} ${fullmove}`;
  }

  function readPiece(el) {
    const pieceAttr = el.getAttribute('data-piece');
    let pieceCode = null;
    if (pieceAttr) {
      const color = pieceAttr[0] === 'w' ? 'white' : 'black';
      const type = pieceAttr[1];
      pieceCode = color === 'white' ? type.toUpperCase() : type.toLowerCase();
    } else {
      const className = el.className;
      const match = className.match(/\b([wb])([prnbqk])\b/);
      if (match) {
        pieceCode = match[1] === 'w' ? match[2].toUpperCase() : match[2];
      }
    }
    const square = el.getAttribute('data-square') || parseSquareFromClass(el.className);
    if (!pieceCode || !square) return null;
    return { piece: pieceCode, square };
  }

  function parseSquareFromClass(className) {
    const match = className.match(/square-([1-8][1-8])/);
    if (match) {
      const num = parseInt(match[1], 10);
      const file = (num % 10) - 1;
      const rank = Math.floor(num / 10) - 1;
      if (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
        return String.fromCharCode('a'.charCodeAt(0) + file) + (rank + 1);
      }
    }
    return null;
  }

  function updateSidebar(result) {
    if (!sidebar) return;
    const bestMoveRow = sidebar.querySelector('#ca-best-move');
    const evalRow = sidebar.querySelector('#ca-eval');
    const depthRow = sidebar.querySelector('#ca-depth');
    const blunderRow = sidebar.querySelector('#ca-blunder');
    bestMoveRow.textContent = `Best move: ${result.bestMove || 'none'}`;
    evalRow.textContent = `Evaluation: ${result.evaluation.toFixed(2)}`;
    depthRow.textContent = `Depth: ${result.depth}`;
    const blunder = lastEvaluation !== null && Math.abs(result.evaluation - lastEvaluation) > 1.5;
    blunderRow.textContent = blunder ? 'Blunder risk detected' : 'Stable';
    lastEvaluation = result.evaluation;
  }

  function drawArrow(boardEl, move, orientation) {
    if (!overlayCtx) return;
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    if (!move) return;
    const rect = boardEl.getBoundingClientRect();
    const squareSize = rect.width / 8;
    const from = squareToPoint(move.from, squareSize, orientation);
    const to = squareToPoint(move.to, squareSize, orientation);
    overlayCtx.strokeStyle = 'rgba(0, 128, 0, 0.7)';
    overlayCtx.lineWidth = Math.max(4, squareSize * 0.08);
    overlayCtx.lineCap = 'round';
    overlayCtx.beginPath();
    overlayCtx.moveTo(from.x, from.y);
    overlayCtx.lineTo(to.x, to.y);
    overlayCtx.stroke();
    drawArrowHead(to, from, squareSize);
  }

  function squareToPoint(index, squareSize, orientation) {
    const file = index % 8;
    const rank = Math.floor(index / 8);
    let x, y;
    if (orientation === 'black') {
      x = (7 - file + 0.5) * squareSize;
      y = (rank + 0.5) * squareSize;
    } else {
      x = (file + 0.5) * squareSize;
      y = (7 - rank + 0.5) * squareSize;
    }
    return { x, y };
  }

  function drawArrowHead(to, from, squareSize) {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const headLength = squareSize * 0.25;
    overlayCtx.beginPath();
    overlayCtx.moveTo(to.x, to.y);
    overlayCtx.lineTo(to.x - headLength * Math.cos(angle - Math.PI / 6), to.y - headLength * Math.sin(angle - Math.PI / 6));
    overlayCtx.lineTo(to.x - headLength * Math.cos(angle + Math.PI / 6), to.y - headLength * Math.sin(angle + Math.PI / 6));
    overlayCtx.fillStyle = 'rgba(0, 128, 0, 0.7)';
    overlayCtx.fill();
  }

  init();
})();
