// Typed API client — all backend calls go through here
// Backend base: FastAPI on port 8000 (override with VITE_API_URL)

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';
export const WS_BASE = API_BASE.replace(/^http/, 'ws');

// ─── Types (mirror backend schemas exactly) ────────────────────────────────

// Backend StepStatus enum: pending | running | completed | failed | skipped
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type ProjectStatus = 'draft' | 'processing' | 'completed' | 'failed';
// Backend AssetType enum
export type AssetType =
  | 'storyboard'
  | 'video_clip'
  | 'voiceover'
  | 'music'
  | 'final_video'
  | 'thumbnail'
  | 'script';

// Maps to backend StepStatusResp
export interface PipelineStep {
  name: string;
  status: StepStatus;
  progress: number;
  message?: string;
  preview_url?: string;
}

// Maps to backend AssetResp
export interface Asset {
  id: string;
  project_id: string;
  run_id?: string;
  asset_type: AssetType;
  pipeline_step?: string;
  b2_url: string;
  sha256?: string;
  file_size_bytes?: number;
  duration_seconds?: number;
  width?: number;
  height?: number;
  metadata_?: Record<string, unknown>;
  created_at: string;
}

// Maps to backend ProjectResp (with steps + assets on detail fetch)
export interface Project {
  id: string;
  user_id: string;
  name: string;
  prompt: string;
  genre: string;
  status: ProjectStatus;
  thumbnail_url?: string;
  duration?: string;
  created_at: string;
  updated_at: string;
  asset_count: number;
}

export interface ProjectFull extends Project {
  steps: PipelineStep[];
  assets: Asset[];
}

export interface ProjectSummary extends Project {
  // asset_count is already on Project; step_count from list endpoint
  step_count?: number;
}

// Maps to backend PipelineStatusResp
export interface PipelinePollResponse {
  project_id: string;
  run_id?: string;
  // backend field is overall_status
  overall_status: ProjectStatus;
  steps: PipelineStep[];
  error_message?: string;
}

// Maps to backend ManifestResp wrapper
export interface ManifestResp {
  project_id: string;
  run_id: string;
  sha256: string;
  manifest_url: string;
  manifest: ManifestData;
}

export interface ManifestData {
  schema_version: string;
  run_id: string;
  project_id: string;
  pipeline: string;
  generation_timestamp: string;
  prompt: string;
  genre: string;
  model_versions: Record<string, string>;
  asset_checksums: Record<string, string>;
  lineage: Array<{
    provider: string;
    model: string;
    version: string;
    output: string;
  }>;
  pipeline_hash: string;
}

// Maps to backend ProjectListResp
export interface ProjectListResp {
  projects: ProjectSummary[];
  total: number;
}

// Maps to backend ExportResp
export interface ExportResp {
  project_id: string;
  download_url: string;
  expires_in_seconds: number;
  filename: string;
}

// Maps to backend HealthResp
export interface HealthResp {
  status: string;
  services: Record<string, { status: string; latency_ms?: number }>;
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    // 204 No Content has no body — don't try to parse
    if (res.status === 204) return undefined as T;
    const body = await res.json().catch(() => ({}));
    const detail = (body as { detail?: string; error?: string }).detail
      ?? (body as { error?: string }).error
      ?? `HTTP ${res.status}`;
    throw new Error(detail);
  }
  // 204 or empty body
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export const api = {
  // List all projects — returns {projects, total}; expose array for convenience
  async listProjects(): Promise<ProjectSummary[]> {
    const resp = await request<ProjectListResp>('/api/projects');
    return resp.projects;
  },

  // Get single project with steps + assets embedded
  getProject(id: string): Promise<ProjectFull> {
    return request<ProjectFull>(`/api/projects/${id}`);
  },

  // Create project — backend returns {project_id, status}; we then fetch full
  async createProject(prompt: string, genre: string): Promise<ProjectFull> {
    // Auto-generate a name from the first words of the prompt
    const words = prompt.trim().split(/\s+/).slice(0, 7).join(' ');
    const name = words.length > 45 ? words.slice(0, 45) : words;
    const resp = await request<{ project_id: string; status: string }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ prompt, genre, name }),
    });
    // Fetch full project detail
    return request<ProjectFull>(`/api/projects/${resp.project_id}`);
  },

  // Rename a project
  renameProject(id: string, name: string): Promise<ProjectFull> {
    return request<ProjectFull>(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });
  },

  // Delete a project — backend returns {success: true}
  deleteProject(id: string): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(`/api/projects/${id}`, { method: 'DELETE' });
  },

  // Duplicate a project
  duplicateProject(id: string): Promise<ProjectFull> {
    return request<ProjectFull>(`/api/projects/${id}/duplicate`, { method: 'POST' });
  },

  // ─── Pipeline ───────────────────────────────────────────────────────────────

  // Trigger pipeline run (re-run or retry)
  runPipeline(id: string): Promise<{ project_id: string; status: string; message: string }> {
    return request(`/api/projects/${id}/run`, { method: 'POST' });
  },

  // Poll pipeline step statuses — backend path is /status not /pipeline
  pollPipeline(id: string): Promise<PipelinePollResponse> {
    return request<PipelinePollResponse>(`/api/projects/${id}/status`);
  },

  // ─── Assets ─────────────────────────────────────────────────────────────────

  getAssets(id: string): Promise<Asset[]> {
    return request<Asset[]>(`/api/projects/${id}/assets`);
  },

  // ─── Manifest ───────────────────────────────────────────────────────────────

  getManifest(id: string): Promise<ManifestResp> {
    return request<ManifestResp>(`/api/projects/${id}/manifest`);
  },

  // ─── Export ─────────────────────────────────────────────────────────────────

  getExport(id: string): Promise<ExportResp> {
    return request<ExportResp>(`/api/projects/${id}/export`);
  },

  // ─── Health ─────────────────────────────────────────────────────────────────

  health(): Promise<HealthResp> {
    return request<HealthResp>('/api/health');
  },
};
