"""
MiRobot Math Controller - Local Bridge & Web Server
Serves the mobile web application and bridges browser commands to physical WLKata Mirobot via USB/UART Serial.
"""

import os
import sys
import re
import json
import time
import socket
import threading
from http.server import ThreadingHTTPServer as HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

try:
    import serial
    import serial.tools.list_ports
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False
    print("[WARNING] pyserial not found. Physical hardware bridge disabled (Simulation mode active).")

TELEMETRY_PATTERN = re.compile(
    r"<(\w+),Angle\(ABCDXYZ\):([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),"
    r"Cartesian coordinate\(XYZ RxRyRz\):([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),"
    r"Pump PWM:([-\d.]+),Valve PWM:([-\d.]+),Motion_MODE:([-\d.]+)>"
)

# OCR & Math AI Models (EasyOCR & YOLO)
EASYOCR_READER = None
YOLO_MODEL = None

try:
    import cv2
    import numpy as np
    import torch
    import easyocr

    use_gpu = torch.cuda.is_available()
    print(f"[EasyOCR] Initializing EasyOCR Reader (CUDA/GPU: {use_gpu})...")
    EASYOCR_READER = easyocr.Reader(['en'], gpu=use_gpu)
    print("[EasyOCR] Engine ready!")
except Exception as e:
    print(f"[EasyOCR] Notice: EasyOCR loading deferred or failed: {e}")

try:
    from ultralytics import YOLO

    candidate_paths = [
        os.path.join(os.path.dirname(__file__), "..", "Finalproject", "model", "best_l.pt"),
        os.path.join(os.path.dirname(__file__), "..", "Finalproject", "model", "best_s.pt"),
        os.path.join(os.path.dirname(__file__), "model", "best_l.pt"),
        os.path.abspath("Finalproject/model/best_l.pt")
    ]
    for cp in candidate_paths:
        abs_p = os.path.abspath(cp)
        if os.path.exists(abs_p):
            print(f"[YOLO] Loading math recognition model: {abs_p}")
            YOLO_MODEL = YOLO(abs_p)
            print(f"[YOLO] Model loaded! Classes: {YOLO_MODEL.names}")
            break
except Exception as e:
    print(f"[YOLO] Notice: YOLO model loading deferred or failed: {e}")


def recognize_with_easyocr(frame):
    global EASYOCR_READER
    h, w = frame.shape[:2]
    
    if EASYOCR_READER is None:
        try:
            import easyocr
            import torch
            EASYOCR_READER = easyocr.Reader(['en'], gpu=torch.cuda.is_available())
        except Exception as e:
            return {"success": False, "message": f"EasyOCR initialization error: {e}"}

    import cv2
    import numpy as np
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    raw_results = EASYOCR_READER.readtext(rgb)
    detections = []
    
    for bbox, text, conf in raw_results:
        t = str(text).strip()
        if not t:
            continue
        pts = np.array(bbox, dtype=np.float32)
        x1, y1 = float(pts[:, 0].min()), float(pts[:, 1].min())
        x2, y2 = float(pts[:, 0].max()), float(pts[:, 1].max())
        cx = float((x1 + x2) / 2)
        cy = float((y1 + y2) / 2)
        
        # Normalize operator characters within tokens
        clean_token = t.replace('X', '×').replace('x', '×').replace('*', '×')
        clean_token = clean_token.replace('/', '÷').replace(':', '÷')

        detections.append({
            "char": t,
            "normalized": clean_token,
            "conf": round(float(conf), 3),
            "cx": cx,
            "cy": cy,
            "x1": int(max(0, x1)),
            "y1": int(max(0, y1)),
            "x2": int(min(w, x2)),
            "y2": int(min(h, y2))
        })
        
    if not detections:
        return {
            "success": False,
            "message": "No text detected by EasyOCR. Ensure good lighting and clear contrast.",
            "detections": [],
            "width": w,
            "height": h
        }
        
    # Sort detections left to right
    detections.sort(key=lambda d: d["cx"])
    
    # Assemble equation string
    raw_combined = " ".join(d["normalized"] for d in detections)
    # Remove trailing = or ? (e.g., "12 + 5 =" -> "12 + 5")
    clean_eq = re.sub(r'[=?\s]+$', '', raw_combined).strip()
    # Format spaces around operators (+, -, ×, ÷)
    clean_eq = re.sub(r'([+\-×÷])', r' \1 ', clean_eq)
    clean_eq = re.sub(r'\s+', ' ', clean_eq).strip()

    # Calculate answer safely
    calc_expr = clean_eq.replace('×', '*').replace('÷', '/')
    calc_expr = re.sub(r'[^0-9+\-*/.()]', '', calc_expr)
    answer = None
    try:
        if calc_expr:
            ans_val = round(float(eval(calc_expr, {"__builtins__": None}, {})), 4)
            if ans_val.is_integer():
                answer = int(ans_val)
            else:
                answer = ans_val
    except Exception:
        answer = None
        
    return {
        "success": True,
        "engine": "EasyOCR",
        "equation": clean_eq,
        "answer": answer,
        "fullEquation": f"{clean_eq} = {answer}" if answer is not None else clean_eq,
        "detections": detections,
        "width": w,
        "height": h
    }


def recognize_with_yolo(frame):
    global YOLO_MODEL
    h, w = frame.shape[:2]
    
    if YOLO_MODEL is None:
        return {
            "success": False,
            "message": "YOLO model not loaded on server.",
            "width": w,
            "height": h
        }
    
    import numpy as np
    results = YOLO_MODEL(frame, conf=0.30, verbose=False)
    detections = []
    
    for r in results:
        # Check OBB (Oriented Bounding Boxes)
        if hasattr(r, 'obb') and r.obb is not None and len(r.obb) > 0:
            for obb in r.obb:
                conf = float(obb.conf[0])
                cls_id = int(obb.cls[0])
                name = YOLO_MODEL.names.get(cls_id, str(cls_id))
                xywhr = obb.xywhr[0].cpu().numpy()
                cx, cy = float(xywhr[0]), float(xywhr[1])
                pts = obb.xyxyxyxy[0].cpu().numpy() if hasattr(obb, 'xyxyxyxy') else []
                if len(pts):
                    x1 = float(np.min(pts[:, 0]))
                    y1 = float(np.min(pts[:, 1]))
                    x2 = float(np.max(pts[:, 0]))
                    y2 = float(np.max(pts[:, 1]))
                else:
                    bw, bh = float(xywhr[2]), float(xywhr[3])
                    x1, x2 = cx - bw / 2, cx + bw / 2
                    y1, y2 = cy - bh / 2, cy + bh / 2
                detections.append({
                    "char": name,
                    "conf": round(conf, 3),
                    "cx": cx,
                    "cy": cy,
                    "x1": int(max(0, x1)),
                    "y1": int(max(0, y1)),
                    "x2": int(min(w, x2)),
                    "y2": int(min(h, y2))
                })

        # Check standard 2D bounding boxes
        elif hasattr(r, 'boxes') and r.boxes is not None and len(r.boxes) > 0:
            for box in r.boxes:
                conf = float(box.conf[0])
                cls_id = int(box.cls[0])
                name = YOLO_MODEL.names.get(cls_id, str(cls_id))
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                detections.append({
                    "char": name,
                    "conf": round(conf, 3),
                    "cx": float((x1 + x2) / 2),
                    "cy": float((y1 + y2) / 2),
                    "x1": int(max(0, x1)),
                    "y1": int(max(0, y1)),
                    "x2": int(min(w, x2)),
                    "y2": int(min(h, y2))
                })

    if not detections:
        return {
            "success": False,
            "message": "No math characters detected by YOLO.",
            "detections": [],
            "width": w,
            "height": h
        }

    detections.sort(key=lambda d: d["cx"])

    char_map = {
        'X': '×',
        'x': '×',
        '*': '×',
        '%': '÷',
        '/': '÷',
        '+': '+',
        '-': '-'
    }
    
    mapped_chars = []
    for d in detections:
        c = d["char"]
        norm = char_map.get(c, c)
        d["normalized"] = norm
        mapped_chars.append(norm)

    raw_str = "".join(mapped_chars)
    display_expr = re.sub(r'([+\-×÷*/])', r' \1 ', raw_str)
    display_expr = re.sub(r'\s+', ' ', display_expr).strip()

    calc_expr = display_expr.replace('×', '*').replace('÷', '/')
    calc_expr = re.sub(r'[^0-9+\-*/.()]', '', calc_expr)
    
    answer = None
    try:
        if calc_expr:
            ans_val = round(float(eval(calc_expr, {"__builtins__": None}, {})), 4)
            if ans_val.is_integer():
                answer = int(ans_val)
            else:
                answer = ans_val
    except Exception:
        answer = None

    return {
        "success": True,
        "engine": "YOLO",
        "equation": display_expr,
        "answer": answer,
        "fullEquation": f"{display_expr} = {answer}" if answer is not None else display_expr,
        "detections": detections,
        "width": w,
        "height": h
    }


def recognize_equation_from_bytes(img_bytes, engine="easyocr"):
    import numpy as np
    import cv2
    
    np_arr = np.frombuffer(img_bytes, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if frame is None:
        return {"success": False, "message": "Failed to decode image bytes"}
    
    if engine.lower() == "yolo":
        return recognize_with_yolo(frame)
    
    # Default: EasyOCR (with automatic fallback to YOLO if EasyOCR yields 0 detections)
    res = recognize_with_easyocr(frame)
    if res.get("success"):
        return res
    
    if YOLO_MODEL is not None:
        yolo_res = recognize_with_yolo(frame)
        if yolo_res.get("success"):
            yolo_res["engine"] = "YOLO (Fallback)"
            return yolo_res
            
    return res


class MirobotHardwareBridge:
    def __init__(self):
        self.ser = None
        self.port = "COM4"
        self.baudrate = 115200
        self.is_connected = False
        self.lock = threading.Lock()
        
        # Telemetry
        self.state = "Disconnected"
        self.angles = {"J1": 0.0, "J2": 0.0, "J3": 0.0, "J4": 0.0, "J5": 0.0, "J6": 0.0}
        self.cartesian = {"X": 200.0, "Y": 0.0, "Z": 200.0, "Rx": 0.0, "Ry": 0.0, "Rz": 0.0}
        
        # Writing Job State
        self.is_writing = False
        self.write_cancelled = False
        self.write_progress = {
            "status": "idle",
            "percent": 0,
            "current": 0,
            "total": 0,
            "currentChar": ""
        }
        self.poll_thread = None

    def list_ports(self):
        if not SERIAL_AVAILABLE:
            return [{"port": "SIMULATION_PORT", "description": "Virtual Simulation Port"}]
        port_list = []
        for p in serial.tools.list_ports.comports():
            port_list.append({
                "port": p.device,
                "description": p.description,
                "is_ch340": "CH340" in p.description or "1A86" in p.hwid
            })
        return port_list

    def auto_detect_port(self):
        ports = self.list_ports()
        for p in ports:
            if p.get("is_ch340") or "USB" in p["description"] or p["port"] == "COM4":
                return p["port"]
        return ports[0]["port"] if ports else "COM4"

    def connect(self, port=None, baudrate=115200):
        if not port or port == "AUTO":
            port = self.auto_detect_port()

        with self.lock:
            try:
                if self.ser and self.ser.is_open:
                    self.ser.close()
                self.ser = serial.Serial(port, baudrate=baudrate, timeout=0.3)
                time.sleep(1.0)
                self.ser.reset_input_buffer()
                self.ser.reset_output_buffer()
                self.is_connected = True
                self.port = port
                self.baudrate = baudrate
                self.state = "Connected"
                
                # Release hold and unlock alarms
                self._clear_hold_and_unlock()
                self._query_telemetry_unlocked()
                
                if not self.poll_thread or not self.poll_thread.is_alive():
                    self.poll_thread = threading.Thread(target=self._poll_loop, daemon=True)
                    self.poll_thread.start()
                    
                return True, f"Connected to {port} at {baudrate} baud."
            except Exception as e:
                self.is_connected = False
                self.state = "Disconnected"
                err_msg = str(e)
                if "PermissionError" in err_msg or "Access is denied" in err_msg:
                    err_msg = f"Port {port} is busy or locked by another app. Ensure other Mirobot scripts are closed."
                return False, err_msg

    def disconnect(self):
        with self.lock:
            if self.ser and self.ser.is_open:
                try:
                    self.ser.close()
                except Exception:
                    pass
            self.ser = None
            self.is_connected = False
            self.state = "Disconnected"
            return True

    def _clear_hold_and_unlock(self):
        """Releases any GRBL feed holds (~) and unlocks alarms ($X)."""
        if not self.ser or not self.ser.is_open:
            return
        try:
            self.ser.write(b"~\r\n")
            self.ser.flush()
            time.sleep(0.05)
            self.ser.write(b"$X\r\n")
            self.ser.flush()
            time.sleep(0.05)
        except Exception:
            pass

    def _query_telemetry_unlocked(self):
        if not self.ser or not self.ser.is_open:
            return
        try:
            self.ser.write(b"?\r\n")
            self.ser.flush()
            time.sleep(0.04)
            resp = ""
            while self.ser.in_waiting > 0:
                resp += self.ser.readline().decode("utf-8", errors="ignore")
            
            if "<Hold" in resp:
                self.ser.write(b"~\r\n")
                self.ser.flush()

            m = TELEMETRY_PATTERN.search(resp)
            if m:
                self.state = m.group(1)
                self.angles["J4"] = float(m.group(2))
                self.angles["J5"] = float(m.group(3))
                self.angles["J6"] = float(m.group(4))
                self.angles["J1"] = float(m.group(6))
                self.angles["J2"] = float(m.group(7))
                self.angles["J3"] = float(m.group(8))

                self.cartesian["X"] = float(m.group(9))
                self.cartesian["Y"] = float(m.group(10))
                self.cartesian["Z"] = float(m.group(11))
        except Exception:
            pass

    def _poll_loop(self):
        while self.is_connected:
            time.sleep(0.35)
            if self.is_writing:
                continue
            with self.lock:
                self._query_telemetry_unlocked()

    def wait_until_idle(self, timeout=8.0):
        """Polls until Mirobot finishes physical movement and returns to 'Idle' state."""
        start = time.time()
        while self.is_connected and not self.write_cancelled:
            if time.time() - start > timeout:
                break
            with self.lock:
                if not self.ser or not self.ser.is_open:
                    break
                try:
                    self.ser.write(b"?\r\n")
                    self.ser.flush()
                    time.sleep(0.04)
                    resp = ""
                    while self.ser.in_waiting > 0:
                        resp += self.ser.readline().decode("utf-8", errors="ignore")
                    
                    if "<Hold" in resp:
                        self.ser.write(b"~\r\n")
                        self.ser.flush()
                    
                    m = TELEMETRY_PATTERN.search(resp)
                    if m:
                        self.state = m.group(1)
                        self.cartesian["X"] = float(m.group(9))
                        self.cartesian["Y"] = float(m.group(10))
                        self.cartesian["Z"] = float(m.group(11))
                    
                    if "<Idle" in resp:
                        return True
                except Exception:
                    break
            time.sleep(0.08)
        return True

    def send_gcode(self, cmd, wait_finish=True):
        if not self.is_connected or not self.ser:
            return "ERROR: Not connected"
        with self.lock:
            try:
                line = f"{cmd.strip()}\r\n".encode("utf-8")
                self.ser.write(line)
                self.ser.flush()
                time.sleep(0.03)
                resp = ""
                while self.ser.in_waiting > 0:
                    resp += self.ser.readline().decode("utf-8", errors="ignore")
            except Exception as e:
                return f"ERROR: {e}"

        if wait_finish:
            self.wait_until_idle(timeout=6.0)

        return resp.strip() or "ok"

    def emergency_stop(self):
        self.write_cancelled = True
        self.is_writing = False
        self.write_progress["status"] = "stopped"
        if self.ser and self.ser.is_open:
            with self.lock:
                try:
                    self.ser.write(b"!\r\n") # Hold motion
                    time.sleep(0.05)
                    self.ser.write(b"M20 G90 G00 Z145.0 F2000\r\n") # Raise pen safely above travel height (140mm)
                    self.ser.flush()
                except Exception:
                    pass

    def homing(self):
        if not self.is_connected or not self.ser:
            return False, "Robot is not connected."
        self._clear_hold_and_unlock()
        with self.lock:
            try:
                self.ser.write(b"$H\r\n")
                self.ser.flush()
                print("[Mirobot] Sent homing command ($H)")
            except Exception as e:
                return False, f"Homing failed: {e}"
        return True, "Homing ($H) started. Ensure robot arm area is clear."

    def start_writing_job(self, strokes, config):
        if self.is_writing:
            return False, "Another writing job is already in progress."
        if not self.is_connected:
            return False, "Robot is not connected."
        
        self.write_cancelled = False
        self.is_writing = True
        z_travel = float(config.get("zTravel", 140.0))
        self.write_progress = {
            "status": "writing",
            "percent": 0,
            "current": 0,
            "total": len(strokes),
            "currentChar": "",
            "x": self.cartesian.get("X", 200.0),
            "y": self.cartesian.get("Y", 0.0),
            "z": z_travel,
            "penDown": False
        }

        # Clear any holds first
        self._clear_hold_and_unlock()

        thread = threading.Thread(target=self._run_writing_thread, args=(strokes, config), daemon=True)
        thread.start()
        return True, "Writing job started."

    def _run_writing_thread(self, strokes, config):
        z_travel = float(config.get("zTravel", 140.0))
        z_write = float(config.get("zWrite", 120.0))
        travel_speed = int(config.get("travelSpeed", 2000))
        write_speed = int(config.get("writeSpeed", 800))

        print(f"[Mirobot] Starting write job: {len(strokes)} strokes | Pen Up Z={z_travel}mm | Pen Down Z={z_write}mm")

        # 1. Lift pen to travel height (140mm)
        self.write_progress["z"] = z_travel
        self.write_progress["penDown"] = False
        self.send_gcode(f"M20 G90 G00 Z{z_travel:.2f} F{travel_speed}", wait_finish=True)

        total = len(strokes)
        for i, stroke in enumerate(strokes):
            if self.write_cancelled:
                print("[Mirobot] Write job cancelled by user.")
                break

            self.write_progress["current"] = i + 1
            self.write_progress["percent"] = int(((i + 1) / total) * 100)
            self.write_progress["currentChar"] = stroke.get("char", "")

            pts = stroke.get("points", [])
            if not pts:
                continue

            start_pt = pts[0]
            rest_pts = pts[1:]

            # 1. Move to start with pen UP (Z=140)
            self.write_progress["x"] = float(start_pt[0])
            self.write_progress["y"] = float(start_pt[1])
            self.write_progress["z"] = z_travel
            self.write_progress["penDown"] = False
            self.send_gcode(f"M20 G90 G00 X{start_pt[0]:.2f} Y{start_pt[1]:.2f} F{travel_speed}", wait_finish=True)

            # 2. Lower pen onto paper (Z=120)
            self.write_progress["z"] = z_write
            self.write_progress["penDown"] = True
            self.send_gcode(f"M20 G90 G01 Z{z_write:.2f} F{write_speed}", wait_finish=True)

            # 3. Draw stroke points smoothly
            for pt in rest_pts:
                if self.write_cancelled:
                    break
                self.write_progress["x"] = float(pt[0])
                self.write_progress["y"] = float(pt[1])
                self.write_progress["z"] = z_write
                self.write_progress["penDown"] = True
                self.send_gcode(f"M20 G90 G01 X{pt[0]:.2f} Y{pt[1]:.2f} F{write_speed}", wait_finish=True)

            # 4. Lift pen after stroke back to travel height (Z=140)
            self.write_progress["z"] = z_travel
            self.write_progress["penDown"] = False
            self.send_gcode(f"M20 G90 G00 Z{z_travel:.2f} F{travel_speed}", wait_finish=True)

        # Park safely away from paper (Z=140)
        self.write_progress["z"] = z_travel
        self.write_progress["penDown"] = False
        self.send_gcode(f"M20 G90 G00 Z{z_travel:.2f} F{travel_speed}", wait_finish=True)
        self.send_gcode(f"M20 G90 G00 X200.00 Y0.00 F{travel_speed}", wait_finish=True)

        self.is_writing = False
        self.write_progress["status"] = "stopped" if self.write_cancelled else "completed"
        self.write_progress["percent"] = 100 if not self.write_cancelled else self.write_progress["percent"]
        print("[Mirobot] Write job finished successfully!")


# Global Bridge Instance
bridge = MirobotHardwareBridge()


class AppRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/ports":
            ports = bridge.list_ports()
            self._send_json({
                "ports": [p["port"] for p in ports],
                "detailed": ports,
                "autoPort": bridge.auto_detect_port(),
                "connected": bridge.is_connected,
                "port": bridge.port
            })
        elif path == "/api/status":
            self._send_json({
                "status": bridge.state,
                "connected": bridge.is_connected,
                "port": bridge.port,
                "cartesian": bridge.cartesian,
                "angles": bridge.angles,
                "isWriting": bridge.is_writing
            })
        elif path == "/api/write_progress":
            self._send_json(bridge.write_progress)
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            data = json.loads(body)
        except Exception:
            data = {}

        if path == "/api/connect":
            port = data.get("port")
            baud = int(data.get("baudrate", 115200))
            ok, msg = bridge.connect(port, baud)
            self._send_json({
                "success": ok,
                "message": msg,
                "connected": bridge.is_connected,
                "port": bridge.port,
                "cartesian": bridge.cartesian
            })

        elif path == "/api/disconnect":
            # Only disconnect if explicitly requested
            bridge.disconnect()
            self._send_json({"success": True, "message": "Disconnected"})

        elif path == "/api/command":
            cmd = data.get("command", "")
            resp = bridge.send_gcode(cmd)
            self._send_json({"success": True, "response": resp})

        elif path == "/api/home":
            ok, msg = bridge.homing()
            self._send_json({"success": ok, "message": msg})

        elif path == "/api/test_pen":
            z_travel = float(data.get("zTravel", 140.0))
            z_write = float(data.get("zWrite", 120.0))
            x = float(data.get("x", 200.0))
            y = float(data.get("y", 0.0))
            bridge._clear_hold_and_unlock()
            bridge.send_gcode(f"M20 G90 G00 Z{z_travel:.2f} F2000", wait_finish=True)
            bridge.send_gcode(f"M20 G90 G00 X{x:.2f} Y{y:.2f} F2000", wait_finish=True)
            bridge.send_gcode(f"M20 G90 G01 Z{z_write:.2f} F800", wait_finish=True)
            time.sleep(1.8)
            bridge.send_gcode(f"M20 G90 G00 Z{z_travel:.2f} F2000", wait_finish=True)
            self._send_json({"success": True, "message": f"Pen touched paper at Z={z_write}mm and lifted safely to Z={z_travel}mm."})

        elif path == "/api/test_lift":
            z_travel = float(data.get("zTravel", 140.0))
            x = float(data.get("x", 200.0))
            y = float(data.get("y", 0.0))
            bridge._clear_hold_and_unlock()
            bridge.send_gcode(f"M20 G90 G00 X{x:.2f} Y{y:.2f} F2000", wait_finish=True)
            bridge.send_gcode(f"M20 G90 G00 Z{z_travel:.2f} F2000", wait_finish=True)
            self._send_json({"success": True, "message": f"Pen lifted to Travel Height Z={z_travel}mm."})

        elif path == "/api/recognize_math":
            image_data = data.get("image", "")
            engine = data.get("engine", "easyocr")
            if not image_data:
                self._send_json({"success": False, "message": "No image data provided"})
                return

            try:
                if "," in image_data:
                    image_data = image_data.split(",", 1)[1]
                
                import base64
                img_bytes = base64.b64decode(image_data)
                result = recognize_equation_from_bytes(img_bytes, engine=engine)
                self._send_json(result)
            except Exception as e:
                self._send_json({"success": False, "message": f"Recognition error: {e}"})

        elif path == "/api/write_strokes":
            strokes = data.get("strokes", [])
            config = data.get("config", {})
            ok, msg = bridge.start_writing_job(strokes, config)
            self._send_json({"success": ok, "message": msg})

        elif path == "/api/stop":
            bridge.emergency_stop()
            self._send_json({"success": True, "message": "Emergency Stop Executed"})

        else:
            self.send_response(404)
            self.end_headers()

    def _send_json(self, payload):
        res = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(res)))
        self.end_headers()
        self.wfile.write(res)


def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP


def run_server(port=8000):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    server = HTTPServer(("0.0.0.0", port), AppRequestHandler)
    local_ip = get_local_ip()

    print("=" * 65)
    print(" [MiRobot] WLKata MiRobot Math Controller - Web & Hardware Bridge")
    print("=" * 65)
    print(f" -> Local Desktop URL : http://localhost:{port}")
    print(f" -> Smartphone Wi-Fi URL: http://{local_ip}:{port}")
    print("-" * 65)
    print(" (i) Open the Smartphone URL in your phone's browser to control")
    print("     the robot and monitor writing with your phone's camera!")
    print("=" * 65)

    # Automatically connect to Mirobot on startup
    auto_port = bridge.auto_detect_port()
    ok, msg = bridge.connect(auto_port)
    if ok:
        print(f" [+] Auto-connected to Mirobot on {auto_port}!")
    else:
        print(f" [-] Could not auto-connect: {msg}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        bridge.disconnect()
        server.server_close()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    run_server(port)
