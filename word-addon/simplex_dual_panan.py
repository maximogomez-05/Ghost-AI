import numpy as np
from fractions import Fraction

# Minimize Z = 900x + 700y
# Continuous model boundaries (or discrete: 60/61, 1/0)
# Let's test both discrete (61, 1) and continuous (60, 0)

def solve_panan(min_sum=61, diff=1, max_sum=199):
    print(f"\n=======================================================")
    print(f"SOLVING WITH min_sum={min_sum}, diff={diff}, max_sum={max_sum}")
    print(f"=======================================================")
    
    # Variables: x, y, s1, s2, s3, s4 | Sol
    # Maximize W = -900x - 700y  =>  W + 900x + 700y = 0
    # Restr 1: x - y >= diff  =>  -x + y + s1 = -diff
    # Restr 2: x <= 120       =>   x + s2 = 120
    # Restr 3: x + y >= min_sum => -x - y + s3 = -min_sum
    # Restr 4: x + y <= max_sum =>  x + y + s4 = max_sum
    
    # Let's scale Z by 100 for clean numbers: W' = -9x - 7y => W' + 9x + 7y = 0
    table = np.array([
        [Fraction(-1), Fraction(1),  Fraction(1), Fraction(0), Fraction(0), Fraction(0), Fraction(-diff)],
        [Fraction(1),  Fraction(0),  Fraction(0), Fraction(1), Fraction(0), Fraction(0), Fraction(120)],
        [Fraction(-1), Fraction(-1), Fraction(0), Fraction(0), Fraction(1), Fraction(0), Fraction(-min_sum)],
        [Fraction(1),  Fraction(1),  Fraction(0), Fraction(0), Fraction(0), Fraction(1), Fraction(max_sum)],
        [Fraction(9),  Fraction(7),  Fraction(0), Fraction(0), Fraction(0), Fraction(0), Fraction(0)]
    ])
    
    basis = ['s1', 's2', 's3', 's4']
    vars_names = ['x', 'y', 's1', 's2', 's3', 's4']
    
    def print_table(t, step_name):
        print(f"\n--- {step_name} ---")
        header = f"{'Base':<6}" + "".join([f"{v:>8}" for v in vars_names]) + f"{'Sol':>10}"
        print(header)
        print("-" * len(header))
        for i in range(4):
            row_str = f"{basis[i]:<6}" + "".join([f"{str(t[i, j]):>8}" for j in range(6)]) + f"{str(t[i, 6]):>10}"
            print(row_str)
        w_str = f"{'W':<6}" + "".join([f"{str(t[4, j]):>8}" for j in range(6)]) + f"{str(t[4, 6]):>10}"
        print(w_str)

    print_table(table, "TABLA INICIAL (DUAL FACTIBLE)")
    
    step = 0
    while True:
        step += 1
        # Check primal feasibility (are all solutions >= 0?)
        sol_col = table[:4, 6]
        min_sol = min(sol_col)
        if min_sol >= 0:
            print(f"\nTODAS LAS SOLUCIONES SON NO NEGATIVAS (>= 0). ¡OPTIMALIDAD ALCANZADA!")
            break
            
        # Simplex Dual: leaving row is most negative solution
        leaving_idx = int(np.argmin(sol_col))
        leaving_var = basis[leaving_idx]
        print(f"\nIteración {step} (Simplex Dual):")
        print(f"Fila saliente: {leaving_var} con solución {table[leaving_idx, 6]}")
        
        # Entering column: min ratio c_j / (-a_rj) for a_rj < 0
        ratios = []
        candidates = []
        for j in range(6):
            a_rj = table[leaving_idx, j]
            c_j = table[4, j]
            if a_rj < 0:
                ratio = c_j / (-a_rj)
                ratios.append(ratio)
                candidates.append((j, vars_names[j], ratio))
            else:
                ratios.append(None)
                
        print(f"Candidatos entrantes (a_{leaving_var},j < 0):")
        for j, name, r in candidates:
            print(f"  Columna {name}: cociente = {table[4, j]} / (-({table[leaving_idx, j]})) = {r}")
            
        if not candidates:
            print("ERROR: Sistema infactible (no hay elementos negativos en la fila saliente).")
            return
            
        # Choose min ratio
        best_cand = min(candidates, key=lambda x: x[2])
        entering_idx = best_cand[0]
        entering_var = best_cand[1]
        pivot = table[leaving_idx, entering_idx]
        print(f"Columna entrante: {entering_var} con menor cociente {best_cand[2]}")
        print(f"Elemento pivote: {pivot} en ({leaving_var}, {entering_var})")
        
        # Gauss-Jordan pivot
        new_pivot_row = table[leaving_idx] / pivot
        new_table = np.zeros_like(table)
        new_table[leaving_idx] = new_pivot_row
        
        for i in range(5):
            if i != leaving_idx:
                factor = table[i, entering_idx]
                new_table[i] = table[i] - factor * new_pivot_row
                
        table = new_table
        basis[leaving_idx] = entering_var
        print_table(table, f"TABLA TRAS ITERACIÓN {step}")
        
    print("\n--- RESULTADOS FINALES ---")
    val_x = Fraction(0)
    val_y = Fraction(0)
    for i in range(4):
        if basis[i] == 'x': val_x = table[i, 6]
        if basis[i] == 'y': val_y = table[i, 6]
    print(f"x* = {val_x} ({float(val_x)}) viajes avión A")
    print(f"y* = {val_y} ({float(val_y)}) viajes avión B")
    w_star = table[4, 6]
    z_star = -w_star * 100
    print(f"W* = {w_star} => Z* = {z_star} litros de combustible ({float(z_star)})")

solve_panan(min_sum=61, diff=1, max_sum=199)
solve_panan(min_sum=60, diff=0, max_sum=200)
