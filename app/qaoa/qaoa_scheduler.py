from typing import List, Dict, Tuple
from dataclasses import dataclass
from qiskit_optimization import QuadraticProgram
from qiskit_optimization.algorithms import MinimumEigenOptimizer
from qiskit_optimization.converters import QuadraticProgramToQubo
from qiskit_algorithms import QAOA
from qiskit_algorithms.optimizers import SPSA
from qiskit_aer import Aer

# Define available slots in a day
SLOTS = ["Morning", "Afternoon", "Evening"]
SLOT_PRODUCTIVITY_BONUS = {"Morning": 2, "Afternoon": 1, "Evening": 0}
MAX_TASKS_PER_SLOT = 2  # avoid overload

@dataclass
class TaskIn:
    title: str
    priority: int = 2         # 1=low, 2=medium, 3=high
    latest_day: int = 6       # deadline day index (0=Mon, 6=Sun)
    preferred_slots: Tuple[str, ...] = ()  # e.g. ("Morning",)

def _build_qp(tasks: List[TaskIn], days: List[str]) -> Tuple[QuadraticProgram, Dict[str, Tuple[int, int, int]]]:
    """Build a QuadraticProgram for QAOA scheduling"""
    qp = QuadraticProgram("study_scheduler")
    var_map: Dict[str, Tuple[int, int, int]] = {}

    # 1. Define binary variables
    for t_idx, t in enumerate(tasks):
        for d_idx in range(len(days)):
            if d_idx > t.latest_day:
                continue
            for s_idx, slot in enumerate(SLOTS):
                name = f"x_{t_idx}_{d_idx}_{s_idx}"
                qp.binary_var(name)
                var_map[name] = (t_idx, d_idx, s_idx)

    # 2. Constraint: each task assigned exactly once
    for t_idx, t in enumerate(tasks):
        coeffs = {}
        for d_idx in range(len(days)):
            if d_idx > t.latest_day:
                continue
            for s_idx in range(len(SLOTS)):
                coeffs[f"x_{t_idx}_{d_idx}_{s_idx}"] = 1.0
        qp.linear_constraint(linear=coeffs, sense="==", rhs=1.0, name=f"assign_task_{t_idx}")

    # 3. Constraint: max tasks per slot
    for d_idx in range(len(days)):
        for s_idx in range(len(SLOTS)):
            coeffs = {}
            for t_idx, t in enumerate(tasks):
                if d_idx > t.latest_day:
                    continue
                name = f"x_{t_idx}_{d_idx}_{s_idx}"
                if name in var_map:
                    coeffs[name] = 1.0
            qp.linear_constraint(linear=coeffs, sense="<=", rhs=float(MAX_TASKS_PER_SLOT), name=f"cap_{d_idx}_{s_idx}")

    # 4. Objective: maximize productivity score
    linear_obj = {}
    for name, (t_idx, d_idx, s_idx) in var_map.items():
        t = tasks[t_idx]
        slot = SLOTS[s_idx]
        value = float(
            t.priority +
            SLOT_PRODUCTIVITY_BONUS.get(slot, 0) +
            (1 if slot in t.preferred_slots else 0)
        )
        linear_obj[name] = value
    qp.maximize(linear=linear_obj)

    return qp, var_map

def optimize_week(tasks_in: List[Dict]) -> Dict:
    """Optimize weekly schedule with QAOA"""
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    # Convert input into TaskIn objects
    tasks = [
        TaskIn(
            title=t.get("title", "Task"),
            priority=int({"low": 1, "medium": 2, "high": 3}.get(str(t.get("priority", "medium")).lower(), 2)),
            latest_day=min(int(t.get("latest_day", 6)), 6),
            preferred_slots=tuple(t.get("preferred_slots", [])),
        )
        for t in tasks_in
    ]

    # Build QP
    qp, var_map = _build_qp(tasks, days)
    qubo = QuadraticProgramToQubo().convert(qp)

    # Setup QAOA on Aer simulator
    backend = Aer.get_backend("qasm_simulator")
    qaoa = QAOA(reps=2, optimizer=SPSA(maxiter=100), quantum_instance=backend)
    solver = MinimumEigenOptimizer(qaoa)

    # Solve optimization
    result = solver.solve(qubo)

    # Decode solution into schedule
    schedule: Dict[str, Dict[str, List[str]]] = {d: {s: [] for s in SLOTS} for d in days}
    for name, val in result.variables_dict.items():
        if val != 1:
            continue
        t_idx, d_idx, s_idx = var_map[name]
        schedule[days[d_idx]][SLOTS[s_idx]].append(tasks[t_idx].title)

    return {"days": days, "slots": SLOTS, "schedule": schedule}

# ----------------- Example run -----------------
if __name__ == "__main__":
    tasks = [
        {"title": "Lab Report", "priority": "high", "latest_day": 2, "preferred_slots": ["Morning"]},
        {"title": "OS Quiz", "priority": "medium", "latest_day": 3},
        {"title": "Math Revision", "priority": "low", "latest_day": 6, "preferred_slots": ["Evening"]},
    ]

    schedule = optimize_week(tasks)
    for day, slots in schedule["schedule"].items():
        print(f"{day}:")
        for slot, items in slots.items():
            print(f"  {slot}: {items}")
