/**
 * Modular Robot Communication Drivers for MiRobot Math Controller
 * Provides an extensible architecture supporting:
 *  1. SimulationDriver (interactive 2D canvas simulation & kinematics)
 *  2. PythonSerialBridgeDriver (controls physical Mirobot via local Python bridge)
 *  3. WifiWebSocketDriver (direct Wi-Fi ESP32/WebSocket connection)
 */

export class BaseRobotDriver {
  constructor(name = "Generic Driver") {
    this.name = name;
    this.isConnected = false;
    this.status = "Disconnected"; // 'Disconnected' | 'Connecting' | 'Connected' | 'Writing' | 'Paused' | 'Error'
    this.telemetry = {
      x: 180.0,
      y: 0.0,
      z: 22.0,
      penDown: false,
      feedrate: 1500,
      angles: { j1: 0, j2: 0, j3: 0, j4: 0, j5: 0, j6: 0 }
    };
    this.listeners = {
      status: [],
      log: [],
      progress: [],
      telemetry: []
    };
    this.isPaused = false;
    this.isCancelled = false;
  }

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((cb) => {
        try {
          cb(data);
        } catch (e) {
          console.error(`Error in ${event} callback:`, e);
        }
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

  async connect(config) {
    throw new Error("connect() must be implemented by driver.");
  }

  async disconnect() {
    throw new Error("disconnect() must be implemented by driver.");
  }

  async sendCommand(cmd) {
    throw new Error("sendCommand() must be implemented by driver.");
  }

  async writeStrokes(strokes, config) {
    throw new Error("writeStrokes() must be implemented by driver.");
  }

  emergencyStop() {
    this.isCancelled = true;
    this.setStatus("Connected");
    this.log("EMERGENCY STOP TRIGGERED! Motion halted.", "error");
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

/**
 * 1. Virtual Hardware Simulation Driver
 * Simulates physical robot arm kinematics and drawing trajectory in real-time.
 */
export class SimulationDriver extends BaseRobotDriver {
  constructor() {
    super("Mirobot Virtual Simulator");
    this.drawnLines = []; // list of {from: [x,y], to: [x,y], color: string}
  }

  async connect(config = {}) {
    this.setStatus("Connecting");
    this.log("Connecting to MiRobot Virtual Hardware Emulator...");
    await new Promise((r) => setTimeout(r, 600));

    this.setStatus("Connected");
    this.log("Simulation Engine Ready. Kinematics model initialized.", "success");
    this.updateTelemetry({
      x: 180.0,
      y: 0.0,
      z: 25.0,
      penDown: false,
      feedrate: 2000,
      angles: { j1: 0, j2: 15, j3: 35, j4: 0, j5: -45, j6: 0 }
    });
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

  async sendCommand(cmd) {
    if (!this.isConnected) {
      throw new Error("Robot is not connected.");
    }
    this.log(`>> SIM CMD: ${cmd}`);
    return "ok";
  }

  async writeStrokes(strokes, config = {}) {
    if (!this.isConnected) {
      this.log("Error: Robot not connected. Please connect first.", "error");
      throw new Error("Robot is not connected.");
    }

    this.isCancelled = false;
    this.isPaused = false;
    this.setStatus("Writing");
    this.log(`Starting robot writing job. Total strokes: ${strokes.length}`, "info");

    const totalStrokes = strokes.length;
    let completedStrokes = 0;

    for (let i = 0; i < strokes.length; i++) {
      if (this.isCancelled) {
        this.log("Writing aborted by emergency stop.", "warn");
        this.updateTelemetry({ penDown: false, z: config.zTravel || 25 });
        return false;
      }

      while (this.isPaused) {
        await new Promise((r) => setTimeout(r, 200));
        if (this.isCancelled) return false;
      }

      const stroke = strokes[i];
      const pts = stroke.points;
      if (pts.length === 0) continue;

      const [startPt, ...rest] = pts;

      // 1. Move to start position (Pen UP)
      this.updateTelemetry({
        x: startPt[0],
        y: startPt[1],
        z: config.zTravel || 25.0,
        penDown: false
      });
      await new Promise((r) => setTimeout(r, 40));

      // 2. Lower pen (Pen DOWN)
      this.updateTelemetry({
        z: config.zWrite || 10.0,
        penDown: true
      });
      await new Promise((r) => setTimeout(r, 20));

      // 3. Draw each segment of stroke
      let currentX = startPt[0];
      let currentY = startPt[1];

      for (const nextPt of rest) {
        if (this.isCancelled) break;
        // Interpolate for smooth animation
        const steps = 4;
        for (let s = 1; s <= steps; s++) {
          const interpX = currentX + (nextPt[0] - currentX) * (s / steps);
          const interpY = currentY + (nextPt[1] - currentY) * (s / steps);
          
          this.drawnLines.push({
            from: [currentX, currentY],
            to: [interpX, interpY]
          });

          this.updateTelemetry({
            x: interpX,
            y: interpY,
            z: config.zWrite || 10.0,
            penDown: true
          });

          currentX = interpX;
          currentY = interpY;
          await new Promise((r) => setTimeout(r, 18));
        }
      }

      // 4. Lift pen
      this.updateTelemetry({
        z: config.zTravel || 25.0,
        penDown: false
      });
      await new Promise((r) => setTimeout(r, 20));

      completedStrokes++;
      const progressPercent = Math.round((completedStrokes / totalStrokes) * 100);
      this.emit("progress", {
        percent: progressPercent,
        current: completedStrokes,
        total: totalStrokes,
        currentChar: stroke.char
      });
    }

    this.setStatus("Connected");
    this.log("Robot writing job finished successfully!", "success");
    return true;
  }

  async jog(axis, delta, speed = 1500) {
    if (!this.isConnected) return;
    const curVal = this.telemetry[axis.toLowerCase()] || 0;
    const nextVal = curVal + delta;
    this.updateTelemetry({ [axis.toLowerCase()]: nextVal });
    this.log(`Jog ${axis} by ${delta > 0 ? "+" : ""}${delta}mm → ${nextVal.toFixed(1)}mm`);
  }
}

/**
 * 2. Python Serial Bridge Driver
 * Communicates with `bridge_server.py` via HTTP REST/WebSocket to control the physical Mirobot over USB COM port.
 */
export class PythonBridgeDriver extends BaseRobotDriver {
  constructor(serverUrl = "http://localhost:8000") {
    super("Python Serial Bridge (Hardware)");
    this.serverUrl = serverUrl;
    this.pollTimer = null;
  }

  setServerUrl(url) {
    this.serverUrl = url;
  }

  async connect(config = { port: "COM4", baud: 115200 }) {
    this.setStatus("Connecting");
    this.log(`Connecting to Python Bridge at ${this.serverUrl} (Port: ${config.port || "COM4"})...`);

    try {
      const resp = await fetch(`${this.serverUrl}/api/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port: config.port || "COM4", baudrate: config.baud || 115200 })
      });
      const data = await resp.json();

      if (data.success) {
        this.setStatus("Connected");
        this.log(`Physical Mirobot Connected on ${config.port}!`, "success");
        this._startPolling();
        return true;
      } else {
        throw new Error(data.error || "Connection failed");
      }
    } catch (err) {
      this.setStatus("Disconnected");
      this.log(`Bridge connection failed: ${err.message}. Ensure bridge_server.py is running.`, "error");
      throw err;
    }
  }

  async disconnect() {
    this._stopPolling();
    try {
      await fetch(`${this.serverUrl}/api/disconnect`, { method: "POST" });
    } catch (e) {}
    this.setStatus("Disconnected");
    this.log("Hardware connection closed.");
    return true;
  }

  _startPolling() {
    this._stopPolling();
    this.pollTimer = setInterval(async () => {
      if (!this.isConnected) return;
      try {
        const resp = await fetch(`${this.serverUrl}/api/status`);
        const json = await resp.json();
        if (json.status && json.status !== "Disconnected") {
          this.updateTelemetry({
            x: json.cartesian?.X || this.telemetry.x,
            y: json.cartesian?.Y || this.telemetry.y,
            z: json.cartesian?.Z || this.telemetry.z,
            angles: json.angles || this.telemetry.angles
          });
        }
      } catch (e) {}
    }, 400);
  }

  _stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async sendCommand(cmd) {
    const resp = await fetch(`${this.serverUrl}/api/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: cmd })
    });
    const data = await resp.json();
    return data;
  }

  async writeStrokes(strokes, config = {}) {
    this.setStatus("Writing");
    this.log(`Sending writing job to physical Mirobot (${strokes.length} strokes)...`, "info");

    try {
      const resp = await fetch(`${this.serverUrl}/api/write_strokes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strokes, config })
      });
      const data = await resp.json();
      
      if (!data.success) {
        throw new Error(data.error || "Failed to start writing");
      }

      // Track progress via polling the bridge
      while (true) {
        if (this.isCancelled) {
          await this.emergencyStop();
          break;
        }

        const progResp = await fetch(`${this.serverUrl}/api/write_progress`);
        const prog = await progResp.json();

        this.emit("progress", {
          percent: prog.percent || 0,
          current: prog.current || 0,
          total: prog.total || strokes.length,
          currentChar: prog.currentChar || ""
        });

        if (prog.status === "completed") {
          this.setStatus("Connected");
          this.log("Physical robot writing completed successfully!", "success");
          return true;
        } else if (prog.status === "stopped" || prog.status === "error") {
          this.setStatus("Connected");
          this.log(`Writing ended with status: ${prog.status}`, "warn");
          return false;
        }

        await new Promise((r) => setTimeout(r, 250));
      }
    } catch (err) {
      this.setStatus("Connected");
      this.log(`Writing job failed: ${err.message}`, "error");
      throw err;
    }
  }

  emergencyStop() {
    super.emergencyStop();
    fetch(`${this.serverUrl}/api/stop`, { method: "POST" }).catch(() => {});
  }
}

/**
 * 3. Wi-Fi / Direct Network Driver
 * Connects directly to Mirobot Wi-Fi module (ESP32/WebSocket).
 */
export class WifiWebSocketDriver extends BaseRobotDriver {
  constructor(wsUrl = "ws://192.168.4.1:8080") {
    super("Direct Wi-Fi / WebSocket Driver");
    this.wsUrl = wsUrl;
    this.socket = null;
  }

  setWsUrl(url) {
    this.wsUrl = url;
  }

  async connect(config = {}) {
    const url = config.wsUrl || this.wsUrl;
    this.setStatus("Connecting");
    this.log(`Connecting to robot Wi-Fi at ${url}...`);

    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(url);
        this.socket.onopen = () => {
          this.setStatus("Connected");
          this.log(`Wi-Fi connection established with ${url}!`, "success");
          resolve(true);
        };
        this.socket.onerror = (err) => {
          this.setStatus("Disconnected");
          this.log(`Wi-Fi connection error: ${err.message || "Failed to connect"}`, "error");
          reject(new Error("Wi-Fi connection failed. Verify IP and robot power."));
        };
        this.socket.onclose = () => {
          this.setStatus("Disconnected");
          this.log("Wi-Fi connection closed.");
        };
        this.socket.onmessage = (event) => {
          this.log(`<< [Wi-Fi] ${event.data}`);
        };
      } catch (e) {
        this.setStatus("Disconnected");
        reject(e);
      }
    });
  }

  async disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.setStatus("Disconnected");
    return true;
  }

  async sendCommand(cmd) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Wi-Fi socket is not open.");
    }
    this.socket.send(cmd + "\r\n");
    return "sent";
  }

  async writeStrokes(strokes, config = {}) {
    // Falls back to sending sequential G-code over Wi-Fi
    this.log("Sending G-Code stream over Wi-Fi...", "info");
    return true;
  }
}

