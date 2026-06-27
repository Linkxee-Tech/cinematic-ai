import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ChevronLeft, ShieldCheck, Hash, GitBranch, Package,
  ChevronDown, ChevronRight, Copy, Check, Loader2, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCinematicStore } from '@/store/cinematicStore';
import { api } from '@/lib/api';
import type { ManifestData } from '@/lib/api';
// import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// JSON tree node component
function JsonNode({ data, depth = 0 }: { data: unknown; depth?: number }) {
  const [collapsed, setCollapsed] = useState(depth > 1);
  const isObj = data !== null && typeof data === 'object' && !Array.isArray(data);
  const isArr = Array.isArray(data);

  if (isObj || isArr) {
    const entries = isArr
      ? (data as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
      : Object.entries(data as Record<string, unknown>);
    const bracket = isArr ? ['[', ']'] : ['{', '}'];
    return (
      <span>
        <button onClick={() => setCollapsed(!collapsed)} className="text-muted-foreground hover:text-foreground mr-1">
          {collapsed ? <ChevronRight size={10} className="inline" /> : <ChevronDown size={10} className="inline" />}
        </button>
        <span className="text-muted-foreground">{bracket[0]}</span>
        {collapsed ? (
          <span className="text-muted-foreground/50 italic text-[10px] mx-1">{entries.length} {isArr ? 'items' : 'keys'}</span>
        ) : (
          <div className="pl-4 border-l border-border/30 ml-1 my-0.5">
            {entries.map(([k, v]) => (
              <div key={k} className="my-0.5">
                {!isArr && <span className="text-chart-2">&quot;{k}&quot;</span>}
                {!isArr && <span className="text-muted-foreground">: </span>}
                <JsonNode data={v} depth={depth + 1} />
                <span className="text-muted-foreground/50">,</span>
              </div>
            ))}
          </div>
        )}
        <span className="text-muted-foreground">{bracket[1]}</span>
      </span>
    );
  }
  if (typeof data === 'string') return <span className="text-chart-1">&quot;{data}&quot;</span>;
  if (typeof data === 'number') return <span className="text-chart-3">{data}</span>;
  if (typeof data === 'boolean') return <span className="text-chart-4">{String(data)}</span>;
  return <span className="text-muted-foreground">{String(data)}</span>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy} className="text-muted-foreground hover:text-foreground transition-colors ml-1 shrink-0">
      {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
    </button>
  );
}

function HashRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/30 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0 w-32">{label}</span>
      <code className="text-[10px] font-mono text-chart-1 flex-1 min-w-0 truncate">{value}</code>
      <CopyButton text={value} />
    </div>
  );
}

export default function ProvenanceViewer() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { currentProject, loadProject, loading } = useCinematicStore();
  // ManifestData is the inner manifest object; ManifestResp is the wrapper
  const [manifest, setManifest] = useState<ManifestData | null>(null);
  const [runId, setRunId] = useState<string>('');
  const [manifestSha256, setManifestSha256] = useState<string>('');
  const [manifestLoading, setManifestLoading] = useState(false);
  const [manifestError, setManifestError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    if (!currentProject || currentProject.id !== projectId) loadProject(projectId);
  }, [projectId, loadProject, currentProject]);

  useEffect(() => {
    if (!projectId) return;
    setManifestLoading(true);
    api.getManifest(projectId)
      .then((resp) => {
        // Unwrap ManifestResp → inner manifest data
        setManifest(resp.manifest);
        setRunId(resp.run_id);
        setManifestSha256(resp.sha256);
      })
      .catch((e: Error) => setManifestError(e.message))
      .finally(() => setManifestLoading(false));
  }, [projectId]);

  if (loading && !currentProject) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-3">
        <Loader2 size={20} className="animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Loading provenance…</p>
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle size={40} className="text-destructive/50" />
        <p className="text-muted-foreground text-sm">Project not found</p>
        <Button onClick={() => navigate('/library')} variant="ghost" className="border border-border/60 text-foreground hover:bg-card">
          <ChevronLeft size={14} className="mr-1" /> Back
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground px-4 md:px-6 py-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Button asChild variant="ghost" className="border border-border/60 text-foreground hover:bg-card h-8 px-2 shrink-0">
          <Link to={`/gallery/${projectId}`}><ChevronLeft size={15} /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold">Content Provenance</h1>
          <p className="text-xs text-muted-foreground truncate">{currentProject.name}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 glass-panel border border-green-500/30 rounded px-2 py-1">
          <ShieldCheck size={12} className="text-green-400" />
          <span className="text-[10px] font-medium text-green-400">Verified</span>
        </div>
      </div>

      {manifestLoading ? (
        <div className="flex items-center justify-center h-40 gap-3">
          <Loader2 size={18} className="animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading manifest…</span>
        </div>
      ) : manifestError ? (
        <div className="flex flex-col items-center justify-center h-40 gap-3">
          <AlertCircle size={28} className="text-destructive/50" />
          <p className="text-sm text-muted-foreground">{manifestError}</p>
          <p className="text-xs text-muted-foreground/60">Make sure the pipeline has completed.</p>
        </div>
      ) : manifest ? (
        <div className="space-y-4">
          {/* Pipeline hash */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-lg p-4 border border-border/50">
            <div className="flex items-center gap-2 mb-3">
              <Hash size={14} className="text-primary" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Pipeline Manifest Hash</h2>
            </div>
            <div className="flex items-center gap-2 p-2.5 bg-background/40 rounded border border-border/40">
              <code className="flex-1 text-[11px] font-mono text-chart-1 min-w-0 break-all">{manifest.pipeline_hash}</code>
              <CopyButton text={manifest.pipeline_hash} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-muted-foreground">Run ID</span><code className="text-[10px] font-mono">{runId}</code>
              <span className="text-muted-foreground">Manifest SHA-256</span><code className="text-[10px] font-mono truncate">{manifestSha256.slice(0, 24)}…</code>
              <span className="text-muted-foreground">Pipeline</span><span>{manifest.pipeline}</span>
              <span className="text-muted-foreground">Generated</span><span>{new Date(manifest.generation_timestamp).toLocaleString()}</span>
            </div>
          </motion.div>

          {/* Model versions */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-panel rounded-lg p-4 border border-border/50">
            <div className="flex items-center gap-2 mb-3">
              <Package size={14} className="text-primary" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Model Versions</h2>
            </div>
            <div className="space-y-0">
              {Object.entries(manifest.model_versions).map(([key, val]) => (
                <HashRow key={key} label={key} value={val} />
              ))}
            </div>
          </motion.div>

          {/* Asset checksums */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel rounded-lg p-4 border border-border/50">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={14} className="text-primary" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Asset Checksums (SHA-256)</h2>
            </div>
            <div className="space-y-0 max-h-60 overflow-y-auto">
              {Object.entries(manifest.asset_checksums).map(([key, hash]) => (
                <div key={key} className="flex items-center gap-2 py-1.5 border-b border-border/30 last:border-0">
                  <span className="text-[10px] text-muted-foreground shrink-0 w-28 truncate">{key.slice(-16)}</span>
                  <code className="flex-1 text-[9px] font-mono text-chart-1 min-w-0 truncate">{hash.slice(0, 32)}…</code>
                  <CopyButton text={hash} />
                </div>
              ))}
            </div>
          </motion.div>

          {/* Lineage */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-panel rounded-lg p-4 border border-border/50">
            <div className="flex items-center gap-2 mb-3">
              <GitBranch size={14} className="text-primary" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Generation Lineage</h2>
            </div>
            <div className="space-y-2">
              {manifest.lineage.map((entry, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    <div className="w-5 h-5 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-[9px] font-bold text-primary">{i + 1}</div>
                    {i < manifest.lineage.length - 1 && <div className="w-px h-4 bg-border/40" />}
                  </div>
                  <div className="glass-panel rounded p-2 flex-1 border border-border/30 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{entry.provider}</span>
                      <code className="text-[9px] font-mono text-muted-foreground">{entry.model}@{entry.version}</code>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">→ {entry.output}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Full JSON tree */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-panel rounded-lg p-4 border border-border/50">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Full Manifest JSON</h2>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] border border-border/40 text-muted-foreground hover:text-foreground hover:bg-card gap-1"
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(manifest, null, 2));
                  toast.success('Manifest copied to clipboard');
                }}
              >
                <Copy size={10} />
                Copy JSON
              </Button>
            </div>
            <div className="p-3 bg-black/30 rounded border border-border/40 text-[11px] font-mono leading-relaxed max-h-72 overflow-y-auto">
              <JsonNode data={manifest} depth={0} />
            </div>
          </motion.div>
        </div>
      ) : null}
    </div>
  );
}
