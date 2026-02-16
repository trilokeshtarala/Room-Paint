"""
Wall Color Changer v5 - 4-Point Polygon Selection.

PHASE 1 - Selecting Walls:
  • Click 4 points in order (Top-Left, Top-Right, Bottom-Right, Bottom-Left)
    to define a wall section. The quad will instantly fill.
  • Repeat for other wall sections.
  • Right-click = Undo last point
  • M = Toggle mask overlay
  • R = Reset selection
  • SPACE = Done selecting -> Move to Recolor Phase

PHASE 2 - Recoloring:
  • Click any color swatch at the bottom to change the wall color.
  • S = Save image
  • Q / ESC = Quit
"""

import cv2
import numpy as np
import os

# ── Config ────────────────────────────────────────────────────
IMAGE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          "bedroom image.jpeg")

COLOR_PALETTE = {
    "Sky Blue":    (210, 180, 100),
    "Mint Green":  (170, 210, 140),
    "Lavender":    (210, 160, 200),
    "Peach":       (160, 190, 240),
    "Warm Yellow": (120, 220, 240),
    "Sage Green":  (140, 175, 130),
    "Coral":       (120, 140, 230),
    "Teal":        (170, 160, 100),
    "Beige":       (180, 210, 230),
    "Light Gray":  (190, 190, 190),
    "Powder Blue": (220, 200, 170),
    "Blush Pink":  (195, 180, 225),
    "Cream":       (200, 230, 245),
    "Terracotta":  (100, 120, 200),
    "Navy":        (100,  60,  40),
    "White":       (245, 245, 245),
}

PALETTE_HEIGHT = 80
MAX_W = 900


# ── Helpers ───────────────────────────────────────────────────

def recolor_walls(original_bgr, mask, target_bgr):
    """Replace wall color exactly. Keeps original brightness (V) only."""
    hsv = cv2.cvtColor(original_bgr, cv2.COLOR_BGR2HSV).copy()
    t = np.uint8([[list(target_bgr)]])
    t_hsv = cv2.cvtColor(t, cv2.COLOR_BGR2HSV)[0][0]

    # Where mask is active, SET H and S to target values
    wall = mask > 0
    hsv[wall, 0] = t_hsv[0]   # exact target hue
    hsv[wall, 1] = t_hsv[1]   # exact target saturation

    # IMPROVED: For low-saturation targets (White/Gray), we must also adjust Brightness (V)
    # otherwise a dark wall painted white just looks dark gray.
    if t_hsv[1] < 20:  # if target is white/gray/black
        # Blend original V with target V to brighten up dark walls
        # while keeping some shadow detail (0.3 original + 0.7 target)
        v_blend = hsv[wall, 2].astype(np.float32) * 0.3 + t_hsv[2] * 0.7
        hsv[wall, 2] = np.clip(v_blend, 0, 255).astype(np.uint8)
    # else: keep original V for colored walls to preserve full texture/shadows

    recolored = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)

    # Smooth blending at mask edges
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


def draw_palette(canvas_width):
    names = list(COLOR_PALETTE.keys())
    cols = len(names)
    bar = np.zeros((PALETTE_HEIGHT, canvas_width, 3), dtype=np.uint8)
    bar[:] = (40, 40, 40)
    sw = canvas_width // cols
    rects = []
    for i, name in enumerate(names):
        x1, x2 = i * sw, (i + 1) * sw
        y1, y2 = 5, PALETTE_HEIGHT - 20
        bgr = COLOR_PALETTE[name]
        cv2.rectangle(bar, (x1+2, y1), (x2-2, y2), bgr, -1)
        # bright selection border
        cv2.rectangle(bar, (x1+2, y1), (x2-2, y2), (200,200,200), 1)
        fs = 0.3
        tw = cv2.getTextSize(name, cv2.FONT_HERSHEY_SIMPLEX, fs, 1)[0][0]
        cv2.putText(bar, name, (x1+(sw-tw)//2, PALETTE_HEIGHT-5),
                    cv2.FONT_HERSHEY_SIMPLEX, fs, (220,220,220), 1, cv2.LINE_AA)
        rects.append((x1, y1, x2, y2, name))
    return bar, rects


def put_text(img, text, pos, scale=0.55, col=(255,255,255)):
    cv2.putText(img, text, pos, cv2.FONT_HERSHEY_SIMPLEX, scale, (0,0,0), 3, cv2.LINE_AA)
    cv2.putText(img, text, pos, cv2.FONT_HERSHEY_SIMPLEX, scale, col,     1, cv2.LINE_AA)


# ── Main ──────────────────────────────────────────────────────

def main():
    original = cv2.imread(IMAGE_PATH)
    if original is None:
        print(f"ERROR: Could not load '{IMAGE_PATH}'")
        return

    h, w = original.shape[:2]
    if w > MAX_W:
        sc = MAX_W / w
        original = cv2.resize(original, None, fx=sc, fy=sc,
                              interpolation=cv2.INTER_AREA)
        h, w = original.shape[:2]

    palette_bar, swatch_rects = draw_palette(w)

    # State
    S = {
        "mask":       np.zeros((h, w), dtype=np.uint8),
        "current_poly": [],     # points for the current wall section
        "phase":      "SELECT", # SELECT or RECOLOR
        "overlay":    True,
        "color_name": None,
        "color_bgr":  None,
        "recolored":  None,
        "final_mask": None
    }

    win = "Wall Color Changer v5 - Polygon Selection"
    cv2.namedWindow(win, cv2.WINDOW_AUTOSIZE)

    def on_mouse(event, mx, my, flags, param):
        if S["phase"] == "SELECT":
            if my >= h: return

            if event == cv2.EVENT_LBUTTONDOWN:
                S["current_poly"].append((mx, my))
                # If 4 points reached, close the quad
                if len(S["current_poly"]) == 4:
                    pts = np.array(S["current_poly"], np.int32)
                    cv2.fillPoly(S["mask"], [pts], 255)
                    S["current_poly"] = []

            elif event == cv2.EVENT_RBUTTONDOWN:
                if S["current_poly"]:
                    S["current_poly"].pop()
                else:
                    # Optional: undo last drawn polygon? (Mask history not implemented for simplicity, reset works)
                    pass

        elif S["phase"] == "RECOLOR":
            if event != cv2.EVENT_LBUTTONDOWN: return
            py = my - h
            if py < 0: return

            for (x1, y1, x2, y2, name) in swatch_rects:
                if x1 <= mx <= x2 and y1 <= py <= y2:
                    S["color_name"] = name
                    S["color_bgr"] = COLOR_PALETTE[name]
                    S["recolored"] = recolor_walls(
                        original, S["final_mask"], S["color_bgr"])
                    break

    cv2.setMouseCallback(win, on_mouse)

    print("==================================================")
    print("  WALL COLOR CHANGER v5 - POLYGON SELECTION")
    print("==================================================")
    print("  PHASE 1: Click 4 points (corners) to define a wall.")
    print("           The quad will fill instantly.")
    print("           Repeat for other wall sections.")
    print("           Right-click undoes last point.")
    print("           Press SPACE when done selecting.")
    print("  PHASE 2: Click a color swatch to recolor.")
    print("  M=overlay  R=reset  S=save  Q=quit")
    print("==================================================")

    while True:
        if S["phase"] == "SELECT":
            disp = original.copy()
            if S["overlay"]:
                disp = overlay_mask(disp, S["mask"])

            # Draw lines for current polygon in progress
            pts = S["current_poly"]
            if len(pts) > 0:
                for i in range(len(pts)):
                    cv2.circle(disp, pts[i], 4, (0, 0, 255), -1)
                    if i > 0:
                        cv2.line(disp, pts[i-1], pts[i], (0, 0, 255), 2)
                # Live dynamic line to cursor (optional but nice) - requires mouse move handling, simple version OK without

            put_text(disp, f"Points: {len(pts)}/4", (10, 30), 0.6, (0, 255, 255))
            put_text(disp, "Click 4 corners of a wall section | SPACE when done",
                     (10, 60), 0.5, (200, 200, 200))
            cv2.imshow(win, disp)

        else: # RECOLOR
            base = S["recolored"] if S["recolored"] is not None \
                   else original.copy()
            disp = base.copy()
            if S["overlay"] and S["final_mask"] is not None:
                disp = overlay_mask(disp, S["final_mask"])

            label = f"Wall: {S['color_name']}" if S["color_name"] \
                    else "Select a color below"
            put_text(disp, label, (10, 30))
            
            # Combine
            full_disp = np.vstack([disp, palette_bar])
            cv2.imshow(win, full_disp)

        key = cv2.waitKey(30) & 0xFF

        if key in (ord('q'), ord('Q'), 27):
            break

        elif key == 32: # SPACE
            if S["phase"] == "SELECT":
                if np.count_nonzero(S["mask"]) == 0:
                    print("  >> Select at least one wall first!")
                else:
                    S["final_mask"] = S["mask"].copy()
                    S["phase"] = "RECOLOR"
                    S["overlay"] = False  # Auto-hide overlay so user sees true color!
                    print("  >> Selection locked! Click a color swatch.")

        elif key in (ord('m'), ord('M')):
            S["overlay"] = not S["overlay"]

        elif key in (ord('r'), ord('R')):
            S["mask"] = np.zeros((h, w), dtype=np.uint8)
            S["current_poly"] = []
            S["phase"] = "SELECT"
            S["recolored"] = None
            S["color_name"] = None
            print("  >> Reset. Start selecting walls again.")

        elif key in (ord('s'), ord('S')):
            if S["recolored"] is not None:
                 sp = os.path.join(os.path.dirname(IMAGE_PATH),
                                   "recolored_bedroom.jpg")
                 cv2.imwrite(sp, S["recolored"])
                 print(f"  >> Saved to {sp}")
            else:
                 print("  >> Nothing to save.")

    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
