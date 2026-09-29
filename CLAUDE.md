# Instrucciones del Proyecto para Claude Code

Este proyecto sigue la metodología **Spec-Driven Development (SDD)** del framework `dbv-specs-ops`. Lee estos archivos al inicio de cada sesión antes de proponer cualquier código o plan:

| Archivo | Propósito |
| --- | --- |
| `dbv-specs-ops/project.config.md` | Identidad del proyecto: nombre, autor, licencia y plantilla de cabeceras |
| `dbv-specs-ops/docs/MASTER_PROMPT.md` | Workflow obligatorio, normas y límites |
| `dbv-specs-ops/docs/SPECIFICATIONS.md` | Requisitos del proyecto actual |
| `docs/ARCHITECTURE.md` | Stack y decisiones técnicas (**raíz del repo**, ver override abajo) |
| `DESIGN.md` (**raíz del repo**) | Sistema de diseño visual: tokens de color, tipografía, componentes y filosofía *(si existe)* |
| `dbv-specs-ops/memory.md` | **Contexto y Decisiones:** Conocimiento cualitativo (ADRs, lecciones, mapa) |
| `dbv-specs-ops/task.md` | Estado actual + Snapshot de Contexto |

## ⚠️ Reglas Core (Puntero Fuerte)

**Lee `dbv-specs-ops/docs/MASTER_PROMPT.md` y sigue su flujo de trabajo estrictamente. Si detectas contradicciones entre el prompt y las especificaciones del proyecto, detente e informa antes de proceder.**
Toda la lógica de inicialización (Bootstrap), comprobación de estado (Specs Check), ciclo de vida (Workflow) y estándares de código están definidos centralizadamente allí para evitar redundancia cognitiva.

## 🔀 Override de rutas del proyecto

- **Arquitectura:** la única fuente de verdad es `docs/ARCHITECTURE.md` en la raíz del repo (entregable del hackathon). Toda referencia en `MASTER_PROMPT.md` u otros documentos del framework a `dbv-specs-ops/docs/ARCHITECTURE.md` debe leerse y escribirse en `docs/ARCHITECTURE.md`. No uses ni actualices `dbv-specs-ops/docs/ARCHITECTURE.md`.
- **Comandos de fase:** no hay `.claude/commands/`. Las fases (`/spec`, `/plan`, `/build`, `/test`, `/code-simplify`, `/ship`, `/maintain`) se invocan escribiéndolas en el prompt y se ejecutan según su definición en `MASTER_PROMPT.md`.


> 🛠️ Framework SDD creado por **[David Bueno Vallejo](https://github.com/davidbuenov)** — libre y gratuito · [dbv-specs-ops](https://github.com/davidbuenov/dbv-specs-ops)
