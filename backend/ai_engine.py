import os
import cv2
import time
import requests
import numpy as np
import supervision as sv
import uuid
import threading
from flask import Flask, Response, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# CONFIG
NODE_API = "http://127.0.0.1:4000/api/webhook/detection"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CAPTURE_DIR = os.path.join(BASE_DIR, "public", "captures")
os.makedirs(CAPTURE_DIR, exist_ok=True)

# ROBOFLOW CONFIG
API_KEY = "B5rgonDYgMQHCpNiBZ1n"
PROJECT_ID = "drone-vs-bird-lanzg-nrlgg"
MODEL_VERSION = 1
CONFIDENCE = 0.4
IOU_THRESH = 0.5

# 🟢 GLOBAL STATE FOR ASYNC INFERENCE
# Stores the specific session ID for the camera to prevent orphan threads
camera_sessions = {} 
active_streams = {}

# Stores the LATEST detection results to be drawn on the live feed
# Structure: { 'camera_name': (detections_object, class_names_list) }
latest_inference_results = {}

# Locks to ensure we don't spawn multiple API threads for the same camera at once
inference_locks = {}

# Timestamp of last API call to enforce the 5-second rule
last_inference_time = {}

# Set FFmpeg timeout
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "timeout;2000"

def save_detection_image(frame, cam_name):
    unique_id = uuid.uuid4().hex[:8]
    filename = f"{cam_name.replace(' ', '_')}_{unique_id}.jpg"
    path = os.path.join(CAPTURE_DIR, filename)
    cv2.imwrite(path, frame)
    return filename

def send_alert(cam_name, detected_class, conf, frame):
    """
    Sends alert to Node.js backend. 
    This is now called from the background thread, so it won't lag the stream.
    """
    label = detected_class.lower().strip()
    valid_classes = ["drone", "1", "0", "uav", "aircraft"]
    
    # Filter only relevant classes
    if not any(vc in label for vc in valid_classes):
        return

    print(f"🚨 DETECTED: {label} ({conf:.2f})")
    image_filename = save_detection_image(frame, cam_name)

    payload = {
        "cameraName": cam_name,
        "detectedClass": "Drone",
        "confidence": float(conf),
        "image": image_filename
    }
    
    try:
        requests.post(NODE_API, json=payload, timeout=2)
    except Exception as e:
        print(f"❌ Backend Error: {e}")

def background_inference_task(frame_copy, cam_name):
    """
    Runs in a separate thread. Calls Roboflow API and updates global state.
    """
    height, width, _ = frame_copy.shape
    scale = 640 / width
    if scale < 1:
        img_resized = cv2.resize(frame_copy, (0,0), fx=scale, fy=scale)
    else:
        img_resized = frame_copy
        scale = 1.0

    _, img_encoded = cv2.imencode('.jpg', img_resized)
    url = f"https://detect.roboflow.com/{PROJECT_ID}/{MODEL_VERSION}?api_key={API_KEY}&confidence={CONFIDENCE}&overlap={IOU_THRESH}"

    try:
        resp = requests.post(url, files={"file": img_encoded.tobytes()}, timeout=5)
        predictions = resp.json().get("predictions", [])
    except Exception as e:
        print(f"⚠️ Inference failed: {e}")
        inference_locks[cam_name] = False # Release lock
        return

    xyxy = []
    confidences = []
    class_ids = []
    class_names = []

    for p in predictions:
        x, y, w, h = p['x']/scale, p['y']/scale, p['width']/scale, p['height']/scale
        xyxy.append([int(x - w/2), int(y - h/2), int(x + w/2), int(y + h/2)])
        confidences.append(p['confidence'])
        class_ids.append(0)
        class_names.append(str(p['class']))

    if xyxy:
        detections = sv.Detections(
            xyxy=np.array(xyxy),
            confidence=np.array(confidences),
            class_id=np.array(class_ids)
        )
        detections['class_name'] = np.array(class_names)
        
        # 🟢 UPDATE GLOBAL STATE
        latest_inference_results[cam_name] = (detections, class_names)

        # 🟢 TRIGGER ALERTS (Background)
        for name, conf in zip(class_names, confidences):
            send_alert(cam_name, name, conf, frame_copy)
    else:
        # Clear detections if nothing found
        latest_inference_results[cam_name] = (sv.Detections.empty(), [])

    # Release lock so next 5-second interval can trigger
    inference_locks[cam_name] = False

def get_reconnecting_frame():
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.putText(frame, "SIGNAL LOST", (180, 220), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
    cv2.putText(frame, "RECONNECTING...", (160, 270), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 1)
    return frame

def generate_frames(source, cam_name, session_id):
    active_streams[cam_name] = True
    
    # Initialize state for this camera
    if cam_name not in inference_locks:
        inference_locks[cam_name] = False
    if cam_name not in last_inference_time:
        last_inference_time[cam_name] = 0
    
    print(f"📷 STREAM STARTING: {cam_name} (Session: {session_id[-4:]})")
    
    cap = None
    if source.isdigit(): 
        source = int(source)
        cap = cv2.VideoCapture(source)
    else:
        cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1) # Keep buffer low for low latency

    box_annotator = sv.BoxAnnotator()
    label_annotator = sv.LabelAnnotator()

    try:
        while True:
            # 🟢 1. SESSION LOCK CHECK
            if camera_sessions.get(cam_name) != session_id:
                print(f"🔁 NEW SESSION TOOK OVER: {cam_name}")
                break

            # 🟢 2. KILL SWITCH
            if not active_streams.get(cam_name, False):
                print(f"🛑 TERMINATING STREAM: {cam_name}")
                break

            success, frame = cap.read()
            
            # 🟢 3. RECONNECT LOGIC
            if not success:
                fail_frame = get_reconnecting_frame()
                ret, buffer = cv2.imencode('.jpg', fail_frame)
                yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
                cap.release()
                time.sleep(1)
                
                if camera_sessions.get(cam_name) != session_id: break
                if not active_streams.get(cam_name, False): break
                
                cap = cv2.VideoCapture(source) if isinstance(source, int) else cv2.VideoCapture(source, cv2.CAP_FFMPEG)
                continue

            current_time = time.time()

            # 🟢 4. BACKGROUND INFERENCE TRIGGER (Non-Blocking)
            # Check if 5 seconds passed AND we aren't currently waiting for an API response
            if (current_time - last_inference_time[cam_name] > 5) and not inference_locks[cam_name]:
                inference_locks[cam_name] = True
                last_inference_time[cam_name] = current_time
                
                # Start background thread
                # IMPORTANT: Pass frame.copy() so we don't mess up the streaming frame
                t = threading.Thread(target=background_inference_task, args=(frame.copy(), cam_name))
                t.daemon = True
                t.start()

            # 🟢 5. DRAW EXISTING DETECTIONS
            # We draw whatever is in the global variable, even if it's 4 seconds old.
            # This ensures the video stays smooth (30fps) while detections update every 5s.
            if cam_name in latest_inference_results:
                detections, names = latest_inference_results[cam_name]
                
                if len(detections) > 0:
                    valid_indices = [i for i, name in enumerate(names) 
                                     if any(x in name.lower() for x in ["drone", "1", "0", "uav"])]
                    
                    if valid_indices:
                        filtered_detections = detections[valid_indices]
                        labels = [f"DRONE {c:.2f}" for c in filtered_detections.confidence]
                        
                        frame = box_annotator.annotate(scene=frame, detections=filtered_detections)
                        frame = label_annotator.annotate(scene=frame, detections=filtered_detections, labels=labels)

            # 🟢 6. ENCODE AND YIELD IMMEDIATELY
            ret, buffer = cv2.imencode('.jpg', frame)
            if not ret: continue

            yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')

    except Exception as e:
        print(f"❌ ERROR: {e}")
    finally:
        if cap and cap.isOpened():
            cap.release()
        if camera_sessions.get(cam_name) == session_id:
            active_streams[cam_name] = False
        print(f"🔌 CLEANUP DONE: {cam_name}")

@app.route('/terminate', methods=['POST'])
def terminate_stream():
    data = request.json
    cam_name = data.get('cameraName')
    if cam_name:
        print(f"🛑 KILL COMMAND FOR: {cam_name}")
        active_streams[cam_name] = False
        return jsonify({"message": "Terminating"}), 200
    return jsonify({"message": "Not found"}), 404

@app.route('/stream')
def stream():
    source = request.args.get('url')
    name = request.args.get('name', 'Unknown')
    
    new_session_id = uuid.uuid4().hex
    
    if name in camera_sessions:
        print(f"⚠️ Existing session found for {name}. Resetting...")
        camera_sessions[name] = new_session_id
        time.sleep(0.5) # Give time for old thread to die
    else:
        camera_sessions[name] = new_session_id

    active_streams[name] = True
    
    # Initialize globals for this cam
    latest_inference_results[name] = (sv.Detections.empty(), [])
    
    return Response(generate_frames(source, name, new_session_id), mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == '__main__':
    # Threaded=True is essential for flask to handle multiple streams + api requests
    app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)