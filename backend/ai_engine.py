import os
import cv2
import time
import requests
import numpy as np
import uuid
import threading
import uvicorn
from fastapi import FastAPI, Request, Query
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ultralytics import YOLO
import torch
import supervision as sv

# -----------------------------------------------------------------------
# FASTAPI SETUP
# -----------------------------------------------------------------------
app = FastAPI(title="DroneGuard AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------
# CONFIGURATION
# -----------------------------------------------------------------------
NODE_API = "http://127.0.0.1:4000/api/webhook/detection"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CAPTURE_DIR = os.path.join(BASE_DIR, "public", "captures")
os.makedirs(CAPTURE_DIR, exist_ok=True)

MODEL_PATH = "best_latest.pt"
CONFIDENCE = 0.35
IOU_THRESH = 0.4
SWAP_CLASSES = True

# -----------------------------------------------------------------------
# GLOBAL STATE
# -----------------------------------------------------------------------
camera_sessions = {}
active_streams = {} 
stream_readers = {} 
last_alert_time = {}

# Global Lock
reader_lock = threading.Lock()

# Device Config
DEVICE = 0 if torch.cuda.is_available() else "cpu"
print(f"🚀 Using Device: {DEVICE}")

# -----------------------------------------------------------------------
# MODEL LOADING
# -----------------------------------------------------------------------
try:
    print(f"📥 Loading Model: {MODEL_PATH}")
    model = YOLO(MODEL_PATH)
    if DEVICE != "cpu":
        model.to("cuda")
    
    if SWAP_CLASSES:
        model.model.names = {0: "bird", 1: "drone"}
        print(f"🔄 Classes Swapped: {model.model.names}")
    
    CLASS_NAMES = model.model.names
    print(f"✅ Model Loaded Successfully")
except Exception as e:
    print(f"❌ Error loading model: {e}")
    model = None
    CLASS_NAMES = {}

os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;udp|timeout;5000"

# -----------------------------------------------------------------------
# PYDANTIC MODELS
# -----------------------------------------------------------------------
class TerminateRequest(BaseModel):
    cameraName: str

# -----------------------------------------------------------------------
# THREADED CAMERA CLASS (WITH FPS)
# -----------------------------------------------------------------------
class ThreadedCamera:
    def __init__(self, src, name):
        self.src = int(src) if str(src).isdigit() else src
        self.name = name
        self.stopped = False
        self.lock = threading.Lock()
        
        # FPS Tracking
        self.fps = 0.0
        self._frames_since_last_check = 0
        self._prev_time = time.time()
        
        # Initial Connection
        self.cap = self._open_camera()
        if self.cap:
             self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
             self.grabbed, self.frame = self.cap.read()
        else:
             self.grabbed = False
             self.frame = None

        self.last_read_time = time.time()

        # Start Thread
        self.t = threading.Thread(target=self.update, args=())
        self.t.daemon = True
        self.t.start()

    def _open_camera(self):
        if self.stopped: return None
        try:
            if isinstance(self.src, int):
                print(f"🔌 Opening Local Camera {self.src}...")
                return cv2.VideoCapture(self.src)
            else:
                print(f"🌐 Opening Network Stream...")
                return cv2.VideoCapture(self.src, cv2.CAP_FFMPEG)
        except Exception as e:
            print(f"❌ Cam Error: {e}")
            return None

    def update(self):
        while not self.stopped:
            if self.cap is None or not self.cap.isOpened():
                self._reconnect()
                continue

            try:
                grabbed, frame = self.cap.read()
                if grabbed:
                    with self.lock:
                        self.grabbed = grabbed
                        self.frame = frame
                        self.last_read_time = time.time()
                        
                        # Calculate FPS
                        self._frames_since_last_check += 1
                        now = time.time()
                        elapsed = now - self._prev_time
                        if elapsed >= 1.0:
                            self.fps = self._frames_since_last_check / elapsed
                            self._frames_since_last_check = 0
                            self._prev_time = now
                else:
                    self._reconnect()
            except Exception:
                self._reconnect()
                
            time.sleep(0.005)

    def _reconnect(self):
        if self.stopped: return
        self.fps = 0.0 # Reset FPS on disconnect

        if self.cap:
            self.cap.release()
        
        time.sleep(1)
        
        if self.stopped: return
        
        print(f"🔄 {self.name}: Reconnecting...")
        self.cap = self._open_camera()
        if self.cap:
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    def read(self):
        with self.lock:
            if self.stopped: return False, None
            if time.time() - self.last_read_time > 3.0:
                self.fps = 0.0 # Force 0 FPS if stale
                return False, None
            return self.grabbed, self.frame

    def stop(self):
        self.stopped = True
        if self.t.is_alive():
            self.t.join(timeout=1.0)
        if self.cap:
            self.cap.release()
        print(f"✅ CAMERA HARDWARE RELEASED: {self.name}")

# -----------------------------------------------------------------------
# HELPER FUNCTIONS
# -----------------------------------------------------------------------
def save_detection_image(frame, cam_name):
    unique_id = uuid.uuid4().hex[:8]
    filename = f"{cam_name.replace(' ', '_')}_{unique_id}.jpg"
    path = os.path.join(CAPTURE_DIR, filename)
    try:
        cv2.imwrite(path, frame)
    except: pass
    return filename

def send_alert_async(cam_name, detected_class, conf, xyxy, frame):
    def _send():
        label_text = str(detected_class).lower().strip()
        if "drone" not in label_text: return

        current_time = time.time()
        if cam_name in last_alert_time and (current_time - last_alert_time[cam_name] < 2): 
            return

        print(f"🚨 ALERT: {label_text} ({conf:.2f})")

        try:
            x1, y1, x2, y2 = map(int, xyxy)
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
            label = f"DRONE {conf:.2f}"
            cv2.putText(frame, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            
            image_filename = save_detection_image(frame, cam_name)
            
            payload = {
                "cameraName": cam_name,
                "detectedClass": "Drone",
                "confidence": float(conf),
                "image": image_filename
            }
            requests.post(NODE_API, json=payload, timeout=2)
            last_alert_time[cam_name] = current_time
        except Exception as e:
            print(f"⚠️ Alert Error: {e}")

    threading.Thread(target=_send, daemon=True).start()

def run_inference(frame):
    if model is None: return sv.Detections.empty(), []
    try:
        results = model.predict(frame, conf=CONFIDENCE, iou=IOU_THRESH, agnostic_nms=True, verbose=False, device=DEVICE)
        if not results: return sv.Detections.empty(), []
        r = results[0]
        detections = sv.Detections.from_ultralytics(r)
        class_names = [CLASS_NAMES.get(class_id, str(class_id)) for class_id in detections.class_id]
        return detections, class_names
    except:
        return sv.Detections.empty(), []

def get_reconnecting_frame():
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.putText(frame, "SIGNAL LOST", (200, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
    return frame

# -----------------------------------------------------------------------
# STREAM GENERATOR
# -----------------------------------------------------------------------
def generate_frames(source: str, cam_name: str, session_id: str):
    active_streams[cam_name] = True
    print(f"📷 STREAM REQUEST: {cam_name}")

    with reader_lock:
        if cam_name not in stream_readers or stream_readers[cam_name].stopped:
            stream_readers[cam_name] = ThreadedCamera(source, cam_name)

    camera = stream_readers[cam_name]
    
    box_annotator = sv.BoxAnnotator(thickness=2)
    label_annotator = sv.LabelAnnotator(text_scale=0.5, text_thickness=1)

    try:
        while True:
            if camera_sessions.get(cam_name) != session_id: break
            if not active_streams.get(cam_name, False): break

            grabbed, frame = camera.read()

            if not grabbed or frame is None:
                fail_frame = get_reconnecting_frame()
                ret, buffer = cv2.imencode(".jpg", fail_frame)
                yield (b"--frame\r\n" b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n")
                time.sleep(0.5)
                continue

            # MAX PERFORMANCE INFERENCE
            local_detections, local_names = run_inference(frame)
            
            if len(local_detections) > 0:
                for name, conf, xyxy in zip(local_names, local_detections.confidence, local_detections.xyxy):
                    send_alert_async(cam_name, name, conf, xyxy, frame.copy())
                
                frame = box_annotator.annotate(scene=frame, detections=local_detections)
                labels = [f"{name} {conf:.2f}" for name, conf in zip(local_names, local_detections.confidence)]
                frame = label_annotator.annotate(scene=frame, detections=local_detections, labels=labels)

            ret, buffer = cv2.imencode(".jpg", frame)
            if not ret: continue
            yield (b"--frame\r\n" b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n")
            
            time.sleep(0.01)

    except Exception as e:
        print(f"❌ Gen Error: {e}")
    finally:
        if camera_sessions.get(cam_name) == session_id:
            active_streams[cam_name] = False
            with reader_lock:
                reader = stream_readers.pop(cam_name, None)
                if reader: reader.stop()

# -----------------------------------------------------------------------
# FASTAPI ROUTES
# -----------------------------------------------------------------------

@app.post("/terminate")
async def terminate_stream(req: TerminateRequest):
    cam_name = req.cameraName
    if cam_name:
        print(f"🛑 TERMINATE SIGNAL: {cam_name}")
        active_streams[cam_name] = False
        with reader_lock:
            reader = stream_readers.pop(cam_name, None)
            if reader: reader.stop()
        return {"message": "Terminating"}
    return JSONResponse(status_code=404, content={"message": "Not found"})

@app.get("/stream")
async def stream(url: str = Query(...), name: str = Query("Unknown")):
    new_session_id = uuid.uuid4().hex
    camera_sessions[name] = new_session_id
    return StreamingResponse(
        generate_frames(url, name, new_session_id), 
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

# 🟢 NEW: FPS Polling Endpoint
@app.get("/fps")
async def get_fps():
    """Returns the current processing FPS for all active cameras."""
    fps_data = {}
    with reader_lock:
        for name, reader in stream_readers.items():
            if not reader.stopped:
                fps_data[name] = round(reader.fps, 1)
    return fps_data

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5000)

# import os
# import cv2
# import time
# import requests
# import numpy as np
# import uuid
# import threading
# import uvicorn
# from fastapi import FastAPI, Request, Query
# from fastapi.responses import StreamingResponse, JSONResponse
# from fastapi.middleware.cors import CORSMiddleware
# from pydantic import BaseModel
# from ultralytics import YOLO
# import torch
# import supervision as sv

# # -----------------------------------------------------------------------
# # FASTAPI SETUP
# # -----------------------------------------------------------------------
# app = FastAPI(title="DroneGuard AI Backend")

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],  # Allow all origins (React Frontend)
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# # -----------------------------------------------------------------------
# # CONFIGURATION
# # -----------------------------------------------------------------------
# NODE_API = "http://127.0.0.1:4000/api/webhook/detection"
# BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# CAPTURE_DIR = os.path.join(BASE_DIR, "public", "captures")
# os.makedirs(CAPTURE_DIR, exist_ok=True)

# MODEL_PATH = "best_latest.pt"
# CONFIDENCE = 0.35
# IOU_THRESH = 0.4
# SWAP_CLASSES = True

# # -----------------------------------------------------------------------
# # GLOBAL STATE
# # -----------------------------------------------------------------------
# camera_sessions = {}
# active_streams = {} 
# stream_readers = {} 
# last_alert_time = {}

# # Global Lock for Dictionary Access
# reader_lock = threading.Lock()

# # Device Config
# DEVICE = 0 if torch.cuda.is_available() else "cpu"
# print(f"🚀 Using Device: {DEVICE}")

# # -----------------------------------------------------------------------
# # MODEL LOADING
# # -----------------------------------------------------------------------
# try:
#     print(f"📥 Loading Model: {MODEL_PATH}")
#     model = YOLO(MODEL_PATH)
#     if DEVICE != "cpu":
#         model.to("cuda")
    
#     if SWAP_CLASSES:
#         model.model.names = {0: "bird", 1: "drone"}
#         print(f"🔄 Classes Swapped: {model.model.names}")
    
#     CLASS_NAMES = model.model.names
#     print(f"✅ Model Loaded Successfully")
# except Exception as e:
#     print(f"❌ Error loading model: {e}")
#     model = None
#     CLASS_NAMES = {}

# os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;udp|timeout;5000"

# # -----------------------------------------------------------------------
# # PYDANTIC MODELS
# # -----------------------------------------------------------------------
# class TerminateRequest(BaseModel):
#     cameraName: str

# # -----------------------------------------------------------------------
# # THREADED CAMERA CLASS (STABLE)
# # -----------------------------------------------------------------------
# class ThreadedCamera:
#     def __init__(self, src, name):
#         # Convert "0" string to integer 0 for local cam
#         self.src = int(src) if str(src).isdigit() else src
#         self.name = name
#         self.stopped = False
#         self.lock = threading.Lock()
        
#         # Initial Connection
#         self.cap = self._open_camera()
#         if self.cap:
#              self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
#              self.grabbed, self.frame = self.cap.read()
#         else:
#              self.grabbed = False
#              self.frame = None

#         self.last_read_time = time.time()

#         # Start Thread
#         self.t = threading.Thread(target=self.update, args=())
#         self.t.daemon = True
#         self.t.start()

#     def _open_camera(self):
#         if self.stopped: return None
#         try:
#             if isinstance(self.src, int):
#                 print(f"🔌 Opening Local Camera {self.src}...")
#                 return cv2.VideoCapture(self.src)
#             else:
#                 print(f"🌐 Opening Network Stream...")
#                 return cv2.VideoCapture(self.src, cv2.CAP_FFMPEG)
#         except Exception as e:
#             print(f"❌ Cam Error: {e}")
#             return None

#     def update(self):
#         while not self.stopped:
#             if self.cap is None or not self.cap.isOpened():
#                 self._reconnect()
#                 continue

#             try:
#                 grabbed, frame = self.cap.read()
#                 if grabbed:
#                     with self.lock:
#                         self.grabbed = grabbed
#                         self.frame = frame
#                         self.last_read_time = time.time()
#                 else:
#                     self._reconnect()
#             except Exception:
#                 self._reconnect()
                
#             # Very short sleep to yield to other threads but keep polling fast
#             time.sleep(0.005)

#     def _reconnect(self):
#         if self.stopped: return

#         if self.cap:
#             self.cap.release()
        
#         time.sleep(1) # Wait before retry
        
#         if self.stopped: return # Check again after sleep
        
#         print(f"🔄 {self.name}: Reconnecting...")
#         self.cap = self._open_camera()
#         if self.cap:
#             self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

#     def read(self):
#         with self.lock:
#             if self.stopped: return False, None
#             # Stale frame check (>3 seconds)
#             if time.time() - self.last_read_time > 3.0:
#                 return False, None
#             return self.grabbed, self.frame

#     def stop(self):
#         self.stopped = True
#         if self.t.is_alive():
#             self.t.join(timeout=1.0)
#         if self.cap:
#             self.cap.release()
#         print(f"✅ CAMERA HARDWARE RELEASED: {self.name}")

# # -----------------------------------------------------------------------
# # HELPER FUNCTIONS
# # -----------------------------------------------------------------------
# def save_detection_image(frame, cam_name):
#     unique_id = uuid.uuid4().hex[:8]
#     filename = f"{cam_name.replace(' ', '_')}_{unique_id}.jpg"
#     path = os.path.join(CAPTURE_DIR, filename)
#     try:
#         cv2.imwrite(path, frame)
#     except: pass
#     return filename

# def send_alert_async(cam_name, detected_class, conf, xyxy, frame):
#     def _send():
#         label_text = str(detected_class).lower().strip()
#         if "drone" not in label_text: return

#         current_time = time.time()
#         # Cooldown check prevents spamming DB, but detection happens every frame
#         if cam_name in last_alert_time and (current_time - last_alert_time[cam_name] < 2): 
#             return

#         print(f"🚨 ALERT: {label_text} ({conf:.2f})")

#         try:
#             x1, y1, x2, y2 = map(int, xyxy)
#             cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
#             label = f"DRONE {conf:.2f}"
#             cv2.putText(frame, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            
#             image_filename = save_detection_image(frame, cam_name)
            
#             payload = {
#                 "cameraName": cam_name,
#                 "detectedClass": "Drone",
#                 "confidence": float(conf),
#                 "image": image_filename
#             }
#             requests.post(NODE_API, json=payload, timeout=2)
#             last_alert_time[cam_name] = current_time
#         except Exception as e:
#             print(f"⚠️ Alert Error: {e}")

#     threading.Thread(target=_send, daemon=True).start()

# def run_inference(frame):
#     if model is None: return sv.Detections.empty(), []
#     try:
#         # Run inference
#         results = model.predict(frame, conf=CONFIDENCE, iou=IOU_THRESH, agnostic_nms=True, verbose=False, device=DEVICE)
#         if not results: return sv.Detections.empty(), []
        
#         r = results[0]
#         detections = sv.Detections.from_ultralytics(r)
#         class_names = [CLASS_NAMES.get(class_id, str(class_id)) for class_id in detections.class_id]
#         return detections, class_names
#     except:
#         return sv.Detections.empty(), []

# def get_reconnecting_frame():
#     frame = np.zeros((480, 640, 3), dtype=np.uint8)
#     cv2.putText(frame, "SIGNAL LOST", (200, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
#     return frame

# # -----------------------------------------------------------------------
# # STREAM GENERATOR
# # -----------------------------------------------------------------------
# def generate_frames(source: str, cam_name: str, session_id: str):
#     active_streams[cam_name] = True
#     print(f"📷 STREAM REQUEST: {cam_name}")

#     # Ensure Camera is initialized
#     with reader_lock:
#         if cam_name not in stream_readers or stream_readers[cam_name].stopped:
#             stream_readers[cam_name] = ThreadedCamera(source, cam_name)

#     camera = stream_readers[cam_name]
    
#     # Annotators
#     box_annotator = sv.BoxAnnotator(thickness=2)
#     label_annotator = sv.LabelAnnotator(text_scale=0.5, text_thickness=1)

#     try:
#         while True:
#             # 1. Session Validation
#             if camera_sessions.get(cam_name) != session_id:
#                 break
            
#             # 2. Active Flag Validation
#             if not active_streams.get(cam_name, False):
#                 break

#             grabbed, frame = camera.read()

#             # 3. Handle Missing Frames
#             if not grabbed or frame is None:
#                 fail_frame = get_reconnecting_frame()
#                 ret, buffer = cv2.imencode(".jpg", fail_frame)
#                 yield (b"--frame\r\n" b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n")
#                 time.sleep(0.5)
#                 continue

#             # 4. MAX PERFORMANCE: Inference Every Frame
#             local_detections, local_names = run_inference(frame)
            
#             if len(local_detections) > 0:
#                 # Send Alerts
#                 for name, conf, xyxy in zip(local_names, local_detections.confidence, local_detections.xyxy):
#                     send_alert_async(cam_name, name, conf, xyxy, frame.copy())
                
#                 # Draw Annotations
#                 frame = box_annotator.annotate(scene=frame, detections=local_detections)
#                 labels = [f"{name} {conf:.2f}" for name, conf in zip(local_names, local_detections.confidence)]
#                 frame = label_annotator.annotate(scene=frame, detections=local_detections, labels=labels)

#             # 5. Encode & Yield
#             ret, buffer = cv2.imencode(".jpg", frame)
#             if not ret: continue
#             yield (b"--frame\r\n" b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n")
            
#             # Tiny sleep to allow context switching, preventing CPU lockup
#             time.sleep(0.01)

#     except Exception as e:
#         print(f"❌ Gen Error: {e}")
#     finally:
#         # CLEANUP Logic
#         if camera_sessions.get(cam_name) == session_id:
#             active_streams[cam_name] = False
#             with reader_lock:
#                 reader = stream_readers.pop(cam_name, None)
#                 if reader:
#                     reader.stop()

# # -----------------------------------------------------------------------
# # FASTAPI ROUTES
# # -----------------------------------------------------------------------

# @app.post("/terminate")
# async def terminate_stream(req: TerminateRequest):
#     cam_name = req.cameraName
#     if cam_name:
#         print(f"🛑 TERMINATE SIGNAL: {cam_name}")
#         active_streams[cam_name] = False
        
#         with reader_lock:
#             reader = stream_readers.pop(cam_name, None)
#             if reader:
#                 reader.stop()
            
#         return {"message": "Terminating"}
#     return JSONResponse(status_code=404, content={"message": "Not found"})

# @app.get("/stream")
# async def stream(url: str = Query(...), name: str = Query("Unknown")):
#     new_session_id = uuid.uuid4().hex
#     camera_sessions[name] = new_session_id
    
#     return StreamingResponse(
#         generate_frames(url, name, new_session_id), 
#         media_type="multipart/x-mixed-replace; boundary=frame"
#     )

# # -----------------------------------------------------------------------
# # ENTRY POINT
# # -----------------------------------------------------------------------
# if __name__ == "__main__":
#     # Uvicorn runs FastAPI. Workers=1 is standard for this kind of threaded/stateful app.
#     # We bind to 0.0.0.0 to be accessible on the network.
#     uvicorn.run(app, host="0.0.0.0", port=5000)

# # import os
# # import cv2
# # import time
# # import requests
# # import numpy as np
# # import uuid
# # import threading
# # from flask import Flask, Response, request, jsonify
# # from flask_cors import CORS
# # from ultralytics import YOLO
# # import torch
# # import supervision as sv

# # app = Flask(__name__)
# # CORS(app)

# # # -----------------------------------------------------------------------
# # # CONFIGURATION
# # # -----------------------------------------------------------------------
# # NODE_API = "http://127.0.0.1:4000/api/webhook/detection"
# # BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# # CAPTURE_DIR = os.path.join(BASE_DIR, "public", "captures")
# # os.makedirs(CAPTURE_DIR, exist_ok=True)

# # MODEL_PATH = "best_latest.pt"
# # CONFIDENCE = 0.35
# # IOU_THRESH = 0.4
# # SWAP_CLASSES = True

# # # -----------------------------------------------------------------------
# # # GLOBAL STATE
# # # -----------------------------------------------------------------------
# # camera_sessions = {}
# # active_streams = {} 
# # stream_readers = {} 
# # last_alert_time = {}

# # # Global Lock for Dictionary Access (Prevents KeyError/Race Conditions)
# # reader_lock = threading.Lock()

# # # Device Config
# # DEVICE = 0 if torch.cuda.is_available() else "cpu"
# # print(f"🚀 Using Device: {DEVICE}")

# # # -----------------------------------------------------------------------
# # # MODEL LOADING
# # # -----------------------------------------------------------------------
# # try:
# #     print(f"📥 Loading Model: {MODEL_PATH}")
# #     model = YOLO(MODEL_PATH)
# #     if DEVICE != "cpu":
# #         model.to("cuda")
    
# #     if SWAP_CLASSES:
# #         model.model.names = {0: "bird", 1: "drone"}
# #         print(f"🔄 Classes Swapped: {model.model.names}")
    
# #     CLASS_NAMES = model.model.names
# #     print(f"✅ Model Loaded Successfully")
# # except Exception as e:
# #     print(f"❌ Error loading model: {e}")
# #     model = None
# #     CLASS_NAMES = {}

# # os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;udp|timeout;5000"

# # # -----------------------------------------------------------------------
# # # THREADED CAMERA CLASS (STABLE)
# # # -----------------------------------------------------------------------
# # class ThreadedCamera:
# #     def __init__(self, src, name):
# #         self.src = int(src) if str(src).isdigit() else src
# #         self.name = name
# #         self.stopped = False
# #         self.lock = threading.Lock()
        
# #         # Initial Connection
# #         self.cap = self._open_camera()
# #         if self.cap:
# #              self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
# #              self.grabbed, self.frame = self.cap.read()
# #         else:
# #              self.grabbed = False
# #              self.frame = None

# #         self.last_read_time = time.time()

# #         # Start Thread
# #         self.t = threading.Thread(target=self.update, args=())
# #         self.t.daemon = True
# #         self.t.start()

# #     def _open_camera(self):
# #         if self.stopped: return None
# #         try:
# #             if isinstance(self.src, int):
# #                 print(f"🔌 Opening Local Camera {self.src}...")
# #                 return cv2.VideoCapture(self.src)
# #             else:
# #                 print(f"🌐 Opening Network Stream...")
# #                 return cv2.VideoCapture(self.src, cv2.CAP_FFMPEG)
# #         except Exception as e:
# #             print(f"❌ Cam Error: {e}")
# #             return None

# #     def update(self):
# #         while not self.stopped:
# #             if self.cap is None or not self.cap.isOpened():
# #                 self._reconnect()
# #                 continue

# #             try:
# #                 grabbed, frame = self.cap.read()
# #                 if grabbed:
# #                     with self.lock:
# #                         self.grabbed = grabbed
# #                         self.frame = frame
# #                         self.last_read_time = time.time()
# #                 else:
# #                     self._reconnect()
# #             except Exception:
# #                 self._reconnect()
                
# #             time.sleep(0.005) # Reduced sleep for faster polling

# #     def _reconnect(self):
# #         if self.stopped: return

# #         if self.cap:
# #             self.cap.release()
        
# #         time.sleep(1) # Wait before retry
        
# #         if self.stopped: return # Check again after sleep
        
# #         print(f"🔄 {self.name}: Reconnecting...")
# #         self.cap = self._open_camera()
# #         if self.cap:
# #             self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

# #     def read(self):
# #         with self.lock:
# #             if self.stopped: return False, None
# #             if time.time() - self.last_read_time > 3.0:
# #                 return False, None
# #             return self.grabbed, self.frame

# #     def stop(self):
# #         self.stopped = True
# #         if self.t.is_alive():
# #             self.t.join(timeout=1.0)
# #         if self.cap:
# #             self.cap.release()
# #         print(f"✅ CAMERA HARDWARE RELEASED: {self.name}")

# # # -----------------------------------------------------------------------
# # # HELPER FUNCTIONS
# # # -----------------------------------------------------------------------
# # def save_detection_image(frame, cam_name):
# #     unique_id = uuid.uuid4().hex[:8]
# #     filename = f"{cam_name.replace(' ', '_')}_{unique_id}.jpg"
# #     path = os.path.join(CAPTURE_DIR, filename)
# #     try:
# #         cv2.imwrite(path, frame)
# #     except: pass
# #     return filename

# # def send_alert_async(cam_name, detected_class, conf, xyxy, frame):
# #     def _send():
# #         label_text = str(detected_class).lower().strip()
# #         if "drone" not in label_text: return

# #         current_time = time.time()
# #         # Cooldown check prevents spamming DB, but detection happens every frame
# #         if cam_name in last_alert_time and (current_time - last_alert_time[cam_name] < 2): 
# #             return

# #         print(f"🚨 ALERT: {label_text} ({conf:.2f})")

# #         try:
# #             x1, y1, x2, y2 = map(int, xyxy)
# #             cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
# #             label = f"DRONE {conf:.2f}"
# #             cv2.putText(frame, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            
# #             image_filename = save_detection_image(frame, cam_name)
            
# #             payload = {
# #                 "cameraName": cam_name,
# #                 "detectedClass": "Drone",
# #                 "confidence": float(conf),
# #                 "image": image_filename
# #             }
# #             requests.post(NODE_API, json=payload, timeout=2)
# #             last_alert_time[cam_name] = current_time
# #         except Exception as e:
# #             print(f"⚠️ Alert Error: {e}")

# #     threading.Thread(target=_send, daemon=True).start()

# # def run_inference(frame):
# #     if model is None: return sv.Detections.empty(), []
# #     try:
# #         # Run inference
# #         results = model.predict(frame, conf=CONFIDENCE, iou=IOU_THRESH, agnostic_nms=True, verbose=False, device=DEVICE)
# #         if not results: return sv.Detections.empty(), []
        
# #         r = results[0]
# #         detections = sv.Detections.from_ultralytics(r)
# #         class_names = [CLASS_NAMES.get(class_id, str(class_id)) for class_id in detections.class_id]
# #         return detections, class_names
# #     except:
# #         return sv.Detections.empty(), []

# # def get_reconnecting_frame():
# #     frame = np.zeros((480, 640, 3), dtype=np.uint8)
# #     cv2.putText(frame, "SIGNAL LOST", (200, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
# #     return frame

# # # -----------------------------------------------------------------------
# # # FLASK STREAM
# # # -----------------------------------------------------------------------
# # def generate_frames(source, cam_name, session_id):
# #     active_streams[cam_name] = True
# #     print(f"📷 STREAM REQUEST: {cam_name}")

# #     with reader_lock:
# #         if cam_name not in stream_readers or stream_readers[cam_name].stopped:
# #             stream_readers[cam_name] = ThreadedCamera(source, cam_name)

# #     camera = stream_readers[cam_name]
    
# #     # Annotators
# #     box_annotator = sv.BoxAnnotator(thickness=2)
# #     label_annotator = sv.LabelAnnotator(text_scale=0.5, text_thickness=1)

# #     try:
# #         while True:
# #             # Check if this session is still valid
# #             if camera_sessions.get(cam_name) != session_id:
# #                 break
            
# #             # Check if user stopped the stream
# #             if not active_streams.get(cam_name, False):
# #                 break

# #             grabbed, frame = camera.read()

# #             if not grabbed or frame is None:
# #                 fail_frame = get_reconnecting_frame()
# #                 ret, buffer = cv2.imencode(".jpg", fail_frame)
# #                 yield (b"--frame\r\n" b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n")
# #                 time.sleep(0.5)
# #                 continue

# #             # 🟢 MAX DETECTION: Run Inference on EVERY Frame
# #             local_detections, local_names = run_inference(frame)
            
# #             if len(local_detections) > 0:
# #                 # 1. Send Alerts (Async check handles throttle)
# #                 for name, conf, xyxy in zip(local_names, local_detections.confidence, local_detections.xyxy):
# #                     send_alert_async(cam_name, name, conf, xyxy, frame.copy())
                
# #                 # 2. Draw Annotations
# #                 frame = box_annotator.annotate(scene=frame, detections=local_detections)
# #                 labels = [f"{name} {conf:.2f}" for name, conf in zip(local_names, local_detections.confidence)]
# #                 frame = label_annotator.annotate(scene=frame, detections=local_detections, labels=labels)

# #             # Encode and yield
# #             ret, buffer = cv2.imencode(".jpg", frame)
# #             if not ret: continue
# #             yield (b"--frame\r\n" b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n")
            
# #             # Minimal sleep to prevent browser buffer overflow, but keep FPS high
# #             time.sleep(0.01) 

# #     except Exception as e:
# #         print(f"❌ Gen Error: {e}")
# #     finally:
# #         # CLEANUP IF THIS IS THE ACTIVE SESSION
# #         if camera_sessions.get(cam_name) == session_id:
# #             active_streams[cam_name] = False
# #             with reader_lock:
# #                 reader = stream_readers.pop(cam_name, None)
# #                 if reader:
# #                     reader.stop()

# # @app.route("/terminate", methods=["POST"])
# # def terminate_stream():
# #     data = request.json
# #     cam_name = data.get("cameraName")
# #     if cam_name:
# #         print(f"🛑 TERMINATE SIGNAL: {cam_name}")
# #         active_streams[cam_name] = False
        
# #         with reader_lock:
# #             reader = stream_readers.pop(cam_name, None)
# #             if reader:
# #                 reader.stop()
            
# #         return jsonify({"message": "Terminating"}), 200
# #     return jsonify({"message": "Not found"}), 404

# # @app.route("/stream")
# # def stream():
# #     source = request.args.get("url")
# #     name = request.args.get("name", "Unknown")
    
# #     new_session_id = uuid.uuid4().hex
# #     camera_sessions[name] = new_session_id
    
# #     return Response(generate_frames(source, name, new_session_id), mimetype="multipart/x-mixed-replace; boundary=frame")

# # if __name__ == "__main__":
# #     app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)

