"""
Wall Color Changer v7 - Comparison Mode (Side-by-Side).

PHASE 1 - SELECT:
  • Click 4 corners to define walls. SPACE to finish.

PHASE 2 - RECOLOR & COMPARE:
  • C = Toggle Comparison Mode (Off -> On)
  • V = Snapshot current view to Left Panel (Compare A vs B)
  • O = Reset Left Panel to Original Image
  • S = Save current view (Right Panel in compare mode)
  
  Palette & Custom Picker works as usual.
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
        ("Light Blue", (230, 216, 173)),       # Soft Sky Blue
        ("Slate Blue", (205, 90, 106)),        # Muted Blue-Grey
        ("Navy Blue", (128, 0, 0)),            # Dark Blue
        ("Sage Green", (131, 193, 157)),       # Muted Earthy Green
        ("Silver", (192, 192, 192)),           # Light Gray
        ("Lavender", (250, 230, 230)),         # Pale Purple
        ("Warm Gray", (169, 169, 169)),        # Greige
        ("Charcoal", (64, 64, 64)),            # Dark Gray
        ("Crisp White", (255, 255, 255)),      # Pure White
        ("Terracotta", (91, 114, 226)),        # Clay Red
        ("Rust", (20, 40, 180)),               # Deep Orange-Red
        ("Cream", (208, 253, 255))             # Off-White
    ],
    "Kitchen": [
        ("White", (255, 255, 255)),            # Standard White
        ("Warm Yellow", (150, 230, 255)),      # Sunny Yellow
        ("Red Accent", (50, 50, 220)),         # Bright Red
        ("Orange Accent", (0, 165, 255))       # Vivid Orange
    ],
    "Hall/Living": [
        ("Warm Beige", (210, 240, 245)),       # Sand Color
        ("Greige", (170, 174, 168)),           # Gray-Beige
        ("Soft Terracotta", (110, 130, 205)),  # Muted Clay
        ("Earthy Ochre", (34, 119, 204)),      # Golden Brown
        ("Green", (144, 238, 144)),            # Pale Green
        ("Charcoal Acc", (50, 50, 50))         # Dark Trim
    ],
    "Bathroom": [
        ("Crisp White", (250, 250, 250)),      # Pure White
        ("Aqua", (255, 255, 0)),               # Cyan
        ("Light Teal", (170, 178, 32)),        # Blue-Green
        ("Charcoal", (60, 60, 60)),            # Dark Gray
        ("Black Accent", (10, 10, 10))         # Jet Black
    ],
    "Dining": [
        ("Warm Red", (34, 34, 178)),           # Deep Red
        ("Aubergine", (71, 56, 75))            # Eggplant Purple
    ],
    "Office": [
        ("Green", (87, 139, 34)),              # Forest Green
        ("Deep Blue", (139, 0, 0)),            # Navy
        ("Yellow Acc", (0, 215, 255))          # Gold
    ],
    "Gaming": [
        ("Neutral Gray", (128, 128, 128)),     # Mid-Gray
        ("Matte Black", (20, 20, 20)),         # Near Black
        ("White", (240, 240, 240))             # Off-White
    ]
}

CATEGORY_NAMES = list(CATEGORIES.keys())
PALETTE_HEIGHT = 100
MAX_W = 900  # Max width for a single panel
COMPARE_SCALE = 0.8  # Scale down images slightly in compare mode if needed

# ── Helpers ───────────────────────────────────────────────────

def recolor_walls(original_bgr, mask, target_bgr):
    """Replace wall color exactly. Keeps original brightness (V) only."""
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

    # UI Elements scaling positions with canvas_width
    # Center controls
    cx = canvas_width // 2
    
    cat_name = CATEGORY_NAMES[category_idx]
    
    # Prev (<)
    cv2.rectangle(bar, (10, 5), (60, 35), (70, 70, 70), -1)
    cv2.putText(bar, "<", (25, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 2)
    
    # Next (>)
    cv2.rectangle(bar, (canvas_width - 60, 5), (canvas_width - 10, 35), (70, 70, 70), -1)
    cv2.putText(bar, ">", (canvas_width - 45, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 2)

    # Label
    label = f"Category: {cat_name}"
    tw = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0][0]
    cv2.putText(bar, label, ((canvas_width - tw)//2, 28), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

    # Custom Color
    custom_btn_x1 = canvas_width - 200
    custom_btn_x2 = canvas_width - 80
    cv2.rectangle(bar, (custom_btn_x1, 5), (custom_btn_x2, 35), (90, 60, 60), -1)
    cv2.putText(bar, "Custom...", (custom_btn_x1 + 10, 26), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

    # Swatches
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

    # Initial resize
    h, w = original.shape[:2]
    if w > MAX_W:
        sc = MAX_W / w
        original = cv2.resize(original, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA)
        h, w = original.shape[:2]

    # COMPARED MODE RESIZE
    # Pre-compute a smaller version for comparison mode so 2 fit on screen nicely
    # Target width ~ 600-700 per panel
    cmp_w = int(w * COMPARE_SCALE)
    cmp_h = int(h * COMPARE_SCALE)
    original_small = cv2.resize(original, (cmp_w, cmp_h), interpolation=cv2.INTER_AREA)

    # State
    S = {
        "mask":       np.zeros((h, w), dtype=np.uint8),
        "current_poly": [],
        "phase":      "SELECT",
        "overlay":    True,
        "color_name": None,
        "color_bgr":  None,
        "recolored":  None,
        "final_mask": None,
        "cat_idx":    0,
        "ui_map":     None,
        
        # Compare Mode State
        "compare_mode": False,
        "ref_image":    original_small.copy(), # The left-side reference image
        "ref_name":     "Original"
    }

    win = "Wall Color Changer v7"
    cv2.namedWindow(win, cv2.WINDOW_AUTOSIZE)

    def on_mouse(event, mx, my, flags, param):
        # Coordinates mapping
        # If compare mode, we render [Ref | Active] side-by-side
        # Mouse clicks on Palette need to adjust Y coordinate
        # Mouse clicks on Image:
        #   - If on Left (Ref), ignore?
        #   - If on Right (Active), map X coordinate back to local image space
        
        frame_h = cmp_h if S["compare_mode"] else h
        frame_w = cmp_w if S["compare_mode"] else w
        
        # Handle Palette Clicks
        # Palette is always at bottom. In compare mode, it spans 2*cmp_w
        total_w = frame_w * 2 if S["compare_mode"] else w
        palette_y_start = frame_h
        
        if my >= palette_y_start:
            if event != cv2.EVENT_LBUTTONDOWN: return
            
            # Palette logic
            py = my - palette_y_start
            ui = S["ui_map"]
            if not ui: return
            
            # Prev
            px1, py1, px2, py2 = ui['prev']
            if px1 <= mx <= px2 and py1 <= py <= py2:
                S["cat_idx"] = (S["cat_idx"] - 1) % len(CATEGORY_NAMES)
                return
            # Next
            nx1, ny1, nx2, ny2 = ui['next']
            if nx1 <= mx <= nx2 and ny1 <= py <= ny2:
                S["cat_idx"] = (S["cat_idx"] + 1) % len(CATEGORY_NAMES)
                return
            # Custom
            cx1, cy1, cx2, cy2 = ui['custom']
            if cx1 <= mx <= cx2 and cy1 <= py <= cy2:
                color = pick_custom_color()
                if color:
                    S["color_name"] = "Custom"
                    S["color_bgr"] = color
                    S["recolored"] = recolor_walls(original, S["final_mask"], color)
                return
            # Swatches
            for swatch in ui['swatches']:
                sx1, sy1, sx2, sy2 = swatch['rect']
                if sx1 <= mx <= sx2 and sy1 <= py <= sy2:
                    S["color_name"] = swatch['name']
                    S["color_bgr"] = swatch['bgr']
                    if S["final_mask"] is not None:
                        S["recolored"] = recolor_walls(original, S["final_mask"], swatch['bgr'])
                    return
            return

        # Handle Image Clicks
        if S["phase"] == "SELECT" and not S["compare_mode"]:
            if event == cv2.EVENT_LBUTTONDOWN:
                S["current_poly"].append((mx, my))
                if len(S["current_poly"]) == 4:
                    pts = np.array(S["current_poly"], np.int32)
                    cv2.fillPoly(S["mask"], [pts], 255)
                    S["current_poly"] = []
            elif event == cv2.EVENT_RBUTTONDOWN:
                if S["current_poly"]: S["current_poly"].pop()

    cv2.setMouseCallback(win, on_mouse)

    print("==================================================")
    print("  v7 - COMPARE MODE ADDED")
    print("==================================================")
    print("  PHASE 1: Select walls (4 corners). Space to finish.")
    print("  PHASE 2: Recolor.")
    print("           C = Toggle Compare Mode (Side-by-Side)")
    print("           V = Snapshot this color to Left Panel")
    print("           O = Reset Left Panel to Original")
    print("==================================================")

    while True:
        # Determine panel dimensions
        if S["compare_mode"]:
            panel_w, panel_h = cmp_w, cmp_h
        else:
            panel_w, panel_h = w, h
            
        palette_bar, ui_map = draw_palette(panel_w * 2 if S["compare_mode"] else panel_w, S["cat_idx"])
        S["ui_map"] = ui_map
        
        # Prepare Active Image
        if S["recolored"] is not None:
            active_full = S["recolored"]
        else:
            active_full = original.copy()
            
        # Draw overlay if needed
        if S["phase"] == "SELECT":
             if S["overlay"]: 
                 active_full = overlay_mask(active_full, S["mask"])
             # Draw points
             for pt in S["current_poly"]:
                 cv2.circle(active_full, pt, 4, (0,0,255), -1)
             
        elif S["phase"] == "RECOLOR":
             if S["overlay"] and S["final_mask"] is not None:
                 active_full = overlay_mask(active_full, S["final_mask"])

        # Resize active to panel size if needed
        if S["compare_mode"]:
            active_panel = cv2.resize(active_full, (panel_w, panel_h), interpolation=cv2.INTER_AREA)
        else:
            active_panel = active_full

        # Annotations text
        label = f"Active: {S['color_name']}" if S["color_name"] else "Active: Original"
        put_text(active_panel, label, (10, 30))
        
        # Build Final Frame
        if S["compare_mode"]:
            # Side by side: [Reference] | [Active]
            # Reference image needs label
            ref_panel = S["ref_image"].copy()
            put_text(ref_panel, f"Ref: {S['ref_name']}", (10, 30), 0.55, (200, 200, 255))
            
            # Decorate
            cv2.line(ref_panel, (panel_w-1, 0), (panel_w-1, panel_h), (255,255,255), 2)
            
            combined_imgs = np.hstack([ref_panel, active_panel])
            frame = np.vstack([combined_imgs, palette_bar])
            
            # Compare mode HUD
            put_text(frame, "[C] Close Compare  [V] Snapshot -> Left  [O] Reset Left", 
                     (20, frame.shape[0] - PALETTE_HEIGHT - 10), 0.5, (0, 255, 255))
        else:
            # Single mode
            frame = np.vstack([active_panel, palette_bar])
            stage = "SELECT" if S["phase"] == "SELECT" else "RECOLOR"
            txt = f"[{stage}] Space=Next" if stage=="SELECT" else f"[{stage}] C=Compare Mode"
            put_text(frame, txt, (10, 60), 0.5, (200, 200, 200))

        cv2.imshow(win, frame)

        key = cv2.waitKey(30) & 0xFF
        if key in (ord('q'), ord('Q'), 27): break
        elif key == 32: # SPACE
             if S["phase"] == "SELECT":
                if np.count_nonzero(S["mask"]) > 0:
                    S["final_mask"] = S["mask"].copy()
                    S["phase"] = "RECOLOR"
                    S["overlay"] = False
        elif key in (ord('c'), ord('C')) and S["phase"] == "RECOLOR":
             S["compare_mode"] = not S["compare_mode"]
        elif key in (ord('v'), ord('V')) and S["compare_mode"]:
             # Snapshot active to reference
             S["ref_image"] = active_panel.copy()
             S["ref_name"] = S["color_name"] if S["color_name"] else "Custom"
             print("  >> Snapshot taken! (Moved Active to Left Panel)")
        elif key in (ord('o'), ord('O')) and S["compare_mode"]:
             # Reset reference
             S["ref_image"] = original_small.copy()
             S["ref_name"] = "Original"
             print("  >> Reference reset to Original.")
        elif key in (ord('m'), ord('M')): S["overlay"] = not S["overlay"]
        elif key in (ord('r'), ord('R')):
             S["mask"] = np.zeros((h, w), dtype=np.uint8)
             S["current_poly"] = []
             S["phase"] = "SELECT"
             S["recolored"] = None
             S["compare_mode"] = False
             print("  >> Reset.")
        elif key in (ord('s'), ord('S')):
             # Save logic - save side-by-side if in compare mode, else single
             if S["compare_mode"]:
                 sp = os.path.join(os.path.dirname(IMAGE_PATH), "comparison_v7.jpg")
                 # Reconstruct full res comparison if possible? 
                 # For simplicity, save the current frame (minus palette?)
                 cv2.imwrite(sp, combined_imgs)
                 print(f"  >> Saved comparison to {sp}")
             elif S["recolored"] is not None:
                 sp = os.path.join(os.path.dirname(IMAGE_PATH), "recolored_v7.jpg")
                 cv2.imwrite(sp, S["recolored"])
                 print(f"  >> Saved to {sp}")

    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
