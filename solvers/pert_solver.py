import sys
import json

def solve_pert(tasks):
    """
    tasks: list of dicts:
    [
        {"id": "A", "duration": 5, "preds": []},
        {"id": "B", "duration": 3, "preds": ["A"]},
        ...
    ]
    """
    task_map = {t["id"]: t for t in tasks}
    
    # Forward Pass: ES, EF
    for t in tasks:
        preds = t.get("preds", [])
        if not preds or len(preds) == 0 or preds == ["-"]:
            t["ES"] = 0
        else:
            t["ES"] = max(task_map[p]["EF"] for p in preds if p in task_map)
        t["EF"] = t["ES"] + t["duration"]
        
    # Project completion time T*
    all_ef = [t["EF"] for t in tasks]
    T_star = max(all_ef) if all_ef else 0
    
    # Backward Pass: LF, LS
    # Build successors map
    succs_map = {t["id"]: [] for t in tasks}
    for t in tasks:
        for p in t.get("preds", []):
            if p in succs_map:
                succs_map[p].append(t["id"])
                
    for t in reversed(tasks):
        succs = succs_map[t["id"]]
        if not succs:
            t["LF"] = T_star
        else:
            t["LF"] = min(task_map[s]["LS"] for s in succs if s in task_map)
        t["LS"] = t["LF"] - t["duration"]
        t["HT"] = t["LF"] - t["EF"] # Total Slack
        t["is_critical"] = (t["HT"] == 0)

    # Critical path
    crit_tasks = [t["id"] for t in tasks if t["is_critical"]]
    crit_path = " -> ".join(crit_tasks)
    
    # Generate markdown
    md = "### Cálculo de Tiempos y Holguras (PERT / CPM)\n\n"
    md += f"• **Duración Mínima del Proyecto (T*)**: `{T_star}` unidades de tiempo.\n"
    md += f"• **Ruta Crítica**: `{crit_path}`\n\n"
    md += "| Actividad | Duración (t) | Predecesoras | ES (Inicio Temp) | EF (Fin Temp) | LS (Inicio Tard) | LF (Fin Tard) | Holgura Total (HT) | ¿Crítica? |\n"
    md += "| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n"
    for t in tasks:
        preds_str = ", ".join(t.get("preds", [])) if t.get("preds") else "—"
        crit_str = "**SÍ (Crítica)**" if t["is_critical"] else "No"
        md += f"| **{t['id']}** | {t['duration']} | {preds_str} | {t['ES']} | {t['EF']} | {t['LS']} | {t['LF']} | {t['HT']} | {crit_str} |\n"
        
    return {
        "T_star": T_star,
        "critical_path": crit_path,
        "tasks": tasks,
        "markdown": md
    }

if __name__ == "__main__":
    test_tasks = [
        {"id": "A", "duration": 4, "preds": []},
        {"id": "B", "duration": 6, "preds": ["A"]},
        {"id": "C", "duration": 2, "preds": ["A"]},
        {"id": "D", "duration": 5, "preds": ["B", "C"]}
    ]
    res = solve_pert(test_tasks)
    print("T*:", res["T_star"], "Critical:", res["critical_path"])
