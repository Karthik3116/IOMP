import cv2
from ultralytics import YOLO
import time
import torch

# -----------------------------------------------------------------------
# CONFIGURATION
# -----------------------------------------------------------------------
MODEL_PATH = "best_latest.pt"       # Ensure this is in the same folder
CONFIDENCE = 0.35                   # Slightly higher to reduce ghost detections
IOU_THRESHOLD = 0.4                 # NMS Threshold
SWAP_CLASSES = True                 # Fix Bird/Drone swap

DEVICE = 0 if torch.cuda.is_available() else "cpu"
# -----------------------------------------------------------------------

def run_inference():
    print("Using device:", DEVICE)

    # 1. Load Model
    print("Loading model...")
    try:
        model = YOLO(MODEL_PATH)
        # Move model to GPU if available
        if DEVICE != "cpu":
            model.to("cuda")
        print(f"Model loaded: {MODEL_PATH}")
    except Exception as e:
        print(f"Error loading model: {e}")
        return

    # 2. Apply Class Swap Fix
    if SWAP_CLASSES:
        model.model.names = {0: "bird", 1: "drone"}
        print(f"Classes swapped: {model.model.names}")

    # 3. Initialize Webcam
    cap = None
    for index in [0, 1]:
        print(f"Trying to open camera index {index} with DirectShow...")
        temp_cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)

        if temp_cap.isOpened():
            print(f"Camera index {index} opened successfully")
            cap = temp_cap
            break
        else:
            temp_cap.release()

    if cap is None or not cap.isOpened():
        print("Could not open any webcam. Check if another app is using it.")
        return

    # 4. Set Resolution
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    print("\nInference Started. Press Q to quit.")

    # 5. Inference Loop
    prev_time = 0
    while True:
        success, frame = cap.read()
        if not success:
            print("Frame read failed. Retrying...")
            time.sleep(0.1)
            continue

        # Calculate FPS
        curr_time = time.time()
        fps = 1 / (curr_time - prev_time) if prev_time > 0 else 0
        prev_time = curr_time

        # Run YOLO Inference
        results = model.predict(
            frame,
            conf=CONFIDENCE,
            iou=IOU_THRESHOLD,
            agnostic_nms=True,
            verbose=False,
            device=DEVICE,
        )

        # Plot Results
        annotated_frame = results[0].plot(line_width=2, font_size=2)

        # Draw FPS on screen
        cv2.putText(
            annotated_frame,
            f"FPS: {int(fps)}",
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (0, 255, 0),
            2,
        )

        # Show Output
        cv2.imshow("YOLO11 Live Detection (Press Q to exit)", annotated_frame)

        # Exit on Q
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    run_inference()
