# 🏆 Prompt Library — Setup Guide

## Folder Structure

```
prompt_library/
├── app.py                  ← Flask backend (run this)
├── prompts.json            ← Main data file (read/written by Flask)
├── templates/
│   └── index.html          ← HTML template (served by Flask)
└── static/
    ├── control.js          ← All JS logic
    ├── style.css           ← All styles
    └── prompts.json        ← Mirror of prompts.json (for direct-load fallback)
```

## How to Run

```bash
cd prompt_library
pip install flask
python app.py
```

Then open: **http://localhost:5004**

## What Was Fixed

### 1. `prompts.json` not connected
- Flask's `app.py` now uses `os.path.join(os.path.dirname(__file__), "prompts.json")` so it always finds the file regardless of working directory
- `save_data()` now **syncs both** `prompts.json` and `static/prompts.json` on every write, so the fallback always has fresh data

### 2. Missing `productFilter` in HTML
- Added a **Brand filter** (`#productFilter`) to `index.html` — it was referenced in `control.js` but missing from the HTML

### 3. Missing `overrideProduct` in modal
- Added the **Brand override** select (`#overrideProduct`) to the Add Prompt modal

### 4. Broken brand/category mapping
- The old mapping only knew KIPSTA → Football and PERFLY → Badminton
- New `transformItem()` in `control.js` correctly maps **all brands** in `prompts.json`:
  - PERFLY → Badminton
  - KIPSTA → Football  
  - Renée → Beauty
  - Lipton / TAZO / Orgain → Beverage
  - Unbranded footwear → Footwear
  - Everything else → Other

### 5. Visual Style mapping expanded
- Now detects: Holographic, Technical, Macro, UGC, Cinematic (default)

### 6. Format mapping expanded
- Animation (video/animation/stop motion/reveal/rotation) vs Image

### 7. Delete button added
- Each prompt card now has a trash icon that calls `/delete` on Flask and removes from memory

### 8. `url_for` template tags
- `index.html` correctly uses `{{ url_for('static', filename='...') }}` — only works when served via Flask (not opened as a raw file)

## Notes
- If Flask is not running, the app automatically falls back to loading `static/prompts.json` directly
- In fallback mode, new prompts added via the modal are stored in memory only (not persisted to disk)
- Always run Flask for full read/write persistence
