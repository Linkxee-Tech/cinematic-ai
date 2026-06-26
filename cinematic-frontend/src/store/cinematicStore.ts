import { create } from 'zustand';
import { api, WS_BASE } from '@/lib/api';
import type {
  ProjectFull,
  ProjectSummary,
  PipelineStep,
  Asset,
  ProjectStatus,
  StepStatus,
} from '@/lib/api';

// ─── Re-export types so pages import from one place ──────────────────────────
export type { ProjectFull, ProjectSummary, PipelineStep, Asset, ProjectStatus, StepStatus };

// ─── Store shape ─────────────────────────────────────────────────────────────

interface CinematicStore {
  projects: ProjectSummary[];
  currentProject: ProjectFull | null;
  loading: boolean;
  error: string | null;
  failureSimulation: boolean;

  // Internal: HTTP poll intervals keyed by projectId
  _pollers: Record<string, ReturnType<typeof setInterval>>;
  // Internal: WebSocket connections keyed by projectId
  _sockets: Record<string, WebSocket>;

  _startPoller: (id: string) => void;
  _connectWS: (id: string) => void;
  _closeWS: (id: string) => void;

  fetchProjects: () => Promise<void>;
  createProject: (prompt: string, genre: string) => Promise<string>;
  deleteProject: (id: string) => Promise<void>;
  duplicateProject: (id: string) => Promise<void>;
  renameProject: (id: string, name: string) => Promise<void>;

  loadProject: (id: string) => Promise<void>;
  clearCurrentProject: () => void;

  runPipeline: (id: string) => Promise<void>;
  stopPoller: (id: string) => void;

  toggleFailureSimulation: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useCinematicStore = create<CinematicStore>((set, get) => ({
  projects: [],
  currentProject: null,
  loading: false,
  error: null,
  failureSimulation: false,
  _pollers: {},
  _sockets: {},

  // ── Project list ────────────────────────────────────────────────────────────

  fetchProjects: async () => {
    set({ loading: true, error: null });
    try {
      const projects = await api.listProjects();
      set({ projects, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  createProject: async (prompt, genre) => {
    set({ loading: true, error: null });
    try {
      // api.createProject POSTs then GETs the full project
      const project = await api.createProject(prompt, genre);
      set((s) => ({
        projects: [{ ...project, step_count: 6 }, ...s.projects],
        currentProject: project,
        loading: false,
      }));
      return project.id;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  deleteProject: async (id) => {
    get().stopPoller(id);
    get()._closeWS(id);
    try {
      await api.deleteProject(id);
      set((s) => ({
        projects: s.projects.filter((p) => p.id !== id),
        currentProject: s.currentProject?.id === id ? null : s.currentProject,
      }));
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  duplicateProject: async (id) => {
    try {
      const copy = await api.duplicateProject(id);
      set((s) => ({
        projects: [{ ...copy, step_count: 6 }, ...s.projects],
      }));
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  renameProject: async (id, name) => {
    try {
      const updated = await api.renameProject(id, name);
      set((s) => ({
        projects: s.projects.map((p) => (p.id === id ? { ...p, name: updated.name } : p)),
        currentProject:
          s.currentProject?.id === id
            ? { ...s.currentProject, name: updated.name }
            : s.currentProject,
      }));
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  // ── Single project ──────────────────────────────────────────────────────────

  loadProject: async (id) => {
    set({ loading: true, error: null });
    try {
      const project = await api.getProject(id);
      set({ currentProject: project, loading: false });
      if (project.status === 'processing') {
        // Prefer WS; fall back to HTTP polling if WS unavailable
        get()._connectWS(id);
        get()._startPoller(id);
      }
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  clearCurrentProject: () => set({ currentProject: null }),

  // ── Pipeline ────────────────────────────────────────────────────────────────

  runPipeline: async (id) => {
    try {
      await api.runPipeline(id);
      set((s) => ({
        currentProject:
          s.currentProject?.id === id
            ? { ...s.currentProject, status: 'processing', steps: [], assets: [] }
            : s.currentProject,
        projects: s.projects.map((p) => (p.id === id ? { ...p, status: 'processing' } : p)),
      }));
      get()._connectWS(id);
      get()._startPoller(id);
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  stopPoller: (id) => {
    const { _pollers } = get();
    if (_pollers[id]) {
      clearInterval(_pollers[id]);
      const updated = { ..._pollers };
      delete updated[id];
      set({ _pollers: updated });
    }
  },

  // ── WebSocket connection ────────────────────────────────────────────────────

  _connectWS: (id: string) => {
    get()._closeWS(id); // close any existing
    try {
      const ws = new WebSocket(`${WS_BASE}/ws/${id}`);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type: string;
            step?: string;
            status?: string;
            progress?: number;
            preview_url?: string | null;
            manifest_url?: string;
            message?: string;
          };

          if (msg.type === 'ping') return;

          if (msg.type === 'step_update' && msg.step) {
            // Map WS step_update into a PipelineStep and merge into currentProject
            set((s) => {
              if (s.currentProject?.id !== id) return {};
              const existing = s.currentProject.steps ?? [];
              const idx = existing.findIndex((st) => st.name === msg.step);
              const updated: PipelineStep = {
                name: msg.step!,
                status: (msg.status as StepStatus) ?? 'pending',
                progress: msg.progress ?? 0,
                preview_url: msg.preview_url ?? undefined,
              };
              const newSteps =
                idx >= 0
                  ? existing.map((st, i) => (i === idx ? updated : st))
                  : [...existing, updated];
              return {
                currentProject: { ...s.currentProject, steps: newSteps },
              };
            });
          }

          if (msg.type === 'pipeline_done') {
            get().stopPoller(id);
            get()._closeWS(id);
            // Refresh full project to get assets
            api.getProject(id).then((full) => {
              set((s) => ({
                currentProject: s.currentProject?.id === id ? full : s.currentProject,
                projects: s.projects.map((p) =>
                  p.id === id ? { ...p, status: full.status, asset_count: full.asset_count } : p
                ),
              }));
            });
          }

          if (msg.type === 'error') {
            set((s) => ({
              currentProject:
                s.currentProject?.id === id
                  ? { ...s.currentProject, status: 'failed' }
                  : s.currentProject,
              projects: s.projects.map((p) => (p.id === id ? { ...p, status: 'failed' } : p)),
            }));
            get().stopPoller(id);
            get()._closeWS(id);
          }
        } catch {
          // ignore malformed WS message
        }
      };

      ws.onerror = () => {
        // WS unavailable — HTTP polling is the fallback, keep it running
      };

      ws.onclose = () => {
        set((s) => {
          const updated = { ...s._sockets };
          delete updated[id];
          return { _sockets: updated };
        });
      };

      set((s) => ({ _sockets: { ...s._sockets, [id]: ws } }));
    } catch {
      // WebSocket not available (e.g. tests) — polling handles it
    }
  },

  _closeWS: (id: string) => {
    const { _sockets } = get();
    if (_sockets[id]) {
      try { _sockets[id].close(); } catch { /* ignore */ }
      const updated = { ..._sockets };
      delete updated[id];
      set({ _sockets: updated });
    }
  },

  // ── HTTP polling fallback (runs alongside WS; stops on terminal) ────────────

  _startPoller: (id: string) => {
    get().stopPoller(id);
    const interval = setInterval(async () => {
      try {
        const poll = await api.pollPipeline(id);
        // overall_status is the backend field name
        const status = poll.overall_status;
        const isTerminal = status === 'completed' || status === 'failed';

        set((s) => {
          if (isTerminal) {
            clearInterval(interval);
            const updatedPollers = { ...s._pollers };
            delete updatedPollers[id];
            return {
              _pollers: updatedPollers,
              currentProject:
                s.currentProject?.id === id
                  ? { ...s.currentProject, status, steps: poll.steps }
                  : s.currentProject,
              projects: s.projects.map((p) => (p.id === id ? { ...p, status } : p)),
            };
          }
          return {
            currentProject:
              s.currentProject?.id === id
                ? { ...s.currentProject, status, steps: poll.steps }
                : s.currentProject,
          };
        });

        if (isTerminal && status === 'completed') {
          get()._closeWS(id);
          api.getProject(id).then((full) => {
            set((s) => ({
              currentProject: s.currentProject?.id === id ? full : s.currentProject,
              projects: s.projects.map((p) =>
                p.id === id ? { ...p, status: full.status, asset_count: full.asset_count } : p
              ),
            }));
          });
        }
      } catch {
        // silently ignore transient poll errors
      }
    }, 1500); // 1.5s HTTP poll — WS provides real-time; polling is safety net

    set((s) => ({ _pollers: { ...s._pollers, [id]: interval } }));
  },

  // ── Debug ───────────────────────────────────────────────────────────────────

  toggleFailureSimulation: () => set((s) => ({ failureSimulation: !s.failureSimulation })),
}));


