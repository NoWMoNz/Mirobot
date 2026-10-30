# 🤖 MiRobot Math Controller

A modern, mobile-friendly web application and robotic writing controller for the **WLKata MiRobot** desktop robotic arm. 

Allows users to enter mathematical expressions on their smartphone, view step-by-step solutions, and physically command the robotic arm to write the calculations and answers on paper using a pen.

---

## 🌟 Key Features

### 1. Smart Mathematical Calculator
- **Full arithmetic support**: Addition (`+`), Subtraction (`−`), Multiplication (`×`), Division (`÷`), Exponents (`^`), Parentheses `()`.
- **Number types**: Decimal numbers, negative numbers, and large multi-step operations.
- **Instant evaluation**: Real-time PEMDAS calculation with instant syntax validation and division-by-zero protection.
- **Mobile-optimized touch keypad**: Large buttons, clear math symbols, quick formula presets, and full hardware keyboard support.

### 2. Step-by-Step Solutions
- **Detailed breakdown**: Explains each sub-step (e.g. parentheses evaluation, multiplication/division left-to-right, addition/subtraction).
- **Writing Style Selector**:
  1. *Write only final answer* (e.g., `Ans = 100`)
  2. *Write problem and final answer* (e.g., `25 × 4 = 100`)
  3. *Write complete step-by-step solution* (e.g., `25 × 4`, `S1: 25 × 4 = 100`, `= 100`)

### 3. MiRobot Writing & Kinematics Engine
- **Vector Stroke Font Engine**: Converts math symbols and digits into 2D continuous pen stroke trajectories.
- **WLKata G-Code Generator**: Generates standard Mirobot G-code (`M20 G90 G00/G01`) with configurable travel speeds and pen heights.
- **Interactive 2D Paper Canvas**: Top-down live simulator rendering the robotic arm pen, paper grid, and ink strokes in real-time.
- **Modular Communication Driver Architecture**:
  - `SimulationDriver`: Fully functional offline emulator with kinematics and drawing canvas (no physical hardware required).
  - `PythonBridgeDriver`: Connects to physical WLKata Mirobot via USB serial (`COM4` / 115200 baud).
  - `WifiWebSocketDriver`: Direct Wi-Fi connection to ESP32 / WebSocket wireless robot bridge.
- **Safety & Error Handling**: Pre-movement confirmation modal, live telemetry HUD (X, Y, Z, Pen Up/Down), progress tracking (% and stroke count), and prominent Emergency STOP button.

### 4. Smartphone Camera & Computer Vision Verification
- **Live Camera Stream**: Open rear or front smartphone camera to monitor the writing surface in real-time.
- **Alignment Guidelines**: Target bounding box overlay for paper orientation and pen centering.
- **Snapshot Capture**: Capture high-resolution photo of the finished written solution.
- **CV Answer Verification**: Scans captured paper photo, detects ink stroke bounding boxes, and compares recognized characters against expected mathematical answers with match confidence percentage!

### 5. Calculation History & Settings
- Automatically stores past calculations with timestamps and writing modes.
- Load previous calculations into the calculator or resend to MiRobot with a single tap.
- Configurable pen travel height (`Z_TRAVEL`), pen writing contact height (`Z_WRITE`), speeds, starting paper position, and G-code export (`.gcode`).

---

## 🚀 Quick Start Guide

### Option A: Launching via Python Server (Recommended for Smartphone & Hardware)

1. Open your terminal in the project directory:
   ```bash
   cd mirobot_math_controller
   ```
2. Start the bridge & web server:
   ```bash
   python bridge_server.py
   ```
3. The terminal will display:
   ```
   =================================================================
    🤖  WLKata MiRobot Math Controller - Web & Hardware Bridge
   =================================================================
    ▶ Local Desktop URL : http://localhost:8000
    ▶ Smartphone Wi-Fi URL: http://192.168.1.XX:8000
   -----------------------------------------------------------------
   ```
4. **On Desktop**: Open `http://localhost:8000` in Google Chrome, Edge, or Safari.
5. **On Smartphone**: Connect your phone to the same Wi-Fi network and open the **Smartphone Wi-Fi URL** (`http://192.168.1.XX:8000`) in your mobile browser.

---

### Option B: Standalone Web Mode (Zero Setup / Offline)

You can open `index.html` directly in any modern browser without running any commands. By default, it operates in **Virtual Simulation Mode**, allowing complete calculation, step-by-step display, virtual pen drawing simulation, and camera monitoring without needing Python or physical hardware!

---

## 📱 Smartphone Workflow Example

1. Open the website on your smartphone.
2. Tap `25`, `×`, `4` on the keypad.
3. The screen instantly evaluates the result: `= 100`.
4. Tap **"Write on Paper"** or view the **"Steps"** tab.
5. Select writing format: *"Write problem and final answer"* (`25 × 4 = 100`).
6. Tap **"Send Writing Instructions to MiRobot"**.
7. Confirm the pre-movement safety check.
8. The MiRobot receives the G-code and physically writes the formula onto the paper.
9. Switch to the **Camera** tab to watch the live writing process and verify the written result using Computer Vision!

---

## 🛠️ Project Structure

```
mirobot_math_controller/
├── index.html             # Responsive mobile-first single page app
├── bridge_server.py       # Python web server + PySerial WLKata Mirobot bridge
├── README.md              # Documentation
├── css/
│   └── styles.css         # Modern futuristic styles (white & light-blue theme)
└── js/
    ├── app.js             # React application logic and UI views
    ├── math_engine.js     # Expression parser, PEMDAS engine, step solver
    ├── vector_font.js     # Vector stroke glyph definitions & G-code generator
    ├── robot_driver.js    # Modular driver architecture (Sim, Serial, Wi-Fi)
    ├── camera_module.js   # MediaDevices camera & Computer Vision answer verifier
    └── audio.js           # Web Audio API futuristic sound effects
```

---

## 🔌 Integrating Physical Hardware

The controller is designed with a pluggable driver interface (`BaseRobotDriver`).
- **USB Serial (WLKata Mirobot default)**: Select *Python Serial Bridge* in the **Settings** or **MiRobot** tab, choose your COM port (e.g., `COM4`), and tap *Connect Robot*.
- **Wi-Fi / ESP32**: Select *Direct Wi-Fi / WebSocket*, enter your robot IP (e.g., `ws://192.168.4.1:8080`), and tap *Connect*.
- **Custom Hardware**: Extend `BaseRobotDriver` in `js/robot_driver.js` to adapt to any custom robotic arm or CNC plotter protocol.

