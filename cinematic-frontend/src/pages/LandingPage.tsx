import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Film, Sparkles, FileText, LayoutGrid, Mic, Music, Layers,
  Zap, ShieldCheck, Download, ArrowRight, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCinematicStore } from '@/store/cinematicStore';
import { cn } from '@/lib/utils';
import CinematicLogo from '@/components/common/CinematicLogo';
import { toast } from 'sonner';

const GENRES = [
  { value: 'Sci-Fi', label: 'Sci-Fi' },
  { value: 'Drama', label: 'Drama' },
  { value: 'Thriller', label: 'Thriller' },
  { value: 'Comedy', label: 'Comedy' },
  { value: 'Horror', label: 'Horror' },
  { value: 'Action', label: 'Action' },
  { value: 'Animation', label: 'Animation' },
  { value: 'Documentary', label: 'Documentary' },
  { value: 'Fantasy', label: 'Fantasy' },
  { value: 'Romance', label: 'Romance' },
];

const PIPELINE_STEPS = [
  { icon: FileText, label: 'Script', color: 'text-chart-1' },
  { icon: LayoutGrid, label: 'Storyboard', color: 'text-chart-2' },
  { icon: Film, label: 'Animation', color: 'text-chart-3' },
  { icon: Mic, label: 'Voiceover', color: 'text-chart-4' },
  { icon: Music, label: 'Music', color: 'text-primary' },
  { icon: Layers, label: 'Compose', color: 'text-chart-5' },
];

const FEATURES = [
  { icon: Zap, title: 'One-Prompt Production', description: 'Type your concept. Our AI pipeline handles script, visuals, voice, music, and final composition.' },
  { icon: ShieldCheck, title: 'Verified Provenance', description: 'Every asset is SHA-256 signed. Tamper-evident manifests stored permanently on-chain.' },
  { icon: Film, title: 'Cinematic Quality', description: 'Powered by GMI Cloud, Kling AI, and ElevenLabs — real production-grade AI models.' },
  { icon: Download, title: 'One-Click Export', description: 'Download your finished MP4 in 4K with subtitles, metadata, and a shareable link.' },
];

const SAMPLE_PROMPTS = [
  'A robot discovers emotions in an abandoned research facility',
  'An astronaut receives a distress signal from a dead planet',
  'A jazz musician in 2087 plays one last concert before the power grid fails',
  'Two rival chefs discover they are cooking the same memory',
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { createProject, runPipeline, loading } = useCinematicStore();
  const [prompt, setPrompt] = useState('');
  const [genre, setGenre] = useState('Sci-Fi');
  const MAX = 500;

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    try {
      const id = await createProject(prompt.trim(), genre);
      await runPipeline(id);
      navigate(`/dashboard/${id}`);
    } catch {
      toast.error('Failed to create project. Is the backend running?');
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <section className="relative overflow-hidden px-6 pt-16 pb-12 md:pt-24 md:pb-16">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary/10 rounded-full blur-[120px]" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="flex justify-center mb-8">
              <CinematicLogo size="full" showIcon />
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-tight text-balance mb-4">
              One Prompt.{' '}
              <span className="gradient-text">One Short Film.</span>
            </h1>
            <p className="text-muted-foreground text-base md:text-lg max-w-xl mx-auto text-pretty mb-10">
              Describe your story. Our 6-stage AI pipeline writes the script, generates storyboards,
              animates scenes, adds voiceover and music — then delivers your finished film.
            </p>
          </motion.div>

          {/* Prompt Input Card */}
          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 }}
            className="glass-panel rounded-xl p-5 text-left border border-border/50"
          >
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Your Story Prompt
              </label>
              <span className={cn('text-xs tabular-nums', prompt.length > MAX * 0.9 ? 'text-destructive' : 'text-muted-foreground')}>
                {prompt.length}/{MAX}
              </span>
            </div>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, MAX))}
              placeholder="A robot discovers it has been dreaming while in standby mode…"
              className="min-h-[100px] resize-none bg-background/50 border-border text-foreground placeholder:text-muted-foreground/50 text-sm mb-4 focus-visible:ring-primary"
            />
            <div className="flex flex-wrap gap-2 mb-4">
              {SAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPrompt(p)}
                  className="text-xs text-muted-foreground border border-border/60 rounded px-2 py-1 hover:text-primary hover:border-primary/50 transition-colors line-clamp-1 max-w-[180px] text-left"
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Select value={genre} onValueChange={setGenre}>
                <SelectTrigger className="sm:w-44 bg-background/50 border-border text-foreground text-sm">
                  <SelectValue placeholder="Genre" />
                </SelectTrigger>
                <SelectContent>
                  {GENRES.map((g) => (
                    <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleGenerate}
                disabled={!prompt.trim() || loading}
                className="flex-1 sm:flex-none gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-sm h-10"
              >
                <Sparkles size={15} />
                {loading ? 'Creating…' : 'Generate Film'}
                <ArrowRight size={14} />
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Pipeline visual */}
      <section className="px-6 py-10 border-t border-border/40">
        <div className="max-w-3xl mx-auto">
          <p className="text-center text-xs uppercase tracking-widest text-muted-foreground mb-6">6-Stage AI Production Pipeline</p>
          <div className="flex items-center justify-center gap-0 overflow-x-auto">
            {PIPELINE_STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <React.Fragment key={step.label}>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.08 }}
                    className="flex flex-col items-center gap-1.5 shrink-0"
                  >
                    <div className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center">
                      <Icon size={16} className={step.color} />
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{step.label}</span>
                  </motion.div>
                  {i < PIPELINE_STEPS.length - 1 && (
                    <ChevronRight size={14} className="text-muted-foreground/40 shrink-0 mx-0.5" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-12 border-t border-border/40">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-center text-lg md:text-2xl font-bold text-balance mb-8">
            Everything you need. <span className="text-primary">Nothing you don't.</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4 }}
                  className="glass-panel rounded-lg p-5 border border-border/50 h-full"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon size={16} className="text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm mb-1 text-balance">{f.title}</h3>
                      <p className="text-xs text-muted-foreground text-pretty leading-relaxed">{f.description}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="px-6 py-12 border-t border-border/40">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-xl md:text-3xl font-black text-balance mb-3">Ready to direct your first AI film?</h2>
          <p className="text-muted-foreground text-sm mb-6 text-pretty">Join the next generation of filmmakers.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Sparkles size={15} />
              Start Creating
            </Button>
            <Button
              variant="ghost"
              className="border border-border/60 text-foreground hover:bg-card gap-2"
              onClick={() => navigate('/library')}
            >
              <Film size={15} />
              My Library
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
