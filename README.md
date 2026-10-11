# ⚡ ModelRouter — Cost-, Latency- & Quality-Aware AI Inference Gateway

**Domain 2: AI Systems & Infrastructure (Challenge A-01)**

An intelligent inference gateway that dynamically routes each request to the optimal model based on **hard constraints** (latency, cost, capability, context length), with **explainable decisions** and **constraint-preserving failover**.

---

## 🎯 Problem Statement & Requirements

| Requirement | Implementation in ModelRouter |
|-------------|-------------------------------|
| **Hard Constraints** | Maximum latency, maximum cost, minimum capability, and required context length are strictly non-negotiable. A model that violates any constraint is **never** a valid choice. |
| **Explainable Decisions** | Every routing decision provides a full candidate evaluation matrix: which models were considered, exact checks passed/failed, scoring formula breakdown, and why the winner was selected. |
| **Constraint-Preserving Failover** | Treats endpoints as unreliable. If a model fails or breaches its latency budget, the gateway fails over only to remaining models that meet all constraints. **Failover never relaxes a constraint**. |
| **No-Violation Safety** | If no model meets the constraints, the gateway clearly rejects the request rather than dispatching to an invalid model. |
| **Uncertainty Protection** | Query complexity is estimated from content with an uncertainty safety factor; when unsure, the router chooses the safer (higher capability) option. |
| **Judge Runtime Controls** | Judges can dynamically change any model's latency, availability, reliability, or load in real time and observe immediate re-routing without restarts. |

---

## 🧠 Model Portfolio (Ollama Prototype)

| Model | Role in ModelRouter | Download Size | Recommendation | Capability (1-10) | Context Length | Avg / Max Latency | Reliability |
|-------|---------------------|---------------|----------------|-------------------|----------------|-------------------|-------------|
| **Qwen3.5 2B** | Fast model for simple requests | ~2.7 GB | Essential | 3/10 | 4,096 | 650ms / 1,800ms | 96% |
| **Qwen3.5 4B** | Balanced model for everyday requests | ~3.3–4.0 GB | Essential | 5/10 | 8,192 | 1,250ms / 3,200ms | 94% |
| **DeepSeek-R1 7B** | Reasoning model for complex requests | ~4.7 GB | Essential | 8/10 | 16,384 | 2,800ms / 7,500ms | 91% |
| **Phi-4-mini 3.8B** | Alternative for reasoning & mathematics | ~2.5 GB | Optional | 6/10 | 8,192 | 1,600ms / 4,200ms | 92% |
| **Qwen3.5 9B** | Higher-capability candidate | ~6.6 GB | Experimental | 9/10 | 32,768 | 4,600ms / 11,500ms | 89% |

> **Note**: As requested, models do not need to be pre-downloaded right now. The gateway features a hybrid execution engine: if local Ollama has models pulled, it invokes them live; otherwise, it executes high-fidelity persona-specific responses and real-time latency simulation.

---

## ⚙️ Prioritized Parameters

As specified in the prototype requirements:
1. **Latency** *(Essential)*: Worst-case max latency checked against user SLA budget.
2. **Capability score** *(Essential)*: Evaluated against user threshold & safe query complexity.
3. **Context length** *(Essential)*: Ensures total tokens fit model window.
4. **Availability** *(Essential)*: Validates endpoint online / reachable status.
5. **Task suitability** *(Highly useful)*: Task match bonus (e.g. coding, math, reasoning, translation).
6. **Reliability** *(Highly useful)*: Historical uptime weight in composite ranking.
7. **Output token capacity** *(Useful)*: Verified against expected response length.
8. **Current load** *(Useful)*: Real-time load penalty to prevent queue saturation.
9. **Cost** *(Useful)*: Evaluated as a hard ceiling constraint.

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+

### 1. Start Backend Gateway
```bash
cd backend
python -m uvicorn main:app --reload --port 8000
```
API Documentation will be live at `http://localhost:8000/docs`.

### 2. Start Frontend UI
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 🧪 Judge Benchmark Scenarios

The UI includes 1-click test presets designed specifically for judging:

1. **⚡ Fast Fact Retrieval**: Simple query with a 2,000ms latency budget routes directly to **Qwen3.5 2B**.
2. **⚖️ Everyday Balanced**: Moderate query with a 3,500ms budget routes to **Qwen3.5 4B**.
3. **🧠 Deep Reasoning & Math**: Complex multi-step proof routes to **DeepSeek-R1 7B** (or **Phi-4-mini 3.8B**).
4. **🚫 Strict SLA (Proof of No-Violation)**: Impossible constraint (e.g., Latency ≤ 400ms and Capability ≥ 9). Gateway immediately rejects rather than breaking constraints.
5. **💥 Outage Failover Demo**: Simulates an outage on the primary model. Watch the gateway fail over to the next eligible model while strictly maintaining all constraints.
6. **⏳ Timeout Failover Demo**: Simulates a latency breach on the primary model, triggering seamless constraint-preserving failover.
7. **🎛️ Live Parameter Adjustment**: Go to the **Models** tab, adjust sliders (Latency, Reliability, Availability), and see the router re-compute live winners in real time.

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Gateway health & live/sim status |
| `GET` | `/api/models` | List all models with current metrics |
| `GET` | `/api/models/{id}` | Get model details |
| `PATCH` | `/api/models/{id}` | Update model config at runtime (Judge controls) |
| `POST` | `/api/models/reset` | Restore all models to factory defaults |
| `POST` | `/api/infer` | Dispatch query with constraints & failover |
| `POST` | `/api/route` | Route-only evaluation (no model execution) |
| `GET` | `/api/logs` | Fetch audit logs with full explainability |
| `GET` | `/api/stats` | Aggregate observability metrics |
