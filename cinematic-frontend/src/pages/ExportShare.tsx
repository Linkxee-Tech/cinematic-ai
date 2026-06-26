import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Download, Share2, Copy, Check, Film, Loader2,
  AlertCircle, CheckCircle2, Settings2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useCinematicStore } from '@/store/cinematicStore';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const QUALITY_OPTIONS = ['4K Ultra HD', '1080p Full HD', '720p HD', '480p SD'];
const FORMAT_OPTIONS = ['MP4 (H.264)', 'WebM (VP9)', 'MOV (ProRes)'];

export default function ExportShare() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { currentProject, loadProject, loading } = useCinematicStore();

  const [quality, setQuality] = useState('1080p Full HD');
  const [format, setFormat] = useState('MP4 (H.264)');
  const [includeSubtitles, setIncludeSubtitles] = useState(true);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportFilename, setExportFilename] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const exportingRef = useRef(false);

  useEffect(() => {
    if (!projectId) return;
    if (!currentProject || currentProject.id !== projectId) loadProject(projectId);
  }, [projectId, loadProject, currentProject]);

  const handleExport = async () => {
    if (!projectId || exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);
    setExportUrl(null);
    try {
      const resp = await api.getExport(projectId);
      setExportUrl(resp.download_url);
      setExportFilename(resp.filename);
      toast.success('Export ready — your film is available for download!', { duration: 5000 });
    } catch (e) {
      toast.error(`Export failed: ${(e as Error).message}`);
    } finally {
      setExporting(false);
      exportingRef.current = false;
    }
  };

  const handleDownload = () => {
    if (!exportUrl) return;
    const a = document.createElement('a');
    a.href = exportUrl;
    a.download = exportFilename ?? 'cinematic-film.mp4';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(exportUrl ?? `https://cinematic.ai/film/${projectId}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
    toast.success('Share link copied!');
  };

  if (loading && !currentProject) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-3">
        <Loader2 size={20} className="animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Loading…</p>
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

  const project = currentProject;
  const isReady = project.status === 'completed';

  return (
    <div className="min-h-screen bg-background text-foreground px-4 md:px-6 py-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Button asChild variant="ghost" className="border border-border/60 text-foreground hover:bg-card h-8 px-2 shrink-0">
          <Link to={`/gallery/${projectId}`}><ChevronLeft size={15} /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold">Export & Share</h1>
          <p className="text-xs text-muted-foreground truncate">{project.name}</p>
        </div>
        <Button
          variant="ghost"
          className={cn('border h-8 text-xs gap-1.5 shrink-0',
            showSettings ? 'border-primary/40 text-primary bg-primary/5' : 'border-border/60 text-foreground hover:bg-card'
          )}
          onClick={() => setShowSettings(!showSettings)}
        >
          <Settings2 size={13} />
          Settings
        </Button>
      </div>

      {/* Not ready warning */}
      {!isReady && (
        <div className="flex items-center gap-3 p-3 glass-panel rounded-lg border border-amber-500/30 bg-amber-500/5 mb-4">
          <AlertCircle size={14} className="text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300">Pipeline must complete before exporting.</p>
          <Button asChild variant="ghost" className="ml-auto border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 h-7 text-xs shrink-0">
            <Link to={`/dashboard/${projectId}`}>View Pipeline</Link>
          </Button>
        </div>
      )}

      {/* Film thumbnail card */}
      <div className="glass-panel rounded-xl overflow-hidden border border-border/50 mb-4">
        {project.thumbnail_url ? (
          <img src={project.thumbnail_url} alt={project.name} className="w-full aspect-video object-cover" />
        ) : (
          <div className="w-full aspect-video bg-muted flex items-center justify-center">
            <Film size={32} className="text-muted-foreground/20" />
          </div>
        )}
        <div className="p-4">
          <h2 className="font-bold text-sm mb-0.5 text-balance">{project.name}</h2>
          <p className="text-xs text-muted-foreground">{project.genre} · {project.duration ?? '—'}</p>
        </div>
      </div>

      {/* Settings panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="glass-panel rounded-lg p-4 border border-border/50 mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Export Settings</p>
                <button onClick={() => setShowSettings(false)} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-xs text-muted-foreground">Quality</Label>
                  <Select value={quality} onValueChange={setQuality}>
                    <SelectTrigger className="w-40 h-8 text-xs bg-background/50 border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUALITY_OPTIONS.map((q) => (
                        <SelectItem key={q} value={q} className="text-xs">{q}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-xs text-muted-foreground">Format</Label>
                  <Select value={format} onValueChange={setFormat}>
                    <SelectTrigger className="w-40 h-8 text-xs bg-background/50 border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORMAT_OPTIONS.map((f) => (
                        <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-xs text-muted-foreground">Include Subtitles</Label>
                  <Switch checked={includeSubtitles} onCheckedChange={setIncludeSubtitles} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-xs text-muted-foreground">Embed Metadata</Label>
                  <Switch checked={includeMetadata} onCheckedChange={setIncludeMetadata} />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Export ready banner */}
      {exportUrl && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel rounded-lg p-4 border border-green-500/30 bg-green-500/5 mb-4 flex items-center gap-3"
        >
          <CheckCircle2 size={16} className="text-green-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-400">Export Ready!</p>
            <p className="text-xs text-muted-foreground truncate">{exportFilename ?? 'film.mp4'}</p>
          </div>
          <Button
            size="sm"
            className="shrink-0 h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
            onClick={handleDownload}
          >
            <Download size={12} className="mr-1" /> Download
          </Button>
        </motion.div>
      )}

      {/* Action buttons */}
      <div className="space-y-3">
        <Button
          className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90 h-11 font-semibold"
          disabled={!isReady || exporting}
          onClick={exportUrl ? handleDownload : handleExport}
        >
          {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          {exporting ? 'Generating Export…' : exportUrl ? 'Download Film' : 'Export Film'}
        </Button>
        <Button
          variant="ghost"
          className="w-full gap-2 border border-border/60 text-foreground hover:bg-card h-10 text-sm"
          disabled={!isReady}
          onClick={handleCopyLink}
        >
          {linkCopied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
          {linkCopied ? 'Link Copied!' : 'Copy Share Link'}
        </Button>
        <Button
          variant="ghost"
          className="w-full gap-2 border border-border/60 text-foreground hover:bg-card h-10 text-sm"
          disabled={!isReady}
          onClick={() => {
            if (navigator.share) {
              navigator.share({ title: project.name, url: exportUrl ?? `https://cinematic.ai/film/${projectId}` });
            } else {
              handleCopyLink();
            }
          }}
        >
          <Share2 size={15} />
          Share to Social
        </Button>
      </div>

      {/* Provenance link */}
      <div className="mt-6 pt-4 border-t border-border/40">
        <Button asChild variant="ghost" className="w-full border border-border/40 text-muted-foreground hover:bg-card hover:text-foreground h-9 text-xs gap-2">
          <Link to={`/provenance/${projectId}`}>
            View Content Provenance & Manifest
          </Link>
        </Button>
      </div>
    </div>
  );
}

const QUALITY_OPTIONS = ['4K Ultra HD', '1080p Full HD', '720p HD', '480p SD'];
const FORMAT_OPTIONS = ['MP4 (H.264)', 'WebM (VP9)', 'MOV (ProRes)'];

export default function ExportShare() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { currentProject, loadProject, loading } = useCinematicStore();

  const [quality, setQuality] = useState('4K Ultra HD');
  const [format, setFormat] = useState('MP4 (H.264)');
  const [includeSubtitles, setIncludeSubtitles] = useState(true);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exported, setExported] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const exportedRef = useRef(false);

  useEffect(() => {
    if (!projectId) return;
    if (!currentProject || currentProject.id !== projectId) loadProject(projectId);
  }, [projectId, loadProject, currentProject]);

  const handleExport = () => {
    if (exportedRef.current) return;
    setExporting(true);
    setExportProgress(0);
    setExported(false);

    const start = Date.now();
    const duration = 3500;
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const progress = Math.min(Math.round((elapsed / duration) * 99), 99);
      setExportProgress(progress);
      if (elapsed >= duration) {
        clearInterval(timer);
        setExportProgress(100);
        setExporting(false);
        if (!exportedRef.current) {
          exportedRef.current = true;
          setExported(true);
          toast.success('Export complete — your film is ready!', { duration: 4000 });
        }
      }
    }, 50);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`https://cinematic.ai/film/${projectId}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
    toast.success('Share link copied!');
  };

  if (loading && !currentProject) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-3">
        <Loader2 size={20} className="animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Loading…</p>
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

  const project = currentProject;
  const isReady = project.status === 'completed';

  return (
    <div className="min-h-screen bg-background text-foreground px-4 md:px-6 py-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Button asChild variant="ghost" className="border border-border/60 text-foreground hover:bg-card h-8 px-2 shrink-0">
          <Link to={`/gallery/${projectId}`}><ChevronLeft size={15} /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold">Export & Share</h1>
          <p className="text-xs text-muted-foreground truncate">{project.name}</p>
        </div>
        <Button
          variant="ghost"
          className={cn('border h-8 text-xs gap-1.5 shrink-0',
            showSettings ? 'border-primary/40 text-primary bg-primary/5' : 'border-border/60 text-foreground hover:bg-card'
          )}
          onClick={() => setShowSettings(!showSettings)}
        >
          <Settings2 size={13} />
          Settings
        </Button>
      </div>

      {/* Not ready warning */}
      {!isReady && (
        <div className="flex items-center gap-3 p-3 glass-panel rounded-lg border border-amber-500/30 bg-amber-500/5 mb-4">
          <AlertCircle size={14} className="text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300">Pipeline must complete before exporting.</p>
          <Button asChild variant="ghost" className="ml-auto border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 h-7 text-xs shrink-0">
            <Link to={`/dashboard/${projectId}`}>View Pipeline</Link>
          </Button>
        </div>
      )}

      {/* Film thumbnail card */}
      <div className="glass-panel rounded-xl overflow-hidden border border-border/50 mb-4">
        {project.thumbnail_url ? (
          <img src={project.thumbnail_url} alt={project.name} className="w-full aspect-video object-cover" />
        ) : (
          <div className="w-full aspect-video bg-muted flex items-center justify-center">
            <Film size={32} className="text-muted-foreground/20" />
          </div>
        )}
        <div className="p-4">
          <h2 className="font-bold text-sm mb-0.5 text-balance">{project.name}</h2>
          <p className="text-xs text-muted-foreground">{project.genre} · {project.duration ?? '—'}</p>
        </div>
      </div>

      {/* Settings panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="glass-panel rounded-lg p-4 border border-border/50 mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Export Settings</p>
                <button onClick={() => setShowSettings(false)} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-xs text-muted-foreground">Quality</Label>
                  <Select value={quality} onValueChange={setQuality}>
                    <SelectTrigger className="w-40 h-8 text-xs bg-background/50 border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUALITY_OPTIONS.map((q) => (
                        <SelectItem key={q} value={q} className="text-xs">{q}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-xs text-muted-foreground">Format</Label>
                  <Select value={format} onValueChange={setFormat}>
                    <SelectTrigger className="w-40 h-8 text-xs bg-background/50 border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORMAT_OPTIONS.map((f) => (
                        <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-xs text-muted-foreground">Include Subtitles</Label>
                  <Switch checked={includeSubtitles} onCheckedChange={setIncludeSubtitles} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-xs text-muted-foreground">Embed Metadata</Label>
                  <Switch checked={includeMetadata} onCheckedChange={setIncludeMetadata} />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Export progress overlay */}
      <AnimatePresence>
        {exporting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-card border border-border rounded-xl p-8 text-center w-80 max-w-[calc(100%-2rem)]"
            >
              <Film size={28} className="text-primary mx-auto mb-4" />
              <p className="font-bold text-sm mb-1">Rendering Film…</p>
              <p className="text-xs text-muted-foreground mb-4">{quality} · {format}</p>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-2">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  animate={{ width: `${exportProgress}%` }}
                  transition={{ duration: 0.2 }}
                />
              </div>
              <p className="text-xs text-primary font-mono">{exportProgress}%</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Export success */}
      {exported && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel rounded-lg p-4 border border-green-500/30 bg-green-500/5 mb-4 flex items-center gap-3"
        >
          <CheckCircle2 size={16} className="text-green-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-400">Export Complete!</p>
            <p className="text-xs text-muted-foreground">{quality} · {format} · {includeSubtitles ? 'with subtitles' : 'no subtitles'}</p>
          </div>
        </motion.div>
      )}

      {/* Action buttons */}
      <div className="space-y-3">
        <Button
          className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90 h-11 font-semibold"
          disabled={!isReady || exporting}
          onClick={handleExport}
        >
          {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          {exporting ? 'Rendering…' : exported ? 'Download Again' : 'Export Film'}
        </Button>
        <Button
          variant="ghost"
          className="w-full gap-2 border border-border/60 text-foreground hover:bg-card h-10 text-sm"
          disabled={!isReady}
          onClick={handleCopyLink}
        >
          {linkCopied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
          {linkCopied ? 'Link Copied!' : 'Copy Share Link'}
        </Button>
        <Button
          variant="ghost"
          className="w-full gap-2 border border-border/60 text-foreground hover:bg-card h-10 text-sm"
          disabled={!isReady}
          onClick={() => {
            if (navigator.share) {
              navigator.share({ title: project.name, url: `https://cinematic.ai/film/${projectId}` });
            } else {
              handleCopyLink();
            }
          }}
        >
          <Share2 size={15} />
          Share to Social
        </Button>
      </div>

      {/* Provenance link */}
      <div className="mt-6 pt-4 border-t border-border/40">
        <Button asChild variant="ghost" className="w-full border border-border/40 text-muted-foreground hover:bg-card hover:text-foreground h-9 text-xs gap-2">
          <Link to={`/provenance/${projectId}`}>
            View Content Provenance & Manifest
          </Link>
        </Button>
      </div>
    </div>
  );
}
