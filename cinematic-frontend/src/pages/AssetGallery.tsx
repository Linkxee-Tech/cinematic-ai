import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, X, Images, Video, Music, FileVideo,
  Download, Eye, Filter, Loader2, AlertCircle, CheckCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCinematicStore } from '@/store/cinematicStore';
import type { Asset } from '@/store/cinematicStore';
import { api } from '@/lib/api';
import type { AssetType } from '@/lib/api';
import { cn } from '@/lib/utils';

type FilterType = 'all' | AssetType;

const FILTER_TABS: { key: FilterType; label: string; icon: React.ElementType }[] = [
  { key: 'all',         label: 'All',        icon: Filter },
  { key: 'storyboard',  label: 'Storyboard', icon: Images },
  { key: 'video_clip',  label: 'Video',      icon: Video },
  { key: 'voiceover',   label: 'Voiceover',  icon: Music },
  { key: 'music',       label: 'Music',      icon: Music },
  { key: 'final_video', label: 'Final',      icon: FileVideo },
];

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  storyboard:  { label: 'Storyboard',  className: 'bg-chart-2/10 text-chart-2 border-chart-2/30' },
  video_clip:  { label: 'Video Clip',  className: 'bg-chart-3/10 text-chart-3 border-chart-3/30' },
  voiceover:   { label: 'Voiceover',   className: 'bg-chart-4/10 text-chart-4 border-chart-4/30' },
  music:       { label: 'Music',       className: 'bg-chart-4/10 text-chart-4 border-chart-4/30' },
  final_video: { label: 'Final Film',  className: 'bg-primary/10 text-primary border-primary/30' },
  thumbnail:   { label: 'Thumbnail',   className: 'bg-chart-2/10 text-chart-2 border-chart-2/30' },
  script:      { label: 'Script',      className: 'bg-muted text-muted-foreground border-border' },
};

/** Derive a display label from asset fields since `name` is not in AssetResp */
function assetLabel(asset: Asset): string {
  return asset.pipeline_step
    ? `${asset.asset_type} — ${asset.pipeline_step}`
    : asset.asset_type;
}

const AUDIO_TYPES: AssetType[] = ['voiceover', 'music'];
const VIDEO_TYPES: AssetType[] = ['video_clip', 'final_video'];

function AssetThumbnail({ asset }: { asset: Asset }) {
  if (AUDIO_TYPES.includes(asset.asset_type)) {
    return (
      <div className="w-full aspect-video bg-muted rounded flex flex-col items-center justify-center gap-2">
        <Music size={20} className="text-chart-4" />
        <div className="flex gap-0.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="w-0.5 bg-chart-4/60 rounded-full" style={{ height: `${8 + Math.sin(i * 0.9) * 7}px` }} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="w-full aspect-video overflow-hidden rounded bg-muted relative">
      <img
        src={asset.b2_url}
        alt={assetLabel(asset)}
        className="w-full h-full object-cover"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
      {VIDEO_TYPES.includes(asset.asset_type) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
            <Video size={14} className="text-white ml-0.5" />
          </div>
        </div>
      )}
    </div>
  );
}

function LightboxModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const badge = TYPE_BADGE[asset.asset_type];
  const label = assetLabel(asset);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        className="bg-card border border-border rounded-xl overflow-hidden max-w-2xl w-full max-h-[90dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <Badge className={cn('text-[10px] border shrink-0', badge?.className)}>{badge?.label}</Badge>
            <span className="text-sm font-medium truncate">{label}</span>
          </div>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground shrink-0 h-7 w-7" onClick={onClose}>
            <X size={15} />
          </Button>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-hidden bg-black/30 min-h-0">
          {AUDIO_TYPES.includes(asset.asset_type) ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              <Music size={28} className="text-chart-4" />
              <div className="flex gap-0.5">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div key={i} className="w-1 bg-chart-4/60 rounded-full" style={{ height: `${10 + Math.sin(i * 0.7) * 10}px` }} />
                ))}
              </div>
            </div>
          ) : (
            <img src={asset.b2_url} alt={label} className="w-full max-h-80 object-contain" />
          )}
        </div>

        {/* Metadata */}
        <div className="px-4 py-3 border-t border-border space-y-1.5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {asset.width && asset.height && (
              <><span className="text-muted-foreground">Resolution</span><span>{asset.width} × {asset.height}</span></>
            )}
            {asset.duration_seconds != null && (
              <><span className="text-muted-foreground">Duration</span><span>{asset.duration_seconds.toFixed(1)}s</span></>
            )}
            {asset.file_size_bytes != null && (
              <><span className="text-muted-foreground">Size</span><span>{(asset.file_size_bytes / 1024 / 1024).toFixed(1)} MB</span></>
            )}
            {asset.pipeline_step && (
              <><span className="text-muted-foreground">Step</span><span>{asset.pipeline_step}</span></>
            )}
          </div>
          {asset.sha256 && (
            <div className="flex items-center gap-2 pt-1">
              <CheckCircle size={11} className="text-green-400 shrink-0" />
              <span className="font-mono text-[9px] text-muted-foreground/60 truncate">SHA-256: {asset.sha256.slice(0, 40)}…</span>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function AssetGallery() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { currentProject, loadProject, loading } = useCinematicStore();
  const [filter, setFilter] = useState<FilterType>('all');
  const [lightbox, setLightbox] = useState<Asset | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    if (!currentProject || currentProject.id !== projectId) loadProject(projectId);
  }, [projectId, loadProject, currentProject]);

  useEffect(() => {
    if (!projectId) return;
    setAssetsLoading(true);
    api.getAssets(projectId)
      .then(setAssets)
      .catch(() => setAssets([]))
      .finally(() => setAssetsLoading(false));
  }, [projectId]);

  if (loading && !currentProject) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-3">
        <Loader2 size={20} className="animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Loading gallery…</p>
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

  const filtered = filter === 'all' ? assets : assets.filter((a) => a.asset_type === filter);
  const countOf = (type: FilterType) =>
    type === 'all' ? assets.length : assets.filter((a) => a.asset_type === type).length;

  return (
    <div className="min-h-screen bg-background text-foreground px-4 md:px-6 py-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Button asChild variant="ghost" className="border border-border/60 text-foreground hover:bg-card h-8 px-2 shrink-0">
          <Link to={`/dashboard/${projectId}`}><ChevronLeft size={15} /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold">Asset Gallery</h1>
          <p className="text-xs text-muted-foreground truncate">{currentProject.name}</p>
        </div>
        <Button asChild variant="ghost" className="border border-border/60 text-foreground hover:bg-card h-8 text-xs gap-1.5 shrink-0">
          <Link to={`/export/${projectId}`}><Download size={13} /> Export</Link>
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
        {FILTER_TABS.map((tab) => {
          const Icon = tab.icon;
          const count = countOf(tab.key);
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap border shrink-0',
                filter === tab.key
                  ? 'bg-primary/10 text-primary border-primary/40'
                  : 'text-muted-foreground border-border/50 hover:text-foreground hover:border-border'
              )}
            >
              <Icon size={12} />
              {tab.label}
              <span className="text-[10px] opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {assetsLoading ? (
        <div className="flex items-center justify-center h-40 gap-3">
          <Loader2 size={18} className="animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading assets…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-3">
          <Images size={32} className="text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">
            {currentProject.status !== 'completed' ? 'Run the pipeline first to generate assets.' : 'No assets in this category.'}
          </p>
          {currentProject.status !== 'completed' && (
            <Button asChild variant="ghost" className="border border-border/60 text-foreground hover:bg-card h-8 text-xs">
              <Link to={`/dashboard/${projectId}`}>Go to Pipeline</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((asset) => {
              const badge = TYPE_BADGE[asset.asset_type];
              return (
                <motion.div
                  key={asset.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="group glass-panel rounded-lg overflow-hidden border border-border/50 hover:border-border cursor-pointer transition-colors"
                  onClick={() => setLightbox(asset)}
                >
                  <div className="relative">
                    <AssetThumbnail asset={asset} />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <Eye size={18} className="text-white drop-shadow" />
                    </div>
                  </div>
                  <div className="p-2">
                    <Badge className={cn('text-[9px] border mb-1', badge?.className)}>{badge?.label}</Badge>
                    <p className="text-xs font-medium truncate">{assetLabel(asset)}</p>
                    {asset.file_size_bytes != null && (
                      <p className="text-[10px] text-muted-foreground">{(asset.file_size_bytes / 1024 / 1024).toFixed(1)} MB</p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && <LightboxModal asset={lightbox} onClose={() => setLightbox(null)} />}
      </AnimatePresence>
    </div>
  );
}
