#!/usr/bin/env python3
"""
Renders build/icon.png (512x512) and build/tray.png (32x32) as an authentic
geometrical 3D isometric mechanical keyboard "C" keycap in a dark stealth obsidian
palette with an illuminated industrial orange (#f97316) legend.
"""
import cairo
import math
import os
import sys

def project(x, y, z, cx=256, cy=282, scale=1.12, azimuth=math.radians(45), elevation=math.radians(35)):
    cos_a = math.cos(azimuth)
    sin_a = math.sin(azimuth)
    x_rot = x * cos_a - y * sin_a
    y_rot = x * sin_a + y * cos_a
    
    sin_e = math.sin(elevation)
    cos_e = math.cos(elevation)
    
    u = cx + x_rot * scale
    v = cy - (y_rot * sin_e + z * cos_e) * scale
    return u, v

def get_points(w, d, r, z, steps=32):
    hw = w / 2
    hd = d / 2
    r = min(r, hw, hd)
    
    corners = [
        (hw - r, hd - r, 0),
        (-hw + r, hd - r, math.pi / 2),
        (-hw + r, -hd + r, math.pi),
        (hw - r, -hd + r, 3 * math.pi / 2),
    ]
    
    points = []
    for cx_c, cy_c, start_angle in corners:
        for i in range(steps):
            theta = start_angle + (math.pi / 2) * (i / steps)
            px = cx_c + r * math.cos(theta)
            py = cy_c + r * math.sin(theta)
            points.append((px, py, z))
    return points

def render_app_icon(output_path):
    size = 512
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, size, size)
    ctx = cairo.Context(surf)
    
    # Transparent canvas
    ctx.set_operator(cairo.OPERATOR_CLEAR)
    ctx.paint()
    ctx.set_operator(cairo.OPERATOR_OVER)
    
    scale = 1.12
    cx, cy = 256, 282
    
    # 1. Multi-tier Ambient Drop Shadow & Ground Contact
    shadow_pts = get_points(312, 312, 56, z=-14, steps=32)
    proj_shadow = [project(p[0], p[1], p[2], cx=cx, cy=cy + 10, scale=scale) for p in shadow_pts]
    
    for blur in range(20, 0, -2):
        ctx.save()
        ctx.move_to(proj_shadow[0][0], proj_shadow[0][1] + blur * 1.6)
        for p in proj_shadow[1:]:
            ctx.line_to(p[0], p[1] + blur * 1.6)
        ctx.close_path()
        ctx.set_source_rgba(0, 0, 0, 0.05)
        ctx.fill()
        ctx.restore()
        
    # 2. Keycap Points
    base_w, base_d, base_r = 296, 296, 54
    top_w, top_d, top_r = 222, 222, 42
    z_top = 124
    
    base_pts = get_points(base_w, base_d, base_r, z=0, steps=32)
    top_pts = get_points(top_w, top_d, top_r, z=z_top, steps=32)
    
    proj_base = [project(p[0], p[1], p[2], cx=cx, cy=cy, scale=scale) for p in base_pts]
    proj_top = [project(p[0], p[1], p[2], cx=cx, cy=cy, scale=scale) for p in top_pts]
    
    u_vals = [p[0] for p in proj_base]
    v_vals = [p[1] for p in proj_base]
    i_left = u_vals.index(min(u_vals))
    i_right = u_vals.index(max(u_vals))
    i_front = v_vals.index(max(v_vals))
    
    # 3. Mechanical Switch Skirt / Bevel Base
    skirt_pts = get_points(base_w + 10, base_d + 10, base_r + 2, z=-8, steps=32)
    proj_skirt = [project(p[0], p[1], p[2], cx=cx, cy=cy, scale=scale) for p in skirt_pts]
    
    ctx.move_to(proj_skirt[i_left][0], proj_skirt[i_left][1])
    for i in range(i_left, i_right + 1):
        ctx.line_to(proj_skirt[i][0], proj_skirt[i][1])
    ctx.line_to(proj_base[i_right][0], proj_base[i_right][1])
    for i in range(i_right, i_left - 1, -1):
        ctx.line_to(proj_base[i][0], proj_base[i][1])
    ctx.close_path()
    pat_skirt = cairo.LinearGradient(proj_skirt[i_left][0], proj_skirt[i_left][1], proj_skirt[i_right][0], proj_skirt[i_right][1])
    pat_skirt.add_color_stop_rgba(0, 0.12, 0.12, 0.15, 1.0)
    pat_skirt.add_color_stop_rgba(0.5, 0.08, 0.08, 0.11, 1.0)
    pat_skirt.add_color_stop_rgba(1, 0.05, 0.05, 0.07, 1.0)
    ctx.set_source(pat_skirt)
    ctx.fill()
    
    # 4. Left Flank: from i_left to i_front (Key-lit dark obsidian)
    ctx.move_to(proj_base[i_left][0], proj_base[i_left][1])
    for i in range(i_left + 1, i_front + 1):
        ctx.line_to(proj_base[i][0], proj_base[i][1])
    for i in range(i_front, i_left - 1, -1):
        ctx.line_to(proj_top[i][0], proj_top[i][1])
    ctx.close_path()
    
    pat_left = cairo.LinearGradient(proj_top[i_left][0], proj_top[i_left][1], proj_base[i_front][0], proj_base[i_front][1])
    pat_left.add_color_stop_rgba(0, 0.24, 0.24, 0.29, 1.0)
    pat_left.add_color_stop_rgba(0.6, 0.16, 0.16, 0.20, 1.0)
    pat_left.add_color_stop_rgba(1.0, 0.10, 0.10, 0.13, 1.0)
    ctx.set_source(pat_left)
    ctx.fill()
    
    # Left flank subtle rim stroke
    ctx.move_to(proj_base[i_left][0], proj_base[i_left][1])
    for i in range(i_left + 1, i_front + 1):
        ctx.line_to(proj_base[i][0], proj_base[i][1])
    ctx.line_to(proj_top[i_front][0], proj_top[i_front][1])
    for i in range(i_front - 1, i_left - 1, -1):
        ctx.line_to(proj_top[i][0], proj_top[i][1])
    ctx.close_path()
    ctx.set_source_rgba(1, 1, 1, 0.08)
    ctx.set_line_width(1.0)
    ctx.stroke()
    
    # 5. Right Flank: from i_front to i_right (Secondary shadow dark charcoal)
    ctx.move_to(proj_base[i_front][0], proj_base[i_front][1])
    for i in range(i_front + 1, i_right + 1):
        ctx.line_to(proj_base[i][0], proj_base[i][1])
    for i in range(i_right, i_front - 1, -1):
        ctx.line_to(proj_top[i][0], proj_top[i][1])
    ctx.close_path()
    
    pat_right = cairo.LinearGradient(proj_top[i_right][0], proj_top[i_right][1], proj_base[i_front][0], proj_base[i_front][1])
    pat_right.add_color_stop_rgba(0, 0.16, 0.16, 0.20, 1.0)
    pat_right.add_color_stop_rgba(0.6, 0.10, 0.10, 0.13, 1.0)
    pat_right.add_color_stop_rgba(1.0, 0.06, 0.06, 0.08, 1.0)
    ctx.set_source(pat_right)
    ctx.fill()
    
    # Front Corner Ridge Specular Highlight
    ctx.move_to(proj_base[i_front][0], proj_base[i_front][1])
    ctx.line_to(proj_top[i_front][0], proj_top[i_front][1])
    pat_ridge = cairo.LinearGradient(proj_base[i_front][0], proj_base[i_front][1], proj_top[i_front][0], proj_top[i_front][1])
    pat_ridge.add_color_stop_rgba(0, 0.35, 0.35, 0.42, 0.4)
    pat_ridge.add_color_stop_rgba(0.7, 0.65, 0.65, 0.75, 0.8)
    pat_ridge.add_color_stop_rgba(1.0, 0.90, 0.90, 0.98, 0.95)
    ctx.set_source(pat_ridge)
    ctx.set_line_width(2.0)
    ctx.stroke()
    
    # 6. Keycap Top Face (Dark graphite top surface)
    ctx.move_to(proj_top[0][0], proj_top[0][1])
    for p in proj_top[1:]:
        ctx.line_to(p[0], p[1])
    ctx.close_path()
    
    top_center = project(0, 0, z_top, cx=cx, cy=cy, scale=scale)
    pat_top = cairo.LinearGradient(top_center[0] - 60, top_center[1] - 80, top_center[0] + 60, top_center[1] + 60)
    pat_top.add_color_stop_rgba(0, 0.28, 0.28, 0.34, 1.0)
    pat_top.add_color_stop_rgba(0.5, 0.18, 0.18, 0.22, 1.0)
    pat_top.add_color_stop_rgba(1.0, 0.12, 0.12, 0.15, 1.0)
    ctx.set_source(pat_top)
    ctx.fill()
    
    # Precision Chamfer Highlight Ring around top perimeter
    ctx.move_to(proj_top[0][0], proj_top[0][1])
    for p in proj_top[1:]:
        ctx.line_to(p[0], p[1])
    ctx.close_path()
    pat_chamfer = cairo.LinearGradient(top_center[0] - 80, top_center[1] - 80, top_center[0] + 80, top_center[1] + 80)
    pat_chamfer.add_color_stop_rgba(0, 0.65, 0.65, 0.75, 0.95)
    pat_chamfer.add_color_stop_rgba(0.5, 0.35, 0.35, 0.42, 0.6)
    pat_chamfer.add_color_stop_rgba(1.0, 0.18, 0.18, 0.22, 0.8)
    ctx.set_source(pat_chamfer)
    ctx.set_line_width(2.2)
    ctx.stroke()
    
    # 7. Ergonomic Spherical Keycap Dish (Deep recessed dark dish)
    dish_pts = get_points(top_w - 28, top_d - 28, top_r - 6, z=z_top - 6, steps=32)
    proj_dish = [project(p[0], p[1], p[2], cx=cx, cy=cy, scale=scale) for p in dish_pts]
    dish_center = project(0, 0, z_top - 6, cx=cx, cy=cy, scale=scale)
    
    ctx.move_to(proj_dish[0][0], proj_dish[0][1])
    for p in proj_dish[1:]:
        ctx.line_to(p[0], p[1])
    ctx.close_path()
    pat_dish = cairo.RadialGradient(dish_center[0], dish_center[1] - 15, 20, dish_center[0], dish_center[1], 130)
    pat_dish.add_color_stop_rgba(0, 0.16, 0.16, 0.20, 1.0)
    pat_dish.add_color_stop_rgba(0.7, 0.11, 0.11, 0.14, 1.0)
    pat_dish.add_color_stop_rgba(1.0, 0.08, 0.08, 0.10, 1.0)
    ctx.set_source(pat_dish)
    ctx.fill()
    
    # Dish edge rim catchlight & shadow
    ctx.move_to(proj_dish[0][0], proj_dish[0][1])
    for p in proj_dish[1:]:
        ctx.line_to(p[0], p[1])
    ctx.close_path()
    pat_dish_rim = cairo.LinearGradient(dish_center[0], dish_center[1] - 70, dish_center[0], dish_center[1] + 70)
    pat_dish_rim.add_color_stop_rgba(0, 0.04, 0.04, 0.06, 0.8)
    pat_dish_rim.add_color_stop_rgba(0.4, 0, 0, 0, 0)
    pat_dish_rim.add_color_stop_rgba(0.7, 0.35, 0.35, 0.42, 0.0)
    pat_dish_rim.add_color_stop_rgba(1.0, 0.45, 0.45, 0.55, 0.7)
    ctx.set_source(pat_dish_rim)
    ctx.set_line_width(1.8)
    ctx.stroke()
    
    # 8. Electric Vibrant Industrial Orange Glow radiating from 'C'
    for r_glow, g_alpha in [(130, 0.06), (90, 0.14), (60, 0.26), (32, 0.45)]:
        glow = cairo.RadialGradient(dish_center[0], dish_center[1], 6, dish_center[0], dish_center[1], r_glow)
        glow.add_color_stop_rgba(0, 0.98, 0.45, 0.09, g_alpha)
        glow.add_color_stop_rgba(1, 0.98, 0.45, 0.09, 0)
        ctx.set_source(glow)
        ctx.arc(dish_center[0], dish_center[1], r_glow, 0, 2 * math.pi)
        ctx.fill()
        
    # 9. Projected 'C' Key Legend (Illuminated double-shot orange legend)
    outer_r = 65
    inner_r = 35
    gap_deg = 74
    half_gap = math.radians(gap_deg / 2)
    start_ang = half_gap
    end_ang = 2 * math.pi - half_gap
    steps = 32
    
    c_pts = []
    for i in range(steps + 1):
        t = start_ang + (end_ang - start_ang) * (i / steps)
        c_pts.append((outer_r * math.cos(t), outer_r * math.sin(t)))
    for i in range(steps + 1):
        t = end_ang - (end_ang - start_ang) * (i / steps)
        c_pts.append((inner_r * math.cos(t), inner_r * math.sin(t)))
        
    rot_angle = math.radians(-45)
    cos_r, sin_r = math.cos(rot_angle), math.sin(rot_angle)
    c_proj = []
    for px, py in c_pts:
        rx = px * cos_r - py * sin_r
        ry = px * sin_r + py * cos_r
        u, v = project(rx, ry, z_top - 5, cx=cx, cy=cy, scale=scale)
        c_proj.append((u, v))
        
    ctx.move_to(c_proj[0][0], c_proj[0][1])
    for p in c_proj[1:]:
        ctx.line_to(p[0], p[1])
    ctx.close_path()
    
    pat_c = cairo.LinearGradient(dish_center[0], dish_center[1] - 45, dish_center[0], dish_center[1] + 45)
    pat_c.add_color_stop_rgba(0, 1.0, 0.72, 0.28, 1.0)     # Golden amber crest
    pat_c.add_color_stop_rgba(0.45, 0.98, 0.45, 0.09, 1.0) # Signature industrial orange #f97316
    pat_c.add_color_stop_rgba(1.0, 0.88, 0.28, 0.04, 1.0)  # Deep radiant orange
    ctx.set_source(pat_c)
    ctx.fill()
    
    # Specular rim highlight on the 'C' legend
    ctx.move_to(c_proj[0][0], c_proj[0][1])
    for p in c_proj[1:]:
        ctx.line_to(p[0], p[1])
    ctx.close_path()
    pat_c_rim = cairo.LinearGradient(dish_center[0], dish_center[1] - 45, dish_center[0], dish_center[1] + 45)
    pat_c_rim.add_color_stop_rgba(0, 1.0, 0.92, 0.70, 0.95)
    pat_c_rim.add_color_stop_rgba(0.6, 0.98, 0.45, 0.09, 0.45)
    pat_c_rim.add_color_stop_rgba(1.0, 0.75, 0.22, 0.02, 0.85)
    ctx.set_source(pat_c_rim)
    ctx.set_line_width(1.8)
    ctx.stroke()
    
    surf.write_to_png(output_path)

def render_tray_icon(output_path):
    size = 32
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, size, size)
    ctx = cairo.Context(surf)
    
    cx, cy = 16.0, 18.0
    scale = 0.070
    
    base_w, base_d, base_r = 296, 296, 54
    top_w, top_d, top_r = 222, 222, 42
    z_top = 124
    
    base_pts = get_points(base_w, base_d, base_r, z=0, steps=16)
    top_pts = get_points(top_w, top_d, top_r, z=z_top, steps=16)
    
    proj_base = [project(p[0], p[1], p[2], cx=cx, cy=cy, scale=scale) for p in base_pts]
    proj_top = [project(p[0], p[1], p[2], cx=cx, cy=cy, scale=scale) for p in top_pts]
    
    u_vals = [p[0] for p in proj_base]
    v_vals = [p[1] for p in proj_base]
    i_left = u_vals.index(min(u_vals))
    i_right = u_vals.index(max(u_vals))
    i_front = v_vals.index(max(v_vals))
    
    # Skirt
    skirt_pts = get_points(base_w + 12, base_d + 12, base_r + 2, z=-8, steps=16)
    proj_skirt = [project(p[0], p[1], p[2], cx=cx, cy=cy, scale=scale) for p in skirt_pts]
    
    ctx.move_to(proj_skirt[i_left][0], proj_skirt[i_left][1])
    for i in range(i_left, i_right + 1):
        ctx.line_to(proj_skirt[i][0], proj_skirt[i][1])
    ctx.line_to(proj_base[i_right][0], proj_base[i_right][1])
    for i in range(i_right, i_left - 1, -1):
        ctx.line_to(proj_base[i][0], proj_base[i][1])
    ctx.close_path()
    ctx.set_source_rgb(0.08, 0.08, 0.11)
    ctx.fill()
    
    # Left Flank
    ctx.move_to(proj_base[i_left][0], proj_base[i_left][1])
    for i in range(i_left + 1, i_front + 1):
        ctx.line_to(proj_base[i][0], proj_base[i][1])
    for i in range(i_front, i_left - 1, -1):
        ctx.line_to(proj_top[i][0], proj_top[i][1])
    ctx.close_path()
    ctx.set_source_rgb(0.24, 0.24, 0.30)
    ctx.fill()
    
    # Right Flank
    ctx.move_to(proj_base[i_front][0], proj_base[i_front][1])
    for i in range(i_front + 1, i_right + 1):
        ctx.line_to(proj_base[i][0], proj_base[i][1])
    for i in range(i_right, i_front - 1, -1):
        ctx.line_to(proj_top[i][0], proj_top[i][1])
    ctx.close_path()
    ctx.set_source_rgb(0.12, 0.12, 0.16)
    ctx.fill()
    
    # Top Face
    ctx.move_to(proj_top[0][0], proj_top[0][1])
    for p in proj_top[1:]:
        ctx.line_to(p[0], p[1])
    ctx.close_path()
    ctx.set_source_rgb(0.18, 0.18, 0.23)
    ctx.fill()
    
    # Crisp rim stroke for tray contrast
    ctx.move_to(proj_top[0][0], proj_top[0][1])
    for p in proj_top[1:]:
        ctx.line_to(p[0], p[1])
    ctx.close_path()
    ctx.set_source_rgba(0.7, 0.7, 0.8, 0.9)
    ctx.set_line_width(0.9)
    ctx.stroke()
    
    # Front Corner Ridge
    ctx.move_to(proj_base[i_front][0], proj_base[i_front][1])
    ctx.line_to(proj_top[i_front][0], proj_top[i_front][1])
    ctx.set_source_rgba(0.8, 0.8, 0.9, 0.95)
    ctx.set_line_width(1.0)
    ctx.stroke()
    
    # 'C' on Top face in radiant industrial orange
    outer_r = 74
    inner_r = 28
    gap_deg = 80
    half_gap = math.radians(gap_deg / 2)
    start_ang = half_gap
    end_ang = 2 * math.pi - half_gap
    steps = 24
    
    c_pts = []
    for i in range(steps + 1):
        t = start_ang + (end_ang - start_ang) * (i / steps)
        c_pts.append((outer_r * math.cos(t), outer_r * math.sin(t)))
    for i in range(steps + 1):
        t = end_ang - (end_ang - start_ang) * (i / steps)
        c_pts.append((inner_r * math.cos(t), inner_r * math.sin(t)))
        
    rot_angle = math.radians(-45)
    cos_r, sin_r = math.cos(rot_angle), math.sin(rot_angle)
    c_proj = []
    for px, py in c_pts:
        rx = px * cos_r - py * sin_r
        ry = px * sin_r + py * cos_r
        u, v = project(rx, ry, z_top - 5, cx=cx, cy=cy, scale=scale)
        c_proj.append((u, v))
        
    ctx.move_to(c_proj[0][0], c_proj[0][1])
    for p in c_proj[1:]:
        ctx.line_to(p[0], p[1])
    ctx.close_path()
    ctx.set_source_rgb(0.98, 0.45, 0.09)
    ctx.fill()
    
    surf.write_to_png(output_path)

if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    build_dir = os.path.join(base_dir, 'build')
    os.makedirs(build_dir, exist_ok=True)
    
    icon_path = os.path.join(build_dir, 'icon.png')
    tray_path = os.path.join(build_dir, 'tray.png')
    
    render_app_icon(icon_path)
    render_tray_icon(tray_path)
    print(f"wrote {icon_path} (512x512) and {tray_path} (32x32)")
