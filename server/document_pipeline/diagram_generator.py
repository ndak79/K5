import json
import os
import sys
from PIL import Image, ImageDraw, ImageFont

def get_font(size, bold=False, italic=False):
    font_dir = "C:/Windows/Fonts"
    if bold and italic:
        f = "timesbi.ttf"
    elif bold:
        f = "timesbd.ttf"
    elif italic:
        f = "timesi.ttf"
    else:
        f = "times.ttf"
    path = os.path.join(font_dir, f)
    if os.path.exists(path):
        return ImageFont.truetype(path, size)
    return ImageFont.load_default()

def wrap_text(text, font, max_w, draw):
    words = text.split()
    lines = []
    curr = []
    for w in words:
        cand = ' '.join(curr + [w])
        bbox = draw.textbbox((0, 0), cand, font=font)
        if (bbox[2] - bbox[0]) <= max_w:
            curr.append(w)
        else:
            if curr:
                lines.append(' '.join(curr))
                curr = [w]
            else:
                lines.append(w)
                curr = []
    if curr:
        lines.append(' '.join(curr))
    return lines

def render_diagram(data, output_path):
    title = data.get("title", "Bài học").strip()
    sections = data.get("sections", [])
    
    # Calculate total columns needed
    leaf_counts = [max(1, len(s.get("children", []))) for s in sections]
    total_leaves = sum(leaf_counts)
    if total_leaves == 0:
        total_leaves = 1
        
    # Scale factor for crisp retina rendering (2x)
    scale = 2
    
    # Dimensions in virtual pixels (then multiplied by scale)
    box_gap_x = 16
    leaf_w = 175
    leaf_h = 100
    
    # Total width based on leaves
    inner_width = total_leaves * leaf_w + (total_leaves - 1) * box_gap_x
    margin_x = 30
    margin_y = 30
    
    root_w = min(280, max(220, inner_width // 2))
    root_h = 80
    sec_h = 60
    
    v_gap_1 = 45  # Gap between root and level 1
    v_gap_2 = 45  # Gap between level 1 and level 2
    
    total_w = inner_width + margin_x * 2
    total_h = margin_y * 2 + root_h + v_gap_1 + sec_h + v_gap_2 + leaf_h
    
    # Create image with pure white background
    img = Image.new("RGB", (int(total_w * scale), int(total_h * scale)), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    
    # Fonts
    font_root = get_font(int(15 * scale), bold=True)
    font_sec = get_font(int(14 * scale), bold=True)
    font_leaf = get_font(int(12 * scale), bold=False)
    
    # Colors matching the user screenshot
    root_bg = (116, 98, 224)      # Purple in screenshot (#7462E0)
    root_text = (255, 255, 255)
    
    sec_bg = (255, 255, 255)
    sec_border = (100, 116, 139)   # Slate border
    sec_text = (30, 41, 59)
    
    leaf_bg = (255, 255, 255)
    leaf_border = (147, 197, 253)  # Soft blue/cyan border (#93C5FD)
    leaf_text = (15, 23, 42)
    
    line_color = (71, 85, 105)     # Dark slate lines
    line_w = int(1.5 * scale)
    
    # 1. Compute positions for leaf boxes
    curr_leaf_idx = 0
    sec_positions = []
    leaf_positions = []
    
    for s_idx, sec in enumerate(sections):
        children = sec.get("children", [])
        if not children:
            children = [sec.get("title", "")]
            
        sec_leaf_boxes = []
        for ch in children:
            lx = margin_x + curr_leaf_idx * (leaf_w + box_gap_x)
            ly = margin_y + root_h + v_gap_1 + sec_h + v_gap_2
            sec_leaf_boxes.append({
                "x": lx, "y": ly, "w": leaf_w, "h": leaf_h, "text": ch
            })
            curr_leaf_idx += 1
            
        leaf_positions.append(sec_leaf_boxes)
        
        # Section box is centered over its leaf boxes
        first_box = sec_leaf_boxes[0]
        last_box = sec_leaf_boxes[-1]
        sec_span_w = (last_box["x"] + last_box["w"]) - first_box["x"]
        sec_w = min(sec_span_w - 10, max(160, sec_span_w * 0.85))
        sec_x = first_box["x"] + (sec_span_w - sec_w) / 2
        sec_y = margin_y + root_h + v_gap_1
        
        sec_positions.append({
            "x": sec_x, "y": sec_y, "w": sec_w, "h": sec_h,
            "text": sec.get("title", "")
        })
        
    # 2. Root box position (centered horizontally)
    root_x = margin_x + (inner_width - root_w) / 2
    root_y = margin_y
    root_bottom_center = (root_x + root_w / 2, root_y + root_h)
    
    # 3. Draw Connecting Lines first (so boxes sit on top cleanly)
    # Line from Root to each Section box
    for sec_pos in sec_positions:
        sec_top_center = (sec_pos["x"] + sec_pos["w"] / 2, sec_pos["y"])
        draw.line([
            (int(root_bottom_center[0] * scale), int(root_bottom_center[1] * scale)),
            (int(sec_top_center[0] * scale), int(sec_top_center[1] * scale))
        ], fill=line_color, width=line_w)
        
    # Line from each Section box to its leaf boxes
    for s_idx, sec_pos in enumerate(sections):
        sec_box = sec_positions[s_idx]
        sec_bottom_center = (sec_box["x"] + sec_box["w"] / 2, sec_box["y"] + sec_box["h"])
        for leaf_box in leaf_positions[s_idx]:
            leaf_top_center = (leaf_box["x"] + leaf_box["w"] / 2, leaf_box["y"])
            draw.line([
                (int(sec_bottom_center[0] * scale), int(sec_bottom_center[1] * scale)),
                (int(leaf_top_center[0] * scale), int(leaf_top_center[1] * scale))
            ], fill=line_color, width=line_w)
            
    # 4. Draw Root Box (Rounded rectangle, purple, white text)
    r_coords = [
        int(root_x * scale), int(root_y * scale),
        int((root_x + root_w) * scale), int((root_y + root_h) * scale)
    ]
    draw.rounded_rectangle(r_coords, radius=int(14 * scale), fill=root_bg)
    
    # Draw Root text (wrapped, centered)
    title_lines = []
    if ":" in title:
        parts = title.split(":", 1)
        title_lines.append(parts[0].strip() + ":")
        rem = parts[1].strip()
    else:
        rem = title
    wrapped_rem = wrap_text(rem, font_root, int((root_w - 24) * scale), draw)
    title_lines.extend(wrapped_rem)
    
    line_h = int(18 * scale)
    total_text_h = len(title_lines) * line_h
    start_ty = r_coords[1] + (r_coords[3] - r_coords[1] - total_text_h) // 2
    for l_idx, line in enumerate(title_lines):
        tb = draw.textbbox((0, 0), line, font=font_root)
        lw = tb[2] - tb[0]
        tx = r_coords[0] + (r_coords[2] - r_coords[0] - lw) // 2
        ty = start_ty + l_idx * line_h
        draw.text((tx, ty), line, font=font_root, fill=root_text)
        
    # 5. Draw Level 1 Section Boxes (Sharp rectangle, white bg, slate border, bold text)
    for s_box in sec_positions:
        s_coords = [
            int(s_box["x"] * scale), int(s_box["y"] * scale),
            int((s_box["x"] + s_box["w"]) * scale), int((s_box["y"] + s_box["h"]) * scale)
        ]
        draw.rectangle(s_coords, fill=sec_bg, outline=sec_border, width=int(1.5 * scale))
        
        s_lines = wrap_text(s_box["text"], font_sec, int((s_box["w"] - 16) * scale), draw)
        s_line_h = int(18 * scale)
        s_total_h = len(s_lines) * s_line_h
        s_start_ty = s_coords[1] + (s_coords[3] - s_coords[1] - s_total_h) // 2
        for l_idx, line in enumerate(s_lines):
            tb = draw.textbbox((0, 0), line, font=font_sec)
            lw = tb[2] - tb[0]
            tx = s_coords[0] + (s_coords[2] - s_coords[0] - lw) // 2
            ty = s_start_ty + l_idx * s_line_h
            draw.text((tx, ty), line, font=font_sec, fill=sec_text)
            
    # 6. Draw Level 2 Leaf Boxes (Rounded rectangle, white bg, soft blue border)
    for s_idx in range(len(sections)):
        for l_box in leaf_positions[s_idx]:
            l_coords = [
                int(l_box["x"] * scale), int(l_box["y"] * scale),
                int((l_box["x"] + l_box["w"]) * scale), int((l_box["y"] + l_box["h"]) * scale)
            ]
            draw.rounded_rectangle(l_coords, radius=int(12 * scale), fill=leaf_bg, outline=leaf_border, width=int(1.5 * scale))
            
            l_lines = wrap_text(l_box["text"], font_leaf, int((l_box["w"] - 18) * scale), draw)
            l_line_h = int(16 * scale)
            l_total_h = len(l_lines) * l_line_h
            l_start_ty = l_coords[1] + (l_coords[3] - l_coords[1] - l_total_h) // 2
            for l_idx, line in enumerate(l_lines):
                tb = draw.textbbox((0, 0), line, font=font_leaf)
                lw = tb[2] - tb[0]
                tx = l_coords[0] + (l_coords[2] - l_coords[0] - lw) // 2
                ty = l_start_ty + l_idx * l_line_h
                draw.text((tx, ty), line, font=font_leaf, fill=leaf_text)
                
    img.save(output_path, "PNG")
    print(f"OK:{output_path}:{int(total_w)}:{int(total_h)}")

if __name__ == "__main__":
    if len(sys.argv) > 2:
        input_json_path = sys.argv[1]
        output_png_path = sys.argv[2]
        with open(input_json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        render_diagram(data, output_png_path)
    elif len(sys.argv) == 2 and sys.argv[1] == "--demo":
        demo_data = {
            "title": "Bài 4: Uy tín, truyền thống trong tập thể quân nhân",
            "sections": [
                {
                    "title": "Uy tín trong tập thể quân nhân",
                    "children": [
                        "Khái niệm, bản chất của uy tín",
                        "Sự hình thành, phát triển uy tín người cán bộ",
                        "Biện pháp xây dựng, củng cố và nâng cao uy tín của sĩ quan cấp phân đội trong tập thể quân nhân"
                    ]
                },
                {
                    "title": "Truyền thống tập thể quân nhân",
                    "children": [
                        "Khái niệm, vai trò, phân loại truyền thống tập thể quân nhân",
                        "Đặc điểm và nội dung cơ bản của truyền thống Quân đội nhân dân Việt Nam",
                        "Biện pháp giữ gìn, phát huy truyền thống tập thể quân nhân"
                    ]
                }
            ]
        }
        render_diagram(demo_data, "test_rendered_diagram.png")
