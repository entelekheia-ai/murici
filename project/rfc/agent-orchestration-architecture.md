# RFC: Dual-Model Agent Orchestration Architecture

## 1. Context and Motivation

Running a single, large Language Model (LLM) for every interaction is inefficient. Trivial questions ("Hello") take unnecessary computational power, while background UI tasks (like summarizing chat history or classifying intent) shouldn't block the main conversation flow.

By adopting a **Dual-Model Topology**, Murici can operate similarly to an autonomous OS: a fast, lightweight "Housekeeper" model runs continuously in the background to handle orchestration, while a heavier "Pro" model is hot-swapped into memory only for complex tasks.

## 2. Architectural Roles

### 2.1 The "Housekeeper" (Orchestrator/Router)
- **Profile:** Small, fast, highly constrained (e.g., 1.5B to 3B parameters).
- **Status:** "Pinned" in memory (Always On).
- **Responsibilities:**
  - **Intent Routing:** Analyze user prompts, score difficulty (1 to 5), and decide which model should handle the response.
  - **Context Housekeeping:** Compress old chat history to save tokens.
  - **Function Calling Triage:** Determine if a tool needs to be executed before generating a response.
- **The Fine-Tuning Requirement:** Off-the-shelf small models (like base Qwen or Llama 1B/3B) suffer from "instruction drift" — they often try to *answer* the prompt instead of *classifying* it, and fail to output strict JSON. **Actionable:** Train a specialized LoRA for the Housekeeper model on a dataset of `<prompt> -> <JSON_classification>` to ensure 100% deterministic routing without hallucinations.

### 2.2 The "Pro" (Specialist)
- **Profile:** Large, highly capable, resource-heavy (e.g., 8B to 14B parameters).
- **Status:** "Swappable" (Loaded on-demand, unloaded when idle).
- **Responsibilities:**
  - Complex reasoning, heavy code generation, architectural decisions, and tasks scored as Level 3+ by the Housekeeper.

## 3. Hardware Constraints Analysis (16GB Apple Silicon Profile)

This topology is highly feasible on modern unified memory architectures (like Apple M1/M2/M3 with 16GB RAM):

| Component | Estimated VRAM/RAM Usage | Notes |
| :--- | :--- | :--- |
| **macOS + Basic Apps** | ~4.0 GB | Reserved by the operating system. |
| **Housekeeper (3B Q4)** | ~2.5 GB | ~2GB weights + 500MB KV Cache. Stays pinned. |
| **Pro Model (8B Q4)** | ~5.5 GB | ~4.5GB weights + 1GB KV Cache. Swappable. |
| **Total Peak Usage** | **~12.0 GB** | **Leaves ~4GB free.** No system swapping/paging required. |

## 4. Hot-Swap & Lifecycle Mechanics

Because engines like oMLX, Ollama, and llama.cpp use `mmap` (Memory-Mapped Files), hot-swapping models is extremely efficient on Macs with fast NVMe SSDs (read speeds of 3,000 to 6,000 MB/s).

1. **Routing:** User sends a complex prompt. Housekeeper analyzes it (takes ~0.5s) and routes it to "Pro".
2. **Wake up (Load):** Murici requests the Pro model. Moving 5GB from SSD to RAM takes **~1.5 to 2.5 seconds**.
3. **Execution:** The Pro model streams the response to the user.
4. **Sleep (Unload):** After a configurable idle timeout (e.g., 5 minutes), Murici unloads the Pro model (freeing 5.5GB of VRAM) while the Housekeeper remains pinned.

## 5. Implementation Roadmap

1. **Phase 1: Mock Router:** Implement the routing logic in Murici using a hardcoded script or basic regex, just to build the dual-model UI and hot-swap mechanic.
2. **Phase 2: Fine-Tuning:** Create a synthetic dataset of prompts graded by difficulty. Fine-tune a 1.5B/3B model (using Unsloth or MLX fine-tuning) to strictly output the routing JSON.
3. **Phase 3: Integration:** Deploy the fine-tuned model as the default Murici "Housekeeper", enabling true autonomous orchestration.
