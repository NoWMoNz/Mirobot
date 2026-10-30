import { MathEngine } from "./math_engine.js";
import { VectorFontGenerator } from "./vector_font.js";
import { SimulationDriver, PythonBridgeDriver, WifiWebSocketDriver } from "./robot_driver.js";
import { CameraModule } from "./camera_module.js";
import { sounds } from "./audio.js";

const { useState, useEffect, useRef, useMemo } = React;

export function App() {
  // Navigation
  const [tab, setTab] = useState("calculator"); // 'calculator' | 'steps' | 'robot' | 'camera' | 'history' | 'settings'

  // Calculator State
  const [expression, setExpression] = useState("25 × 4");
  const [solution, setSolution] = useState(null);
  const [calcError, setCalcError] = useState("");
  const [writingMode, setWritingMode] = useState("problem_answer"); // 'answer_only' | 'problem_answer' | 'full_steps'

  // History State
  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem("mirobot_calc_history");
      return saved ? JSON.parse(saved) : [
        {
          id: "hist_1",
          problem: "25 + 5",
          answer: 30,
          mode: "problem_answer",
          timestamp: "10:30 AM"
        },
        {
          id: "hist_2",
          problem: "15 × 3 + 12 ÷ 4",
          answer: 48,
          mode: "full_steps",
          timestamp: "11:15 AM"
        }
      ];
    } catch (e) {
      return [];
    }
  });

  // Settings State
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("mirobot_settings");
      return saved ? JSON.parse(saved) : {
        driverType: "simulation", // 'simulation' | 'bridge' | 'wifi'
        bridgeUrl: "http://localhost:8000",
        wifiUrl: "ws://192.168.4.1:8080",
        comPort: "COM4",
        zTravel: 24.0,
        zWrite: 10.5,
        travelSpeed: 2000,
        writeSpeed: 900,
        startX: 180,
        startY: -40,
        charWidth: 7,
        charHeight: 11,
        soundEnabled: true
      };
    } catch (e) {
      return {
        driverType: "simulation",
        bridgeUrl: "http://localhost:8000",
        wifiUrl: "ws://192.168.4.1:8080",
        comPort: "COM4",
        zTravel: 24.0,
        zWrite: 10.5,
        travelSpeed: 2000,
        writeSpeed: 900,
        startX: 180,
        startY: -40,
        charWidth: 7,
        charHeight: 11,
        soundEnabled: true
      };
    }
  });

  // Robot State
  const [robotStatus, setRobotStatus] = useState("Disconnected");
  const [telemetry, setTelemetry] = useState({
    x: 180.0,
    y: 0.0,
    z: 24.0,
    penDown: false,
    feedrate: 2000,
    angles: { j1: 0, j2: 15, j3: 35, j4: 0, j5: -45, j6: 0 }
  });
  const [progress, setProgress] = useState({ percent: 0, current: 0, total: 0, currentChar: "" });
  const [logs, setLogs] = useState([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [availablePorts, setAvailablePorts] = useState(["COM4"]);

  // Camera & CV State
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [facingMode, setFacingMode] = useState("environment");
  const [snapshot, setSnapshot] = useState(null);
  const [cvResult, setCvResult] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // References
  const robotDriverRef = useRef(null);
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const cameraModuleRef = useRef(new CameraModule());
  const logContainerRef = useRef(null);

  // Save history
  useEffect(() => {
    try {
      localStorage.setItem("mirobot_calc_history", JSON.stringify(history));
    } catch (e) {}
  }, [history]);

  // Save settings
  useEffect(() => {
    try {
      localStorage.setItem("mirobot_settings", JSON.stringify(settings));
      sounds.muted = !settings.soundEnabled;
    } catch (e) {}
  }, [settings]);

  // Initialize Robot Driver based on settings
  useEffect(() => {
    if (robotDriverRef.current) {
      robotDriverRef.current.disconnect().catch(() => {});
    }

    let driver;
    if (settings.driverType === "bridge") {
      driver = new PythonBridgeDriver(settings.bridgeUrl);
    } else if (settings.driverType === "wifi") {
      driver = new WifiWebSocketDriver(settings.wifiUrl);
    } else {
      driver = new SimulationDriver();
    }

    driver.on("status", (s) => setRobotStatus(s));
    driver.on("telemetry", (t) => setTelemetry(t));
    driver.on("progress", (p) => setProgress(p));
    driver.on("log", (l) => {
      setLogs((prev) => [...prev.slice(-150), l]);
    });

    robotDriverRef.current = driver;

    // Auto-connect simulation driver on startup
    if (settings.driverType === "simulation") {
      driver.connect().catch(() => {});
    }

    return () => {
      driver.disconnect().catch(() => {});
    };
  }, [settings.driverType, settings.bridgeUrl, settings.wifiUrl]);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Solve math problem on input change
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

  // Render icons using Lucide
  useEffect(() => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  });

  // Refresh COM ports from Python bridge if in bridge mode
  const fetchPorts = async () => {
    try {
      const resp = await fetch(`${settings.bridgeUrl}/api/ports`);
      const data = await resp.json();
      if (data.ports && data.ports.length > 0) {
        setAvailablePorts(data.ports);
      }
    } catch (e) {
      console.warn("Could not fetch COM ports:", e);
    }
  };

  // Connect/Disconnect toggle
  const toggleRobotConnection = async () => {
    sounds.playTap();
    const driver = robotDriverRef.current;
    if (!driver) return;

    if (robotStatus === "Connected" || robotStatus === "Writing") {
      await driver.disconnect();
    } else {
      try {
        if (settings.driverType === "bridge") {
          await driver.connect({ port: settings.comPort });
        } else if (settings.driverType === "wifi") {
          await driver.connect({ wsUrl: settings.wifiUrl });
        } else {
          await driver.connect();
        }
        sounds.playStart();
      } catch (err) {
        sounds.playAlert();
        alert(`Connection Failed: ${err.message}`);
      }
    }
  };

  // Calculate current payload text to write
  const writingText = useMemo(() => {
    return MathEngine.getWritingPayload(solution, writingMode);
  }, [solution, writingMode]);

  // Calculate strokes for current writing payload
  const currentStrokes = useMemo(() => {
    if (!writingText) return [];
    return VectorFontGenerator.textToStrokes(writingText, {
      startX: settings.startX,
      startY: settings.startY,
      charWidth: settings.charWidth,
      charHeight: settings.charHeight
    });
  }, [writingText, settings]);

  // Generated G-Code preview
  const generatedGCode = useMemo(() => {
    if (!currentStrokes.length) return "";
    return VectorFontGenerator.strokesToGCode(currentStrokes, {
      zTravel: settings.zTravel,
      zWrite: settings.zWrite,
      travelSpeed: settings.travelSpeed,
      writeSpeed: settings.writeSpeed
    });
  }, [currentStrokes, settings]);

  // Redraw virtual paper canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    // Background paper
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Subtle grid lines (ruled notebook style)
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    for (let y = 30; y < height; y += 24) {
      ctx.beginPath();
      ctx.moveTo(15, y);
      ctx.lineTo(width - 15, y);
      ctx.stroke();
    }

    // Left margin line (pink/red guideline)
    ctx.strokeStyle = "#fecdd3";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(35, 10);
    ctx.lineTo(35, height - 10);
    ctx.stroke();

    // Map robot coordinates (X: ~150-250, Y: -60 to 60) to canvas (0 to width, 0 to height)
    const mapCoords = (rx, ry) => {
      // Robot X maps to canvas Y; Robot Y maps to canvas X
      // Let startX (180) start at canvas left + 50
      const cx = 50 + (ry + 50) * 2.8;
      const cy = 40 + (230 - rx) * 2.6;
      return [cx, cy];
    };

    // If driver is SimulationDriver, draw accumulated ink lines
    if (robotDriverRef.current && robotDriverRef.current.drawnLines) {
      ctx.strokeStyle = "#0284c7";
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      robotDriverRef.current.drawnLines.forEach((line) => {
        const [p1x, p1y] = mapCoords(line.from[0], line.from[1]);
        const [p2x, p2y] = mapCoords(line.to[0], line.to[1]);
        ctx.beginPath();
        ctx.moveTo(p1x, p1y);
        ctx.lineTo(p2x, p2y);
        ctx.stroke();
      });
    }

    // Render ghost preview of strokes if not writing yet
    if (robotStatus !== "Writing" && currentStrokes.length > 0) {
      ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
      ctx.lineWidth = 1.5;
      currentStrokes.forEach((stroke) => {
        if (!stroke.points || stroke.points.length === 0) return;
        ctx.beginPath();
        stroke.points.forEach((pt, i) => {
          const [cx, cy] = mapCoords(pt[0], pt[1]);
          if (i === 0) ctx.moveTo(cx, cy);
          else ctx.lineTo(cx, cy);
        });
        ctx.stroke();
      });
    }

    // Draw active pen head / robot end-effector indicator
    const [penCx, penCy] = mapCoords(telemetry.x, telemetry.y);
    // Pen shadow
    ctx.beginPath();
    ctx.ellipse(penCx + 2, penCy + 4, 6, 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fill();

    // Pen tip
    ctx.beginPath();
    ctx.arc(penCx, penCy, telemetry.penDown ? 5.5 : 4, 0, Math.PI * 2);
    ctx.fillStyle = telemetry.penDown ? "#0284c7" : "#64748b";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Pen status badge on canvas
    ctx.fillStyle = telemetry.penDown ? "#0284c7" : "#94a3b8";
    ctx.font = "bold 10px monospace";
    ctx.fillText(telemetry.penDown ? "PEN DOWN" : "PEN UP", penCx + 10, penCy - 6);

  }, [telemetry, robotStatus, currentStrokes]);

  // Execute writing job
  const handleStartWriting = async () => {
    setShowConfirmModal(false);
    sounds.playStart();

    if (!solution) {
      alert("Please calculate a valid mathematical expression first.");
      return;
    }

    if (robotStatus === "Disconnected") {
      alert("Robot is disconnected. Please connect before writing.");
      setTab("robot");
      return;
    }

    // Save to history
    const historyItem = {
      id: "hist_" + Date.now(),
      problem: solution.problem,
      answer: solution.finalAnswer,
      mode: writingMode,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };
    setHistory((prev) => [historyItem, ...prev.slice(0, 49)]);

    // Switch to robot tab to watch
    setTab("robot");

    if (robotDriverRef.current instanceof SimulationDriver) {
      robotDriverRef.current.clearVirtualPaper();
    }

    try {
      const success = await robotDriverRef.current.writeStrokes(currentStrokes, {
        zTravel: settings.zTravel,
        zWrite: settings.zWrite,
        travelSpeed: settings.travelSpeed,
        writeSpeed: settings.writeSpeed
      });
      if (success) {
        sounds.playSuccess();
      }
    } catch (err) {
      sounds.playAlert();
      alert(`Writing error: ${err.message}`);
    }
  };

  // Emergency stop handler
  const handleEmergencyStop = () => {
    sounds.playAlert();
    if (robotDriverRef.current) {
      robotDriverRef.current.emergencyStop();
    }
  };

  // Keypad click handler
  const handleKeypadPress = (val) => {
    sounds.playTap();
    if (val === "C") {
      setExpression("");
    } else if (val === "BACKSPACE") {
      setExpression((prev) => prev.slice(0, -1));
    } else if (val === "=") {
      sounds.playCompute();
      if (solution) {
        setTab("steps");
      }
    } else {
      setExpression((prev) => prev + val);
    }
  };

  // Camera Management
  const startCamera = async () => {
    setCameraError("");
    try {
      await cameraModuleRef.current.startCamera(videoRef.current, facingMode);
      setCameraActive(true);
    } catch (err) {
      setCameraError(err.message || "Camera access failed");
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    cameraModuleRef.current.stopCamera();
    setCameraActive(false);
  };

  const switchCamera = async () => {
    sounds.playTap();
    try {
      await cameraModuleRef.current.switchCamera(videoRef.current);
      setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
    } catch (e) {
      alert("Camera switch unavailable on this device.");
    }
  };

  const captureSnapshot = () => {
    sounds.playTap();
    if (!videoRef.current) return;
    const snap = cameraModuleRef.current.captureSnapshot(videoRef.current);
    setSnapshot(snap);
    runCVVerification(snap);
  };

  const runCVVerification = (snap) => {
    if (!snap || !solution) return;
    setIsVerifying(true);
    setTimeout(() => {
      const result = CameraModule.verifyWriting(snap.canvas, solution.finalAnswer, solution.problem);
      setCvResult(result);
      setIsVerifying(false);
      if (result.isMatched) {
        sounds.playSuccess();
      } else {
        sounds.playAlert();
      }
    }, 450);
  };

  return (
    <div className="flex flex-col min-h-screen max-w-2xl mx-auto bg-slate-50 relative pb-20 shadow-2xl border-x border-slate-200">
      
      {/* 1. Header Bar */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-sky-100 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-400 flex items-center justify-center text-white shadow-md">
            <i data-lucide="bot" className="w-5 h-5"></i>
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800 leading-tight">MiRobot Math</h1>
            <p className="text-xs text-sky-600 font-medium">Smart Writing Controller</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Status Indicator */}
          <button
            onClick={() => setTab("robot")}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
              robotStatus === "Connected"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : robotStatus === "Writing"
                ? "bg-sky-50 text-sky-700 border-sky-300 animate-pulse"
                : robotStatus === "Paused"
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-slate-100 text-slate-600 border-slate-200"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                robotStatus === "Connected"
                  ? "bg-emerald-500"
                  : robotStatus === "Writing"
                  ? "bg-sky-500 animate-ping"
                  : robotStatus === "Paused"
                  ? "bg-amber-500"
                  : "bg-slate-400"
              }`}
            ></span>
            <span>{robotStatus}</span>
          </button>

          {/* Emergency Stop Button */}
          <button
            onClick={handleEmergencyStop}
            title="Emergency Stop"
            className="px-2.5 py-1 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-lg text-xs font-bold shadow-sm flex items-center space-x-1 transition-transform active:scale-95"
          >
            <i data-lucide="octagon-alert" className="w-3.5 h-3.5"></i>
            <span>STOP</span>
          </button>
        </div>
      </header>

      {/* 2. Main Content Body */}
      <main className="flex-1 p-4 overflow-y-auto">
        
        {/* TAB 1: CALCULATOR */}
        {tab === "calculator" && (
          <div className="space-y-4">
            
            {/* Display Screen */}
            <div className="bg-gradient-to-br from-white to-sky-50/50 rounded-2xl p-5 border border-sky-100 shadow-sm relative overflow-hidden">
              <div className="text-xs uppercase tracking-wider font-semibold text-slate-400 mb-1 flex items-center justify-between">
                <span>Problem Input</span>
                <span className="text-sky-600 font-mono text-[11px]">PEMDAS Engine</span>
              </div>

              {/* Expression input */}
              <input
                type="text"
                value={expression}
                onChange={(e) => setExpression(e.target.value)}
                placeholder="Enter formula e.g. 25 × 4"
                className="w-full text-2xl font-bold text-slate-800 bg-transparent outline-none tracking-wide"
              />

              {/* Real-time Calculation Result */}
              <div className="mt-4 pt-3 border-t border-sky-100 flex items-baseline justify-between">
                <span className="text-xs font-medium text-slate-500">Result</span>
                {calcError ? (
                  <span className="text-sm font-semibold text-rose-500 flex items-center space-x-1">
                    <i data-lucide="alert-circle" className="w-4 h-4 mr-1 inline"></i>
                    {calcError}
                  </span>
                ) : solution ? (
                  <span className="text-3xl font-extrabold text-sky-600 tracking-tight">
                    = {solution.finalAnswer}
                  </span>
                ) : (
                  <span className="text-sm text-slate-400">Ready</span>
                )}
              </div>
            </div>

            {/* Quick Math Presets */}
            <div className="flex space-x-2 overflow-x-auto pb-1 text-xs">
              {["25 + 5", "25 × 4", "150 ÷ 5", "(18 + 7) × 4", "99 - 45.5"].map((preset) => (
                <button
                  key={preset}
                  onClick={() => {
                    sounds.playTap();
                    setExpression(preset);
                  }}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:border-sky-300 hover:text-sky-600 rounded-full font-medium whitespace-nowrap shadow-xs transition-colors"
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Smart Keypad */}
            <div className="grid grid-cols-4 gap-2.5 pt-1">
              {[
                { label: "C", val: "C", cls: "bg-rose-50 text-rose-600 hover:bg-rose-100 border-rose-200 font-bold" },
                { label: "(", val: "(", cls: "bg-sky-50 text-sky-700 hover:bg-sky-100 border-sky-200 font-semibold" },
                { label: ")", val: ")", cls: "bg-sky-50 text-sky-700 hover:bg-sky-100 border-sky-200 font-semibold" },
                { label: "⌫", val: "BACKSPACE", cls: "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200 font-semibold" },

                { label: "7", val: "7", cls: "bg-white text-slate-800 hover:bg-slate-50 border-slate-200 font-bold" },
                { label: "8", val: "8", cls: "bg-white text-slate-800 hover:bg-slate-50 border-slate-200 font-bold" },
                { label: "9", val: "9", cls: "bg-white text-slate-800 hover:bg-slate-50 border-slate-200 font-bold" },
                { label: "÷", val: "÷", cls: "bg-sky-100 text-sky-800 hover:bg-sky-200 border-sky-300 font-bold text-xl" },

                { label: "4", val: "4", cls: "bg-white text-slate-800 hover:bg-slate-50 border-slate-200 font-bold" },
                { label: "5", val: "5", cls: "bg-white text-slate-800 hover:bg-slate-50 border-slate-200 font-bold" },
                { label: "6", val: "6", cls: "bg-white text-slate-800 hover:bg-slate-50 border-slate-200 font-bold" },
                { label: "×", val: "×", cls: "bg-sky-100 text-sky-800 hover:bg-sky-200 border-sky-300 font-bold text-xl" },

                { label: "1", val: "1", cls: "bg-white text-slate-800 hover:bg-slate-50 border-slate-200 font-bold" },
                { label: "2", val: "2", cls: "bg-white text-slate-800 hover:bg-slate-50 border-slate-200 font-bold" },
                { label: "3", val: "3", cls: "bg-white text-slate-800 hover:bg-slate-50 border-slate-200 font-bold" },
                { label: "−", val: "-", cls: "bg-sky-100 text-sky-800 hover:bg-sky-200 border-sky-300 font-bold text-xl" },

                { label: "0", val: "0", cls: "bg-white text-slate-800 hover:bg-slate-50 border-slate-200 font-bold" },
                { label: ".", val: ".", cls: "bg-white text-slate-800 hover:bg-slate-50 border-slate-200 font-bold text-lg" },
                { label: "^", val: "^", cls: "bg-sky-50 text-sky-700 hover:bg-sky-100 border-sky-200 font-bold" },
                { label: "+", val: "+", cls: "bg-sky-100 text-sky-800 hover:bg-sky-200 border-sky-300 font-bold text-xl" },
              ].map((k, idx) => (
                <button
                  key={idx}
                  onClick={() => handleKeypadPress(k.val)}
                  className={`calc-btn h-14 rounded-xl text-lg flex items-center justify-center border shadow-xs transition-all ${k.cls}`}
                >
                  {k.label}
                </button>
              ))}
            </div>

            {/* Action Row */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => {
                  sounds.playCompute();
                  if (solution) setTab("steps");
                }}
                disabled={!solution}
                className={`py-3.5 px-4 rounded-xl font-bold flex items-center justify-center space-x-2 border transition-all ${
                  solution
                    ? "bg-white text-sky-700 border-sky-200 hover:bg-sky-50 shadow-sm"
                    : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                }`}
              >
                <i data-lucide="list-ordered" className="w-5 h-5"></i>
                <span>View Steps</span>
              </button>

              <button
                onClick={() => {
                  sounds.playTap();
                  setShowConfirmModal(true);
                }}
                disabled={!solution}
                className={`py-3.5 px-4 rounded-xl font-bold text-white flex items-center justify-center space-x-2 shadow-md transition-all ${
                  solution
                    ? "bg-gradient-to-r from-sky-600 to-cyan-500 hover:from-sky-700 hover:to-cyan-600 active:scale-98"
                    : "bg-slate-300 cursor-not-allowed"
                }`}
              >
                <i data-lucide="pen-tool" className="w-5 h-5"></i>
                <span>Write on Paper</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: STEP-BY-STEP SOLUTIONS */}
        {tab === "steps" && (
          <div className="space-y-4">
            
            {/* Summary Banner */}
            <div className="bg-white rounded-2xl p-5 border border-sky-100 shadow-sm">
              <span className="text-xs uppercase font-bold text-sky-600 tracking-wider">Solution Breakdown</span>
              <h2 className="text-2xl font-bold text-slate-800 mt-1">
                {solution ? `${solution.problem} = ${solution.finalAnswer}` : "No Problem Solved"}
              </h2>
            </div>

            {/* Step-by-Step Cards */}
            {solution && solution.steps && (
              <div className="space-y-3">
                {solution.steps.map((st, i) => (
                  <div key={i} className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-xs flex items-start space-x-3">
                    <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500 uppercase">{st.action}</span>
                        {st.result !== "" && (
                          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                            Result: {st.result}
                          </span>
                        )}
                      </div>
                      <div className="text-base font-semibold text-slate-800 mt-1">
                        {st.subProblem}
                      </div>
                      {st.note && (
                        <p className="text-xs text-slate-500 mt-1 italic">{st.note}</p>
                      )}
                    </div>
                  </div>
                ))}

                {/* Final Answer Highlight */}
                <div className="bg-gradient-to-r from-sky-50 to-cyan-50 rounded-xl p-4 border border-sky-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs uppercase font-bold text-sky-700">Final Computed Answer</span>
                    <div className="text-3xl font-extrabold text-sky-800">{solution.finalAnswer}</div>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-md">
                    <i data-lucide="check" className="w-6 h-6"></i>
                  </div>
                </div>
              </div>
            )}

            {/* Writing Mode Selector */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                Choose Writing Style for MiRobot:
              </label>

              <div className="space-y-2">
                {[
                  {
                    id: "answer_only",
                    title: "Write Only Final Answer",
                    desc: `Output: Ans = ${solution?.finalAnswer || 0}`,
                    icon: "hash"
                  },
                  {
                    id: "problem_answer",
                    title: "Write Problem & Final Answer",
                    desc: `Output: ${solution?.problem || "25 + 5"} = ${solution?.finalAnswer || 30}`,
                    icon: "equal"
                  },
                  {
                    id: "full_steps",
                    title: "Write Complete Step-by-Step",
                    desc: `Outputs problem, sub-steps & final answer`,
                    icon: "file-text"
                  }
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => {
                      sounds.playTap();
                      setWritingMode(mode.id);
                    }}
                    className={`w-full p-3 rounded-xl border text-left flex items-center space-x-3 transition-all ${
                      writingMode === mode.id
                        ? "border-sky-500 bg-sky-50/60 ring-2 ring-sky-200"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        writingMode === mode.id ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <i data-lucide={mode.icon} className="w-4 h-4"></i>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-slate-800">{mode.title}</div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">{mode.desc}</div>
                    </div>
                    {writingMode === mode.id && (
                      <i data-lucide="check-circle" className="w-5 h-5 text-sky-600"></i>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Send to Robot Primary Button */}
            <button
              onClick={() => {
                sounds.playTap();
                setShowConfirmModal(true);
              }}
              className="w-full py-4 bg-gradient-to-r from-sky-600 to-cyan-500 hover:from-sky-700 hover:to-cyan-600 text-white font-bold rounded-2xl shadow-lg flex items-center justify-center space-x-2 transition-transform active:scale-98"
            >
              <i data-lucide="send" className="w-5 h-5"></i>
              <span>Send Writing Instructions to MiRobot</span>
            </button>
          </div>
        )}

        {/* TAB 3: MIROBOT CONTROLLER & LIVE CANVAS */}
        {tab === "robot" && (
          <div className="space-y-4">
            
            {/* Connection Card */}
            <div className="bg-white rounded-2xl p-4 border border-sky-100 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <i data-lucide="cpu" className="w-5 h-5 text-sky-600"></i>
                  <span className="font-bold text-slate-800 text-sm">
                    {settings.driverType === "simulation"
                      ? "Virtual MiRobot Simulator"
                      : settings.driverType === "bridge"
                      ? "Physical WLKata MiRobot (Bridge)"
                      : "Direct Wi-Fi Mirobot"}
                  </span>
                </div>
                <button
                  onClick={toggleRobotConnection}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs transition-colors ${
                    robotStatus === "Connected" || robotStatus === "Writing"
                      ? "bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200"
                      : "bg-emerald-600 text-white hover:bg-emerald-700"
                  }`}
                >
                  {robotStatus === "Connected" || robotStatus === "Writing" ? "Disconnect" : "Connect Robot"}
                </button>
              </div>

              {/* Hardware Port selection when in Bridge mode */}
              {settings.driverType === "bridge" && (
                <div className="mt-3 flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-500 font-medium">Serial Port:</span>
                    <select
                      value={settings.comPort}
                      onChange={(e) => setSettings({ ...settings, comPort: e.target.value })}
                      className="border border-slate-200 rounded px-2 py-1 bg-white font-mono"
                    >
                      {availablePorts.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={fetchPorts}
                    className="text-sky-600 hover:underline flex items-center space-x-1"
                  >
                    <i data-lucide="refresh-cw" className="w-3 h-3"></i>
                    <span>Refresh Ports</span>
                  </button>
                </div>
              )}
            </div>

            {/* Virtual Paper & Live Writing Canvas */}
            <div className="bg-white rounded-2xl p-3 border border-sky-100 shadow-sm">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-bold text-slate-500 uppercase flex items-center space-x-1">
                  <i data-lucide="square" className="w-3.5 h-3.5 text-sky-600"></i>
                  <span>Paper Surface (Top View)</span>
                </span>
                <button
                  onClick={() => {
                    sounds.playTap();
                    if (robotDriverRef.current instanceof SimulationDriver) {
                      robotDriverRef.current.clearVirtualPaper();
                    }
                  }}
                  className="text-xs text-slate-500 hover:text-slate-800 flex items-center space-x-1"
                >
                  <i data-lucide="eraser" className="w-3.5 h-3.5"></i>
                  <span>Clear Paper</span>
                </button>
              </div>

              {/* Canvas element */}
              <div className="rounded-xl overflow-hidden border border-slate-200 shadow-inner bg-white flex justify-center">
                <canvas
                  ref={canvasRef}
                  width={340}
                  height={220}
                  className="paper-canvas w-full max-w-md h-[220px]"
                ></canvas>
              </div>

              {/* Telemetry HUD */}
              <div className="grid grid-cols-4 gap-2 mt-3 text-center text-xs">
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/80">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">X Pos</div>
                  <div className="font-mono font-bold text-slate-700">{telemetry.x.toFixed(1)} mm</div>
                </div>
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/80">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Y Pos</div>
                  <div className="font-mono font-bold text-slate-700">{telemetry.y.toFixed(1)} mm</div>
                </div>
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/80">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Z Height</div>
                  <div className="font-mono font-bold text-slate-700">{telemetry.z.toFixed(1)} mm</div>
                </div>
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/80">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Pen</div>
                  <div className={`font-mono font-bold ${telemetry.penDown ? "text-sky-600" : "text-slate-500"}`}>
                    {telemetry.penDown ? "DOWN" : "UP"}
                  </div>
                </div>
              </div>
            </div>

            {/* Writing Job Status & Progress */}
            {robotStatus === "Writing" && (
              <div className="bg-gradient-to-r from-sky-50 to-blue-50 rounded-2xl p-4 border border-sky-200 shadow-sm space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-sky-800">
                  <span className="flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-sky-600 animate-ping"></span>
                    <span>Physically Writing Character: '{progress.currentChar || "..."}'</span>
                  </span>
                  <span>{progress.percent}%</span>
                </div>
                <div className="w-full bg-sky-200/60 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-sky-600 h-2.5 rounded-full transition-all duration-200"
                    style={{ width: `${progress.percent}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[11px] text-sky-700">
                  <span>Stroke {progress.current} of {progress.total}</span>
                  <span>Speed: {settings.writeSpeed} mm/min</span>
                </div>
              </div>
            )}

            {/* Control Actions */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => {
                  sounds.playTap();
                  setShowConfirmModal(true);
                }}
                disabled={robotStatus === "Writing" || !solution}
                className={`py-3 px-3 rounded-xl font-bold text-white text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-all ${
                  robotStatus !== "Writing" && solution
                    ? "bg-sky-600 hover:bg-sky-700"
                    : "bg-slate-300 cursor-not-allowed"
                }`}
              >
                <i data-lucide="play" className="w-4 h-4"></i>
                <span>Start Writing</span>
              </button>

              <button
                onClick={() => {
                  sounds.playTap();
                  if (robotStatus === "Writing") robotDriverRef.current?.pause();
                  else if (robotStatus === "Paused") robotDriverRef.current?.resume();
                }}
                disabled={robotStatus !== "Writing" && robotStatus !== "Paused"}
                className="py-3 px-3 bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5"
              >
                <i data-lucide={robotStatus === "Paused" ? "play-circle" : "pause"} className="w-4 h-4"></i>
                <span>{robotStatus === "Paused" ? "Resume" : "Pause"}</span>
              </button>

              <button
                onClick={handleEmergencyStop}
                className="py-3 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 shadow-sm"
              >
                <i data-lucide="octagon-alert" className="w-4 h-4"></i>
                <span>E-STOP</span>
              </button>
            </div>

            {/* Manual Jogging Section */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 block">
                Manual Jog & Calibration
              </span>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <button
                  onClick={() => robotDriverRef.current?.jog("X", 5)}
                  className="py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700"
                >
                  X +5mm
                </button>
                <button
                  onClick={() => robotDriverRef.current?.jog("Y", 5)}
                  className="py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700"
                >
                  Y +5mm
                </button>
                <button
                  onClick={() => robotDriverRef.current?.jog("Z", 2)}
                  className="py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700"
                >
                  Z +2mm (Up)
                </button>

                <button
                  onClick={() => robotDriverRef.current?.jog("X", -5)}
                  className="py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700"
                >
                  X -5mm
                </button>
                <button
                  onClick={() => robotDriverRef.current?.jog("Y", -5)}
                  className="py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700"
                >
                  Y -5mm
                </button>
                <button
                  onClick={() => robotDriverRef.current?.jog("Z", -2)}
                  className="py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700"
                >
                  Z -2mm (Down)
                </button>
              </div>
            </div>

            {/* Terminal Log */}
            <div className="bg-slate-900 rounded-2xl p-3 text-slate-200 font-mono text-[11px] shadow-sm">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400">
                <span>Mirobot Terminal Log</span>
                <button onClick={() => setLogs([])} className="hover:text-slate-200">Clear</button>
              </div>
              <div ref={logContainerRef} className="h-24 overflow-y-auto space-y-1 mt-2">
                {logs.length === 0 ? (
                  <div className="text-slate-500 italic">No logs yet. Robot idle.</div>
                ) : (
                  logs.map((l, i) => (
                    <div key={i} className={l.level === "error" ? "text-rose-400" : l.level === "success" ? "text-emerald-400" : "text-slate-300"}>
                      <span className="text-slate-500 mr-1">[{l.timestamp}]</span>
                      {l.text}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CAMERA MONITORING & CV VERIFICATION */}
        {tab === "camera" && (
          <div className="space-y-4">
            
            {/* Camera Viewport */}
            <div className="bg-slate-900 rounded-2xl overflow-hidden relative aspect-video border border-slate-800 shadow-md flex items-center justify-center">
              {/* Live Video Element */}
              <video
                ref={videoRef}
                playsInline
                muted
                className={`w-full h-full object-cover ${!cameraActive && "hidden"}`}
              ></video>

              {/* Offline / Placeholder screen */}
              {!cameraActive && (
                <div className="text-center p-6 text-slate-400 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-sky-400">
                    <i data-lucide="camera" className="w-6 h-6"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">Camera Feed Inactive</h3>
                    <p className="text-xs text-slate-400 mt-1">Tap below to open your smartphone camera.</p>
                  </div>
                </div>
              )}

              {/* Optical Overlay Target Guides (when camera is on) */}
              {cameraActive && (
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                  {/* Paper alignment bounding box */}
                  <div className="w-3/4 h-3/5 border-2 border-dashed border-sky-400/70 rounded-xl relative">
                    <span className="absolute -top-3 left-4 bg-sky-500 text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                      Paper Alignment Zone
                    </span>
                    <div className="absolute inset-0 flex items-center justify-center text-sky-400/40">
                      <i data-lucide="crosshair" className="w-8 h-8"></i>
                    </div>
                  </div>
                </div>
              )}

              {/* Floating Camera Control Buttons */}
              <div className="absolute bottom-3 right-3 flex space-x-2">
                {cameraActive && (
                  <button
                    onClick={switchCamera}
                    title="Switch Camera (Front/Back)"
                    className="p-2.5 bg-black/60 backdrop-blur-md text-white rounded-full hover:bg-black/80 transition-all active:scale-95"
                  >
                    <i data-lucide="refresh-cw" className="w-4 h-4"></i>
                  </button>
                )}
              </div>
            </div>

            {/* Camera Activation / Capture Bar */}
            <div className="grid grid-cols-2 gap-3">
              {!cameraActive ? (
                <button
                  onClick={startCamera}
                  className="col-span-2 py-3.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center justify-center space-x-2 shadow-sm"
                >
                  <i data-lucide="video" className="w-5 h-5"></i>
                  <span>Open Smartphone Camera</span>
                </button>
              ) : (
                <>
                  <button
                    onClick={captureSnapshot}
                    className="py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center space-x-2 shadow-sm active:scale-98"
                  >
                    <i data-lucide="camera" className="w-5 h-5"></i>
                    <span>Capture Snapshot</span>
                  </button>
                  <button
                    onClick={stopCamera}
                    className="py-3.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl flex items-center justify-center space-x-2"
                  >
                    <i data-lucide="video-off" className="w-5 h-5"></i>
                    <span>Turn Off</span>
                  </button>
                </>
              )}
            </div>

            {/* Error banner if permission denied */}
            {cameraError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-xs flex items-start space-x-2">
                <i data-lucide="alert-triangle" className="w-4 h-4 shrink-0 mt-0.5"></i>
                <span>{cameraError}</span>
              </div>
            )}

            {/* Computer Vision Verification Result Card */}
            {snapshot && (
              <div className="bg-white rounded-2xl p-4 border border-sky-100 shadow-sm space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center space-x-1.5">
                    <i data-lucide="scan" className="w-4 h-4 text-sky-600"></i>
                    <span>CV Optical Inspection Report</span>
                  </span>
                  <span className="text-[11px] text-slate-400">{snapshot.timestamp}</span>
                </div>

                <div className="relative rounded-xl overflow-hidden border border-slate-200">
                  <img src={snapshot.dataUrl} alt="Writing Snapshot" className="w-full object-cover max-h-48" />
                  
                  {/* Bounding box overlays */}
                  {cvResult && cvResult.boundingBoxes && (
                    <div className="absolute inset-0 pointer-events-none">
                      {cvResult.boundingBoxes.map((b, i) => (
                        <div
                          key={i}
                          style={{
                            left: `${(b.x / snapshot.width) * 100}%`,
                            top: `${(b.y / snapshot.height) * 100}%`,
                            width: `${(b.width / snapshot.width) * 100}%`,
                            height: `${(b.height / snapshot.height) * 100}%`
                          }}
                          className="absolute border-2 border-emerald-400 bg-emerald-500/20 flex items-end justify-center"
                        >
                          <span className="bg-emerald-600 text-white font-mono text-[9px] px-1 py-0.5 rounded -mb-3 shadow-xs">
                            {b.char} ({Math.round(b.confidence * 100)}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Verification result details */}
                {isVerifying ? (
                  <div className="p-3 bg-sky-50 text-sky-800 rounded-xl text-xs flex items-center space-x-2">
                    <i data-lucide="loader" className="w-4 h-4 animate-spin text-sky-600"></i>
                    <span>Analyzing ink strokes & recognizing handwriting...</span>
                  </div>
                ) : cvResult ? (
                  <div
                    className={`p-3.5 rounded-xl border flex items-start space-x-3 ${
                      cvResult.isMatched
                        ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                        : "bg-amber-50 border-amber-200 text-amber-900"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        cvResult.isMatched ? "bg-emerald-600 text-white" : "bg-amber-600 text-white"
                      }`}
                    >
                      <i data-lucide={cvResult.isMatched ? "check-circle" : "alert-circle"} className="w-5 h-5"></i>
                    </div>
                    <div>
                      <div className="text-sm font-bold">
                        {cvResult.isMatched ? "Optical Verification Passed!" : "Discrepancy Detected"}
                      </div>
                      <div className="text-xs mt-0.5 opacity-90">{cvResult.summary}</div>
                      <div className="text-[11px] font-mono mt-1 font-semibold">
                        Expected: {cvResult.expected} | Match Score: {cvResult.matchPercentage}%
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: HISTORY */}
        {tab === "history" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Calculation History</h2>
              {history.length > 0 && (
                <button
                  onClick={() => {
                    if (confirm("Are you sure you want to clear all history?")) {
                      setHistory([]);
                    }
                  }}
                  className="text-xs text-rose-600 hover:underline flex items-center space-x-1"
                >
                  <i data-lucide="trash-2" className="w-3.5 h-3.5"></i>
                  <span>Clear All</span>
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-400 space-y-2">
                <i data-lucide="clock" className="w-8 h-8 mx-auto text-slate-300"></i>
                <div className="text-sm font-medium">No calculation history yet.</div>
                <p className="text-xs text-slate-400">Perform calculations in the Calculator tab to save history.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl p-3.5 border border-slate-200/90 shadow-xs flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs text-slate-400 flex items-center space-x-1.5">
                        <span>{item.timestamp}</span>
                        <span>•</span>
                        <span className="uppercase text-[10px] font-bold text-sky-600">
                          {item.mode.replace("_", " ")}
                        </span>
                      </div>
                      <div className="text-base font-bold text-slate-800 mt-0.5">
                        {item.problem} = <span className="text-sky-600">{item.answer}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      {/* Load into calculator */}
                      <button
                        onClick={() => {
                          sounds.playTap();
                          setExpression(item.problem);
                          setTab("calculator");
                        }}
                        title="Load into Calculator"
                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                      >
                        <i data-lucide="edit-3" className="w-4 h-4"></i>
                      </button>

                      {/* Resend to robot */}
                      <button
                        onClick={() => {
                          sounds.playTap();
                          setExpression(item.problem);
                          setWritingMode(item.mode || "problem_answer");
                          setShowConfirmModal(true);
                        }}
                        title="Resend to MiRobot"
                        className="p-2 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg transition-colors"
                      >
                        <i data-lucide="send" className="w-4 h-4"></i>
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => {
                          setHistory((prev) => prev.filter((h) => h.id !== item.id));
                        }}
                        title="Delete"
                        className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                      >
                        <i data-lucide="trash" className="w-4 h-4"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 6: SETTINGS */}
        {tab === "settings" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800">System & Robot Settings</h2>

            {/* Driver Mode */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                Robot Connection Mode
              </label>
              
              <div className="space-y-2">
                {[
                  {
                    type: "simulation",
                    title: "Virtual Simulation Mode (Default)",
                    desc: "Test motions & writing directly on screen without physical robot hardware"
                  },
                  {
                    type: "bridge",
                    title: "Python Serial Bridge (Hardware COM Port)",
                    desc: "Connects to physical WLKata Mirobot via local Python bridge (COM4)"
                  },
                  {
                    type: "wifi",
                    title: "Direct Wi-Fi / WebSocket",
                    desc: "Direct communication with Mirobot ESP32 Wi-Fi module"
                  }
                ].map((drv) => (
                  <button
                    key={drv.type}
                    onClick={() => {
                      sounds.playTap();
                      setSettings({ ...settings, driverType: drv.type });
                    }}
                    className={`w-full p-3 rounded-xl border text-left flex items-start space-x-3 transition-all ${
                      settings.driverType === drv.type
                        ? "border-sky-500 bg-sky-50/70 ring-2 ring-sky-200"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex-1">
                      <div className="text-sm font-bold text-slate-800">{drv.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{drv.desc}</div>
                    </div>
                    {settings.driverType === drv.type && (
                      <i data-lucide="check-circle" className="w-5 h-5 text-sky-600 shrink-0"></i>
                    )}
                  </button>
                ))}
              </div>

              {settings.driverType === "bridge" && (
                <div className="pt-2 border-t border-slate-100 text-xs space-y-2">
                  <label className="text-slate-600 font-semibold block">Bridge Server URL:</label>
                  <input
                    type="text"
                    value={settings.bridgeUrl}
                    onChange={(e) => setSettings({ ...settings, bridgeUrl: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-2 font-mono"
                  />
                </div>
              )}
            </div>

            {/* Pen Heights & Speed Calibration */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                Pen Kinematics & Speeds
              </label>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-slate-500 block mb-1">Pen Up Z (mm):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={settings.zTravel}
                    onChange={(e) => setSettings({ ...settings, zTravel: parseFloat(e.target.value) || 24 })}
                    className="w-full border border-slate-200 rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">Pen Write Z (mm):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={settings.zWrite}
                    onChange={(e) => setSettings({ ...settings, zWrite: parseFloat(e.target.value) || 10.5 })}
                    className="w-full border border-slate-200 rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">Writing Speed (mm/min):</label>
                  <input
                    type="number"
                    step="50"
                    value={settings.writeSpeed}
                    onChange={(e) => setSettings({ ...settings, writeSpeed: parseInt(e.target.value) || 800 })}
                    className="w-full border border-slate-200 rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">Travel Speed (mm/min):</label>
                  <input
                    type="number"
                    step="100"
                    value={settings.travelSpeed}
                    onChange={(e) => setSettings({ ...settings, travelSpeed: parseInt(e.target.value) || 2000 })}
                    className="w-full border border-slate-200 rounded-lg p-2 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* G-Code Export */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">G-Code Program</span>
                <button
                  onClick={() => {
                    const blob = new Blob([generatedGCode], { type: "text/plain" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `mirobot_${Date.now()}.gcode`;
                    a.click();
                  }}
                  disabled={!generatedGCode}
                  className="text-xs font-bold text-sky-600 hover:underline flex items-center space-x-1"
                >
                  <i data-lucide="download" className="w-3.5 h-3.5"></i>
                  <span>Export .gcode</span>
                </button>
              </div>
              <textarea
                readOnly
                value={generatedGCode || "; No calculation to generate G-code."}
                className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl p-2 font-mono text-[11px] text-slate-700 outline-none"
              ></textarea>
            </div>

            {/* Sound Toggle */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-slate-800">Futuristic Audio Cues</div>
                <div className="text-xs text-slate-500">Synthesized Web Audio sounds for taps & events</div>
              </div>
              <input
                type="checkbox"
                checked={settings.soundEnabled}
                onChange={(e) => setSettings({ ...settings, soundEnabled: e.target.checked })}
                className="w-5 h-5 accent-sky-600 cursor-pointer"
              />
            </div>
          </div>
        )}

      </main>

      {/* 3. Pre-Movement Safety Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-sky-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3 text-amber-600">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <i data-lucide="shield-alert" className="w-6 h-6"></i>
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-base">Confirm Robot Movement</h3>
                <p className="text-xs text-slate-500">Pre-Writing Safety Check</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 space-y-1.5 border border-slate-200">
              <div className="font-semibold text-slate-700">What will be written:</div>
              <div className="font-mono bg-white p-2 rounded border border-slate-200 text-sky-800 font-bold whitespace-pre-line">
                {writingText}
              </div>
              <ul className="list-disc pl-4 space-y-1 text-slate-500 mt-2">
                <li>Paper is positioned securely on the writing mat.</li>
                <li>Pen is secured in gripper at correct calibration height.</li>
                <li>Robot workspace is clear of hands and obstacles.</li>
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleStartWriting}
                className="py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center space-x-1"
              >
                <i data-lucide="play" className="w-4 h-4"></i>
                <span>Confirm & Write</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Bottom Navigation Bar (Mobile-first) */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-2xl mx-auto z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 shadow-lg flex items-center justify-around">
        {[
          { id: "calculator", label: "Calculator", icon: "calculator" },
          { id: "steps", label: "Steps", icon: "list-ordered" },
          { id: "robot", label: "MiRobot", icon: "bot" },
          { id: "camera", label: "Camera", icon: "camera" },
          { id: "history", label: "History", icon: "history" },
          { id: "settings", label: "Settings", icon: "settings" },
        ].map((tabItem) => (
          <button
            key={tabItem.id}
            onClick={() => {
              sounds.playTap();
              setTab(tabItem.id);
            }}
            className={`flex flex-col items-center py-1 px-2.5 rounded-xl transition-all ${
              tab === tabItem.id ? "text-sky-600 font-bold scale-105" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <i data-lucide={tabItem.icon} className="w-5 h-5 mb-0.5"></i>
            <span className="text-[10px] tracking-tight">{tabItem.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

// Render root
const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(React.createElement(App));
}

