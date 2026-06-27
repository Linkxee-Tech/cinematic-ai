import React, { useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, LayoutGrid, Film, Mic, Music, Layers,
  CheckCircle2, AlertCircle, Clock, Loader2,
  ChevronLeft, RefreshCw, Bug, Eye, BarChart2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCinematicStore } from '@/store/cinematicStore';
import type { PipelineStep, StepStatus } from '@/store/cinematicStore';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Map pipeline step names (from backend) to icons
const STEP_ICONS: Record<string, React.ElementType> = {
  script_writing:   FileText,
  storyboard:       LayoutGrid,
  video_generation: Film,
  voice_generation: Mic,
  music_generation: Music,
  final_assembly:   Layers,
};

// Backend StepStatus enum: pending | running | completed | failed | skipped
const STATUS_CONFIG: Record<StepStatus, { color: string; icon: React.ElementType; label: string }> = {
  pending:   { color: 'text-muted-foreground', icon: Clock,        label: 'Pending' },
  running:   { color: 'text-primary',          icon: Loader2,      label: 'Running' },
  completed: { color: 'text-green-400',        icon: CheckCircle2, label: 'Complete' },
  failed:    { color: 'text-destructive',      icon: AlertCircle,  label: 'Failed' },
  skipped:   { color: 'text-muted-foreground', icon: Clock,        label: 'Skipped' },
};

function StepCard({ step, isActive }: { step: PipelineStep; isActive: boolean }) {
  const Icon = STEP_ICONS[step.name] ?? Film;
  const cfg = STATUS_CONFIG[step.status] ?? STATUS_CONFIG.pending;
  const StatusIcon = cfg.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'glass-panel rounded-lg p-4 border transition-colors',
        isActive ? 'border-primary/50 bg-primary/5' : 'border-border/50',
        step.status === 'failed' && 'border-destructive/40 bg-destructive/5'
      )}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={cn('w-8 h-8 rounded flex items-center justify-center shrink-0',
          step.status === 'completed' ? 'bg-green-500/10' :
          step.status === 'running'   ? 'bg-primary/10' :
          step.status === 'failed'    ? 'bg-destructive/10' : 'bg-muted'
        )}>
          <Icon size={15} className={cfg.color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold truncate capitalize">{step.name.replace(/_/g, ' ')}</p>
            <Badge className={cn('text-[9px] shrink-0 border px-1.5 py-0',
              step.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
              step.status === 'running'   ? 'bg-primary/10 text-primary border-primary/30' :
              step.status === 'failed'    ? 'bg-destructive/10 text-destructive border-destructive/30' :
              'bg-muted text-muted-foreground border-border'
            )}>
              <StatusIcon size={9} className={cn('mr-1', step.status === 'running' && 'animate-spin')} />
              {cfg.label}
            </Badge>
          </div>
          {step.message && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{step.message}</p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {(step.status === 'running' || step.status === 'completed' || step.status === 'failed') && (
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className={cn('h-full rounded-full',
              step.status === 'failed'    ? 'bg-destructive' :
              step.status === 'completed' ? 'bg-green-500' : 'bg-primary'
            )}
            animate={{ width: `${step.progress}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>
      )}

      {/* Preview image/URL if provided */}
      <AnimatePresence>
        {step.preview_url && step.status === 'completed' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 overflow-hidden"
          >
            <img
              src={step.preview_url}
              alt={`${step.name} preview`}
              className="w-full max-h-32 object-cover rounded border border-border/40 opacity-90"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function PipelineDashboard() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { currentProject, loading, error, failureSimulation, loadProject, runPipeline, toggleFailureSimulation } = useCinematicStore();
  const activeStepRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (projectId) loadProject(projectId);
  }, [projectId, loadProject]);

  // Auto-scroll to active step
  useEffect(() => {
    if (activeStepRef.current) {
      activeStepRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentProject?.steps]);

  if (loading && !currentProject) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-3">
        <Loader2 size={20} className="animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Loading pipeline…</p>
      </div>
    );
  }

  if (error || !currentProject) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle size={40} className="text-destructive/50" />
        <p className="text-muted-foreground text-sm">{error ?? 'Project not found'}</p>
        <Button onClick={() => navigate('/library')} variant="ghost" className="border border-border/60 text-foreground hover:bg-card">
          <ChevronLeft size={14} className="mr-1" /> Back to Library
        </Button>
      </div>
    );
  }

  const project = currentProject;
  const steps = project.steps ?? [];
  // const activeStep = steps.find((s) => s.status === 'running');
  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const overallProgress = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;
  const isFailed = project.status === 'failed';

  return (
    <div className="min-h-screen bg-background text-foreground px-4 md:px-6 py-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Button asChild variant="ghost" className="border border-border/60 text-foreground hover:bg-card h-8 px-2 shrink-0">
          <Link to="/library"><ChevronLeft size={15} /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold truncate">{project.name}</h1>
          <p className="text-[10px] text-muted-foreground truncate">{project.genre} · {project.prompt.slice(0, 60)}…</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {project.status === 'completed' && (
            <Button asChild variant="ghost" className="border border-border/60 text-foreground hover:bg-card h-8 text-xs gap-1.5">
              <Link to={`/gallery/${projectId}`}><Eye size={13} /> Gallery</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Overall progress */}
      <div className="glass-panel rounded-lg p-4 mb-4 border border-border/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <BarChart2 size={14} className="text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Overall Progress</span>
          </div>
          <span className="text-xs font-mono text-primary">{overallProgress}%</span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <motion.div
            className={cn('h-full rounded-full', isFailed ? 'bg-destructive' : 'bg-primary')}
            animate={{ width: `${overallProgress}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
        {project.status === 'completed' && (
          <div className="flex items-center gap-2 mt-2">
            <CheckCircle2 size={13} className="text-green-400" />
            <span className="text-xs text-green-400 font-medium">Production complete · {project.duration}</span>
          </div>
        )}
        {isFailed && (
          <div className="flex items-center gap-2 mt-2">
            <AlertCircle size={13} className="text-destructive" />
            <span className="text-xs text-destructive">Pipeline failed — retry below</span>
          </div>
        )}
      </div>

      {/* Failure state + Retry */}
      {(isFailed || project.status === 'draft') && (
        <div className="flex gap-2 mb-4">
          <Button
            className="flex-1 gap-2 bg-primary text-primary-foreground hover:bg-primary/90 h-9 text-xs"
            onClick={async () => {
              try {
                await runPipeline(project.id);
              } catch {
                toast.error('Failed to start pipeline');
              }
            }}
          >
            <RefreshCw size={13} />
            {isFailed ? 'Retry Pipeline' : 'Start Pipeline'}
          </Button>
          <Button
            variant="ghost"
            className={cn(
              'border h-9 text-xs gap-1.5 shrink-0',
              failureSimulation
                ? 'border-destructive/50 text-destructive hover:bg-destructive/10'
                : 'border-border/60 text-foreground hover:bg-card'
            )}
            onClick={toggleFailureSimulation}
          >
            <Bug size={13} />
            {failureSimulation ? 'Failure ON' : 'Simulate Fail'}
          </Button>
        </div>
      )}

      {/* Debug toggle during processing */}
      {project.status === 'processing' && (
        <div className="flex justify-end mb-3">
          <Button
            variant="ghost"
            size="sm"
            className={cn('text-[10px] h-6 gap-1 border',
              failureSimulation ? 'border-destructive/40 text-destructive hover:bg-destructive/10' : 'border-border/40 text-muted-foreground hover:bg-card'
            )}
            onClick={toggleFailureSimulation}
          >
            <Bug size={10} />
            {failureSimulation ? 'Failure Sim: ON' : 'Failure Sim: OFF'}
          </Button>
        </div>
      )}

      {/* Step cards */}
      <div className="space-y-3">
        {steps.map((step) => {
          const isActive = step.status === 'running';
          return (
            <div key={step.name} ref={isActive ? activeStepRef : null}>
              <StepCard step={step} isActive={isActive} />
            </div>
          );
        })}
      </div>

      {/* CTA after completion */}
      {project.status === 'completed' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 flex gap-3">
          <Button asChild className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 gap-2 h-10 text-sm">
            <Link to={`/gallery/${projectId}`}><Eye size={14} /> View Assets</Link>
          </Button>
          <Button asChild variant="ghost" className="border border-border/60 text-foreground hover:bg-card gap-2 h-10 text-sm">
            <Link to={`/export/${projectId}`}><Film size={14} /> Export</Link>
          </Button>
        </motion.div>
      )}
    </div>
  );
}
