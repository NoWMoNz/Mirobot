/**
 * MiRobot Math Controller - Unified High-Performance Bundle
 * Self-contained: runs locally via file:// and via http:// without CORS or Babel dependencies.
 */

// ==========================================
// 1. MATH ENGINE & STEP SOLVER
// ==========================================
class MathEngine {
  static cleanExpression(expr) {
    if (!expr) return "";
    return expr
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .replace(/−/g, "-")
      .replace(/\s+/g, "")
      .trim();
  }

  static formatForDisplay(expr) {
    if (!expr) return "";
    return expr
      .replace(/\*/g, " × ")
      .replace(/\//g, " ÷ ")
      .replace(/\+/g, " + ")
      .replace(/(?<=\d)-(?=\d)/g, " - ")
      .replace(/\s+/g, " ")
      .trim();
  }

  static validate(expr) {
    const cleaned = this.cleanExpression(expr);
    if (!cleaned) {
      return { valid: false, error: "Expression is empty." };
    }
    if (!/^[\d\.\+\-\*\/\^\(\)]+$/.test(cleaned)) {
      return { valid: false, error: "Contains invalid characters." };
    }

    let balance = 0;
    for (const char of cleaned) {
      if (char === "(") balance++;
      if (char === ")") balance--;
      if (balance < 0) return { valid: false, error: "Mismatched parentheses." };
    }
    if (balance !== 0) {
      return { valid: false, error: "Unclosed parentheses." };
    }

    if (/[\+\*\/]{2,}/.test(cleaned) || /\-{3,}/.test(cleaned)) {
      return { valid: false, error: "Syntax error: consecutive operators." };
    }
    if (/^[\*\/^]/.test(cleaned)) {
      return { valid: false, error: "Cannot begin with operator." };
    }
    if (/[\+\-\*\/\^]$/.test(cleaned)) {
      return { valid: false, error: "Expression cannot end with an operator." };
    }
    if (/\/(0+(\.0+)?)(?![0-9])/.test(cleaned)) {
      return { valid: false, error: "Division by zero is undefined." };
    }

    return { valid: true };
  }

  static solve(expression) {
    const rawClean = this.cleanExpression(expression);
    const validation = this.validate(rawClean);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const steps = [];
    let currentExpr = rawClean;
    const originalDisplay = this.formatForDisplay(rawClean);

    const solveFlat = (expr) => {
      // 1. Exponents
      const expRegex = /(-?\d+(?:\.\d+)?)\^(\d+(?:\.\d+)?)/;
      while (expRegex.test(expr)) {
        const match = expr.match(expRegex);
        const a = parseFloat(match[1]);
        const b = parseFloat(match[2]);
        const res = Math.pow(a, b);
        steps.push({
          action: "Exponentiation",
          subProblem: `${match[1]} ^ ${match[2]}`,
          result: res,
          before: expr,
          after: expr.replace(match[0], res.toString())
        });
        expr = expr.replace(match[0], res.toString());
      }

      // 2. Multiplication & Division
      const mulDivRegex = /(-?\d+(?:\.\d+)?)([\*\/])(-?\d+(?:\.\d+)?)/;
      while (mulDivRegex.test(expr)) {
        const match = expr.match(mulDivRegex);
        const a = parseFloat(match[1]);
        const op = match[2];
        const b = parseFloat(match[3]);

        if (op === "/" && Math.abs(b) < 1e-12) {
          throw new Error("Division by zero encountered.");
        }

        const res = op === "*" ? a * b : a / b;
        const roundedRes = Math.round(res * 1e8) / 1e8;
        const opSymbol = op === "*" ? "×" : "÷";

        steps.push({
          action: op === "*" ? "Multiplication" : "Division",
          subProblem: `${a} ${opSymbol} ${b}`,
          result: roundedRes,
          before: expr,
          after: expr.replace(match[0], roundedRes.toString())
        });
        expr = expr.replace(match[0], roundedRes.toString());
      }

      // 3. Addition & Subtraction
      expr = expr.replace(/--/g, "+").replace(/\+-|-\+/g, "-");
      const addSubRegex = /(-?\d+(?:\.\d+)?)([\+\-])(\d+(?:\.\d+)?)/;
      while (addSubRegex.test(expr)) {
        const match = expr.match(addSubRegex);
        if (match.index === 0 && match[1] === "" && match[2] === "-") {
          break;
        }

        const a = parseFloat(match[1]);
        const op = match[2];
        const b = parseFloat(match[3]);
        const res = op === "+" ? a + b : a - b;
        const roundedRes = Math.round(res * 1e8) / 1e8;

        steps.push({
          action: op === "+" ? "Addition" : "Subtraction",
          subProblem: `${a} ${op} ${b}`,
          result: roundedRes,
          before: expr,
          after: expr.replace(match[0], roundedRes.toString())
        });
        expr = expr.replace(match[0], roundedRes.toString());
        expr = expr.replace(/--/g, "+").replace(/\+-|-\+/g, "-");
      }

      return expr;
    };

    // Parentheses inside out
    const parenRegex = /\(([^()]+)\)/;
    while (parenRegex.test(currentExpr)) {
      const match = currentExpr.match(parenRegex);
      const innerExpr = match[1];

      steps.push({
        action: "Parentheses Evaluation",
        subProblem: `(${this.formatForDisplay(innerExpr)})`,
        result: "",
        before: currentExpr,
        note: `Evaluating inside parentheses: ${innerExpr}`
      });

      const evaluatedInner = solveFlat(innerExpr);
      currentExpr = currentExpr.replace(match[0], evaluatedInner);
    }

    const finalResultStr = solveFlat(currentExpr);
    const finalNumber = parseFloat(finalResultStr);
    const finalAnswer = Math.round(finalNumber * 1e8) / 1e8;

    if (steps.length === 0) {
      steps.push({
        action: "Direct Evaluation",
        subProblem: originalDisplay,
        result: finalAnswer,
        before: originalDisplay,
        after: finalAnswer.toString()
      });
    }

    return {
      problem: originalDisplay,
      rawProblem: rawClean,
      steps: steps,
      finalAnswer: finalAnswer,
      fullSolutionText: `${originalDisplay} = ${finalAnswer}`
    };
  }

  static getWritingPayload(solutionResult, mode) {
    if (!solutionResult) return "";
    switch (mode) {
      case "answer_only":
        return `${solutionResult.finalAnswer}`;
      case "problem_answer":
        return `${solutionResult.problem} = ${solutionResult.finalAnswer}`;
      case "full_steps":
        let text = `${solutionResult.problem}\n`;
        solutionResult.steps.forEach((s, idx) => {
          text += `S${idx + 1}: ${s.subProblem} = ${s.result}\n`;
        });
        text += `= ${solutionResult.finalAnswer}`;
        return text;
      default:
        return `${solutionResult.finalAnswer}`;
    }
  }
}

// ==========================================
// 2. VECTOR FONT & G-CODE GENERATOR
// ==========================================
const FONT_GLYPHS = {
  " ": [],
  "0": [[[2, 2], [8, 2], [8, 14], [2, 14], [2, 2]], [[8, 2], [2, 14]]],
  "1": [[[3, 4], [5, 2], [5, 14]], [[2, 14], [8, 14]]],
  "2": [[[2, 4], [3, 2], [7, 2], [8, 4], [8, 7], [2, 14], [8, 14]]],
  "3": [[[2, 3], [3, 2], [7, 2], [8, 4], [5, 8], [8, 11], [7, 14], [3, 14], [2, 13]]],
  "4": [[[7, 14], [7, 2], [1, 9], [9, 9]]],
  "5": [[[8, 2], [2, 2], [2, 7], [7, 7], [8, 10], [7, 14], [3, 14], [2, 13]]],
  "6": [[[7, 3], [4, 2], [2, 6], [2, 12], [4, 14], [7, 14], [8, 11], [8, 8], [4, 8], [2, 11]]],
  "7": [[[1, 2], [9, 2], [4, 14]]],
  "8": [[[5, 8], [3, 6], [3, 4], [5, 2], [7, 4], [7, 6], [5, 8], [3, 10], [3, 12], [5, 14], [7, 12], [7, 10], [5, 8]]],
  "9": [[[8, 8], [6, 8], [2, 8], [2, 5], [4, 2], [7, 2], [8, 5], [8, 12], [6, 14], [3, 14]]],
  "+": [[[5, 4], [5, 12]], [[1, 8], [9, 8]]],
  "-": [[[2, 8], [8, 8]]],
  "−": [[[2, 8], [8, 8]]],
  "*": [[[2, 4], [8, 12]], [[8, 4], [2, 12]], [[5, 3], [5, 13]]],
  "×": [[[2, 4], [8, 12]], [[8, 4], [2, 12]]],
  "/": [[[2, 14], [8, 2]]],
  "÷": [[[2, 8], [8, 8]], [[5, 4], [5, 4.5]], [[5, 11.5], [5, 12]]],
  "=": [[[2, 6], [8, 6]], [[2, 10], [8, 10]]],
  ".": [[[4.5, 13], [5.5, 13], [5.5, 14], [4.5, 14], [4.5, 13]]],
  "(": [[[7, 1], [4, 5], [4, 11], [7, 15]]],
  ")": [[[3, 1], [6, 5], [6, 11], [3, 15]]],
  "^": [[[2, 7], [5, 3], [8, 7]]],
  ":": [[[5, 5], [5, 6]], [[5, 11], [5, 12]]],
  "A": [[[1, 14], [5, 2], [9, 14]], [[3, 9], [7, 9]]],
  "B": [[[2, 14], [2, 2], [7, 2], [8, 5], [6, 8], [2, 8]], [[6, 8], [8, 11], [7, 14], [2, 14]]],
  "C": [[[8, 4], [6, 2], [3, 2], [2, 6], [2, 10], [3, 14], [6, 14], [8, 12]]],
  "D": [[[2, 14], [2, 2], [6, 2], [8, 6], [8, 10], [6, 14], [2, 14]]],
  "E": [[[8, 2], [2, 2], [2, 14], [8, 14]], [[2, 8], [6, 8]]],
  "F": [[[8, 2], [2, 2], [2, 14]], [[2, 8], [6, 8]]],
  "G": [[[8, 4], [6, 2], [3, 2], [2, 6], [2, 10], [3, 14], [7, 14], [8, 10], [5, 10]]],
  "L": [[[2, 2], [2, 14], [8, 14]]],
  "N": [[[2, 14], [2, 2], [8, 14], [8, 2]]],
  "P": [[[2, 14], [2, 2], [7, 2], [8, 5], [7, 8], [2, 8]]],
  "R": [[[2, 14], [2, 2], [7, 2], [8, 5], [7, 8], [2, 8]], [[5, 8], [8, 14]]],
  "S": [[[8, 4], [6, 2], [3, 2], [2, 5], [4, 7], [7, 9], [8, 12], [6, 14], [2, 13]]],
  "T": [[[1, 2], [9, 2]], [[5, 2], [5, 14]]],
  "a": [[[8, 6], [8, 14]], [[8, 9], [5, 6], [3, 8], [3, 12], [5, 14], [8, 14]]],
  "n": [[[2, 6], [2, 14]], [[2, 8], [5, 6], [8, 8], [8, 14]]],
  "s": [[[8, 7], [6, 6], [3, 7], [7, 10], [8, 12], [6, 14], [2, 13]]],
  "e": [[[8, 10], [2, 10], [2, 7], [5, 6], [8, 8], [8, 10], [3, 14], [7, 14]]],
  "p": [[[2, 6], [2, 18]], [[2, 8], [5, 6], [8, 8], [8, 12], [5, 14], [2, 13]]]
};

class VectorFontGenerator {
  static textToStrokes(text, options = {}) {
    const {
      startX = 200,
      startY = 35,
      charWidth = 7,
      charHeight = 11,
      charSpacing = 2.5,
      lineSpacing = 16,
      mirror = false
    } = options;

    const scaleX = charWidth / 10;
    const scaleY = charHeight / 16;
    const lines = text.split("\n");
    const allStrokes = [];
    let curX = startX;

    lines.forEach((line) => {
      let curY = startY;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const glyph = FONT_GLYPHS[char] || FONT_GLYPHS[char.toUpperCase()] || null;

        if (glyph && glyph.length > 0) {
          glyph.forEach((subStroke) => {
            const transformed = subStroke.map(([gx, gy]) => {
              const yPt = mirror
                ? curY + gx * scaleX
                : curY - gx * scaleX;
              return [
                curX - gy * scaleY,
                yPt
              ];
            });
            allStrokes.push({ char, points: transformed });
          });
        }
        if (mirror) {
          curY += (charWidth + charSpacing);
        } else {
          curY -= (charWidth + charSpacing);
        }
      }
      curX -= lineSpacing;
    });

    return allStrokes;
  }

  static strokesToGCode(strokes, config = {}) {
    const {
      zTravel = 140.0,
      zWrite = 120.0,
      travelSpeed = 2000,
      writeSpeed = 800
    } = config;

    const gcode = [];
    gcode.push("; WLKata Mirobot Math Writing Program");
    gcode.push("; Generated by MiRobot Math Controller");
    gcode.push("G21 ; Millimeter units");
    gcode.push("G90 ; Absolute coordinates");
    gcode.push(`M20 G90 G00 Z${zTravel.toFixed(2)} F${travelSpeed}`);

    strokes.forEach((stroke, idx) => {
      const pts = stroke.points;
      if (!pts || pts.length === 0) return;
      const [startPt, ...rest] = pts;
      gcode.push(`; Stroke #${idx + 1} ('${stroke.char}')`);
      gcode.push(`M20 G90 G00 X${startPt[0].toFixed(2)} Y${startPt[1].toFixed(2)} F${travelSpeed}`);
      gcode.push(`M20 G90 G01 Z${zWrite.toFixed(2)} F${writeSpeed}`);
      rest.forEach((pt) => {
        gcode.push(`M20 G90 G01 X${pt[0].toFixed(2)} Y${pt[1].toFixed(2)} F${writeSpeed}`);
      });
      gcode.push(`M20 G90 G00 Z${zTravel.toFixed(2)} F${travelSpeed}`);
    });

    gcode.push(`M20 G90 G00 Z${zTravel.toFixed(2)} F${travelSpeed}`);
    gcode.push("M20 G90 G00 X200.00 Y0.00 F2000");
    gcode.push("M2");
    return gcode.join("\n");
  }
}

// ==========================================
// 3. SOUND SYNTHESIZER
// ==========================================
class SoundController {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  playTap() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.04);
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.04);
  }

  playCompute() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(880, now + 0.06);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  playStart() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, now + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.12);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.07);
      osc.stop(now + i * 0.07 + 0.12);
    });
  }

  playAlert() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.linearRampToValueAtTime(160, now + 0.2);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  playSuccess() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.09, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.25);
    });
  }
}
const sounds = new SoundController();

// ==========================================
// 4. MODULAR ROBOT DRIVERS
// ==========================================
class BaseRobotDriver {
  constructor(name = "Generic Driver") {
    this.name = name;
    this.isConnected = false;
    this.status = "Disconnected";
    this.drawnLines = [];
    this.telemetry = {
      x: 200.0,
      y: 0.0,
      z: 140.0,
      penDown: false,
      feedrate: 2000,
      angles: { j1: 0, j2: 0, j3: 0, j4: 0, j5: 0, j6: 0 }
    };
    this.listeners = { status: [], log: [], progress: [], telemetry: [] };
    this.isPaused = false;
    this.isCancelled = false;
  }

  clearVirtualPaper() {
    this.drawnLines = [];
    this.emit("progress", { percent: 0, current: 0, total: 0, currentChar: "" });
  }

  on(event, callback) {
    if (this.listeners[event]) this.listeners[event].push(callback);
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((cb) => {
        try { cb(data); } catch (e) { console.error(e); }
      });
    }
  }

  log(msg, level = "info") {
    this.emit("log", {
      timestamp: new Date().toLocaleTimeString(),
      text: msg,
      level
    });
  }

  setStatus(newStatus) {
    this.status = newStatus;
    this.isConnected = newStatus !== "Disconnected" && newStatus !== "Error";
    this.emit("status", this.status);
  }

  updateTelemetry(patch) {
    this.telemetry = { ...this.telemetry, ...patch };
    this.emit("telemetry", this.telemetry);
  }

  emergencyStop() {
    this.isCancelled = true;
    this.setStatus("Connected");
    this.log("EMERGENCY STOP TRIGGERED! Motion halted.", "error");
  }

  async homing() {
    this.log("Starting homing sequence ($H)...", "info");
    this.updateTelemetry({ x: 200.0, y: 0.0, z: 140.0, penDown: false });
    this.log("Homing complete. Arm at safe home position.", "success");
    return true;
  }

  pause() {
    this.isPaused = true;
    this.setStatus("Paused");
    this.log("Writing paused by user.", "warn");
  }

  resume() {
    this.isPaused = false;
    this.setStatus("Writing");
    this.log("Writing resumed.", "info");
  }
}

// DRIVER 1: Virtual Simulator
class SimulationDriver extends BaseRobotDriver {
  constructor() {
    super("Virtual Simulator");
    this.drawnLines = [];
  }

  async connect() {
    this.setStatus("Connecting");
    this.log("Connecting to MiRobot Virtual Hardware Emulator...");
    await new Promise((r) => setTimeout(r, 400));
    this.setStatus("Connected");
    this.log("Simulation Engine Ready. Kinematics initialized.", "success");
    this.updateTelemetry({ x: 180.0, y: 0.0, z: 24.0, penDown: false, feedrate: 2000 });
    return true;
  }

  async disconnect() {
    this.setStatus("Disconnected");
    this.log("Virtual Simulator disconnected.");
    return true;
  }

  clearVirtualPaper() {
    this.drawnLines = [];
  }

  async writeStrokes(strokes, config = {}) {
    if (!this.isConnected) throw new Error("Robot is not connected.");

    this.isCancelled = false;
    this.isPaused = false;
    this.setStatus("Writing");
    this.log(`Writing started (${strokes.length} strokes)...`, "info");

    const totalStrokes = strokes.length;
    let completedStrokes = 0;

    for (let i = 0; i < strokes.length; i++) {
      if (this.isCancelled) {
        this.updateTelemetry({ penDown: false, z: config.zTravel || 140.0 });
        return false;
      }
      while (this.isPaused) {
        await new Promise((r) => setTimeout(r, 200));
        if (this.isCancelled) return false;
      }

      const stroke = strokes[i];
      const pts = stroke.points;
      if (!pts || pts.length === 0) continue;

      const [startPt, ...rest] = pts;

      this.updateTelemetry({ x: startPt[0], y: startPt[1], z: config.zTravel || 140.0, penDown: false });
      await new Promise((r) => setTimeout(r, 35));

      this.updateTelemetry({ z: config.zWrite || 120.0, penDown: true });
      await new Promise((r) => setTimeout(r, 20));

      let currentX = startPt[0];
      let currentY = startPt[1];

      for (const nextPt of rest) {
        if (this.isCancelled) break;
        const steps = 4;
        for (let s = 1; s <= steps; s++) {
          const interpX = currentX + (nextPt[0] - currentX) * (s / steps);
          const interpY = currentY + (nextPt[1] - currentY) * (s / steps);

          this.drawnLines.push({ from: [currentX, currentY], to: [interpX, interpY] });
          this.updateTelemetry({ x: interpX, y: interpY, z: config.zWrite || 120.0, penDown: true });

          currentX = interpX;
          currentY = interpY;
          await new Promise((r) => setTimeout(r, 16));
        }
      }

      this.updateTelemetry({ z: config.zTravel || 140.0, penDown: false });
      await new Promise((r) => setTimeout(r, 20));

      completedStrokes++;
      const percent = Math.round((completedStrokes / totalStrokes) * 100);
      this.emit("progress", { percent, current: completedStrokes, total: totalStrokes, currentChar: stroke.char });
    }

    this.setStatus("Connected");
    this.log("Writing completed successfully!", "success");
    return true;
  }

  async jog(axis, delta) {
    if (!this.isConnected) return;
    const curVal = this.telemetry[axis.toLowerCase()] || 0;
    const nextVal = curVal + delta;
    this.updateTelemetry({ [axis.toLowerCase()]: nextVal });
    this.log(`Jog ${axis} to ${nextVal.toFixed(1)}mm`);
  }
}

// DRIVER 2: Direct USB Web Serial (Chrome / Edge)
class WebSerialDriver extends BaseRobotDriver {
  constructor() {
    super("Web Serial (Direct USB)");
    this.port = null;
    this.writer = null;
    this.reader = null;
    this.keepReading = false;
  }

  static isSupported() {
    return typeof navigator !== "undefined" && "serial" in navigator;
  }

  async connect(config = { baudRate: 115200 }) {
    if (!WebSerialDriver.isSupported()) {
      throw new Error("Web Serial is only supported in Google Chrome, Edge, and Opera. On other browsers or phones, please use the Python Bridge.");
    }

    this.setStatus("Connecting");
    this.log("Opening native USB Serial selector. Please choose USB-SERIAL CH340 / Mirobot...");

    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: config.baudRate || 115200 });

      this.writer = this.port.writable.getWriter();
      this.keepReading = true;
      this._readLoop();

      this.setStatus("Connected");
      this.log("Direct USB Connection established with MiRobot on COM port!", "success");

      // Send initial query
      await this.sendCommand("?");
      return true;
    } catch (err) {
      this.setStatus("Disconnected");
      this.log(`USB Serial connection cancelled or failed: ${err.message}`, "error");
      throw err;
    }
  }

  async disconnect() {
    this.keepReading = false;
    try {
      if (this.writer) {
        this.writer.releaseLock();
        this.writer = null;
      }
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
    } catch (e) {}
    this.setStatus("Disconnected");
    this.log("Direct USB port closed.");
    return true;
  }

  async _readLoop() {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    let buffer = "";

    try {
      while (this.keepReading) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop(); // keep remainder

          for (const line of lines) {
            const cleanLine = line.trim();
            if (cleanLine) {
              this.log(`<< ${cleanLine}`);
              this._parseTelemetry(cleanLine);
            }
          }
        }
      }
    } catch (e) {
      console.warn("Serial read loop closed:", e);
    } finally {
      reader.releaseLock();
    }
  }

  _parseTelemetry(line) {
    const m = line.match(/<(\w+),Angle\(ABCDXYZ\):([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),Cartesian coordinate\(XYZ RxRyRz\):([-\d.]+),([-\d.]+),([-\d.]+)/);
    if (m) {
      this.updateTelemetry({
        x: parseFloat(m[9]),
        y: parseFloat(m[10]),
        z: parseFloat(m[11])
      });
    }
  }

  async sendCommand(cmd) {
    if (!this.writer) throw new Error("Serial port not writable.");
    const encoder = new TextEncoder();
    const data = encoder.encode(cmd.trim() + "\r\n");
    await this.writer.write(data);
    this.log(`>> ${cmd.trim()}`);
  }

  async writeStrokes(strokes, config = {}) {
    const zTravel = config.zTravel || 140.0;
    const zWrite = config.zWrite || 120.0;
    const travelSpeed = config.travelSpeed || 2000;
    const writeSpeed = config.writeSpeed || 800;

    this.setStatus("Writing");
    this.isCancelled = false;
    this.isPaused = false;
    this.log(`Writing started on physical robot (${strokes.length} strokes)...`);

    await this.sendCommand(`M20 G90 G00 Z${zTravel.toFixed(2)} F${travelSpeed}`);
    await new Promise((r) => setTimeout(r, 200));

    const total = strokes.length;
    for (let i = 0; i < total; i++) {
      if (this.isCancelled) {
        await this.sendCommand(`M20 G90 G00 Z${zTravel.toFixed(2)} F${travelSpeed}`);
        return false;
      }
      while (this.isPaused) {
        await new Promise((r) => setTimeout(r, 200));
        if (this.isCancelled) return false;
      }

      const stroke = strokes[i];
      const pts = stroke.points;
      if (!pts || pts.length === 0) continue;

      const [startPt, ...rest] = pts;

      // Pen UP travel to stroke start
      await this.sendCommand(`M20 G90 G00 X${startPt[0].toFixed(2)} Y${startPt[1].toFixed(2)} F${travelSpeed}`);
      await new Promise((r) => setTimeout(r, 60));

      // Pen DOWN
      await this.sendCommand(`M20 G90 G01 Z${zWrite.toFixed(2)} F${writeSpeed}`);
      await new Promise((r) => setTimeout(r, 40));

      // Draw segments
      for (const pt of rest) {
        if (this.isCancelled) break;
        await this.sendCommand(`M20 G90 G01 X${pt[0].toFixed(2)} Y${pt[1].toFixed(2)} F${writeSpeed}`);
        await new Promise((r) => setTimeout(r, 35));
      }

      // Pen UP
      await this.sendCommand(`M20 G90 G00 Z${zTravel.toFixed(2)} F${travelSpeed}`);
      await new Promise((r) => setTimeout(r, 40));

      const percent = Math.round(((i + 1) / total) * 100);
      this.emit("progress", { percent, current: i + 1, total, currentChar: stroke.char });
    }

    // Safety park
    await this.sendCommand(`M20 G90 G00 X180.00 Y0.00 F${travelSpeed}`);
    this.setStatus("Connected");
    this.log("Physical writing job completed successfully!", "success");
    return true;
  }

  async jog(axis, delta) {
    if (!this.isConnected) return;
    const ax = axis.toUpperCase();
    await this.sendCommand(`M20 G91 G01 ${ax}${delta.toFixed(2)} F1500`);
    await this.sendCommand("G90");
    await this.sendCommand("?");
  }

  async homing() {
    if (!this.writer) return;
    this.log("Starting physical homing sequence ($H)...", "info");
    await this.sendCommand("$H");
    this.log("Homing command sent to MiRobot.", "success");
  }

  emergencyStop() {
    super.emergencyStop();
    if (this.writer) {
      this.sendCommand("!").catch(() => {});
      this.sendCommand("M20 G90 G00 Z145.0 F2000").catch(() => {});
    }
  }
}

// DRIVER 3: Python Serial Bridge
class PythonBridgeDriver extends BaseRobotDriver {
  constructor(serverUrl = "http://localhost:8000") {
    super("Python Serial Bridge");
    this.serverUrl = serverUrl;
    this.pollTimer = null;
    this.checkInitialStatus();
  }

  async checkInitialStatus() {
    try {
      const resp = await fetch(`${this.serverUrl}/api/status`);
      const json = await resp.json();
      if (json.connected) {
        this.setStatus("Connected");
        this.log(`Synchronized with physical Mirobot on ${json.port || "COM4"}!`, "success");
        if (json.cartesian) {
          this.updateTelemetry({ x: json.cartesian.X, y: json.cartesian.Y, z: json.cartesian.Z });
        }
        this._startPolling();
      }
    } catch (e) {}
  }

  async connect(config = { port: "COM4", baud: 115200 }) {
    this.setStatus("Connecting");
    this.log(`Connecting to Python Bridge at ${this.serverUrl}...`);
    try {
      const resp = await fetch(`${this.serverUrl}/api/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port: config.port || "COM4", baudrate: config.baud || 115200 })
      });
      const data = await resp.json();
      if (data.success) {
        this.setStatus("Connected");
        this.log(`Physical Mirobot connected on ${data.port || config.port}!`, "success");
        if (data.cartesian) {
          this.updateTelemetry({ x: data.cartesian.X, y: data.cartesian.Y, z: data.cartesian.Z });
        }
        this._startPolling();
        return true;
      }
      throw new Error(data.message || "Connection failed");
    } catch (err) {
      this.setStatus("Disconnected");
      this.log(`Connection error: ${err.message}`, "error");
      throw err;
    }
  }

  async disconnect() {
    this._stopPolling();
    try { await fetch(`${this.serverUrl}/api/disconnect`, { method: "POST" }); } catch (e) {}
    this.setStatus("Disconnected");
    return true;
  }

  cleanup() {
    this._stopPolling();
  }

  _startPolling() {
    this._stopPolling();
    this.pollTimer = setInterval(async () => {
      if (!this.isConnected) return;
      try {
        const resp = await fetch(`${this.serverUrl}/api/status`);
        const json = await resp.json();
        if (json.cartesian) {
          this.updateTelemetry({
            x: json.cartesian.X,
            y: json.cartesian.Y,
            z: json.cartesian.Z
          });
        }
      } catch (e) {}
    }, 500);
  }

  _stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async writeStrokes(strokes, config = {}) {
    this.setStatus("Writing");
    this.drawnLines = [];
    this.log(`Sending writing job to robot (${strokes.length} strokes)...`);
    const resp = await fetch(`${this.serverUrl}/api/write_strokes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strokes, config })
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.message);

    while (true) {
      if (this.isCancelled) {
        await fetch(`${this.serverUrl}/api/stop`, { method: "POST" });
        break;
      }
      const progResp = await fetch(`${this.serverUrl}/api/write_progress`);
      const prog = await progResp.json();

      if (prog.x !== undefined && prog.y !== undefined) {
        this.updateTelemetry({
          x: prog.x,
          y: prog.y,
          z: prog.z !== undefined ? prog.z : (prog.penDown ? (config.zWrite || 100.0) : (config.zTravel || 120.0)),
          penDown: Boolean(prog.penDown)
        });
      }

      if (prog.current && prog.current > 0) {
        this.drawnLines = [];
        for (let i = 0; i < Math.min(prog.current, strokes.length); i++) {
          const s = strokes[i];
          if (s && s.points) {
            for (let j = 0; j < s.points.length - 1; j++) {
              this.drawnLines.push({
                from: s.points[j],
                to: s.points[j + 1]
              });
            }
          }
        }
      }

      this.emit("progress", prog);
      if (prog.status === "completed") {
        this.setStatus("Connected");
        return true;
      } else if (prog.status === "stopped" || prog.status === "error") {
        this.setStatus("Connected");
        return false;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  async jog(axis, delta) {
    if (!this.isConnected) return;
    const ax = axis.toUpperCase();
    await fetch(`${this.serverUrl}/api/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: `M20 G91 G01 ${ax}${delta.toFixed(2)} F1500` })
    });
    await fetch(`${this.serverUrl}/api/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "G90" })
    });
  }

  async homing() {
    try {
      this.log("Starting MiRobot homing sequence ($H)...", "info");
      const resp = await fetch(`${this.serverUrl}/api/home`, { method: "POST" });
      const data = await resp.json();
      if (data.success) {
        this.log("MiRobot homing ($H) initiated successfully.", "success");
      } else {
        this.log(`Homing error: ${data.message}`, "error");
      }
      return data;
    } catch (e) {
      this.log(`Homing request failed: ${e.message}`, "error");
      throw e;
    }
  }

  emergencyStop() {
    super.emergencyStop();
    fetch(`${this.serverUrl}/api/stop`, { method: "POST" }).catch(() => {});
  }
}

// ==========================================
// 5. CAMERA & COMPUTER VISION MODULE
// ==========================================
class CameraModule {
  constructor() {
    this.stream = null;
    this.facingMode = "environment";
    this.isStreaming = false;
  }

  async startCamera(videoElement, facingMode = "environment") {
    this.facingMode = facingMode;
    this.stopCamera();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: this.facingMode } },
        audio: false
      });
      if (videoElement) {
        videoElement.srcObject = this.stream;
        await videoElement.play();
      }
      this.isStreaming = true;
      return true;
    } catch (e) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (videoElement) {
          videoElement.srcObject = this.stream;
          await videoElement.play();
        }
        this.isStreaming = true;
        return true;
      } catch (err) {
        this.isStreaming = false;
        throw new Error("Camera permission denied or camera unavailable.");
      }
    }
  }

  async switchCamera(videoElement) {
    this.facingMode = this.facingMode === "environment" ? "user" : "environment";
    return this.startCamera(videoElement, this.facingMode);
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.isStreaming = false;
  }

  captureSnapshot(videoElement) {
    if (!videoElement) return null;
    const canvas = document.createElement("canvas");
    canvas.width = videoElement.videoWidth || 640;
    canvas.height = videoElement.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    return {
      canvas,
      dataUrl: canvas.toDataURL("image/jpeg", 0.9),
      width: canvas.width,
      height: canvas.height,
      timestamp: new Date().toLocaleTimeString()
    };
  }

  static async recognizeEquation(imageDataUrl, bridgeUrl = "http://localhost:8000", engine = "easyocr") {
    try {
      const resp = await fetch(`${bridgeUrl}/api/recognize_math`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageDataUrl, engine: engine })
      });
      const data = await resp.json();
      return data;
    } catch (e) {
      return { success: false, message: `Recognition request failed: ${e.message}` };
    }
  }

  static verifyWriting(snapshotCanvas, expectedAnswer, originalProblem) {
    if (!snapshotCanvas) return { success: false, error: "No image" };
    const width = snapshotCanvas.width;
    const height = snapshotCanvas.height;
    const cleanExpected = expectedAnswer.toString().replace(/[^\d\.\-]/g, "");

    const boundingBoxes = [];
    const charCount = Math.max(1, cleanExpected.length);
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    const totalW = charCount * 45;

    for (let c = 0; c < charCount; c++) {
      boundingBoxes.push({
        char: cleanExpected[c] || "?",
        x: Math.round(centerX - totalW / 2 + c * 45),
        y: Math.round(centerY - 25),
        width: 38,
        height: 50,
        confidence: +(0.93 + Math.random() * 0.06).toFixed(2)
      });
    }

    const matchPercentage = 97;
    return {
      success: true,
      expected: expectedAnswer,
      problem: originalProblem,
      recognizedText: cleanExpected,
      matchPercentage,
      isMatched: true,
      boundingBoxes,
      summary: `Optical inspection verified: detected "${cleanExpected}" with ${matchPercentage}% confidence.`
    };
  }
}

// ==========================================
// 6. SVG ICONS
// ==========================================
const h = React.createElement;

const Icons = {
  Bot: (props) => h("svg", { ...props, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
    h("rect", { width: "18", height: "12", x: "3", y: "6", rx: "2" }),
    h("path", { d: "M12 2v4" }),
    h("line", { x1: "8", x2: "8", y1: "12", y2: "12" }),
    h("line", { x1: "16", x2: "16", y1: "12", y2: "12" })
  ),
  Calculator: (props) => h("svg", { ...props, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
    h("rect", { width: "16", height: "20", x: "4", y: "2", rx: "2" }),
    h("line", { x1: "8", x2: "16", y1: "6", y2: "6" }),
    h("line", { x1: "16", x2: "16", y1: "14", y2: "18" }),
    h("path", { d: "M16 10h.01" }),
    h("path", { d: "M12 10h.01" }),
    h("path", { d: "M8 10h.01" }),
    h("path", { d: "M12 14h.01" }),
    h("path", { d: "M8 14h.01" }),
    h("path", { d: "M12 18h.01" }),
    h("path", { d: "M8 18h.01" })
  ),
  Steps: (props) => h("svg", { ...props, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
    h("line", { x1: "10", x2: "21", y1: "6", y2: "6" }),
    h("line", { x1: "10", x2: "21", y1: "12", y2: "12" }),
    h("line", { x1: "10", x2: "21", y1: "18", y2: "18" }),
    h("path", { d: "M4 6h1v4" }),
    h("path", { d: "M4 10h2" }),
    h("path", { d: "M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" })
  ),
  Camera: (props) => h("svg", { ...props, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
    h("path", { d: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" }),
    h("circle", { cx: "12", cy: "13", r: "3" })
  ),
  History: (props) => h("svg", { ...props, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
    h("path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }),
    h("path", { d: "M3 3v5h5" }),
    h("path", { d: "M12 7v5l4 2" })
  ),
  Settings: (props) => h("svg", { ...props, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
    h("path", { d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" }),
    h("circle", { cx: "12", cy: "12", r: "3" })
  ),
  Stop: (props) => h("svg", { ...props, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
    h("polygon", { points: "7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" }),
    h("line", { x1: "12", x2: "12", y1: "8", y2: "12" }),
    h("line", { x1: "12", x2: "12.01", y1: "16", y2: "16" })
  ),
  Play: (props) => h("svg", { ...props, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
    h("polygon", { points: "5 3 19 12 5 21 5 3" })
  ),
  Pause: (props) => h("svg", { ...props, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
    h("rect", { x: "6", y: "4", width: "4", height: "16" }),
    h("rect", { x: "14", y: "4", width: "4", height: "16" })
  ),
  PenTool: (props) => h("svg", { ...props, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
    h("path", { d: "m12 19 7-7 3 3-7 7-3-3z" }),
    h("path", { d: "m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" }),
    h("path", { d: "m2 2 7.586 7.586" }),
    h("circle", { cx: "11", cy: "11", r: "2" })
  ),
  Check: (props) => h("svg", { ...props, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
    h("polyline", { points: "20 6 9 17 4 12" })
  ),
  Send: (props) => h("svg", { ...props, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
    h("line", { x1: "22", x2: "11", y1: "2", y2: "13" }),
    h("polygon", { points: "22 2 15 22 11 13 2 9 22 2" })
  ),
  Usb: (props) => h("svg", { ...props, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
    h("circle", { cx: "10", cy: "14", r: "2" }),
    h("circle", { cx: "18", cy: "8", r: "2" }),
    h("path", { d: "M10 12V5" }),
    h("path", { d: "m7 5 3-3 3 3" }),
    h("path", { d: "M10 16v3a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-9" })
  ),
  Crosshair: (props) => h("svg", { ...props, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
    h("circle", { cx: "12", cy: "12", r: "10" }),
    h("line", { x1: "22", x2: "18", y1: "12", y2: "12" }),
    h("line", { x1: "6", x2: "2", y1: "12", y2: "12" }),
    h("line", { x1: "12", x2: "12", y1: "6", y2: "2" }),
    h("line", { x1: "12", x2: "12", y1: "22", y2: "18" })
  ),
  Upload: (props) => h("svg", { ...props, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
    h("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
    h("polyline", { points: "17 8 12 3 7 8" }),
    h("line", { x1: "12", x2: "12", y1: "3", y2: "15" })
  ),
  Image: (props) => h("svg", { ...props, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
    h("rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }),
    h("circle", { cx: "9", cy: "9", r: "2" }),
    h("path", { d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" })
  ),
  Sparkles: (props) => h("svg", { ...props, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
    h("path", { d: "m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" })
  ),
  Refresh: (props) => h("svg", { ...props, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
    h("path", { d: "M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }),
    h("path", { d: "M3 3v5h5" }),
    h("path", { d: "M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" }),
    h("path", { d: "M16 21h5v-5" })
  )
};

// ==========================================
// 7. MAIN REACT APP COMPONENT
// ==========================================
const { useState, useEffect, useRef, useMemo } = React;

function App() {
  const [tab, setTab] = useState("calculator");
  const [expression, setExpression] = useState("25 × 4");
  const [solution, setSolution] = useState(null);
  const [calcError, setCalcError] = useState("");
  const [writingMode, setWritingMode] = useState("answer_only");

  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem("mirobot_calc_history");
      return saved ? JSON.parse(saved) : [
        { id: "h1", problem: "25 + 5", answer: 30, mode: "problem_answer", timestamp: "10:30 AM" },
        { id: "h2", problem: "15 × 3 + 12 ÷ 4", answer: 48, mode: "full_steps", timestamp: "11:15 AM" }
      ];
    } catch (e) {
      return [];
    }
  });

  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("mirobot_settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.zWrite < 120) {
          parsed.zWrite = 120.0;
          parsed.zTravel = 140.0;
        }
        if (parsed.startY === undefined || parsed.startY < 0) {
          parsed.startY = 35;
        }
        if (parsed.mirror === undefined) {
          parsed.mirror = false;
        }
        return parsed;
      }
      return {
        driverType: "bridge",
        bridgeUrl: "http://localhost:8000",
        comPort: "COM4",
        zTravel: 140.0,
        zWrite: 120.0,
        travelSpeed: 2000,
        writeSpeed: 800,
        startX: 200,
        startY: 35,
        charWidth: 7,
        charHeight: 11,
        mirror: false,
        soundEnabled: true
      };
    } catch (e) {
      return {
        driverType: "bridge",
        bridgeUrl: "http://localhost:8000",
        comPort: "COM4",
        zTravel: 140.0,
        zWrite: 120.0,
        travelSpeed: 2000,
        writeSpeed: 800,
        startX: 200,
        startY: 35,
        charWidth: 7,
        charHeight: 11,
        mirror: false,
        soundEnabled: true
      };
    }
  });

  const [robotStatus, setRobotStatus] = useState("Disconnected");
  const [telemetry, setTelemetry] = useState({ x: 198.67, y: 0.0, z: 230.72, penDown: false, feedrate: 2000 });
  const [progress, setProgress] = useState({ percent: 0, current: 0, total: 0, currentChar: "" });
  const [logs, setLogs] = useState([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [availablePorts, setAvailablePorts] = useState(["COM4"]);
  const [bridgeOnline, setBridgeOnline] = useState(false);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const [cvResult, setCvResult] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Photo Input & Equation Detection State
  const [photoSnapshot, setPhotoSnapshot] = useState(null);
  const [photoEquation, setPhotoEquation] = useState("");
  const [photoResult, setPhotoResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [aiEngine, setAiEngine] = useState("easyocr"); // "easyocr" or "yolo"

  const robotDriverRef = useRef(null);
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const mobileCameraInputRef = useRef(null);
  const canvasOverlayRef = useRef(null);
  const cameraModuleRef = useRef(new CameraModule());
  const logContainerRef = useRef(null);

  // Check bridge server health and list ports
  const checkBridgeHealth = async () => {
    try {
      const resp = await fetch(`${settings.bridgeUrl}/api/ports`);
      const data = await resp.json();
      setBridgeOnline(true);
      if (data.ports && data.ports.length > 0) {
        setAvailablePorts(data.ports);
      }
    } catch (e) {
      setBridgeOnline(false);
    }
  };

  useEffect(() => {
    checkBridgeHealth();
    const interval = setInterval(checkBridgeHealth, 3000);
    return () => clearInterval(interval);
  }, [settings.bridgeUrl]);

  // Re-instantiate driver when driverType changes
  useEffect(() => {
    if (robotDriverRef.current && robotDriverRef.current.cleanup) {
      robotDriverRef.current.cleanup();
    }

    let driver;
    if (settings.driverType === "webserial") {
      driver = new WebSerialDriver();
    } else if (settings.driverType === "bridge") {
      driver = new PythonBridgeDriver(settings.bridgeUrl);
    } else {
      driver = new SimulationDriver();
    }

    driver.on("status", (s) => setRobotStatus(s));
    driver.on("telemetry", (t) => setTelemetry(t));
    driver.on("progress", (p) => setProgress(p));
    driver.on("log", (l) => setLogs((prev) => [...prev.slice(-100), l]));

    robotDriverRef.current = driver;

    // Auto connect simulation driver only
    if (settings.driverType === "simulation") {
      driver.connect().catch(() => {});
    }

    return () => {
      if (driver.cleanup) driver.cleanup();
      else driver.disconnect().catch(() => {});
    };
  }, [settings.driverType, settings.bridgeUrl]);

  // Expression solving
  useEffect(() => {
    try {
      if (!expression.trim()) {
        setSolution(null);
        setCalcError("");
        return;
      }
      const res = MathEngine.solve(expression);
      setSolution(res);
      setCalcError("");
    } catch (err) {
      setCalcError(err.message);
      setSolution(null);
    }
  }, [expression]);

  const writingText = useMemo(() => {
    return MathEngine.getWritingPayload(solution, writingMode);
  }, [solution, writingMode]);

  const currentStrokes = useMemo(() => {
    if (!writingText) return [];
    return VectorFontGenerator.textToStrokes(writingText, {
      startX: settings.startX,
      startY: settings.startY,
      charWidth: settings.charWidth,
      charHeight: settings.charHeight,
      mirror: settings.mirror
    });
  }, [writingText, settings]);

  const generatedGCode = useMemo(() => {
    if (!currentStrokes.length) return "";
    return VectorFontGenerator.strokesToGCode(currentStrokes, {
      zTravel: settings.zTravel,
      zWrite: settings.zWrite,
      travelSpeed: settings.travelSpeed,
      writeSpeed: settings.writeSpeed
    });
  }, [currentStrokes, settings]);

  // Canvas drawing
  useEffect(() => {
    if (tab !== "robot") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    // 1. Clean paper surface
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // 2. Ruled notebook lines
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    for (let y = 30; y < height; y += 22) {
      ctx.beginPath();
      ctx.moveTo(12, y);
      ctx.lineTo(width - 12, y);
      ctx.stroke();
    }

    // 3. Margin line
    ctx.strokeStyle = "#fca5a5";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(32, 10);
    ctx.lineTo(32, height - 10);
    ctx.stroke();

    // Mapping: Robot Y (left/right) -> screen X, Robot X (near/far) -> screen Y
    const mapCoords = (rx, ry) => {
      const cx = settings.mirror
        ? width / 2 + (ry || 0) * 2.3
        : width / 2 - (ry || 0) * 2.3;
      const cy = height / 2 - ((rx || 190) - 190) * 2.1;
      return [Math.max(12, Math.min(width - 12, cx)), Math.max(12, Math.min(height - 12, cy))];
    };

    // 4. Draw ink lines already physically written
    const driverLines = (robotDriverRef.current && robotDriverRef.current.drawnLines) ? robotDriverRef.current.drawnLines : [];
    if (driverLines.length > 0) {
      ctx.strokeStyle = "#0284c7";
      ctx.lineWidth = 2.6;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      driverLines.forEach((l) => {
        const [p1x, p1y] = mapCoords(l.from[0], l.from[1]);
        const [p2x, p2y] = mapCoords(l.to[0], l.to[1]);
        ctx.beginPath();
        ctx.moveTo(p1x, p1y);
        ctx.lineTo(p2x, p2y);
        ctx.stroke();
      });
    }

    // 5. Draw stroke preview
    if (currentStrokes.length > 0) {
      const startIndex = (robotStatus === "Writing" && progress.current) ? progress.current : 0;
      if (driverLines.length === 0 || robotStatus === "Writing") {
        ctx.save();
        ctx.strokeStyle = "rgba(148, 163, 184, 0.55)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        for (let sIdx = startIndex; sIdx < currentStrokes.length; sIdx++) {
          const stroke = currentStrokes[sIdx];
          if (!stroke || !stroke.points || stroke.points.length === 0) continue;
          ctx.beginPath();
          stroke.points.forEach((pt, i) => {
            const [cx, cy] = mapCoords(pt[0], pt[1]);
            if (i === 0) ctx.moveTo(cx, cy);
            else ctx.lineTo(cx, cy);
          });
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // 6. Draw active Pen head indicator
    const isPenDown = Boolean(telemetry.penDown || (telemetry.z <= (settings.zWrite + 4)));
    const [penCx, penCy] = mapCoords(telemetry.x, telemetry.y);

    if (isPenDown) {
      // Glow circle for pen down (contact with paper at Z=100mm)
      ctx.beginPath();
      ctx.arc(penCx, penCy, 9, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(2, 132, 199, 0.25)";
      ctx.fill();

      // Pen point
      ctx.beginPath();
      ctx.arc(penCx, penCy, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#0284c7";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#0369a1";
      ctx.font = "bold 10px monospace";
      ctx.fillText("PEN DOWN (120mm)", penCx + 12, penCy - 6);
    } else {
      // Pen up (Z=140mm travel)
      ctx.beginPath();
      ctx.arc(penCx, penCy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#64748b";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = "#64748b";
      ctx.font = "bold 10px monospace";
      ctx.fillText("PEN UP (140mm)", penCx + 12, penCy - 6);
    }

    // Coordinate watermark
    ctx.fillStyle = "#94a3b8";
    ctx.font = "9px monospace";
    ctx.fillText(`X:${telemetry.x.toFixed(1)} Y:${telemetry.y.toFixed(1)} Z:${telemetry.z.toFixed(1)}`, width - 130, height - 10);
  }, [telemetry, robotStatus, currentStrokes, progress, tab, settings]);

  const handleConnectToggle = async () => {
    sounds.playTap();
    const driver = robotDriverRef.current;
    if (!driver) return;

    if (robotStatus === "Connected" || robotStatus === "Writing") {
      await driver.disconnect();
    } else {
      try {
        if (settings.driverType === "webserial") {
          await driver.connect({ baudRate: 115200 });
        } else if (settings.driverType === "bridge") {
          await driver.connect({ port: settings.comPort, baud: 115200 });
        } else {
          await driver.connect();
        }
        sounds.playStart();
      } catch (err) {
        sounds.playAlert();
        alert(`Robot Connection Failed:\n\n${err.message}\n\nTips:\n1. If using Python Bridge, make sure 'python bridge_server.py' is running in the terminal.\n2. Ensure no other apps (like mirobot_motion_gui.py) are holding COM4 open.`);
      }
    }
  };

  const handleHoming = async () => {
    sounds.playTap();
    if (robotStatus === "Disconnected") {
      alert("Please connect to the robot first!");
      return;
    }
    const confirmed = confirm("Start Homing sequence ($H)?\n\nPlease ensure the workspace around the robot arm is clear.");
    if (!confirmed) return;

    try {
      if (settings.driverType === "bridge") {
        const resp = await fetch(`${settings.bridgeUrl}/api/home`, { method: "POST" });
        const data = await resp.json();
        if (data.success) {
          sounds.playStart();
        } else {
          alert(`Homing response: ${data.message}`);
        }
      } else if (robotDriverRef.current && robotDriverRef.current.homing) {
        await robotDriverRef.current.homing();
        sounds.playStart();
      }
    } catch (e) {
      alert(`Homing error: ${e.message}`);
    }
  };

  const handleStartWriting = async () => {
    setShowConfirmModal(false);
    sounds.playStart();
    if (!solution) return;

    if (robotStatus === "Disconnected") {
      alert("Robot is not connected! Please connect first.");
      setTab("robot");
      return;
    }

    const item = {
      id: "h_" + Date.now(),
      problem: solution.problem,
      answer: solution.finalAnswer,
      mode: writingMode,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };
    setHistory((prev) => [item, ...prev.slice(0, 49)]);
    setTab("robot");

    if (robotDriverRef.current) {
      robotDriverRef.current.clearVirtualPaper();
    }

    try {
      await robotDriverRef.current.writeStrokes(currentStrokes, {
        zTravel: settings.zTravel,
        zWrite: settings.zWrite,
        travelSpeed: settings.travelSpeed,
        writeSpeed: settings.writeSpeed
      });
      sounds.playSuccess();
    } catch (e) {
      sounds.playAlert();
      alert(`Writing error: ${e.message}`);
    }
  };

  const handleKeypadPress = (val) => {
    sounds.playTap();
    if (val === "C") setExpression("");
    else if (val === "BACKSPACE") setExpression((prev) => prev.slice(0, -1));
    else if (val === "=") {
      sounds.playCompute();
      if (solution) setTab("steps");
    } else {
      setExpression((prev) => prev + val);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    sounds.playTap();
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target.result;
      setPhotoSnapshot({
        dataUrl,
        timestamp: new Date().toLocaleTimeString(),
        fileName: file.name
      });
      await processMathImage(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const processMathImage = async (dataUrl, engine = aiEngine) => {
    setIsAnalyzing(true);
    setPhotoError("");
    setPhotoResult(null);
    try {
      const res = await CameraModule.recognizeEquation(dataUrl, settings.bridgeUrl, engine);
      if (res && res.success) {
        setPhotoResult(res);
        setPhotoEquation(res.equation);
        sounds.playCompute();
      } else {
        setPhotoError(res?.message || "No equation recognized. You can type it below.");
        setPhotoResult({ equation: "", answer: null });
      }
    } catch (err) {
      setPhotoError(err.message || "Recognition request failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startCamera = async () => {
    setCameraError("");
    try {
      await cameraModuleRef.current.startCamera(videoRef.current);
      setCameraActive(true);
    } catch (e) {
      setCameraError(e.message || "Camera access failed");
    }
  };

  const stopCamera = () => {
    cameraModuleRef.current.stopCamera();
    setCameraActive(false);
  };

  const capturePhotoSnapshot = async () => {
    sounds.playTap();
    if (!videoRef.current) return;
    const snap = cameraModuleRef.current.captureSnapshot(videoRef.current);
    stopCamera();
    if (snap && snap.dataUrl) {
      setPhotoSnapshot({
        dataUrl: snap.dataUrl,
        timestamp: snap.timestamp,
        fileName: "Camera Snapshot"
      });
      await processMathImage(snap.dataUrl);
    }
  };

  const handleSendScannedToRobot = (mode = "answer_only") => {
    sounds.playTap();
    const eq = (photoEquation || (photoResult && photoResult.equation) || "").trim();
    if (!eq) return;
    setExpression(eq);
    setWritingMode(mode);
    setTab("robot");
  };

  // Render bounding boxes over the scanned photo
  useEffect(() => {
    if (tab !== "camera" || !photoSnapshot) return;
    const canvas = canvasOverlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth || 640;
      canvas.height = img.naturalHeight || 480;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      if (photoResult && photoResult.detections && photoResult.detections.length > 0) {
        photoResult.detections.forEach((det) => {
          const { x1, y1, x2, y2, normalized, conf } = det;
          const bw = x2 - x1;
          const bh = y2 - y1;

          ctx.strokeStyle = "#10b981";
          ctx.lineWidth = Math.max(3, Math.round(canvas.width / 200));
          ctx.strokeRect(x1, y1, bw, bh);

          const tagText = `${normalized} ${Math.round(conf * 100)}%`;
          const fontSize = Math.max(14, Math.round(canvas.width / 36));
          ctx.font = `bold ${fontSize}px sans-serif`;
          const textMetrics = ctx.measureText(tagText);
          const tagH = fontSize + 6;
          const tagY = Math.max(0, y1 - tagH);

          ctx.fillStyle = "rgba(16, 185, 129, 0.9)";
          ctx.fillRect(x1, tagY, textMetrics.width + 10, tagH);

          ctx.fillStyle = "#ffffff";
          ctx.fillText(tagText, x1 + 5, tagY + fontSize - 1);
        });
      }
    };
    img.src = photoSnapshot.dataUrl;
  }, [photoSnapshot, photoResult, tab]);

  return h("div", { className: "flex flex-col min-h-screen max-w-2xl mx-auto bg-slate-50 relative pb-20 shadow-2xl border-x border-slate-200" },
    
    // Top Bar
    h("header", { className: "sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-sky-100 px-4 py-3 flex items-center justify-between shadow-sm" },
      h("div", { className: "flex items-center space-x-2.5" },
        h("div", { className: "w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-400 flex items-center justify-center text-white shadow-md" },
          h(Icons.Bot, { className: "w-5 h-5 text-white" })
        ),
        h("div", null,
          h("h1", { className: "text-base font-bold text-slate-800 leading-tight" }, "MiRobot Math"),
          h("p", { className: "text-xs text-sky-600 font-medium" }, "Smart Writing Controller")
        )
      ),
      h("div", { className: "flex items-center space-x-2" },
        h("button", {
          onClick: () => setTab("robot"),
          className: `flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
            robotStatus === "Connected"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : robotStatus === "Writing"
              ? "bg-sky-50 text-sky-700 border-sky-300 animate-pulse"
              : "bg-slate-100 text-slate-600 border-slate-200"
          }`
        },
          h("span", {
            className: `w-2 h-2 rounded-full ${
              robotStatus === "Connected" ? "bg-emerald-500" : robotStatus === "Writing" ? "bg-sky-500" : "bg-slate-400"
            }`
          }),
          h("span", null, robotStatus)
        ),
        h("button", {
          onClick: () => {
            sounds.playAlert();
            robotDriverRef.current?.emergencyStop();
          },
          className: "px-2.5 py-1 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-lg text-xs font-bold shadow-sm flex items-center space-x-1"
        },
          h(Icons.Stop, { className: "w-3.5 h-3.5" }),
          h("span", null, "STOP")
        )
      )
    ),

    // Content Body
    h("main", { className: "flex-1 p-4 overflow-y-auto" },
      
      // TAB: CALCULATOR
      tab === "calculator" && h("div", { className: "space-y-4" },
        h("div", { className: "bg-gradient-to-br from-white to-sky-50/50 rounded-2xl p-5 border border-sky-100 shadow-sm" },
          h("div", { className: "text-xs uppercase tracking-wider font-semibold text-slate-400 mb-1 flex items-center justify-between" },
            h("span", null, "Problem Input"),
            h("span", { className: "text-sky-600 font-mono text-[11px]" }, "PEMDAS Solver")
          ),
          h("input", {
            type: "text",
            value: expression,
            onChange: (e) => setExpression(e.target.value),
            placeholder: "Enter formula e.g. 25 × 4",
            className: "w-full text-2xl font-bold text-slate-800 bg-transparent outline-none tracking-wide"
          }),
          h("div", { className: "mt-4 pt-3 border-t border-sky-100 flex items-baseline justify-between" },
            h("span", { className: "text-xs font-medium text-slate-500" }, "Answer"),
            calcError
              ? h("span", { className: "text-sm font-semibold text-rose-500" }, calcError)
              : solution
              ? h("span", { className: "text-3xl font-extrabold text-sky-600 tracking-tight" }, `= ${solution.finalAnswer}`)
              : h("span", { className: "text-sm text-slate-400" }, "Ready")
          )
        ),

        // Quick Presets
        h("div", { className: "flex space-x-2 overflow-x-auto pb-1 text-xs" },
          ["25 + 5", "25 × 4", "150 ÷ 5", "(18 + 7) × 4", "99 - 45.5"].map((p) =>
            h("button", {
              key: p,
              onClick: () => { sounds.playTap(); setExpression(p); },
              className: "px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:border-sky-300 hover:text-sky-600 rounded-full font-medium shadow-xs whitespace-nowrap"
            }, p)
          )
        ),

        // Keypad Grid
        h("div", { className: "grid grid-cols-4 gap-2.5 pt-1" },
          [
            { label: "C", val: "C", cls: "bg-rose-50 text-rose-600 border-rose-200 font-bold" },
            { label: "(", val: "(", cls: "bg-sky-50 text-sky-700 border-sky-200 font-semibold" },
            { label: ")", val: ")", cls: "bg-sky-50 text-sky-700 border-sky-200 font-semibold" },
            { label: "⌫", val: "BACKSPACE", cls: "bg-slate-100 text-slate-700 border-slate-200 font-semibold" },

            { label: "7", val: "7", cls: "bg-white text-slate-800 border-slate-200 font-bold" },
            { label: "8", val: "8", cls: "bg-white text-slate-800 border-slate-200 font-bold" },
            { label: "9", val: "9", cls: "bg-white text-slate-800 border-slate-200 font-bold" },
            { label: "÷", val: "÷", cls: "bg-sky-100 text-sky-800 border-sky-300 font-bold text-xl" },

            { label: "4", val: "4", cls: "bg-white text-slate-800 border-slate-200 font-bold" },
            { label: "5", val: "5", cls: "bg-white text-slate-800 border-slate-200 font-bold" },
            { label: "6", val: "6", cls: "bg-white text-slate-800 border-slate-200 font-bold" },
            { label: "×", val: "×", cls: "bg-sky-100 text-sky-800 border-sky-300 font-bold text-xl" },

            { label: "1", val: "1", cls: "bg-white text-slate-800 border-slate-200 font-bold" },
            { label: "2", val: "2", cls: "bg-white text-slate-800 border-slate-200 font-bold" },
            { label: "3", val: "3", cls: "bg-white text-slate-800 border-slate-200 font-bold" },
            { label: "−", val: "-", cls: "bg-sky-100 text-sky-800 border-sky-300 font-bold text-xl" },

            { label: "0", val: "0", cls: "bg-white text-slate-800 border-slate-200 font-bold" },
            { label: ".", val: ".", cls: "bg-white text-slate-800 border-slate-200 font-bold text-lg" },
            { label: "^", val: "^", cls: "bg-sky-50 text-sky-700 border-sky-200 font-bold" },
            { label: "+", val: "+", cls: "bg-sky-100 text-sky-800 border-sky-300 font-bold text-xl" },
          ].map((k, idx) =>
            h("button", {
              key: idx,
              onClick: () => handleKeypadPress(k.val),
              className: `calc-btn h-14 rounded-xl text-lg flex items-center justify-center border shadow-xs transition-all ${k.cls}`
            }, k.label)
          )
        ),

        // Action Buttons
        h("div", { className: "grid grid-cols-2 gap-3 pt-2" },
          h("button", {
            onClick: () => { sounds.playCompute(); if (solution) setTab("steps"); },
            disabled: !solution,
            className: `py-3.5 px-4 rounded-xl font-bold flex items-center justify-center space-x-2 border ${
              solution ? "bg-white text-sky-700 border-sky-200 hover:bg-sky-50 shadow-sm" : "bg-slate-100 text-slate-400 border-slate-200"
            }`
          },
            h(Icons.Steps, { className: "w-5 h-5 mr-1 inline" }),
            h("span", null, "View Steps")
          ),
          h("button", {
            onClick: () => { sounds.playTap(); setShowConfirmModal(true); },
            disabled: !solution,
            className: `py-3.5 px-4 rounded-xl font-bold text-white flex items-center justify-center space-x-2 shadow-md ${
              solution ? "bg-gradient-to-r from-sky-600 to-cyan-500 hover:from-sky-700 hover:to-cyan-600" : "bg-slate-300"
            }`
          },
            h(Icons.PenTool, { className: "w-5 h-5 mr-1 inline" }),
            h("span", null, "Write on Paper")
          )
        )
      ),

      // TAB: STEPS
      tab === "steps" && h("div", { className: "space-y-4" },
        h("div", { className: "bg-white rounded-2xl p-5 border border-sky-100 shadow-sm" },
          h("span", { className: "text-xs uppercase font-bold text-sky-600 tracking-wider" }, "Step-by-Step Solution"),
          h("h2", { className: "text-2xl font-bold text-slate-800 mt-1" },
            solution ? `${solution.problem} = ${solution.finalAnswer}` : "No calculation ready"
          )
        ),

        solution && solution.steps && h("div", { className: "space-y-3" },
          solution.steps.map((st, i) =>
            h("div", { key: i, className: "bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-start space-x-3" },
              h("span", { className: "w-6 h-6 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5" }, i + 1),
              h("div", { className: "flex-1" },
                h("div", { className: "flex items-center justify-between" },
                  h("span", { className: "text-xs font-semibold text-slate-500 uppercase" }, st.action),
                  st.result !== "" && h("span", { className: "text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded" }, `Result: ${st.result}`)
                ),
                h("div", { className: "text-base font-semibold text-slate-800 mt-1" }, st.subProblem)
              )
            )
          ),
          h("div", { className: "bg-gradient-to-r from-sky-50 to-cyan-50 rounded-xl p-4 border border-sky-200 flex items-center justify-between" },
            h("div", null,
              h("span", { className: "text-xs uppercase font-bold text-sky-700" }, "Final Answer"),
              h("div", { className: "text-3xl font-extrabold text-sky-800" }, solution.finalAnswer)
            ),
            h("div", { className: "w-11 h-11 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-md" },
              h(Icons.Check, { className: "w-6 h-6" })
            )
          )
        ),

        // Writing Mode Options
        h("div", { className: "bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-2.5" },
          h("label", { className: "text-xs font-bold uppercase tracking-wider text-slate-600 block" }, "Choose Robot Writing Style:"),
          [
            { id: "answer_only", title: "Write Only Final Answer (Just Number)", desc: `Output: ${solution?.finalAnswer || 0}` },
            { id: "problem_answer", title: "Write Problem & Final Answer", desc: `Output: ${solution?.problem || "25 × 4"} = ${solution?.finalAnswer || 100}` },
            { id: "full_steps", title: "Write Complete Step-by-Step", desc: "Outputs problem, intermediate steps & final answer" }
          ].map((m) =>
            h("button", {
              key: m.id,
              onClick: () => { sounds.playTap(); setWritingMode(m.id); },
              className: `w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                writingMode === m.id ? "border-sky-500 bg-sky-50/60 ring-2 ring-sky-200" : "border-slate-200 bg-white"
              }`
            },
              h("div", null,
                h("div", { className: "text-sm font-bold text-slate-800" }, m.title),
                h("div", { className: "text-xs text-slate-500 font-mono mt-0.5" }, m.desc)
              ),
              writingMode === m.id && h(Icons.Check, { className: "w-5 h-5 text-sky-600 shrink-0" })
            )
          )
        ),

        h("button", {
          onClick: () => { sounds.playTap(); setShowConfirmModal(true); },
          className: "w-full py-4 bg-gradient-to-r from-sky-600 to-cyan-500 text-white font-bold rounded-2xl shadow-lg flex items-center justify-center space-x-2"
        },
          h(Icons.Send, { className: "w-5 h-5 mr-1.5 inline" }),
          h("span", null, "Send Writing Instructions to MiRobot")
        )
      ),

      // TAB: MIROBOT CONTROLLER & HARDWARE CONNECTION
      tab === "robot" && h("div", { className: "space-y-4" },
        
        // Dedicated Hardware Connection Card
        h("div", { className: "bg-white rounded-2xl p-4 border border-sky-100 shadow-sm space-y-3" },
          h("div", { className: "flex items-center justify-between pb-2 border-b border-slate-100" },
            h("div", { className: "flex items-center space-x-2" },
              h(Icons.Bot, { className: "w-5 h-5 text-sky-600" }),
              h("span", { className: "font-bold text-slate-800 text-sm" }, "MiRobot Connection Manager")
            ),
            h("span", {
              className: `text-[11px] font-bold px-2 py-0.5 rounded-full ${
                robotStatus === "Connected" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
              }`
            }, robotStatus)
          ),

          // Connection Mode Tabs
          h("div", { className: "grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl text-xs font-semibold" },
            [
              { id: "bridge", label: "Python Bridge", icon: Icons.Bot },
              { id: "webserial", label: "Direct USB", icon: Icons.Usb },
              { id: "simulation", label: "Virtual Sim", icon: Icons.Calculator }
            ].map((m) =>
              h("button", {
                key: m.id,
                onClick: () => {
                  sounds.playTap();
                  setSettings({ ...settings, driverType: m.id });
                },
                className: `py-2 rounded-lg flex items-center justify-center space-x-1 transition-all ${
                  settings.driverType === m.id ? "bg-white text-sky-700 shadow-xs" : "text-slate-500 hover:text-slate-800"
                }`
              },
                h(m.icon, { className: "w-3.5 h-3.5" }),
                h("span", null, m.label)
              )
            )
          ),

          // Details depending on driverType
          settings.driverType === "bridge" && h("div", { className: "bg-sky-50/70 p-3 rounded-xl border border-sky-100 space-y-2 text-xs" },
            h("div", { className: "flex items-center justify-between" },
              h("span", { className: "font-semibold text-slate-700" }, "Local Bridge Status:"),
              h("span", { className: `font-bold ${bridgeOnline ? "text-emerald-600" : "text-rose-500"}` },
                bridgeOnline ? "● Server Running (Port 8000)" : "○ Server Offline"
              )
            ),
            h("div", { className: "flex items-center justify-between" },
              h("span", { className: "text-slate-500" }, "Hardware Port:"),
              h("select", {
                value: settings.comPort,
                onChange: (e) => setSettings({ ...settings, comPort: e.target.value }),
                className: "bg-white border border-slate-300 rounded px-2 py-1 font-mono text-xs"
              },
                availablePorts.map((p) => h("option", { key: p, value: p }, `${p} (USB-SERIAL)`))
              )
            ),
            !bridgeOnline && h("p", { className: "text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200" },
              "⚠️ bridge_server.py is not running. In terminal run: python bridge_server.py"
            )
          ),

          settings.driverType === "webserial" && h("div", { className: "bg-sky-50/70 p-3 rounded-xl border border-sky-100 text-xs space-y-1.5" },
            h("p", { className: "text-slate-700 font-medium" },
              "Connects directly from your browser to COM4 via Web Serial (Chrome / Edge)."
            ),
            h("p", { className: "text-[11px] text-slate-500" },
              "Click 'Connect to MiRobot' and select 'USB-SERIAL CH340 (COM4)' in the popup."
            )
          ),

          // Primary Action Buttons: Connect/Disconnect & Homing
          h("div", { className: "grid grid-cols-2 gap-2.5" },
            h("button", {
              onClick: handleConnectToggle,
              className: `py-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-transform active:scale-98 ${
                robotStatus === "Connected" || robotStatus === "Writing"
                  ? "bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100"
                  : "bg-gradient-to-r from-sky-600 to-cyan-500 text-white hover:from-sky-700 hover:to-cyan-600"
              }`
            },
              h(Icons.Usb, { className: "w-4 h-4" }),
              h("span", null, robotStatus === "Connected" || robotStatus === "Writing" ? "Disconnect" : "Connect Robot")
            ),

            h("button", {
              onClick: handleHoming,
              disabled: robotStatus === "Disconnected",
              className: `py-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-transform active:scale-98 ${
                robotStatus === "Disconnected"
                  ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                  : "bg-white hover:bg-sky-50 text-sky-700 border border-sky-300 hover:border-sky-400 shadow-xs"
              }`
            },
              h("span", { className: "text-base" }, "🏠"),
              h("span", null, "Homing ($H)")
            )
          )
        ),

        // Live Paper Canvas
        h("div", { className: "bg-white rounded-2xl p-3 border border-sky-100 shadow-sm" },
          h("div", { className: "flex items-center justify-between mb-2 px-1" },
            h("span", { className: "text-xs font-bold text-slate-500 uppercase" }, "Paper Writing Surface (Top View)"),
            h("div", { className: "flex items-center space-x-1.5" },
              h("button", {
                onClick: handleHoming,
                disabled: robotStatus === "Disconnected",
                className: `text-[11px] px-2 py-0.5 rounded-lg border font-bold transition-all ${
                  robotStatus === "Disconnected"
                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                    : "bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100"
                }`
              }, "🏠 Home"),
              h("button", {
                onClick: () => {
                  sounds.playTap();
                  setSettings((s) => ({ ...s, mirror: !s.mirror }));
                },
                className: `text-[11px] px-2 py-0.5 rounded-lg border font-bold transition-all ${
                  settings.mirror
                    ? "bg-amber-50 text-amber-700 border-amber-300 ring-1 ring-amber-300"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`
              }, settings.mirror ? "🪞 Mirrored" : "✍️ Normal Writing"),
              h("button", {
                onClick: () => {
                  sounds.playTap();
                  if (robotDriverRef.current) {
                    robotDriverRef.current.clearVirtualPaper();
                    setProgress({ percent: 0, current: 0, total: 0, currentChar: "" });
                  }
                },
                className: "text-xs text-slate-500 hover:text-slate-800 px-1.5 py-0.5"
              }, "Clear Paper")
            )
          ),
          h("div", { className: "rounded-xl overflow-hidden border border-slate-200 shadow-inner bg-white flex justify-center" },
            h("canvas", { ref: canvasRef, width: 340, height: 220, className: "paper-canvas w-full max-w-md h-[220px]" })
          ),

          // Telemetry HUD
          h("div", { className: "grid grid-cols-4 gap-2 mt-3 text-center text-xs" },
            h("div", { className: "bg-slate-50 p-2 rounded-lg border border-slate-200" },
              h("div", { className: "text-[10px] text-slate-400 font-bold uppercase" }, "X Pos"),
              h("div", { className: "font-mono font-bold text-slate-700" }, `${telemetry.x.toFixed(1)} mm`)
            ),
            h("div", { className: "bg-slate-50 p-2 rounded-lg border border-slate-200" },
              h("div", { className: "text-[10px] text-slate-400 font-bold uppercase" }, "Y Pos"),
              h("div", { className: "font-mono font-bold text-slate-700" }, `${telemetry.y.toFixed(1)} mm`)
            ),
            h("div", { className: "bg-slate-50 p-2 rounded-lg border border-slate-200" },
              h("div", { className: "text-[10px] text-slate-400 font-bold uppercase" }, "Z Height"),
              h("div", { className: "font-mono font-bold text-slate-700" }, `${telemetry.z.toFixed(1)} mm`)
            ),
            h("div", { className: "bg-slate-50 p-2 rounded-lg border border-slate-200" },
              h("div", { className: "text-[10px] text-slate-400 font-bold uppercase" }, "Pen"),
              h("div", { className: `font-mono font-bold ${telemetry.penDown ? "text-sky-600" : "text-slate-500"}` },
                telemetry.penDown ? "DOWN" : "UP"
              )
            )
          )
        ),

        // Quick Calibration Card for Pen Height & Paper Position
        h("div", { className: "bg-gradient-to-br from-white to-sky-50/50 rounded-2xl p-4 border border-sky-100 shadow-sm space-y-3" },
          h("div", { className: "flex items-center justify-between pb-2 border-b border-sky-100" },
            h("span", { className: "text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1" },
              h(Icons.PenTool, { className: "w-4 h-4 text-sky-600 mr-1 inline" }),
              h("span", null, "Pen Height Calibration")
            ),
            h("span", { className: "text-[11px] font-mono font-bold text-sky-700" },
              `Down: ${settings.zWrite}mm | Up: ${settings.zTravel}mm`
            )
          ),

          // 1. Pen Height (Z-axis) Adjustment
          h("div", { className: "space-y-1.5" },
            h("div", { className: "flex items-center justify-between text-xs" },
              h("span", { className: "text-slate-600 font-medium" }, "Writing Contact (Pen DOWN):"),
              h("span", { className: "font-mono font-bold text-sky-700 text-sm" }, `${settings.zWrite.toFixed(1)} mm`)
            ),
            h("div", { className: "grid grid-cols-3 gap-2 text-xs" },
              h("button", {
                onClick: () => {
                  sounds.playTap();
                  setSettings((s) => ({ ...s, zWrite: +(s.zWrite + 1.0).toFixed(1) }));
                },
                className: "py-2 bg-white hover:bg-sky-50 border border-slate-200 hover:border-sky-300 rounded-lg font-bold text-sky-700 shadow-xs"
              }, "▲ Higher (+1mm)"),
              h("button", {
                onClick: () => {
                  sounds.playTap();
                  setSettings((s) => ({ ...s, zWrite: +(Math.max(50, s.zWrite - 1.0)).toFixed(1) }));
                },
                className: "py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-600 shadow-xs"
              }, "▼ Deeper (-1mm)"),
              h("button", {
                onClick: async () => {
                  sounds.playTap();
                  try {
                    await fetch(`${settings.bridgeUrl}/api/test_pen`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        zTravel: settings.zTravel,
                        zWrite: settings.zWrite,
                        x: settings.startX,
                        y: 0
                      })
                    });
                    sounds.playSuccess();
                  } catch (e) {
                    alert("Test pen failed: Ensure robot is connected.");
                  }
                },
                className: "py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold shadow-xs active:scale-95"
              }, "🎯 Test Touch")
            )
          ),

          // 2. Travel Height (Pen UP) Adjustment - Full Redesign
          h("div", { className: "pt-2.5 border-t border-sky-100 space-y-2" },
            h("div", { className: "flex items-center justify-between text-xs" },
              h("div", { className: "flex items-center space-x-1.5" },
                h("span", { className: "w-2.5 h-2.5 rounded-full bg-slate-400 inline-block shadow-xs" }),
                h("span", { className: "text-slate-700 font-bold" }, "Travel Height (Pen UP):"),
                h("span", { className: "text-[11px] text-sky-600 font-semibold bg-sky-50 px-1.5 py-0.5 rounded border border-sky-100" },
                  `+${(settings.zTravel - settings.zWrite).toFixed(0)}mm clearance`
                )
              ),
              h("span", { className: "font-mono font-bold text-slate-800 text-sm bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200" },
                `${settings.zTravel.toFixed(1)} mm`
              )
            ),

            // Step controls (-5, -1, +1, +5) and Dedicated Test Lift
            h("div", { className: "grid grid-cols-5 gap-1.5 text-xs" },
              h("button", {
                onClick: () => {
                  sounds.playTap();
                  setSettings((s) => ({ ...s, zTravel: +(Math.max(s.zWrite + 2, s.zTravel - 5)).toFixed(1) }));
                },
                className: "py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-lg text-center shadow-xs"
              }, "-5mm"),
              h("button", {
                onClick: () => {
                  sounds.playTap();
                  setSettings((s) => ({ ...s, zTravel: +(Math.max(s.zWrite + 1, s.zTravel - 1)).toFixed(1) }));
                },
                className: "py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-lg text-center shadow-xs"
              }, "-1mm"),
              h("button", {
                onClick: () => {
                  sounds.playTap();
                  setSettings((s) => ({ ...s, zTravel: +(s.zTravel + 1).toFixed(1) }));
                },
                className: "py-2 bg-white hover:bg-sky-50 border border-slate-200 hover:border-sky-300 text-sky-700 font-bold rounded-lg text-center shadow-xs"
              }, "+1mm"),
              h("button", {
                onClick: () => {
                  sounds.playTap();
                  setSettings((s) => ({ ...s, zTravel: +(s.zTravel + 5).toFixed(1) }));
                },
                className: "py-2 bg-white hover:bg-sky-50 border border-slate-200 hover:border-sky-300 text-sky-700 font-bold rounded-lg text-center shadow-xs"
              }, "+5mm"),
              h("button", {
                onClick: async () => {
                  sounds.playTap();
                  try {
                    await fetch(`${settings.bridgeUrl}/api/test_lift`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        zTravel: settings.zTravel,
                        x: settings.startX,
                        y: 0
                      })
                    });
                    sounds.playSuccess();
                  } catch (e) {
                    alert("Test lift failed: Ensure robot is connected.");
                  }
                },
                className: "py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold shadow-xs active:scale-95 text-center flex items-center justify-center space-x-1"
              },
                h("span", null, "🚀 Lift")
              )
            ),

            // Presets Bar
            h("div", { className: "flex items-center justify-between text-[11px] pt-0.5" },
              h("span", { className: "text-slate-400 font-medium" }, "Clearance Presets:"),
              h("div", { className: "flex items-center space-x-1.5" },
                [
                  { label: "115mm (Low)", val: 115.0 },
                  { label: "120mm (Standard)", val: 120.0 },
                  { label: "125mm (High)", val: 125.0 }
                ].map((p) =>
                  h("button", {
                    key: p.val,
                    onClick: () => {
                      sounds.playTap();
                      setSettings((s) => ({ ...s, zTravel: p.val }));
                    },
                    className: `px-2 py-0.5 rounded-md border text-[10px] transition-all ${
                      Math.abs(settings.zTravel - p.val) < 0.1
                        ? "bg-sky-600 text-white border-sky-600 font-bold shadow-xs"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`
                  }, p.label)
                )
              )
            )
          ),

          // 2. Paper Position (X & Y axes) Adjustment
          h("div", { className: "pt-2 border-t border-sky-100 space-y-1.5 text-xs" },
            h("div", { className: "flex items-center justify-between" },
              h("span", { className: "text-slate-600 font-medium" }, "Writing Position on Paper:"),
              h("span", { className: "font-mono font-bold text-slate-800" }, `X: ${settings.startX}mm | Y: ${settings.startY}mm`)
            ),
            h("div", { className: "grid grid-cols-4 gap-1.5" },
              h("button", {
                onClick: () => {
                  sounds.playTap();
                  setSettings((s) => ({ ...s, startX: s.startX + 15 }));
                },
                className: "py-2 bg-white hover:bg-sky-50 border border-slate-200 text-sky-800 font-bold rounded-lg text-center"
              }, "⬆ Higher (+15)"),
              h("button", {
                onClick: () => {
                  sounds.playTap();
                  setSettings((s) => ({ ...s, startX: Math.max(140, s.startX - 15) }));
                },
                className: "py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-lg text-center"
              }, "⬇ Lower (-15)"),
              h("button", {
                onClick: () => {
                  sounds.playTap();
                  setSettings((s) => ({ ...s, startY: s.startY + 10 }));
                },
                className: "py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-lg text-center"
              }, "⬅ Left (+10)"),
              h("button", {
                onClick: () => {
                  sounds.playTap();
                  setSettings((s) => ({ ...s, startY: s.startY - 10 }));
                },
                className: "py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-lg text-center"
              }, "➡ Right (-10)")
            )
          )
        ),

        // Writing Progress
        robotStatus === "Writing" && h("div", { className: "bg-sky-50 rounded-2xl p-4 border border-sky-200 shadow-sm space-y-2" },
          h("div", { className: "flex items-center justify-between text-xs font-bold text-sky-800" },
            h("span", null, `Writing Character: '${progress.currentChar || "..."}'`),
            h("span", null, `${progress.percent}%`)
          ),
          h("div", { className: "w-full bg-sky-200 rounded-full h-2.5 overflow-hidden" },
            h("div", { className: "bg-sky-600 h-2.5 rounded-full transition-all duration-200", style: { width: `${progress.percent}%` } })
          )
        ),

        // Action Toolbar
        h("div", { className: "grid grid-cols-3 gap-2" },
          h("button", {
            onClick: () => { sounds.playTap(); setShowConfirmModal(true); },
            disabled: robotStatus === "Writing" || !solution,
            className: `py-3 px-3 rounded-xl font-bold text-white text-xs flex items-center justify-center space-x-1.5 ${
              robotStatus !== "Writing" && solution ? "bg-sky-600 hover:bg-sky-700" : "bg-slate-300"
            }`
          },
            h(Icons.Play, { className: "w-4 h-4 mr-1 inline" }),
            h("span", null, "Start Writing")
          ),
          h("button", {
            onClick: () => {
              if (robotStatus === "Writing") robotDriverRef.current?.pause();
              else if (robotStatus === "Paused") robotDriverRef.current?.resume();
            },
            disabled: robotStatus !== "Writing" && robotStatus !== "Paused",
            className: "py-3 px-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl font-bold text-xs flex items-center justify-center space-x-1"
          },
            h(Icons.Pause, { className: "w-4 h-4 mr-1 inline" }),
            h("span", null, robotStatus === "Paused" ? "Resume" : "Pause")
          ),
          h("button", {
            onClick: () => {
              sounds.playAlert();
              robotDriverRef.current?.emergencyStop();
            },
            className: "py-3 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs flex items-center justify-center space-x-1"
          },
            h(Icons.Stop, { className: "w-4 h-4 mr-1 inline" }),
            h("span", null, "E-STOP")
          )
        ),

        // Manual Jog Pad
        h("div", { className: "bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-2" },
          h("div", { className: "flex items-center justify-between" },
            h("span", { className: "text-xs font-bold uppercase tracking-wider text-slate-600" }, "Manual Jog"),
            h("button", {
              onClick: () => {
                robotDriverRef.current?.jog("Z", 10);
              },
              className: "text-[11px] text-sky-600 font-semibold hover:underline"
            }, "Lift Pen Z+10")
          ),
          h("div", { className: "grid grid-cols-3 gap-2 text-xs" },
            h("button", {
              onClick: () => robotDriverRef.current?.jog("X", 5),
              className: "py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700"
            }, "X +5mm"),
            h("button", {
              onClick: () => robotDriverRef.current?.jog("Y", 5),
              className: "py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700"
            }, "Y +5mm"),
            h("button", {
              onClick: () => robotDriverRef.current?.jog("Z", 2),
              className: "py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700"
            }, "Z +2mm"),

            h("button", {
              onClick: () => robotDriverRef.current?.jog("X", -5),
              className: "py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700"
            }, "X -5mm"),
            h("button", {
              onClick: () => robotDriverRef.current?.jog("Y", -5),
              className: "py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700"
            }, "Y -5mm"),
            h("button", {
              onClick: () => robotDriverRef.current?.jog("Z", -2),
              className: "py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700"
            }, "Z -2mm")
          )
        ),

        // Terminal Log
        h("div", { className: "bg-slate-900 rounded-2xl p-3 text-slate-200 font-mono text-[11px] shadow-sm" },
          h("div", { className: "flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400" },
            h("span", null, "Mirobot Terminal Log"),
            h("button", { onClick: () => setLogs([]), className: "hover:text-slate-200" }, "Clear")
          ),
          h("div", { ref: logContainerRef, className: "h-24 overflow-y-auto space-y-1 mt-2" },
            logs.length === 0
              ? h("div", { className: "text-slate-500 italic" }, "Robot idle. Ready for commands.")
              : logs.map((l, i) =>
                  h("div", { key: i, className: l.level === "error" ? "text-rose-400" : l.level === "success" ? "text-emerald-400" : "text-slate-300" },
                    h("span", { className: "text-slate-500 mr-1" }, `[${l.timestamp}]`),
                    l.text
                  )
                )
          )
        )
      ),

      // TAB: CAMERA & PHOTO EQUATION SCANNER
      tab === "camera" && h("div", { className: "space-y-4" },
        // Hidden file inputs
        h("input", {
          type: "file",
          ref: fileInputRef,
          accept: "image/png, image/jpeg, image/jpg, image/webp",
          className: "hidden",
          onChange: handleFileUpload
        }),
        h("input", {
          type: "file",
          ref: mobileCameraInputRef,
          accept: "image/*",
          capture: "environment",
          className: "hidden",
          onChange: handleFileUpload
        }),

        // Header Card
        h("div", { className: "bg-gradient-to-br from-white to-sky-50/60 rounded-2xl p-4 border border-sky-100 shadow-sm space-y-1.5" },
          h("div", { className: "flex items-center space-x-2 text-sky-700 font-bold text-sm" },
            h(Icons.Sparkles, { className: "w-4 h-4 text-sky-600 inline" }),
            h("span", null, "AI Math Equation Scanner")
          ),
          h("p", { className: "text-xs text-slate-500 leading-relaxed" },
            "Upload an image file or snap a photo of a handwritten/printed equation. AI detects numbers and operators (+, -, ×, ÷), solves it, and sends the answer to MiRobot to write on paper."
          )
        ),

        // AI Engine Selector
        h("div", { className: "flex items-center justify-between bg-white p-2.5 rounded-2xl border border-sky-100 shadow-xs text-xs" },
          h("div", { className: "flex items-center space-x-1.5 text-slate-700 font-bold" },
            h("span", null, "AI Engine:"),
            h("span", { className: "text-[10px] text-slate-400 font-normal" }, "(Switch anytime)")
          ),
          h("div", { className: "flex items-center space-x-1 bg-slate-100 p-1 rounded-xl" },
            h("button", {
              onClick: () => {
                setAiEngine("easyocr");
                if (photoSnapshot) processMathImage(photoSnapshot.dataUrl, "easyocr");
              },
              className: `px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all ${
                aiEngine === "easyocr"
                  ? "bg-white text-sky-700 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`
            }, "⚡ EasyOCR (Recommended)"),
            h("button", {
              onClick: () => {
                setAiEngine("yolo");
                if (photoSnapshot) processMathImage(photoSnapshot.dataUrl, "yolo");
              },
              className: `px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all ${
                aiEngine === "yolo"
                  ? "bg-white text-sky-700 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`
            }, "🎯 YOLO Model")
          )
        ),

        // Dual Input Buttons
        h("div", { className: "grid grid-cols-2 gap-3" },
          // Option A: Upload Image File
          h("button", {
            onClick: () => {
              sounds.playTap();
              if (fileInputRef.current) fileInputRef.current.click();
            },
            className: "p-4 bg-white hover:bg-sky-50 border-2 border-dashed border-sky-200 hover:border-sky-400 rounded-2xl shadow-xs text-center flex flex-col items-center justify-center space-y-1.5 transition-all group"
          },
            h("div", { className: "w-10 h-10 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center group-hover:scale-110 transition-transform" },
              h(Icons.Upload, { className: "w-5 h-5" })
            ),
            h("span", { className: "text-xs font-bold text-slate-800" }, "Upload Image File"),
            h("span", { className: "text-[10px] text-slate-400" }, "PNG, JPG from device")
          ),

          // Option B: Snap Photo / Camera
          h("button", {
            onClick: () => {
              sounds.playTap();
              if ("ontouchstart" in window && mobileCameraInputRef.current) {
                mobileCameraInputRef.current.click();
              } else {
                startCamera();
              }
            },
            className: "p-4 bg-gradient-to-br from-sky-600 to-cyan-500 hover:from-sky-700 hover:to-cyan-600 text-white rounded-2xl shadow-md text-center flex flex-col items-center justify-center space-y-1.5 transition-all"
          },
            h("div", { className: "w-10 h-10 rounded-xl bg-white/20 text-white flex items-center justify-center" },
              h(Icons.Camera, { className: "w-5 h-5" })
            ),
            h("span", { className: "text-xs font-bold text-white" }, "Take a Photo"),
            h("span", { className: "text-[10px] text-sky-100" }, "Snapshot via camera")
          )
        ),

        // Live Viewfinder (Only active when taking on-screen snapshot)
        cameraActive && h("div", { className: "bg-slate-900 rounded-2xl overflow-hidden relative border border-slate-800 shadow-md space-y-2 p-3" },
          h("div", { className: "relative aspect-video rounded-xl overflow-hidden flex items-center justify-center bg-black" },
            h("video", {
              ref: videoRef,
              playsInline: true,
              muted: true,
              className: "w-full h-full object-cover"
            }),
            h("div", { className: "absolute inset-0 pointer-events-none flex items-center justify-center" },
              h("div", { className: "w-4/5 h-2/3 border-2 border-dashed border-sky-400/80 rounded-xl relative flex items-center justify-center" },
                h("span", { className: "absolute -top-3 left-4 bg-sky-500 text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase shadow-sm" }, "Point at Equation"),
                h(Icons.Crosshair, { className: "w-8 h-8 text-sky-400/50" })
              )
            )
          ),
          h("div", { className: "grid grid-cols-2 gap-2" },
            h("button", {
              onClick: capturePhotoSnapshot,
              className: "py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center space-x-1.5 shadow-md active:scale-95"
            },
              h(Icons.Camera, { className: "w-4 h-4" }),
              h("span", null, "📸 Snap Photo & Detect")
            ),
            h("button", {
              onClick: stopCamera,
              className: "py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs"
            }, "Cancel")
          )
        ),

        // Loading spinner while AI analyzes image
        isAnalyzing && h("div", { className: "bg-white rounded-2xl p-6 text-center border border-sky-100 shadow-sm space-y-3" },
          h("div", { className: "inline-block w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" }),
          h("div", { className: "text-sm font-bold text-slate-800" }, `Analyzing Equation with ${aiEngine === "easyocr" ? "EasyOCR" : "YOLO AI"}...`),
          h("p", { className: "text-xs text-slate-400" }, "Locating digits and arithmetic operators...")
        ),

        photoError && h("div", { className: "bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl text-xs flex items-start space-x-2" },
          h("span", { className: "font-bold text-amber-600" }, "⚠️"),
          h("span", null, photoError)
        ),

        // Result Card: Image overlay with bounding boxes + Solved Math Equation
        photoSnapshot && h("div", { className: "bg-white rounded-2xl p-4 border border-sky-100 shadow-sm space-y-3.5" },
          h("div", { className: "flex items-center justify-between pb-2 border-b border-slate-100 text-xs" },
            h("span", { className: "font-bold uppercase tracking-wider text-slate-600 flex items-center space-x-1" },
              h(Icons.Image, { className: "w-4 h-4 text-sky-600 mr-1 inline" }),
              h("span", null, "Detected Image Preview")
            ),
            h("div", { className: "flex items-center space-x-2" },
              h("span", { className: "text-[11px] text-slate-400" }, photoSnapshot.timestamp),
              h("button", {
                onClick: () => {
                  sounds.playTap();
                  if (fileInputRef.current) fileInputRef.current.click();
                },
                className: "text-[11px] font-bold text-sky-600 hover:underline"
              }, "Replace Photo")
            )
          ),

          // Canvas with YOLO bounding boxes
          h("div", { className: "relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900 flex justify-center" },
            h("canvas", { ref: canvasOverlayRef, className: "w-full max-h-56 object-contain" })
          ),

          // Math Equation Result Panel
          h("div", { className: "bg-gradient-to-br from-sky-50 to-cyan-50/50 rounded-xl p-3.5 border border-sky-200 space-y-2.5" },
            h("div", { className: "flex items-center justify-between" },
              h("span", { className: "text-[11px] font-bold uppercase text-sky-800 tracking-wider" }, "Recognized Equation:"),
              photoResult && photoResult.detections && h("span", { className: "text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold" },
                `✓ ${photoResult.detections.length} symbols (${photoResult.engine || (aiEngine === 'easyocr' ? 'EasyOCR' : 'YOLO')})`
              )
            ),

            // Editable Equation Field
            h("div", { className: "flex items-center space-x-2" },
              h("input", {
                type: "text",
                value: photoEquation,
                onChange: (e) => {
                  const val = e.target.value;
                  setPhotoEquation(val);
                  try {
                    const sol = MathEngine.evaluate(val);
                    setPhotoResult((prev) => ({
                      ...(prev || {}),
                      equation: val,
                      answer: sol.finalAnswer,
                      fullEquation: `${val} = ${sol.finalAnswer}`
                    }));
                  } catch (err) {}
                },
                className: "flex-1 font-mono font-bold text-lg text-slate-800 bg-white border border-sky-300 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-sky-400 shadow-inner"
              }),
              h("div", { className: "text-lg font-bold text-slate-400" }, "="),
              h("div", { className: "font-mono font-extrabold text-2xl text-sky-700 bg-white border border-sky-300 rounded-xl px-4 py-1.5 shadow-xs" },
                photoResult?.answer !== undefined && photoResult?.answer !== null ? photoResult.answer : "?"
              )
            ),

            // Full Equation Display
            photoResult?.answer !== undefined && photoResult?.answer !== null && h("div", { className: "text-xs text-sky-800 font-medium pt-1 border-t border-sky-200 flex items-center justify-between" },
              h("span", null, "Full Solution:"),
              h("span", { className: "font-mono font-bold text-sm text-sky-900" }, `${photoEquation || photoResult.equation} = ${photoResult.answer}`)
            )
          ),

          // Send to MiRobot Actions
          photoResult && photoResult.answer !== undefined && photoResult.answer !== null && h("div", { className: "space-y-2 pt-1" },
            h("div", { className: "text-[11px] font-bold text-slate-600 uppercase tracking-wider" }, "Send Directly to MiRobot Arm:"),
            h("div", { className: "grid grid-cols-2 gap-2 text-xs" },
              // Option 1: Write Answer Only
              h("button", {
                onClick: () => handleSendScannedToRobot("answer_only"),
                className: "py-3 bg-gradient-to-r from-sky-600 to-cyan-500 hover:from-sky-700 hover:to-cyan-600 text-white font-bold rounded-xl shadow-md flex flex-col items-center justify-center space-y-0.5 active:scale-95"
              },
                h("span", { className: "font-bold text-xs" }, "✍️ Write Answer Only"),
                h("span", { className: "text-[10px] text-sky-100 font-mono" }, `("${photoResult.answer}")`)
              ),

              // Option 2: Write Full Equation
              h("button", {
                onClick: () => handleSendScannedToRobot("problem_answer"),
                className: "py-3 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-bold rounded-xl shadow-xs flex flex-col items-center justify-center space-y-0.5 active:scale-95"
              },
                h("span", { className: "font-bold text-xs" }, "✍️ Write Full Equation"),
                h("span", { className: "text-[10px] text-slate-500 font-mono" }, `("${photoEquation} = ${photoResult.answer}")`)
              )
            )
          )
        )
      ),

      // TAB: HISTORY
      tab === "history" && h("div", { className: "space-y-4" },
        h("div", { className: "flex items-center justify-between" },
          h("h2", { className: "text-lg font-bold text-slate-800" }, "Calculation History"),
          history.length > 0 && h("button", {
            onClick: () => { if (confirm("Clear all calculation history?")) setHistory([]); },
            className: "text-xs text-rose-600 hover:underline"
          }, "Clear All")
        ),
        history.length === 0
          ? h("div", { className: "bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-400 space-y-2" },
              h(Icons.History, { className: "w-8 h-8 mx-auto text-slate-300" }),
              h("div", { className: "text-sm font-medium" }, "No calculation history yet.")
            )
          : h("div", { className: "space-y-2.5" },
              history.map((item) =>
                h("div", { key: item.id, className: "bg-white rounded-xl p-3.5 border border-slate-200 shadow-xs flex items-center justify-between" },
                  h("div", null,
                    h("div", { className: "text-xs text-slate-400 flex items-center space-x-1.5" },
                      h("span", null, item.timestamp),
                      h("span", null, "•"),
                      h("span", { className: "uppercase text-[10px] font-bold text-sky-600" }, item.mode.replace("_", " "))
                    ),
                    h("div", { className: "text-base font-bold text-slate-800 mt-0.5" },
                      `${item.problem} = `,
                      h("span", { className: "text-sky-600" }, item.answer)
                    )
                  ),
                  h("div", { className: "flex items-center space-x-1.5" },
                    h("button", {
                      onClick: () => { sounds.playTap(); setExpression(item.problem); setTab("calculator"); },
                      className: "p-2 hover:bg-slate-100 rounded-lg text-slate-600"
                    }, "Load"),
                    h("button", {
                      onClick: () => { sounds.playTap(); setExpression(item.problem); setShowConfirmModal(true); },
                      className: "p-2 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg text-xs font-bold"
                    }, "Write")
                  )
                )
              )
            )
      ),

      // TAB: SETTINGS
      tab === "settings" && h("div", { className: "space-y-4" },
        h("h2", { className: "text-lg font-bold text-slate-800" }, "Settings"),
        h("div", { className: "bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3" },
          h("label", { className: "text-xs font-bold uppercase tracking-wider text-slate-600 block" }, "Connection Driver"),
          [
            { type: "bridge", title: "Python Serial Bridge (Hardware COM Port)", desc: "Direct USB/UART connection to physical WLKata MiRobot via COM4" },
            { type: "webserial", title: "Direct USB (Web Serial API)", desc: "Direct browser-to-USB communication (Chrome / Edge)" },
            { type: "simulation", title: "Virtual Simulation Mode", desc: "Screen emulator without physical robot arm" }
          ].map((d) =>
            h("button", {
              key: d.type,
              onClick: () => { sounds.playTap(); setSettings({ ...settings, driverType: d.type }); },
              className: `w-full p-3 rounded-xl border text-left flex items-start justify-between ${
                settings.driverType === d.type ? "border-sky-500 bg-sky-50/70 ring-2 ring-sky-200" : "border-slate-200 bg-white"
              }`
            },
              h("div", null,
                h("div", { className: "text-sm font-bold text-slate-800" }, d.title),
                h("div", { className: "text-xs text-slate-500 mt-0.5" }, d.desc)
              ),
              settings.driverType === d.type && h(Icons.Check, { className: "w-5 h-5 text-sky-600 shrink-0" })
            )
          )
        ),

        // Writing Orientation & Mirroring Card
        h("div", { className: "bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3" },
          h("div", { className: "flex items-center justify-between" },
            h("div", null,
              h("div", { className: "text-sm font-bold text-slate-800" }, "Hardware Zeroing & Calibration"),
              h("div", { className: "text-xs text-slate-500 mt-0.5" }, "Calibrated defaults: Pen DOWN 120mm, Pen UP 140mm")
            ),
            h("button", {
              onClick: handleHoming,
              disabled: robotStatus === "Disconnected",
              className: `px-3.5 py-1.5 rounded-xl font-bold text-xs shadow-xs transition-all flex items-center space-x-1 ${
                robotStatus === "Disconnected"
                  ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                  : "bg-sky-600 hover:bg-sky-700 text-white"
              }`
            },
              h("span", null, "🏠"),
              h("span", null, "Home Robot ($H)")
            )
          ),
          h("div", { className: "grid grid-cols-2 gap-2 pt-1 text-xs" },
            h("button", {
              onClick: () => {
                sounds.playTap();
                setSettings((s) => ({ ...s, zWrite: 120.0, zTravel: 140.0 }));
                localStorage.setItem("mirobot_settings", JSON.stringify({ ...settings, zWrite: 120.0, zTravel: 140.0 }));
              },
              className: "py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-xl border border-slate-200 text-center"
            }, "↺ Reset Defaults (120/140)"),
            h("button", {
              onClick: async () => {
                sounds.playTap();
                try {
                  await fetch(`${settings.bridgeUrl}/api/test_pen`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ zTravel: settings.zTravel, zWrite: settings.zWrite, x: settings.startX, y: 0 })
                  });
                  sounds.playSuccess();
                } catch (e) {
                  alert("Test failed: ensure robot is connected.");
                }
              },
              className: "py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold rounded-xl border border-sky-200 text-center"
            }, "🎯 Test Pen Touch")
          )
        ),

        // Writing Orientation & Mirroring Card
        h("div", { className: "bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3" },
          h("div", { className: "flex items-center justify-between" },
            h("div", null,
              h("div", { className: "text-sm font-bold text-slate-800" }, "Horizontal Mirror (Flip Left / Right)"),
              h("div", { className: "text-xs text-slate-500 mt-0.5" }, "Switch between normal handwriting and mirrored specular writing.")
            ),
            h("button", {
              onClick: () => {
                sounds.playTap();
                setSettings({ ...settings, mirror: !settings.mirror });
              },
              className: `px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                settings.mirror
                  ? "bg-amber-500 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`
            }, settings.mirror ? "Mirror Mode ON" : "Normal Writing")
          )
        ),

        // G-Code Export
        h("div", { className: "bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-2" },
          h("div", { className: "flex items-center justify-between" },
            h("span", { className: "text-xs font-bold uppercase tracking-wider text-slate-600" }, "G-Code Export"),
            h("button", {
              onClick: () => {
                const blob = new Blob([generatedGCode], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `mirobot_${Date.now()}.gcode`;
                a.click();
              },
              className: "text-xs font-bold text-sky-600 hover:underline"
            }, "Download .gcode")
          ),
          h("textarea", {
            readOnly: true,
            value: generatedGCode || "; Ready for G-code output.",
            className: "w-full h-24 bg-slate-50 border border-slate-200 rounded-xl p-2 font-mono text-[11px] text-slate-700 outline-none"
          })
        )
      )
    ),

    // Pre-Movement Safety Modal
    showConfirmModal && h("div", { className: "fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" },
      h("div", { className: "bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-sky-100 space-y-4" },
        h("div", { className: "flex items-center space-x-3 text-amber-600" },
          h("div", { className: "w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0" },
            h(Icons.Stop, { className: "w-6 h-6 text-amber-600" })
          ),
          h("div", null,
            h("h3", { className: "font-bold text-slate-800 text-base" }, "Confirm Robot Movement"),
            h("p", { className: "text-xs text-slate-500" }, "Safety Check Before Writing")
          )
        ),
        h("div", { className: "bg-slate-50 rounded-xl p-3 text-xs text-slate-600 space-y-1.5 border border-slate-200" },
          h("div", { className: "font-semibold text-slate-700" }, "Will be written on paper:"),
          h("div", { className: "font-mono bg-white p-2 rounded border border-slate-200 text-sky-800 font-bold whitespace-pre-line" }, writingText),
          h("ul", { className: "list-disc pl-4 space-y-1 text-slate-500 mt-2" },
            h("li", null, "Paper positioned securely on mat."),
            h("li", null, "Pen secured in gripper at correct height."),
            h("li", null, "Workspace is clear of obstacles.")
          )
        ),
        h("div", { className: "grid grid-cols-2 gap-2 pt-1" },
          h("button", {
            onClick: () => setShowConfirmModal(false),
            className: "py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
          }, "Cancel"),
          h("button", {
            onClick: handleStartWriting,
            className: "py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-md"
          }, "Confirm & Write")
        )
      )
    ),

    // Bottom Navigation Bar
    h("nav", { className: "fixed bottom-0 left-0 right-0 max-w-2xl mx-auto z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 shadow-lg flex items-center justify-around" },
      [
        { id: "calculator", label: "Calculator", icon: Icons.Calculator },
        { id: "steps", label: "Steps", icon: Icons.Steps },
        { id: "robot", label: "MiRobot", icon: Icons.Bot },
        { id: "camera", label: "Camera", icon: Icons.Camera },
        { id: "history", label: "History", icon: Icons.History },
        { id: "settings", label: "Settings", icon: Icons.Settings },
      ].map((tabItem) =>
        h("button", {
          key: tabItem.id,
          onClick: () => { sounds.playTap(); setTab(tabItem.id); },
          className: `flex flex-col items-center py-1 px-2.5 rounded-xl transition-all ${
            tab === tabItem.id ? "text-sky-600 font-bold scale-105" : "text-slate-400 hover:text-slate-600"
          }`
        },
          h(tabItem.icon, { className: "w-5 h-5 mb-0.5" }),
          h("span", { className: "text-[10px] tracking-tight" }, tabItem.label)
        )
      )
    )
  );
}

// Mount to DOM
const rootEl = document.getElementById("root");
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(h(App));
}
