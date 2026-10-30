import sys
import os
import sqlite3
import json
import uuid
import urllib.parse
from datetime import datetime, timezone

def get_base_dir():
    user_home = os.path.expanduser("~")
    base_dir = os.path.join(user_home, ".gemini", "antigravity")
    return base_dir

def get_db_path():
    return os.path.join(get_base_dir(), "conversation_summaries.db")

def get_brain_dir():
    return os.path.join(get_base_dir(), "brain")

def list_projects():
    db_path = get_db_path()
    if not os.path.exists(db_path):
        return []

    try:
        conn = sqlite3.connect(db_path, timeout=5.0)
        cursor = conn.cursor()
        rows = cursor.execute("""
            SELECT conversation_id, title, preview, step_count, datetime(last_modified_time) as lmt, workspace_uris
            FROM conversation_summaries
            ORDER BY last_modified_time DESC
        """).fetchall()
        conn.close()
    except Exception as e:
        return {"error": str(e)}

    projects = {}
    for cid, title, preview, step_count, lmt, w_uris in rows:
        ws_path = "General"
        ws_name = "General"
        if w_uris:
            try:
                uris = json.loads(w_uris)
                if uris and uris[0]:
                    raw_uri = uris[0]
                    if raw_uri.startswith("file:///"):
                        clean_path = urllib.parse.unquote(raw_uri.replace("file:///", ""))
                        ws_path = clean_path.replace("\\", "/")
                        base = os.path.basename(clean_path.rstrip("/\\"))
                        ws_name = base if base else clean_path
            except Exception:
                pass

        if ws_path not in projects:
            projects[ws_path] = {
                "path": ws_path,
                "name": ws_name,
                "chats": []
            }

        display_title = title.strip() if (title and title.strip()) else (
            preview.strip() if (preview and preview.strip()) else f"Chat {cid[:8]}"
        )
        # Limit title length
        if len(display_title) > 60:
            display_title = display_title[:57] + "..."

        projects[ws_path]["chats"].append({
            "id": cid,
            "title": display_title,
            "step_count": step_count or 0,
            "updated": lmt or ""
        })

    # Convert to list and sort by most recently active project
    result = list(projects.values())
    result.sort(key=lambda p: (p["chats"][0]["updated"] if p["chats"] else ""), reverse=True)
    return result

def get_conversation_history(cid):
    log_path = os.path.join(get_brain_dir(), cid, ".system_generated", "logs", "transcript.jsonl")
    if not os.path.exists(log_path):
        # Return empty list if folder doesn't exist yet
        return {"id": cid, "messages": []}

    messages = []
    try:
        with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    step = json.loads(line)
                    stype = step.get("type")
                    if stype == "USER_INPUT":
                        raw = step.get("content", "")
                        clean = raw.replace("<USER_REQUEST>", "").replace("</USER_REQUEST>", "").strip()
                        if "<ADDITIONAL_METADATA>" in clean:
                            clean = clean.split("<ADDITIONAL_METADATA>")[0].strip()
                        messages.append({
                            "role": "user",
                            "content": clean,
                            "time": step.get("created_at", "")
                        })
                    elif stype == "PLANNER_RESPONSE":
                        content = step.get("content", "")
                        if content and content.strip():
                            messages.append({
                                "role": "model",
                                "content": content.strip(),
                                "time": step.get("created_at", "")
                            })
                except Exception:
                    pass
    except Exception as e:
        return {"error": str(e), "messages": []}

    return {"id": cid, "messages": messages}

def create_conversation(workspace_path, title):
    new_cid = str(uuid.uuid4())
    db_path = get_db_path()
    brain_dir = get_brain_dir()

    if not workspace_path or workspace_path == "General":
        workspace_path = os.getcwd().replace("\\", "/")

    norm_path = workspace_path.replace("\\", "/")
    encoded_uri = "file:///" + urllib.parse.quote(norm_path)
    workspace_uris = json.dumps([encoded_uri])

    # 1. Create logs directory
    chat_brain_dir = os.path.join(brain_dir, new_cid, ".system_generated", "logs")
    os.makedirs(chat_brain_dir, exist_ok=True)
    transcript_file = os.path.join(chat_brain_dir, "transcript.jsonl")
    if not os.path.exists(transcript_file):
        with open(transcript_file, "w", encoding="utf-8") as f:
            pass # Create empty file

    # 2. Insert into SQLite
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    clean_title = (title or "Nuevo Chat").strip()

    try:
        conn = sqlite3.connect(db_path, timeout=5.0)
        conn.execute("""
            INSERT INTO conversation_summaries (
                conversation_id, title, preview, step_count, last_modified_time,
                workspace_uris, status, source, project_id, parent_conversation_id,
                nesting_depth, battle_id, winning_conversation_id, not_fully_idle,
                killed, last_user_input_time, last_user_input_step_index, app_data_dir, group_id
            ) VALUES (
                ?, ?, ?, 0, ?,
                ?, 'CASCADE_RUN_STATUS_IDLE', '', '', '',
                0, '', '', 0,
                0, ?, -1, 'antigravity', ''
            )
        """, (new_cid, clean_title, clean_title, now_iso, workspace_uris, now_iso))
        conn.commit()
        conn.close()
    except Exception as e:
        return {"error": str(e)}

    return {
        "ok": True,
        "id": new_cid,
        "title": clean_title,
        "workspace": norm_path
    }

def append_turn(cid, user_text, model_text):
    log_dir = os.path.join(get_brain_dir(), cid, ".system_generated", "logs")
    os.makedirs(log_dir, exist_ok=True)
    log_file = os.path.join(log_dir, "transcript.jsonl")

    now_iso = datetime.now(timezone.utc).isoformat() + "Z"

    # Find highest existing step_index
    last_idx = -1
    if os.path.exists(log_file):
        try:
            with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            data = json.loads(line)
                            if "step_index" in data and isinstance(data["step_index"], int):
                                if data["step_index"] > last_idx:
                                    last_idx = data["step_index"]
                        except Exception:
                            pass
        except Exception:
            pass

    # Append user step
    user_step = {
        "step_index": last_idx + 1,
        "source": "USER_EXPLICIT",
        "type": "USER_INPUT",
        "status": "DONE",
        "created_at": now_iso,
        "content": f"<USER_REQUEST>\n{user_text}\n</USER_REQUEST>"
    }

    # Append model step
    model_step = {
        "step_index": last_idx + 2,
        "source": "MODEL",
        "type": "PLANNER_RESPONSE",
        "status": "DONE",
        "created_at": now_iso,
        "content": model_text
    }

    try:
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(user_step, ensure_ascii=False) + "\n")
            f.write(json.dumps(model_step, ensure_ascii=False) + "\n")
    except Exception as e:
        return {"error": str(e)}

    # Update summary in DB
    db_path = get_db_path()
    try:
        conn = sqlite3.connect(db_path, timeout=5.0)
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE conversation_summaries
            SET last_modified_time = datetime('now'),
                step_count = step_count + 2,
                preview = ?
            WHERE conversation_id = ?
        """, ((user_text[:60] if user_text else "Chat"), cid))
        conn.commit()
        conn.close()
    except Exception:
        pass

    return {"ok": True}

if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    if len(sys.argv) < 2:
        print(json.dumps({"error": "No action specified"}))
        sys.exit(1)

    action = sys.argv[1]

    if action == "list-projects":
        res = list_projects()
        print(json.dumps(res, ensure_ascii=False))

    elif action == "get-conversation":
        cid = sys.argv[2] if len(sys.argv) > 2 else ""
        res = get_conversation_history(cid)
        print(json.dumps(res, ensure_ascii=False))

    elif action == "create-conversation":
        ws = sys.argv[2] if len(sys.argv) > 2 else ""
        title = sys.argv[3] if len(sys.argv) > 3 else "Nuevo Chat"
        res = create_conversation(ws, title)
        print(json.dumps(res, ensure_ascii=False))

    elif action == "append-turn":
        cid = sys.argv[2] if len(sys.argv) > 2 else ""
        u_text = sys.argv[3] if len(sys.argv) > 3 else ""
        m_text = sys.argv[4] if len(sys.argv) > 4 else ""
        res = append_turn(cid, u_text, m_text)
        print(json.dumps(res, ensure_ascii=False))
    else:
        print(json.dumps({"error": f"Unknown action: {action}"}))
