class ChessEngine {
  constructor(options = {}) {
    this.depth = options.depth || 3;
  }

  analyzePosition(fen, options = {}) {
    const depth = options.depth || this.depth;
    const result = EngineCore.analyzePosition(fen, { depth });
    return {
      bestMove: result.bestMove,
      evaluation: result.evaluation,
      depth: result.depth,
      moveObject: result.moveObject
    };
  }
}

window.ChessEngine = ChessEngine;
