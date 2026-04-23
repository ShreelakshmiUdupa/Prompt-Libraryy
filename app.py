from flask import Flask, request, jsonify, render_template, send_from_directory, send_file
import json
import os
import uuid
from datetime import datetime

app = Flask(__name__, static_folder='static', template_folder='templates')
app.static_url_path = '/static'
FILE = os.path.join(os.path.dirname(__file__), "prompts.json")

def load_data():
    if not os.path.exists(FILE):
        return []
    with open(FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_data(data):
    with open(FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    # Also sync to static folder so direct JSON fallback works
    static_file = os.path.join(os.path.dirname(__file__), "static", "prompts.json")
    with open(static_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/get")
def get():
    return jsonify(load_data())

@app.route("/add", methods=["POST"])
def add():
    data = request.json
    prompts = load_data()
    new_prompt = {
        "id": str(uuid.uuid4()),
        "title": data["title"],
        "category": data["category"],
        "brand": data.get("brand", "KIPSTA"),
        "product_type": data.get("product_type", "sports"),
        "content": data["content"],
        "favorite": False,
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M")
    }
    prompts.append(new_prompt)
    save_data(prompts)
    return jsonify({"success": True, "id": new_prompt["id"]})

@app.route("/delete", methods=["POST"])
def delete():
    prompt_id = request.json["id"]
    prompts = [p for p in load_data() if p["id"] != prompt_id]
    save_data(prompts)
    return jsonify({"success": True})

@app.route("/edit", methods=["POST"])
def edit():
    data = request.json
    prompts = load_data()
    for p in prompts:
        if p["id"] == data["id"]:
            p["title"] = data["title"]
            p["category"] = data["category"]
            p["content"] = data["content"]
            p["brand"] = data.get("brand", p.get("brand", "KIPSTA"))
    save_data(prompts)
    return jsonify({"success": True})

@app.route("/favorite", methods=["POST"])
def favorite():
    prompt_id = request.json["id"]
    prompts = load_data()
    for p in prompts:
        if p["id"] == prompt_id:
            p["favorite"] = not p.get("favorite", False)
    save_data(prompts)
    return jsonify({"success": True})

@app.route("/bulk-add", methods=["POST"])
def bulk_add():
    data = request.json
    prompts = load_data()
    for item in data.get("prompts", []):
        prompts.append({
            "id": str(uuid.uuid4()),
            "title": item.get("title", "Untitled"),
            "category": item.get("category", "General"),
            "brand": item.get("brand", "KIPSTA"),
            "product_type": item.get("product_type", "sports"),
            "content": item.get("content", ""),
            "favorite": False,
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M")
        })
    save_data(prompts)
    return jsonify({"success": True, "count": len(data.get("prompts", []))})

if __name__ == "__main__":
    app.run(debug=True, port=5006, host='0.0.0.0')
@app.route("/ai/improve", methods=["POST"])
def ai_improve():
    text = request.json.get("text", "")
    return jsonify({
        "result": text + " | AI enhanced version"
    })