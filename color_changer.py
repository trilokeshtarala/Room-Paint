"""
Wall Color Changer v4 - Manual mask painting + Flood Fill.

PHASE 1 - Paint the wall mask:
  Left-click + drag   = PAINT  (mark as wall - green overlay)
  Right-click + drag   = ERASE (unmark)
  Middle-click         = FLOOD FILL (magic wand - fill similar region)
  F                    = Toggle flood-fill mode for LEFT click
  [ / ]                = Decrease / increase brush size
  + / -                = Increase / decrease flood fill tolerance
  SPACE                = Lock mask, move to recolour phase

PHASE 2 - Recolour:
  Click a colour swatch to change wall colour.

General:
  M = Toggle mask overlay   R = Reset   S = Save   Q/ESC = Quit
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

    # Where mask is active, SET H and S to target values (not blend)
    wall = mask > 0
    hsv[wall, 0] = t_hsv[0]   # exact target hue
    hsv[wall, 1] = t_hsv[1]   # exact target saturation
    # V channel stays untouched -> preserves shadows, highlights, texture

    recolored = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)

    # Smooth blending at mask edges to avoid hard cutoff
    alpha = cv2.GaussianBlur(mask, (15, 15), 0).astype(np.float32) / 255.0
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

    # All mutable state in a dict to avoid nonlocal scoping issues
    # Pre-compute edge map for edge-aware flood fill
    gray = cv2.cvtColor(original, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150)
    edges = cv2.dilate(edges, np.ones((3, 3), dtype=np.uint8), iterations=1)

    S = {
        "mask":       np.zeros((h, w), dtype=np.uint8),
        "brush":      20,
        "flood_tol":  10,
        "phase":      "PAINT",
        "overlay":    True,
        "flood_mode": False,
        "painting":   False,
        "erasing":    False,
        "color_name": None,
        "color_bgr":  None,
        "recolored":  None,
        "locked_mask": None,
    }

    win = "Wall Color Changer v4"
    cv2.namedWindow(win, cv2.WINDOW_AUTOSIZE)

    def on_mouse(event, mx, my, flags, param):
        if S["phase"] == "PAINT":
            if my >= h:
                return

            # Flood fill: middle click, or left click in flood mode
            if event == cv2.EVENT_MBUTTONDOWN or \
               (event == cv2.EVENT_LBUTTONDOWN and S["flood_mode"]):
                flood_mask = np.zeros((h + 2, w + 2), dtype=np.uint8)
                # Inject edges into flood mask so fill can't cross boundaries
                flood_mask[1:h+1, 1:w+1] = (edges > 0).astype(np.uint8)
                lo = (S["flood_tol"],) * 3
                hi = (S["flood_tol"],) * 3
                temp = original.copy()
                cv2.floodFill(temp, flood_mask, (mx, my), (0, 0, 0),
                              loDiff=lo, upDiff=hi,
                              flags=cv2.FLOODFILL_MASK_ONLY | (255 << 8))
                filled = flood_mask[1:h+1, 1:w+1]
                # Remove the original edge pixels from the fill result
                filled[edges > 0] = 0
                S["mask"] = cv2.bitwise_or(S["mask"], filled)
                return

            # Brush paint (left)
            if event == cv2.EVENT_LBUTTONDOWN:
                S["painting"] = True
                cv2.circle(S["mask"], (mx, my), S["brush"], 255, -1)
            elif event == cv2.EVENT_MOUSEMOVE and S["painting"]:
                cv2.circle(S["mask"], (mx, my), S["brush"], 255, -1)
            elif event == cv2.EVENT_LBUTTONUP:
                S["painting"] = False

            # Brush erase (right)
            if event == cv2.EVENT_RBUTTONDOWN:
                S["erasing"] = True
                cv2.circle(S["mask"], (mx, my), S["brush"], 0, -1)
            elif event == cv2.EVENT_MOUSEMOVE and S["erasing"]:
                cv2.circle(S["mask"], (mx, my), S["brush"], 0, -1)
            elif event == cv2.EVENT_RBUTTONUP:
                S["erasing"] = False

            # Scroll = brush size
            if event == cv2.EVENT_MOUSEWHEEL:
                if flags > 0:
                    S["brush"] = min(100, S["brush"] + 3)
                else:
                    S["brush"] = max(3, S["brush"] - 3)

        elif S["phase"] == "RECOLOR":
            if event != cv2.EVENT_LBUTTONDOWN:
                return
            py = my - h
            if py < 0:
                return
            for (x1, y1, x2, y2, name) in swatch_rects:
                if x1 <= mx <= x2 and y1 <= py <= y2:
                    S["color_name"] = name
                    S["color_bgr"] = COLOR_PALETTE[name]
                    S["recolored"] = recolor_walls(
                        original, S["locked_mask"], S["color_bgr"])
                    break

    cv2.setMouseCallback(win, on_mouse)

    print("==================================================")
    print("  WALL COLOR CHANGER v4 - PAINT YOUR MASK")
    print("==================================================")
    print("  LEFT DRAG    = Paint wall area (green)")
    print("  RIGHT DRAG   = Erase mistake")
    print("  MIDDLE CLICK = Flood fill (magic wand)")
    print("  F            = Toggle flood-fill on left click")
    print("  SCROLL / [ ] = Brush size     +/- = Flood tol")
    print("  SPACE        = Lock mask -> recolour phase")
    print("  M=overlay  R=reset  S=save  Q=quit")
    print("==================================================")

    while True:
        if S["phase"] == "PAINT":
            disp = original.copy()
            if S["overlay"]:
                disp = overlay_mask(disp, S["mask"])

            mode_lbl = "FLOOD FILL (click to fill)" if S["flood_mode"] \
                       else "BRUSH (left=paint, right=erase)"
            pct = int(np.count_nonzero(S["mask"]) / S["mask"].size * 100)
            put_text(disp, f"MODE: {mode_lbl}",
                     (10, 25), 0.5, (0, 255, 255))
            put_text(disp,
                     f"Brush: {S['brush']}px | Flood tol: {S['flood_tol']} | Mask: {pct}%",
                     (10, 50), 0.45, (200, 200, 200))
            put_text(disp, "SPACE=lock  F=flood  M=overlay  R=reset",
                     (10, 73), 0.4, (180, 180, 180))
            cv2.imshow(win, disp)

        else:  # RECOLOR
            base = S["recolored"] if S["recolored"] is not None else original.copy()
            disp = base.copy()
            if S["overlay"] and S["locked_mask"] is not None:
                disp = overlay_mask(disp, S["locked_mask"])
            label = f"Wall: {S['color_name']}" if S["color_name"] \
                    else "Click a colour swatch below"
            put_text(disp, label, (10, 30))
            disp = np.vstack([disp, palette_bar])
            cv2.imshow(win, disp)

        key = cv2.waitKey(30) & 0xFF

        if key in (ord('q'), ord('Q'), 27):
            break

        elif key == 32:  # SPACE
            if S["phase"] == "PAINT":
                if np.count_nonzero(S["mask"]) == 0:
                    print("  >> Paint some wall area first!")
                else:
                    S["locked_mask"] = cv2.GaussianBlur(S["mask"], (15, 15), 0)
                    S["phase"] = "RECOLOR"
                    print("  >> Mask locked! Click a colour swatch.")

        elif key in (ord('f'), ord('F')) and S["phase"] == "PAINT":
            S["flood_mode"] = not S["flood_mode"]
            st = "ON (left click = flood fill)" if S["flood_mode"] \
                 else "OFF (left click = brush)"
            print(f"  >> Flood fill mode: {st}")

        elif key in (ord('m'), ord('M')):
            S["overlay"] = not S["overlay"]

        elif key in (ord('r'), ord('R')):
            S["mask"] = np.zeros((h, w), dtype=np.uint8)
            S["recolored"] = None
            S["locked_mask"] = None
            S["color_name"] = None
            S["color_bgr"] = None
            S["phase"] = "PAINT"
            S["overlay"] = True
            S["flood_mode"] = False
            print("  >> Reset. Paint the walls again.")

        elif key in (ord('+'), ord('=')):
            S["flood_tol"] = min(100, S["flood_tol"] + 5)
            print(f"  >> Flood tolerance: {S['flood_tol']}")

        elif key == ord('-'):
            S["flood_tol"] = max(5, S["flood_tol"] - 5)
            print(f"  >> Flood tolerance: {S['flood_tol']}")

        elif key == ord('['):
            S["brush"] = max(3, S["brush"] - 5)
            print(f"  >> Brush: {S['brush']}px")

        elif key == ord(']'):
            S["brush"] = min(100, S["brush"] + 5)
            print(f"  >> Brush: {S['brush']}px")

        elif key in (ord('s'), ord('S')):
            if S["recolored"] is not None:
                sp = os.path.join(os.path.dirname(IMAGE_PATH),
                                  "recolored_bedroom.jpg")
                cv2.imwrite(sp, S["recolored"])
                print(f"  >> Saved to {sp}")
            else:
                print("  >> Nothing to save yet!")

    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
