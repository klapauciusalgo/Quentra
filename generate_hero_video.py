import math
import subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

def generate_loop_video(output_path="frontend/public/videos/hero_quant_motion.mp4"):
    width, height = 960, 540
    fps = 30
    duration_sec = 6
    total_frames = fps * duration_sec

    # Start ffmpeg process writing to pipe
    cmd = [
        "ffmpeg", "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{width}x{height}",
        "-pix_fmt", "rgb24",
        "-r", str(fps),
        "-i", "-",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "faster",
        "-crf", "22",
        "-movflags", "+faststart",
        output_path
    ]
    
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    # Precompute 120 static particle seeds
    np.random.seed(42)
    num_particles = 90
    p_x = np.random.uniform(0, width, num_particles)
    p_base_y = np.random.uniform(0, height, num_particles)
    p_speed = np.random.uniform(0.5, 2.0, num_particles)
    p_radius = np.random.uniform(1.2, 3.5, num_particles)
    p_alpha = np.random.uniform(80, 240, num_particles)

    # Precompute 16 candle x positions and heights
    candle_count = 20
    c_x = np.linspace(80, width - 80, candle_count)
    c_base_open = np.array([280, 290, 275, 310, 305, 340, 325, 360, 350, 390, 375, 410, 400, 430, 420, 450, 440, 470, 460, 480], dtype=float)
    # in screen coords, smaller y = higher price
    c_screen_y = height - c_base_open * 0.9

    for frame in range(total_frames):
        t = frame / total_frames # 0 to 1
        phase = t * 2 * math.pi

        # Create dark tech slate background
        img = Image.new("RGB", (width, height), (7, 11, 20))
        draw = ImageDraw.Draw(img)

        # 1. Perspective 3D Grid floor at bottom
        grid_horizon = int(height * 0.48)
        num_grid_lines = 12
        for i in range(num_grid_lines + 1):
            gx = (i / num_grid_lines) * width
            # Draw lines radiating from vanishing point (width/2, grid_horizon)
            vp_x = width * 0.5 + math.sin(phase) * 30
            vp_y = grid_horizon
            draw.line([(vp_x, vp_y), (gx, height)], fill=(18, 32, 58), width=1)

        # Horizontal grid rungs moving forward
        num_rungs = 10
        for r in range(num_rungs):
            rung_prog = (r / num_rungs + t) % 1.0
            # non-linear perspective mapping
            persp_y = grid_horizon + (rung_prog ** 2.2) * (height - grid_horizon)
            rung_alpha = int(rung_prog * 70)
            draw.line([(0, persp_y), (width, persp_y)], fill=(20, 38, 70), width=1)

        # 2. Cyan / Blue ambient glow orb in center
        orb_x = width * 0.5 + math.cos(phase) * 60
        orb_y = height * 0.42 + math.sin(phase * 2) * 20
        # Draw concentric glow circles
        for r in range(120, 20, -15):
            glow_col = (10, int(30 + (120 - r) * 0.6), int(70 + (120 - r) * 1.2))
            draw.ellipse([orb_x - r, orb_y - r * 0.6, orb_x + r, orb_y + r * 0.6], outline=glow_col, width=1)

        # 3. Dynamic Sine Wave algorithmic trend line
        wave_pts = []
        for x in range(0, width, 12):
            w_prog = x / width
            wy = height * 0.48 + math.sin(w_prog * 4 * math.pi + phase) * 35 + math.cos(w_prog * 8 * math.pi - phase) * 15
            wave_pts.append((x, wy))
        
        # Draw wave shadow and bright core
        for i in range(len(wave_pts) - 1):
            draw.line([wave_pts[i], wave_pts[i+1]], fill=(0, 113, 227), width=3)
        for i in range(len(wave_pts) - 1):
            draw.line([wave_pts[i], wave_pts[i+1]], fill=(0, 210, 255), width=1)

        # 4. Candlesticks with pulsing active live candle
        for idx in range(candle_count):
            cx = c_x[idx]
            # base price wave
            wave_offset = math.sin(idx * 0.6 + phase) * 12
            cy = c_screen_y[idx] + wave_offset
            candle_h = 24 + math.sin(idx * 1.2 + phase) * 10
            is_green = idx % 3 != 0
            body_col = (48, 209, 88) if is_green else (255, 69, 58)
            wick_col = (70, 230, 110) if is_green else (255, 100, 90)

            # wick
            draw.line([(cx, cy - candle_h * 0.6), (cx, cy + candle_h * 0.6)], fill=wick_col, width=1)
            # body
            draw.rectangle([cx - 5, cy - candle_h * 0.35, cx + 5, cy + candle_h * 0.35], fill=body_col)

            # Special aura for latest live candle (last 2)
            if idx >= candle_count - 2:
                halo_r = 10 + math.sin(phase * 4) * 3
                draw.ellipse([cx - halo_r, cy - halo_r, cx + halo_r, cy + halo_r], outline=(0, 210, 255), width=1)

        # 5. Floating upward cyber particles
        for i in range(num_particles):
            cur_y = (p_base_y[i] - t * p_speed[i] * height) % height
            cur_x = p_x[i] + math.sin(phase + i) * 12
            rad = p_radius[i]
            col_g = int(140 + math.sin(i) * 60)
            draw.ellipse([cur_x - rad, cur_y - rad, cur_x + rad, cur_y + rad], fill=(0, col_g, 255))

        # 6. Sweeping Laser Scanline
        scan_y = int((t * 1.5 % 1.0) * height)
        draw.line([(0, scan_y), (width, scan_y)], fill=(0, 210, 255), width=1)

        # Convert image to raw bytes and pipe to ffmpeg
        proc.stdin.write(img.tobytes())

    proc.stdin.close()
    proc.wait()
    print(f"Video generated successfully at {output_path}!")

if __name__ == "__main__":
    generate_loop_video()
