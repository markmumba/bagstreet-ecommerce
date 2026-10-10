import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Megaphone, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useStorefrontHeroSettings, useUpdateStorefrontHero } from '@/hooks/useSettings';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/** Lets the owner swap the storefront homepage campaign photo and headline. */
export function StorefrontHeroCard() {
  const { data: hero, isLoading } = useStorefrontHeroSettings();
  const update = useUpdateStorefrontHero();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [eyebrow, setEyebrow] = useState('');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [fileError, setFileError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!hero) return;
    setEyebrow(hero.eyebrow);
    setTitle(hero.title);
    setSubtitle(hero.subtitle);
  }, [hero]);

  const previewUrl = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const shownImage = previewUrl ?? (removeImage ? null : hero?.image_url ?? null);

  const onPickFile = (file: File | undefined) => {
    setFileError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) return setFileError('Choose an image file (JPEG, PNG, WebP or HEIC).');
    if (file.size > MAX_IMAGE_BYTES) return setFileError('Image must be 15MB or smaller.');
    setImage(file);
    setRemoveImage(false);
  };

  const onSave = async () => {
    setSaved(false);
    await update.mutateAsync({ eyebrow, title, subtitle, image, removeImage });
    setImage(null);
    setRemoveImage(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Megaphone className="h-5 w-5 text-muted-foreground" strokeWidth={1.7} />
          Homepage campaign
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Preview approximates the storefront hero: wide crop with the headline bottom-left */}
        <div className="relative aspect-[21/9] overflow-hidden rounded-xl border border-border bg-[#2a221d]">
          {shownImage && <img src={shownImage} alt="" className="absolute inset-0 h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute bottom-3 left-4 right-4 text-white">
            <p className="text-[10px] uppercase tracking-[0.14em] opacity-80">{eyebrow}</p>
            <p className="mt-1 whitespace-pre-line font-serif text-xl leading-tight">{title}</p>
          </div>
          {isLoading && <div className="absolute inset-0 animate-pulse bg-muted" />}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="hidden"
            onChange={(e) => onPickFile(e.target.files?.[0])}
          />
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={update.isPending}>
            <ImagePlus className="h-4 w-4" strokeWidth={1.7} />
            {hero?.image_url || image ? 'Replace photo' : 'Upload photo'}
          </Button>
          {(image || (hero?.image_url && !removeImage)) && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setImage(null);
                setRemoveImage(Boolean(hero?.image_url));
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              disabled={update.isPending}
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.7} />
              {image ? 'Discard new photo' : 'Remove photo'}
            </Button>
          )}
          {image && <span className="truncate text-xs text-muted-foreground">{image.name}</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          Use a landscape photo at least 2000px wide. Phones show the centre of the image, so keep the subject in the middle.
        </p>
        {fileError && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{fileError}</p>}

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="hero-eyebrow">Small label</label>
          <Input id="hero-eyebrow" value={eyebrow} maxLength={60} onChange={(e) => setEyebrow(e.target.value)} placeholder="The New Season" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="hero-title">Headline</label>
          <Textarea id="hero-title" rows={2} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          <p className="text-xs text-muted-foreground">Put the second part on a new line to show it in italics.</p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="hero-subtitle">Supporting text</label>
          <Textarea id="hero-subtitle" rows={2} value={subtitle} maxLength={240} onChange={(e) => setSubtitle(e.target.value)} />
        </div>

        <div className="flex justify-end">
          <Button type="button" onClick={onSave} disabled={isLoading || update.isPending}>
            {update.isPending ? 'Saving...' : 'Save campaign'}
          </Button>
        </div>

        {update.error && (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {update.error?.message || 'Failed to update the homepage campaign'}
          </p>
        )}
        {saved && (
          <p className="rounded-xl border border-[var(--color-success-border)] bg-[var(--color-success-bg)] px-3 py-2 text-sm text-[var(--color-success-text)]">
            Homepage campaign updated. It's live on the storefront now.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
