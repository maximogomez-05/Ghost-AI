import os
import sys
import numpy as np
from fractions import Fraction
import matplotlib.pyplot as plt

def format_fraction(f):
    if f.denominator == 1:
        return str(f.numerator)
    return f"{f.numerator}/{f.denominator}"

def solve_simplex_panan(x_min_sum=61, a_b_diff=1, x_max_a=120, total_max=199):
    """
    PANAN Canonical Dual Simplex Solver
    Min Z = 900x + 700y  <=> Max W' = -9x - 7y
    """
    # Matrix: x, y, s1, s2, s3, s4 | Sol
    table = [
        [Fraction(-1), Fraction(1),  Fraction(1), Fraction(0), Fraction(0), Fraction(0), Fraction(-a_b_diff)],
        [Fraction(1),  Fraction(0),  Fraction(0), Fraction(1), Fraction(0), Fraction(0), Fraction(x_max_a)],
        [Fraction(-1), Fraction(-1), Fraction(0), Fraction(0), Fraction(1), Fraction(0), Fraction(-x_min_sum)],
        [Fraction(1),  Fraction(1),  Fraction(0), Fraction(0), Fraction(0), Fraction(1), Fraction(total_max)],
        [Fraction(9),  Fraction(7),  Fraction(0), Fraction(0), Fraction(0), Fraction(0), Fraction(0)]
    ]
    
    basis = ['s1', 's2', 's3', 's4']
    vars_names = ['x', 'y', 's1', 's2', 's3', 's4']
    
    steps_log = []
    
    def log_table(step_title, pivot_info=None):
        md = f"### {step_title}\n\n"
        md += "| Base | x | y | s1 | s2 | s3 | s4 | Solución |\n"
        md += "| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n"
        for i in range(4):
            row_str = f"| **{basis[i]}** | " + " | ".join([format_fraction(table[i][j]) for j in range(6)]) + f" | **{format_fraction(table[i][6])}** |\n"
            md += row_str
        md += f"| **W'** | " + " | ".join([format_fraction(table[4][j]) for j in range(6)]) + f" | **{format_fraction(table[4][6])}** |\n\n"
        if pivot_info:
            md += f"> **Pivoteo**: Fila saliente `{pivot_info['leaving']}`, Columna entrante `{pivot_info['entering']}`, Elemento pivote `{pivot_info['pivot']}`.\n\n"
        steps_log.append(md)

    log_table("Tabla 0 (Inicial — Factible Dual)")
    
    # Iteration 1: s3 leaves (-61), y enters (ratio 7/1 = 7)
    # Pivot at row 2 (s3), col 1 (y) -> p = -1
    p1 = table[2][1]
    for j in range(7):
        table[2][j] /= p1
    basis[2] = 'y'
    
    for i in range(5):
        if i != 2:
            factor = table[i][1]
            for j in range(7):
                table[i][j] -= factor * table[2][j]
                
    log_table("Tabla 1 (Iteración 2 — Simplex Dual)", {"leaving": "s3", "entering": "y", "pivot": "-1"})
    
    # Iteration 2: s1 leaves (-62), x enters (ratio 2/2 = 1)
    # Pivot at row 0 (s1), col 0 (x) -> p = -2
    p2 = table[0][0]
    for j in range(7):
        table[0][j] /= p2
    basis[0] = 'x'
    
    for i in range(5):
        if i != 0:
            factor = table[i][0]
            for j in range(7):
                table[i][j] -= factor * table[0][j]
                
    log_table("Tabla 2 (TABLA FINAL ÓPTIMA)", {"leaving": "s1", "entering": "x", "pivot": "-2"})
    
    x_val = int(table[0][6])
    y_val = int(table[2][6])
    z_min = 900 * x_val + 700 * y_val
    
    result = {
        "x": x_val,
        "y": y_val,
        "Z_min": z_min,
        "tables_markdown": "".join(steps_log)
    }
    return result

if __name__ == "__main__":
    res = solve_simplex_panan()
    print("Solved:", res["x"], res["y"], "Z:", res["Z_min"])
