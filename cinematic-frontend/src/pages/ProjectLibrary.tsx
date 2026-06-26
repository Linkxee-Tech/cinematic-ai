import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Film, Loader2, AlertCircle, Trash2, Copy,
  Pencil, Check, X, Play, Eye, Clock, BarChart2,
  RefreshCw, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCinematicStore } from '@/store/cinematicStore';
import type { ProjectSummary, ProjectStatus } from '@/store/cinematicStore';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const STATUS_CONFIG: Record<ProjectStatus, { label: string; className: string }> = {
  draft:      { label: 'Draft',      className: 'bg-muted text-muted-foreground border-border/50' },
  processing: { label: 'Processing', className: 'bg-primary/10 text-primary border-primary/30' },
  completed:  { label: 'Completed',  className: 'bg-green-500/10 text-green-400 border-green-500/30' },
  failed:     { label: 'Failed',     className: 'bg-destructive/10 text-destructive border-destructive/30' },
};

function ProjectCard({
  project,
  onDelete,
  onDuplicate,
  onRename,
}: {
  project: ProjectSummary;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const cfg = STATUS_CONFIG[project.status];

  const saveRename = () => {
    if (editName.trim() && editName.trim() !== project.name) {
      onRename(project.id, editName.trim());
    }
    setEditing(false);
  };

  const primaryAction = () => {
    if (project.status === 'completed') navigate(`/gallery/${project.id}`);
    else navigate(`/dashboard/${project.id}`);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="glass-panel rounded-xl overflow-hidden border border-border/50 h-full flex flex-col"
    >
      {/* Thumbnail */}
      <div
        className="relative aspect-video cursor-pointer overflow-hidden bg-muted"
        onClick={primaryAction}
      >
        {project.thumbnail_url ? (
          <img src={project.thumbnail_url} alt={project.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film size={24} className="text-muted-foreground/20" />
          </div>
        )}
        {project.status === 'processing' && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-primary" />
          </div>
        )}
        <Badge className={cn('absolute top-2 left-2 text-[9px] border', cfg.className)}>
          {project.status === 'processing' && <BarChart2 size={8} className="mr-1 animate-pulse" />}
          {cfg.label}
        </Badge>
        {project.duration && (
          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[9px] rounded px-1.5 py-0.5 font-mono">
            {project.duration}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col p-3">
        {/* Title row */}
        {editing ? (
          <div className="flex items-center gap-1 mb-1">
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditing(false); }}
              className="flex-1 bg-background/60 border border-primary/40 rounded px-2 py-0.5 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
            <button onClick={saveRename} className="text-green-400 hover:text-green-300 p-0.5"><Check size={13} /></button>
            <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground p-0.5"><X size={13} /></button>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-1 mb-1">
            <h3 className="text-sm font-bold leading-tight text-balance flex-1 min-w-0 line-clamp-1">{project.name}</h3>
            <button onClick={() => { setEditing(true); setEditName(project.name); }} className="text-muted-foreground hover:text-foreground shrink-0 p-0.5">
              <Pencil size={11} />
            </button>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground line-clamp-2 mb-2 flex-1 text-pretty">{project.prompt}</p>
        <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground mb-3">
          <Clock size={9} />
          <span>{new Date(project.updated_at).toLocaleDateString()}</span>
          <span>·</span>
          <span className="capitalize">{project.genre}</span>
          {project.asset_count > 0 && (
            <><span>·</span><span>{project.asset_count} assets</span></>
          )}
        </div>

        {/* Actions */}
        {showDeleteConfirm ? (
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-7 text-[10px] border border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => { onDelete(project.id); setShowDeleteConfirm(false); }}
            >
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-7 text-[10px] border border-border/40 text-muted-foreground hover:bg-card"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="flex-1 h-7 text-[10px] bg-primary text-primary-foreground hover:bg-primary/90 gap-1"
              onClick={primaryAction}
            >
              {project.status === 'completed' ? <Eye size={10} /> : <Play size={10} />}
              {project.status === 'completed' ? 'View' : 'Open'}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 border border-border/40 text-muted-foreground hover:bg-card hover:text-foreground"
              title="Duplicate"
              onClick={() => { onDuplicate(project.id); toast.success('Project duplicated'); }}
            >
              <Copy size={11} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 border border-border/40 text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
              title="Delete"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 size={11} />
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function ProjectLibrary() {
  const navigate = useNavigate();
  const { projects, loading, error, fetchProjects, deleteProject, duplicateProject, renameProject } = useCinematicStore();
  const [filter, setFilter] = useState<ProjectStatus | 'all'>('all');

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const filtered = filter === 'all' ? projects : projects.filter((p) => p.status === filter);
  const filters: Array<{ key: ProjectStatus | 'all'; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'completed', label: 'Completed' },
    { key: 'processing', label: 'Processing' },
    { key: 'draft', label: 'Draft' },
    { key: 'failed', label: 'Failed' },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground px-4 md:px-6 py-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-base md:text-lg font-black">Project Library</h1>
          <p className="text-xs text-muted-foreground">{projects.length} film{projects.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="border border-border/60 text-muted-foreground hover:bg-card h-8 w-8"
            onClick={fetchProjects}
            title="Refresh"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </Button>
          <Button
            className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs"
            onClick={() => navigate('/')}
          >
            <Plus size={13} />
            New Film
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
        {filters.map((f) => {
          const count = f.key === 'all' ? projects.length : projects.filter((p) => p.status === f.key).length;
          if (count === 0 && f.key !== 'all') return null;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap border shrink-0',
                filter === f.key
                  ? 'bg-primary/10 text-primary border-primary/40'
                  : 'text-muted-foreground border-border/50 hover:text-foreground hover:border-border'
              )}
            >
              {f.label} <span className="opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-3 glass-panel rounded-lg border border-destructive/30 bg-destructive/5 mb-4">
          <AlertCircle size={14} className="text-destructive shrink-0" />
          <p className="text-xs text-destructive">{error} — Make sure the backend is running on port 3001.</p>
        </div>
      )}

      {/* Loading */}
      {loading && projects.length === 0 ? (
        <div className="flex items-center justify-center h-40 gap-3">
          <Loader2 size={18} className="animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading projects…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-4">
          <Film size={36} className="text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">
            {projects.length === 0 ? 'No films yet. Create your first film!' : 'No films in this category.'}
          </p>
          <Button
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 h-9 text-sm"
            onClick={() => navigate('/')}
          >
            <Sparkles size={13} />
            Create Your First Film
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onDelete={deleteProject}
                onDuplicate={duplicateProject}
                onRename={renameProject}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
