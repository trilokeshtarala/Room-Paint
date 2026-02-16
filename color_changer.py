"""
Wall Color Changer v9 - Zoom & Pan Support.

PHASE 1 - SELECT:
  • Left Click: Add Point.
  • Right Click: Undo Point.
  • ENTER / Mid-Click: Close Shape.
  • MOUSE WHEEL: Zoom In/Out (centered at mouse cursor).
  • HOLD LEFT CLICK + DRAG: Pan (while zoomed in).
  • SPACE: Finish Selection.

PHASE 2 - RECOLOR & COMPARE:
  • C: Toggle Compare Mode.
  • V: Snapshot -> Left Panel.
  • O: Reset Left Panel.
  • S: Save.
  • MOUSE WHEEL: Zoom In/Out.
  • HOLD LEFT CLICK + DRAG: Pan.
"""

import cv2
import numpy as np
import os
import tkinter as tk
from tkinter import colorchooser

# ── Config ────────────────────────────────────────────────────
IMAGE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          "bedroom image.jpeg")

CATEGORIES = {
    "Bedroom": [
        ("Light Blue", (230, 216, 173)),
        # ... (Same colors as before, kept short for brevity in file but will include all)
        ("Slate Blue", (205, 90, 106)),
        ("Navy Blue", (128, 0, 0)),
        ("Sage Green", (142, 188, 159)),
        ("Silver", (192, 192, 192)),
        ("Lavender", (230, 230, 250)),
        ("Warm Gray", (169, 169, 169)),
        ("Charcoal", (54, 54, 54)),
        ("Crisp White", (255, 255, 255)),
        ("Terracotta", (94, 114, 226)),
        ("Rust", (67, 75, 183)),
        ("Cream", (220, 245, 255))
    ],
    "Kitchen": [
        ("White", (255, 255, 255)),
        ("Warm Yellow", (153, 228, 255)),
        ("Red Accent", (50, 50, 220)),
        ("Orange Accent", (0, 165, 255))
    ],
    "Hall/Living": [
        ("Warm Beige", (200, 228, 245)),
        ("Greige", (180, 180, 170)),
        ("Soft Terracotta", (120, 140, 210)),
        ("Earthy Ochre", (80, 160, 204)),
        ("Green", (80, 180, 80)),
        ("Charcoal Acc", (60, 60, 60))
    ],
    "Bathroom": [
        ("Crisp White", (250, 250, 250)),
        ("Aqua", (255, 255, 0)),
        ("Light Teal", (180, 180, 100)),
        ("Charcoal", (70, 70, 70)),
        ("Black Accent", (10, 10, 10))
    ],
    "Dining": [
        ("Warm Red", (60, 60, 200)),
        ("Aubergine", (80, 40, 70))
    ],
    "Office": [
        ("Green", (100, 180, 100)),
        ("Deep Blue", (150, 50, 10)),
        ("Yellow Acc", (50, 220, 240))
    ],
    "Gaming": [
        ("Neutral Gray", (150, 150, 150)),
        ("Matte Black", (25, 25, 25)),
        ("White", (245, 245, 245))
    ]
}

CATEGORY_NAMES = list(CATEGORIES.keys())
PALETTE_HEIGHT = 100
MAX_W = 900 
COMPARE_SCALE = 0.8 

# ── Helpers ───────────────────────────────────────────────────

def recolor_walls(original_bgr, mask, target_bgr):
    hsv = cv2.cvtColor(original_bgr, cv2.COLOR_BGR2HSV).copy()
    t = np.uint8([[list(target_bgr)]])
    t_hsv = cv2.cvtColor(t, cv2.COLOR_BGR2HSV)[0][0]

    wall = mask > 0
    hsv[wall, 0] = t_hsv[0]
    hsv[wall, 1] = t_hsv[1]

    if t_hsv[1] < 20: 
        v_blend = hsv[wall, 2].astype(np.float32) * 0.3 + t_hsv[2] * 0.7
        hsv[wall, 2] = np.clip(v_blend, 0, 255).astype(np.uint8)

    recolored = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)

    alpha = cv2.GaussianBlur(mask, (7, 7), 0).astype(np.float32) / 255.0
    alpha_3 = np.dstack([alpha, alpha, alpha])
    result = (alpha_3 * recolored.astype(np.float32) +
              (1 - alpha_3) * original_bgr.astype(np.float32)).astype(np.uint8)
    return result


def overlay_mask(image, mask, color=(0, 255, 0), opacity=0.35):
    out = image.copy()
    m = mask > 0
    out[m] = ((1 - opacity) * out[m] + opacity * np.array(color)).astype(np.uint8)
    return out


def draw_palette(canvas_width, category_idx):
    bar = np.zeros((PALETTE_HEIGHT, canvas_width, 3), dtype=np.uint8)
    bar[:] = (40, 40, 40)

    cat_name = CATEGORY_NAMES[category_idx]
    
    cv2.rectangle(bar, (10, 5), (60, 35), (70, 70, 70), -1)
    cv2.putText(bar, "<", (25, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 2)
    
    cv2.rectangle(bar, (canvas_width - 60, 5), (canvas_width - 10, 35), (70, 70, 70), -1)
    cv2.putText(bar, ">", (canvas_width - 45, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 2)

    label = f"Category: {cat_name}"
    tw = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0][0]
    cv2.putText(bar, label, ((canvas_width - tw)//2, 28), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

    custom_btn_x1 = canvas_width - 200
    custom_btn_x2 = canvas_width - 80
    cv2.rectangle(bar, (custom_btn_x1, 5), (custom_btn_x2, 35), (90, 60, 60), -1)
    cv2.putText(bar, "Custom...", (custom_btn_x1 + 10, 26), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

    colors = CATEGORIES[cat_name]
    rects = []
    if colors:
        cols = len(colors)
        sw = canvas_width // cols
        for i, (name, bgr) in enumerate(colors):
            x1, x2 = i * sw, (i + 1) * sw
            y1, y2 = 45, PALETTE_HEIGHT - 5
            
            cv2.rectangle(bar, (x1+2, y1), (x2-2, y2), bgr, -1)
            cv2.rectangle(bar, (x1+2, y1), (x2-2, y2), (200,200,200), 1)
            
            fs = 0.4
            for scale in [0.4, 0.35, 0.3]:
                tw = cv2.getTextSize(name, cv2.FONT_HERSHEY_SIMPLEX, scale, 1)[0][0]
                if tw < sw - 4:
                    fs = scale
                    break
            
            tx = x1 + (sw - tw) // 2
            cv2.putText(bar, name, (tx, y2 - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, fs, (50, 50, 50), 2)
            cv2.putText(bar, name, (tx, y2 - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, fs, (220, 220, 220), 1)

            rects.append({'rect': (x1, y1, x2, y2), 'name': name, 'bgr': bgr})

    ui_map = {
        'prev': (10, 5, 60, 35),
        'next': (canvas_width - 60, 5, canvas_width - 10, 35),
        'custom': (custom_btn_x1, 5, custom_btn_x2, 35),
        'swatches': rects
    }
    return bar, ui_map


def pick_custom_color():
    root = tk.Tk()
    root.withdraw()
    color = colorchooser.askcolor(title="Choose Wall Color")
    root.destroy()
    if color[0]:
        r, g, b = map(int, color[0])
        return (b, g, r) 
    return None


def put_text(img, text, pos, scale=0.55, col=(255,255,255)):
    cv2.putText(img, text, pos, cv2.FONT_HERSHEY_SIMPLEX, scale, (0,0,0), 3, cv2.LINE_AA)
    cv2.putText(img, text, pos, cv2.FONT_HERSHEY_SIMPLEX, scale, col,     1, cv2.LINE_AA)


# ── Main ──────────────────────────────────────────────────────

def main():
    original = cv2.imread(IMAGE_PATH)
    if original is None:
        print(f"ERROR: Could not load '{IMAGE_PATH}'")
        return

    h_orig, w_orig = original.shape[:2]
    # Resize to max screen width if too huge
    scale_factor = 1.0
    if w_orig > MAX_W:
        scale_factor = MAX_W / w_orig
        original = cv2.resize(original, None, fx=scale_factor, fy=scale_factor, interpolation=cv2.INTER_AREA)

    h, w = original.shape[:2] # Working resolution

    # Compare mode sizes
    cmp_w = int(w * COMPARE_SCALE)
    cmp_h = int(h * COMPARE_SCALE)
    original_small = cv2.resize(original, (cmp_w, cmp_h), interpolation=cv2.INTER_AREA)

    # State
    S = {
        "mask":       np.zeros((h, w), dtype=np.uint8),
        "current_poly": [],
        "closed_polys": [],
        "phase":      "SELECT",
        "overlay":    True,
        "color_name": None,
        "color_bgr":  None,
        "recolored":  None,
        "final_mask": None,
        "cat_idx":    0,
        "ui_map":     None,
        "compare_mode": False,
        "ref_image":    original_small.copy(), 
        "ref_name":     "Original",
        
        # ZOOM STATE
        "zoom_level": 1.0,  # 1.0 = 100%
        "offset_x":   0,    # Viewport offset (in image coords)
        "offset_y":   0,
        "dragging":   False,
        "drag_start": (0,0)
    }

    win = "Wall Color Changer v9"
    cv2.namedWindow(win, cv2.WINDOW_AUTOSIZE)

    # Coordinate Mapper: Screen -> Image
    def screen_to_image(sx, sy):
        # Viewport params
        frame_h = cmp_h if S["compare_mode"] else h
        frame_w = cmp_w if S["compare_mode"] else w
        
        # Check if in palette
        if sy >= frame_h:
            return None, "PALETTE"
            
        # In zoomed image?
        # Effective viewport size is frame_w, frame_h
        # Image is displayed starting at offset_x, offset_y with size (frame_w / zoom, frame_h / zoom)
        # So: img_x = offset_x + sx / zoom
        
        ix = S["offset_x"] + sx / S["zoom_level"]
        iy = S["offset_y"] + sy / S["zoom_level"]
        
        # Check bounds
        # For SELECT mode, we operate on FULL res image 'original' (up to h,w)
        # For COMPARE mode, we operate on 'active_panel' (up to cmp_h, cmp_w)
        limit_w = frame_w if S["compare_mode"] else w
        limit_h = frame_h if S["compare_mode"] else h
        
        # Actually in compare mode, the "image" is smaller. 
        # But zoom logic should work on the *displayed* pixels.
        
        if 0 <= ix < limit_w and 0 <= iy < limit_h:
            return (ix, iy), "IMAGE"
        
        return None, "OUT"


    def on_mouse(event, mx, my, flags, param):
        frame_h = cmp_h if S["compare_mode"] else h
        frame_w = cmp_w if S["compare_mode"] else w
        
        # HANDLE ZOOM/PAN
        if event == cv2.EVENT_MOUSEWHEEL:
            delta = flags > 0 # Up or down
            factor = 1.1 if delta else 0.9
            new_zoom = S["zoom_level"] * factor
            if new_zoom < 1.0: new_zoom = 1.0
            if new_zoom > 5.0: new_zoom = 5.0
            
            # Zoom towards cursor? Simple center zoom for now to avoid drift bugs
            # Or zoom towards mx,my
            # Center of view:
            cx = S["offset_x"] + (frame_w / S["zoom_level"]) / 2
            cy = S["offset_y"] + (frame_h / S["zoom_level"]) / 2
            
            S["zoom_level"] = new_zoom
            
            # Re-center
            new_w_view = frame_w / new_zoom
            new_h_view = frame_h / new_zoom
            S["offset_x"] = max(0, min(cx - new_w_view/2, (frame_w if S["compare_mode"] else w) - new_w_view))
            S["offset_y"] = max(0, min(cy - new_h_view/2, (frame_h if S["compare_mode"] else h) - new_h_view))
            return

        # PANNING (Middle drag or Left drag if not clicking active)
        # We'll use Left Drag for pan if not in select mode, or if zoomed in?
        # Let's use Middle click drag or Ctrl+Left drag?
        # Or just drag if points not being added? 
        # Better: Left Drag = Pan, Click = Select (distinguish by drag threshold)
        if event == cv2.EVENT_LBUTTONDOWN:
             S["dragging"] = True
             S["drag_start"] = (mx, my)
             S["drag_origin_offset"] = (S["offset_x"], S["offset_y"])
             
        elif event == cv2.EVENT_MOUSEMOVE:
             if S["dragging"]:
                 dx = (mx - S["drag_start"][0]) / S["zoom_level"]
                 dy = (my - S["drag_start"][1]) / S["zoom_level"]
                 
                 # Move opposite to drag
                 S["offset_x"] = S["drag_origin_offset"][0] - dx
                 S["offset_y"] = S["drag_origin_offset"][1] - dy
                 
                 # Clamp
                 img_w = frame_w if S["compare_mode"] else w
                 img_h = frame_h if S["compare_mode"] else h
                 view_w = frame_w / S["zoom_level"]
                 view_h = frame_h / S["zoom_level"]
                 
                 S["offset_x"] = max(0, min(S["offset_x"], img_w - view_w))
                 S["offset_y"] = max(0, min(S["offset_y"], img_h - view_h))
             return

        elif event == cv2.EVENT_LBUTTONUP:
             was_dragging = S["dragging"] and (abs(mx - S["drag_start"][0]) > 2 or abs(my - S["drag_start"][1]) > 2)
             S["dragging"] = False
             
             if was_dragging: return # Don't register click

             # CLICK LOGIC
             coords, type = screen_to_image(mx, my)
             
             if type == "PALETTE":
                 # Palette click logic (handle coordinates relative to palette bar)
                 py = my - frame_h
                 ui = S["ui_map"]
                 if not ui: return
                 # Copy-paste palette logic...
                 px1, py1, px2, py2 = ui['prev']
                 if px1 <= mx <= px2 and py1 <= py <= py2:
                    S["cat_idx"] = (S["cat_idx"] - 1) % len(CATEGORY_NAMES)
                    return
                 nx1, ny1, nx2, ny2 = ui['next']
                 if nx1 <= mx <= nx2 and ny1 <= py <= ny2:
                    S["cat_idx"] = (S["cat_idx"] + 1) % len(CATEGORY_NAMES)
                    return
                 cx1, cy1, cx2, cy2 = ui['custom']
                 if cx1 <= mx <= cx2 and cy1 <= py <= cy2:
                    color = pick_custom_color()
                    if color:
                        S["color_name"] = "Custom"
                        S["color_bgr"] = color
                        S["recolored"] = recolor_walls(original, S["final_mask"], color)
                    return
                 for swatch in ui['swatches']:
                    sx1, sy1, sx2, sy2 = swatch['rect']
                    if sx1 <= mx <= sx2 and sy1 <= py <= sy2:
                        S["color_name"] = swatch['name']
                        S["color_bgr"] = swatch['bgr']
                        if S["final_mask"] is not None:
                            S["recolored"] = recolor_walls(original, S["final_mask"], swatch['bgr'])
                        return
                 return # End Palette Click

             elif type == "IMAGE":
                 ix, iy = coords
                 # Phase 1: Select
                 if S["phase"] == "SELECT" and not S["compare_mode"]:
                     S["current_poly"].append((int(ix), int(iy)))

        elif event == cv2.EVENT_RBUTTONDOWN:
            if S["phase"] == "SELECT" and S["current_poly"]:
                S["current_poly"].pop()
                
        elif event == cv2.EVENT_MBUTTONDOWN or (event == cv2.EVENT_LBUTTONDBLCLK): # Mid or DblClick to Close
             if S["phase"] == "SELECT" and len(S["current_poly"]) >= 3:
                 pts = np.array(S["current_poly"], np.int32)
                 cv2.fillPoly(S["mask"], [pts], 255)
                 S["closed_polys"].append(S["current_poly"])
                 S["current_poly"] = []
                 print("  >> Shape Closed.")


    cv2.setMouseCallback(win, on_mouse)

    print("==================================================")
    print("  v9 - ZOOM ENABLED")
    print("==================================================")
    print("  MOUSE WHEEL: Zoom In/Out")
    print("  LEFT DRAG:   Pan Image")
    print("  LEFT CLICK:  Select Point (Center zoom for precision)")
    print("==================================================")

    while True:
        if S["compare_mode"]:
            panel_w, panel_h = cmp_w, cmp_h
        else:
            panel_w, panel_h = w, h
            
        palette_bar, ui_map = draw_palette(panel_w * 2 if S["compare_mode"] else panel_w, S["cat_idx"])
        S["ui_map"] = ui_map
        
        # 1. Prepare Full Res Image (with overlays)
        if S["recolored"] is not None:
            active_full = S["recolored"].copy() # Copy to avoid lag?
        else:
            active_full = original.copy()
            
        if S["phase"] == "SELECT":
             if S["overlay"]: 
                 active_full = overlay_mask(active_full, S["mask"])
             
             pts = S["current_poly"]
             if len(pts) > 0:
                 for i in range(len(pts)):
                     cv2.circle(active_full, pts[i], 4, (0, 0, 255), -1)
                     if i > 0: cv2.line(active_full, pts[i-1], pts[i], (0, 0, 255), 2)
                 if len(pts) > 2:
                     cv2.line(active_full, pts[-1], pts[0], (0, 255, 255), 1)

        elif S["phase"] == "RECOLOR":
             if S["overlay"] and S["final_mask"] is not None:
                 active_full = overlay_mask(active_full, S["final_mask"])

        # 2. Extract Zoomed ROI for Active Panel
        zoom = S["zoom_level"]
        # If compare mode, we resize active_full to cmp size first? 
        # No, zoom logic is best applied to the full res overlay for sharpness, THEN resized? 
        # Or resize first then zoom?
        # Logic: If compare mode, base image is (cmp_w, cmp_h).
        
        if S["compare_mode"]:
            # Active panel base
            base = cv2.resize(active_full, (cmp_w, cmp_h), interpolation=cv2.INTER_AREA)
        else:
            base = active_full

        # Apply Zoom ROI crop
        # ROI is from offset_x, offset_y with size (panel_w/zoom, panel_h/zoom)
        roi_w = int(panel_w / zoom)
        roi_h = int(panel_h / zoom)
        
        # Safe crop
        ox = int(S["offset_x"])
        oy = int(S["offset_y"])
        if ox + roi_w > base.shape[1]: ox = base.shape[1] - roi_w
        if oy + roi_h > base.shape[0]: oy = base.shape[0] - roi_h
        
        cropped = base[oy:oy+roi_h, ox:ox+roi_w]
        # Resize back to panel size
        active_panel = cv2.resize(cropped, (panel_w, panel_h), interpolation=cv2.INTER_NEAREST)

        label = f"Zoom: {zoom:.1f}x"
        put_text(active_panel, label, (panel_w - 120, 30))
        
        # 3. Assemble Frame
        if S["compare_mode"]:
            ref_panel = S["ref_image"].copy()
            # Does ref panel zoom too? Let's say yes, synced zoom
            # Ref base is S['ref_image'] which is (cmp_w, cmp_h)
            ref_cropped = S["ref_image"][oy:oy+roi_h, ox:ox+roi_w]
            ref_panel_zoomed = cv2.resize(ref_cropped, (panel_w, panel_h), interpolation=cv2.INTER_NEAREST)
            
            put_text(ref_panel_zoomed, f"Ref: {S['ref_name']}", (10, 30), 0.55, (200, 200, 255))
            cv2.line(ref_panel_zoomed, (panel_w-1, 0), (panel_w-1, panel_h), (255,255,255), 2)
            
            combined_imgs = np.hstack([ref_panel_zoomed, active_panel])
            frame = np.vstack([combined_imgs, palette_bar])
            put_text(frame, "[C] Close Compare  [V] Snapshot  [Scroll] Zoom", 
                     (20, frame.shape[0] - PALETTE_HEIGHT - 10), 0.5, (0, 255, 255))
        else:
            frame = np.vstack([active_panel, palette_bar])
            stage = "SELECT" if S["phase"] == "SELECT" else "RECOLOR"
            if stage == "SELECT":
                txt = f"[{stage}] Scroll=Zoom Drag=Pan ENTER=Close"
            else:
                txt = f"[{stage}] C=Compare Mode Scroll=Zoom"
            put_text(frame, txt, (10, 60), 0.5, (200, 200, 200))

        cv2.imshow(win, frame)

        key = cv2.waitKey(30) & 0xFF
        if key in (ord('q'), ord('Q'), 27): break
        elif key == 32: # SPACE
             if S["phase"] == "SELECT":
                if len(S["current_poly"]) >= 3:
                     # Auto close current
                     pts = np.array(S["current_poly"], np.int32)
                     cv2.fillPoly(S["mask"], [pts], 255)
                     S["closed_polys"].append(S["current_poly"])
                     S["current_poly"] = []
                
                if np.count_nonzero(S["mask"]) > 0:
                    S["final_mask"] = S["mask"].copy()
                    S["phase"] = "RECOLOR"
                    S["overlay"] = False
        elif key == 13: # ENTER
             if S["phase"] == "SELECT" and len(S["current_poly"]) >= 3:
                 pts = np.array(S["current_poly"], np.int32)
                 cv2.fillPoly(S["mask"], [pts], 255)
                 S["closed_polys"].append(S["current_poly"])
                 S["current_poly"] = []
        elif key in (ord('c'), ord('C')) and S["phase"] == "RECOLOR":
             S["compare_mode"] = not S["compare_mode"]
             # Reset zoom when toggling mode to avoid confusion
             S["zoom_level"] = 1.0
             S["offset_x"] = 0
             S["offset_y"] = 0
             
        elif key in (ord('v'), ord('V')) and S["compare_mode"]:
             S["ref_image"] = cv2.resize(active_full, (cmp_w, cmp_h), interpolation=cv2.INTER_AREA)
             S["ref_name"] = S["color_name"] if S["color_name"] else "Custom"
        elif key in (ord('o'), ord('O')) and S["compare_mode"]:
             S["ref_image"] = original_small.copy()
             S["ref_name"] = "Original"

        elif key in (ord('s'), ord('S')):
             # Save logic...
             if S["recolored"] is not None:
                 sp = os.path.join(os.path.dirname(IMAGE_PATH), "recolored_zoom_v9.jpg")
                 cv2.imwrite(sp, S["recolored"])
                 print(f"  >> Saved to {sp}")

    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
