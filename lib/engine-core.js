// Basic chess engine core with move generation and alpha-beta search
(function() {
  const PIECE_VALUES = {
    'p': 100,
    'n': 320,
    'b': 330,
    'r': 500,
    'q': 900,
    'k': 20000
  };

  const FILES = ['a','b','c','d','e','f','g','h'];

  const KNIGHT_DELTAS = [-17,-15,-10,-6,6,10,15,17];
  const BISHOP_DELTAS = [-9,-7,7,9];
  const ROOK_DELTAS = [-8,-1,1,8];
  const QUEEN_DELTAS = [...BISHOP_DELTAS, ...ROOK_DELTAS];

  function cloneState(state) {
    return {
      board: state.board.slice(),
      whiteToMove: state.whiteToMove,
      castling: { ...state.castling },
      enPassant: state.enPassant,
      halfmove: state.halfmove,
      fullmove: state.fullmove
    };
  }

  function indexToSquare(idx) {
    const file = idx % 8;
    const rank = Math.floor(idx / 8);
    return FILES[file] + (rank + 1);
  }

  function squareToIndex(square) {
    const file = FILES.indexOf(square[0]);
    const rank = parseInt(square[1], 10) - 1;
    return rank * 8 + file;
  }

  function fenToState(fen) {
    const [boardPart, turn, castlingPart, epPart, halfmove, fullmove] = fen.split(' ');
    const board = new Array(64).fill(null);
    const ranks = boardPart.split('/');
    for (let r = 0; r < 8; r++) {
      let file = 0;
      for (const char of ranks[7 - r]) {
        if (!isNaN(char)) {
          file += parseInt(char, 10);
        } else {
          const idx = r * 8 + file;
          board[idx] = char;
          file++;
        }
      }
    }
    const castling = { K: false, Q: false, k: false, q: false };
    if (castlingPart && castlingPart !== '-') {
      for (const c of castlingPart) {
        if (castling[c] !== undefined) castling[c] = true;
      }
    }
    const enPassant = epPart === '-' ? -1 : squareToIndex(epPart);
    return {
      board,
      whiteToMove: turn === 'w',
      castling,
      enPassant,
      halfmove: parseInt(halfmove || '0', 10),
      fullmove: parseInt(fullmove || '1', 10)
    };
  }

  function generateFEN(state) {
    let boardPart = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const piece = state.board[r * 8 + f];
        if (piece) {
          if (empty > 0) {
            boardPart += empty;
            empty = 0;
          }
          boardPart += piece;
        } else {
          empty++;
        }
      }
      if (empty > 0) boardPart += empty;
      if (r !== 0) boardPart += '/';
    }
    const turn = state.whiteToMove ? 'w' : 'b';
    const castlingRights = ['K','Q','k','q'].filter(c => state.castling[c]).join('') || '-';
    const ep = state.enPassant === -1 ? '-' : indexToSquare(state.enPassant);
    return `${boardPart} ${turn} ${castlingRights} ${ep} ${state.halfmove} ${state.fullmove}`;
  }

  function pieceColor(piece) {
    if (!piece) return null;
    return piece === piece.toUpperCase() ? 'w' : 'b';
  }

  function inBounds(idx) {
    return idx >= 0 && idx < 64;
  }

  function isSquareAttacked(state, squareIdx, byWhite) {
    const dir = byWhite ? 1 : -1;
    const file = squareIdx % 8;
    const rank = Math.floor(squareIdx / 8);
    // pawns
    for (const df of [-1, 1]) {
      const tFile = file + df;
      const tRank = rank - dir;
      if (tFile < 0 || tFile > 7 || tRank < 0 || tRank > 7) continue;
      const target = tRank * 8 + tFile;
      const piece = state.board[target];
      if (piece && (byWhite ? piece === 'P' : piece === 'p')) return true;
    }
    // knights
    for (const delta of KNIGHT_DELTAS) {
      const target = squareIdx + delta;
      if (!inBounds(target)) continue;
      const fileDiff = Math.abs((target % 8) - file);
      if (fileDiff > 2) continue;
      const piece = state.board[target];
      if (piece && (byWhite ? piece === 'N' : piece === 'n')) return true;
    }
    // bishops/queens
    for (const delta of BISHOP_DELTAS) {
      const stepFile = delta === 9 || delta === -7 ? 1 : -1;
      const stepRank = delta > 0 ? 1 : -1;
      let f = file + stepFile;
      let r = rank + stepRank;
      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const target = r * 8 + f;
        const piece = state.board[target];
        if (piece) {
          if (byWhite ? (piece === 'B' || piece === 'Q') : (piece === 'b' || piece === 'q')) return true;
          break;
        }
        f += stepFile;
        r += stepRank;
      }
    }
    // rooks/queens
    for (const delta of ROOK_DELTAS) {
      const stepFile = delta === 1 ? 1 : delta === -1 ? -1 : 0;
      const stepRank = delta === 8 ? 1 : delta === -8 ? -1 : 0;
      let f = file + stepFile;
      let r = rank + stepRank;
      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const target = r * 8 + f;
        const piece = state.board[target];
        if (piece) {
          if (byWhite ? (piece === 'R' || piece === 'Q') : (piece === 'r' || piece === 'q')) return true;
          break;
        }
        f += stepFile;
        r += stepRank;
      }
    }
    // kings
    for (let dr = -1; dr <= 1; dr++) {
      for (let df = -1; df <= 1; df++) {
        if (dr === 0 && df === 0) continue;
        const tFile = file + df;
        const tRank = rank + dr;
        if (tFile < 0 || tFile > 7 || tRank < 0 || tRank > 7) continue;
        const target = tRank * 8 + tFile;
        const piece = state.board[target];
        if (piece && (byWhite ? piece === 'K' : piece === 'k')) return true;
      }
    }
    return false;
  }

  function generateMoves(state) {
    const moves = [];
    const side = state.whiteToMove ? 'w' : 'b';
    for (let i = 0; i < 64; i++) {
      const piece = state.board[i];
      if (!piece || pieceColor(piece) !== side) continue;
      switch (piece.toLowerCase()) {
        case 'p':
          generatePawnMoves(state, i, piece, moves);
          break;
        case 'n':
          generateJumpMoves(state, i, piece, moves, KNIGHT_DELTAS);
          break;
        case 'b':
          generateSlideMoves(state, i, piece, moves, BISHOP_DELTAS);
          break;
        case 'r':
          generateSlideMoves(state, i, piece, moves, ROOK_DELTAS);
          break;
        case 'q':
          generateSlideMoves(state, i, piece, moves, QUEEN_DELTAS);
          break;
        case 'k':
          generateKingMoves(state, i, piece, moves);
          break;
      }
    }
    // filter illegal moves
    const legal = [];
    for (const move of moves) {
      const undo = makeMove(state, move);
      const kingIdx = findKing(state, side === 'w');
      const inCheck = isSquareAttacked(state, kingIdx, !state.whiteToMove);
      undoMove(state, undo);
      if (!inCheck) legal.push(move);
    }
    return legal;
  }

  function findKing(state, white) {
    const target = white ? 'K' : 'k';
    for (let i = 0; i < 64; i++) if (state.board[i] === target) return i;
    return -1;
  }

  function generatePawnMoves(state, idx, piece, moves) {
    const white = piece === 'P';
    const dir = white ? 8 : -8;
    const startRank = white ? 1 : 6;
    const promotionRank = white ? 7 : 0;
    const rank = Math.floor(idx / 8);
    const forward = idx + dir;
    if (inBounds(forward) && !state.board[forward]) {
      addPawnMove(idx, forward, piece, moves, rank + 1 === promotionRank);
      const doubleForward = idx + dir * 2;
      if (rank === startRank && !state.board[doubleForward]) {
        moves.push({ from: idx, to: doubleForward, piece, capture: null, flag: 'double' });
      }
    }
    for (const df of [-1, 1]) {
      const file = (idx % 8) + df;
      if (file < 0 || file > 7) continue;
      const target = idx + dir + df;
      const targetPiece = state.board[target];
      if (targetPiece && pieceColor(targetPiece) !== pieceColor(piece)) {
        addPawnMove(idx, target, piece, moves, rank + 1 === promotionRank, targetPiece);
      }
      if (target === state.enPassant) {
        moves.push({ from: idx, to: target, piece, capture: white ? 'p' : 'P', flag: 'enpassant' });
      }
    }
  }

  function addPawnMove(from, to, piece, moves, promotion, capture) {
    if (promotion) {
      for (const promo of ['q','r','b','n']) {
        const promoPiece = piece === 'P' ? promo.toUpperCase() : promo;
        moves.push({ from, to, piece, capture: capture || null, promotion: promoPiece, flag: 'promotion' });
      }
    } else {
      moves.push({ from, to, piece, capture: capture || null });
    }
  }

  function generateJumpMoves(state, idx, piece, moves, deltas) {
    for (const delta of deltas) {
      const target = idx + delta;
      if (!inBounds(target)) continue;
      const fileDiff = Math.abs((target % 8) - (idx % 8));
      if (fileDiff > 2) continue; // ensure within board edges
      const targetPiece = state.board[target];
      if (!targetPiece || pieceColor(targetPiece) !== pieceColor(piece)) {
        moves.push({ from: idx, to: target, piece, capture: targetPiece || null });
      }
    }
  }

  function generateSlideMoves(state, idx, piece, moves, deltas) {
    const startFile = idx % 8;
    const startRank = Math.floor(idx / 8);
    for (const delta of deltas) {
      const stepFile = delta === 1 ? 1 : delta === -1 ? -1 : delta === 9 || delta === -7 ? 1 : delta === -9 || delta === 7 ? -1 : 0;
      const stepRank = delta === 8 || delta === 9 || delta === 7 ? 1 : delta === -8 || delta === -9 || delta === -7 ? -1 : 0;
      let f = startFile + stepFile;
      let r = startRank + stepRank;
      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const target = r * 8 + f;
        const targetPiece = state.board[target];
        if (!targetPiece) {
          moves.push({ from: idx, to: target, piece, capture: null });
        } else {
          if (pieceColor(targetPiece) !== pieceColor(piece)) {
            moves.push({ from: idx, to: target, piece, capture: targetPiece });
          }
          break;
        }
        f += stepFile;
        r += stepRank;
      }
    }
  }

  function generateKingMoves(state, idx, piece, moves) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let df = -1; df <= 1; df++) {
        if (dr === 0 && df === 0) continue;
        const file = (idx % 8) + df;
        const rank = Math.floor(idx / 8) + dr;
        if (file < 0 || file > 7 || rank < 0 || rank > 7) continue;
        const target = rank * 8 + file;
        const targetPiece = state.board[target];
        if (!targetPiece || pieceColor(targetPiece) !== pieceColor(piece)) {
          moves.push({ from: idx, to: target, piece, capture: targetPiece || null });
        }
      }
    }
    // castling
    const white = piece === 'K';
    if (white && idx === squareToIndex('e1')) {
      if (state.castling.K && !state.board[squareToIndex('f1')] && !state.board[squareToIndex('g1')]) {
        if (!isSquareAttacked(state, idx, false) && !isSquareAttacked(state, squareToIndex('f1'), false) && !isSquareAttacked(state, squareToIndex('g1'), false)) {
          moves.push({ from: idx, to: squareToIndex('g1'), piece, flag: 'castle', castle: 'K' });
        }
      }
      if (state.castling.Q && !state.board[squareToIndex('d1')] && !state.board[squareToIndex('c1')] && !state.board[squareToIndex('b1')]) {
        if (!isSquareAttacked(state, idx, false) && !isSquareAttacked(state, squareToIndex('d1'), false) && !isSquareAttacked(state, squareToIndex('c1'), false)) {
          moves.push({ from: idx, to: squareToIndex('c1'), piece, flag: 'castle', castle: 'Q' });
        }
      }
    }
    if (!white && idx === squareToIndex('e8')) {
      if (state.castling.k && !state.board[squareToIndex('f8')] && !state.board[squareToIndex('g8')]) {
        if (!isSquareAttacked(state, idx, true) && !isSquareAttacked(state, squareToIndex('f8'), true) && !isSquareAttacked(state, squareToIndex('g8'), true)) {
          moves.push({ from: idx, to: squareToIndex('g8'), piece, flag: 'castle', castle: 'k' });
        }
      }
      if (state.castling.q && !state.board[squareToIndex('d8')] && !state.board[squareToIndex('c8')] && !state.board[squareToIndex('b8')]) {
        if (!isSquareAttacked(state, idx, true) && !isSquareAttacked(state, squareToIndex('d8'), true) && !isSquareAttacked(state, squareToIndex('c8'), true)) {
          moves.push({ from: idx, to: squareToIndex('c8'), piece, flag: 'castle', castle: 'q' });
        }
      }
    }
  }

  function makeMove(state, move) {
    const undo = {
      move,
      captured: move.capture || null,
      enPassant: state.enPassant,
      castling: { ...state.castling },
      halfmove: state.halfmove,
      fullmove: state.fullmove
    };
    state.enPassant = -1;
    state.halfmove++;
    const movingPiece = move.promotion ? move.promotion : move.piece;
    if (move.flag === 'enpassant') {
      const capIdx = state.whiteToMove ? move.to - 8 : move.to + 8;
      state.board[capIdx] = null;
    }
    state.board[move.to] = movingPiece;
    state.board[move.from] = null;
    if (movingPiece.toLowerCase() === 'p') state.halfmove = 0;
    if (move.capture) state.halfmove = 0;
    if (move.flag === 'double') {
      state.enPassant = state.whiteToMove ? move.to - 8 : move.to + 8;
    }
    // castling rights updates
    if (move.piece === 'K') { state.castling.K = false; state.castling.Q = false; }
    if (move.piece === 'k') { state.castling.k = false; state.castling.q = false; }
    if (move.from === squareToIndex('a1') || move.to === squareToIndex('a1')) state.castling.Q = false;
    if (move.from === squareToIndex('h1') || move.to === squareToIndex('h1')) state.castling.K = false;
    if (move.from === squareToIndex('a8') || move.to === squareToIndex('a8')) state.castling.q = false;
    if (move.from === squareToIndex('h8') || move.to === squareToIndex('h8')) state.castling.k = false;

    if (move.flag === 'castle') {
      if (move.castle === 'K') {
        state.board[squareToIndex('f1')] = 'R';
        state.board[squareToIndex('h1')] = null;
      }
      if (move.castle === 'Q') {
        state.board[squareToIndex('d1')] = 'R';
        state.board[squareToIndex('a1')] = null;
      }
      if (move.castle === 'k') {
        state.board[squareToIndex('f8')] = 'r';
        state.board[squareToIndex('h8')] = null;
      }
      if (move.castle === 'q') {
        state.board[squareToIndex('d8')] = 'r';
        state.board[squareToIndex('a8')] = null;
      }
    }
    state.whiteToMove = !state.whiteToMove;
    if (!state.whiteToMove) state.fullmove++;
    return undo;
  }

  function undoMove(state, undo) {
    const { move } = undo;
    state.whiteToMove = !state.whiteToMove;
    if (state.whiteToMove) state.fullmove--;
    state.enPassant = undo.enPassant;
    state.castling = { ...undo.castling };
    state.halfmove = undo.halfmove;
    state.board[move.from] = move.piece;
    state.board[move.to] = null;
    if (move.promotion) {
      state.board[move.from] = move.piece;
    }
    if (move.flag === 'enpassant') {
      const capIdx = state.whiteToMove ? move.to + 8 : move.to - 8;
      state.board[capIdx] = undo.captured;
    } else if (move.flag === 'castle') {
      if (move.castle === 'K') {
        state.board[squareToIndex('h1')] = 'R';
        state.board[squareToIndex('f1')] = null;
      }
      if (move.castle === 'Q') {
        state.board[squareToIndex('a1')] = 'R';
        state.board[squareToIndex('d1')] = null;
      }
      if (move.castle === 'k') {
        state.board[squareToIndex('h8')] = 'r';
        state.board[squareToIndex('f8')] = null;
      }
      if (move.castle === 'q') {
        state.board[squareToIndex('a8')] = 'r';
        state.board[squareToIndex('d8')] = null;
      }
    }
    if (move.capture && move.flag !== 'enpassant') {
      state.board[move.to] = undo.captured;
    }
  }

  function evaluate(state) {
    let score = 0;
    for (let i = 0; i < 64; i++) {
      const piece = state.board[i];
      if (!piece) continue;
      const value = PIECE_VALUES[piece.toLowerCase()] || 0;
      const positional = positionalBonus(piece, i);
      score += (piece === piece.toUpperCase() ? 1 : -1) * (value + positional);
    }
    return score;
  }

  function positionalBonus(piece, idx) {
    const rank = Math.floor(idx / 8);
    const file = idx % 8;
    let bonus = 0;
    if (piece.toLowerCase() === 'p') {
      bonus += piece === 'P' ? rank * 2 : (7 - rank) * 2;
      if (file === 3 || file === 4) bonus += 2;
    }
    if (piece.toLowerCase() === 'n') {
      if (file >= 2 && file <= 5 && rank >= 2 && rank <= 5) bonus += 10;
    }
    if (piece.toLowerCase() === 'b') {
      if ((file + rank) % 2 === 0) bonus += 1;
    }
    return bonus;
  }

  function search(state, depth, alpha, beta) {
    if (depth === 0) {
      return { score: evaluate(state) };
    }
    const moves = generateMoves(state);
    if (moves.length === 0) {
      const kingIdx = findKing(state, state.whiteToMove);
      const inCheck = isSquareAttacked(state, kingIdx, !state.whiteToMove);
      if (inCheck) {
        return { score: state.whiteToMove ? -100000 + depth : 100000 - depth };
      }
      return { score: 0 }; // stalemate
    }
    let bestMove = null;
    if (state.whiteToMove) {
      let bestScore = -Infinity;
      for (const move of moves) {
        const undo = makeMove(state, move);
        const { score } = search(state, depth - 1, alpha, beta);
        undoMove(state, undo);
        if (score > bestScore) {
          bestScore = score;
          bestMove = move;
        }
        alpha = Math.max(alpha, score);
        if (beta <= alpha) break;
      }
      return { score: bestScore, move: bestMove };
    } else {
      let bestScore = Infinity;
      for (const move of moves) {
        const undo = makeMove(state, move);
        const { score } = search(state, depth - 1, alpha, beta);
        undoMove(state, undo);
        if (score < bestScore) {
          bestScore = score;
          bestMove = move;
        }
        beta = Math.min(beta, score);
        if (beta <= alpha) break;
      }
      return { score: bestScore, move: bestMove };
    }
  }

  function analyzePosition(fen, options = {}) {
    const depth = options.depth || 3;
    const state = fenToState(fen);
    const cloned = cloneState(state);
    const result = search(cloned, depth, -Infinity, Infinity);
    const bestMove = result.move;
    const evaluation = result.score / 100;
    return {
      bestMove: bestMove ? moveToAlgebraic(bestMove) : null,
      evaluation,
      depth,
      moveObject: bestMove
    };
  }

  function moveToAlgebraic(move) {
    const from = indexToSquare(move.from);
    const to = indexToSquare(move.to);
    const promotion = move.promotion ? '=' + move.promotion.toUpperCase() : '';
    return `${from}${to}${promotion}`;
  }

  window.EngineCore = {
    analyzePosition,
    fenToState,
    generateFEN,
    cloneState,
    moveToAlgebraic
  };
})();
