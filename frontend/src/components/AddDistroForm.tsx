import { useEffect, useRef, useState } from 'react';
import { suggestDistro, fetchSearch } from '@/lib/api';

interface AddDistroFormProps {
  open: boolean;
  onClose: () => void;
  onSubmitted?: (info: { id: string; title: string; description?: string; url: string }) => void;
}

type SubmissionState =
  | { status: 'idle' }
  | { status: 'validating'; topic: string }
  | { status: 'invalid'; topic: string; error: string }
  | { status: 'submitting'; topic: string }
  | { status: 'success'; id: string; title: string; description?: string; url: string }
  | { status: 'error'; message: string };

const WIKI_TIMEOUT_MS = 5000;

function normalizeTopic(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function AddDistroForm({ open, onClose, onSubmitted }: AddDistroFormProps) {
  const [topic, setTopic] = useState('');
  const [rationale, setRationale] = useState('');
  const [submitter, setSubmitter] = useState('');
  const [preview, setPreview] = useState<{ title: string; description?: string; url: string } | null>(null);
  const [state, setState] = useState<SubmissionState>({ status: 'idle' });
  const [alreadySeen, setAlreadySeen] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Reset form state whenever the modal opens or closes.
  useEffect(() => {
    setTopic('');
    setRationale('');
    setSubmitter('');
    setPreview(null);
    setAlreadySeen(null);
    setState({ status: 'idle' });
    if (open) {
      queueMicrotask(() => inputRef.current?.focus());
    }
  }, [open]);

  // Close on Esc, and trap focus while the modal is open.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      // Tab focus trap
      if (e.key !== 'Tab') return;
      const focusable = Array.from(
        backdropRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => !('disabled' in el && (el as HTMLButtonElement).disabled) && el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Debounced Wikipedia lookup.
  useEffect(() => {
    const normalized = normalizeTopic(topic);
    if (!normalized) {
      setPreview(null);
      setAlreadySeen(null);
      setState({ status: 'idle' });
      return;
    }

    setState({ status: 'validating', topic: normalized });
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const slugLike = normalized.replace(/\s+/g, '_');
        const res = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slugLike)}`,
          { signal: controller.signal, headers: { 'Api-User-Agent': 'DistroMap/0.1 (https://distromap.example)' } },
        );
        if (!res.ok) {
          const error = res.status === 404 ? 'No Wikipedia page found for that topic.' : `Wikipedia error (HTTP ${res.status}).`;
          setState({ status: 'invalid', topic: normalized, error });
          setPreview(null);
          return;
        }
        const json = (await res.json()) as {
          title: string;
          description?: string;
          extract?: string;
          content_urls?: { desktop?: { page?: string } };
        };
        const info = {
          title: json.title,
          description: json.description ?? json.extract?.slice(0, 200),
          url: json.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(slugLike)}`,
        };
        setPreview(info);

        // Cross-check duplicates using slugified id + exact name match.
        const list = await fetchSearch(json.title).catch(() => []);
        const slug = slugify(json.title);
        const lowerTitle = json.title.toLowerCase();
        const match = list.find(
          (d) => slugify(d.id) === slug || slugify(d.name) === slug || d.name.toLowerCase() === lowerTitle,
        );
        setAlreadySeen(match ? `Already in DistroMap: ${match.name}` : null);
        setState({ status: 'idle' });
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setState({ status: 'invalid', topic: normalized, error: (e as Error).message || 'Failed to reach Wikipedia.' });
      }
    }, 350);

    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [topic]);

  // Timeout guard for Wikipedia validation step.
  useEffect(() => {
    if (state.status !== 'validating') return;
    const timeout = setTimeout(() => {
      setState((s) => (s.status === 'validating' ? { status: 'invalid', topic: s.topic, error: 'Wikipedia lookup timed out.' } : s));
    }, WIKI_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [state]);

  if (!open) return null;

  function onBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  async function submit() {
    if (!preview) return;
    setState({ status: 'submitting', topic: preview.title });
    try {
      const result = await suggestDistro(preview.title, rationale || undefined, submitter || undefined);
      const info = result?.validated ?? preview;
      const id = result?.id ?? Math.random().toString(36).slice(2, 10);
      setState({ status: 'success', id, ...info });
      onSubmitted?.({ id, title: info.title, description: info.description, url: info.url });
    } catch (err) {
      setState({ status: 'error', message: (err as Error).message });
    }
  }

  return (
    <div className="add-form-backdrop" ref={backdropRef} onClick={onBackdropClick} role="dialog" aria-modal="true" aria-label="Suggest a distro">
      <div className="add-form">
        <header className="add-form-header">
          <h2>Add a distro</h2>
          <p>Tell us what to add. We’ll validate it against Wikipedia and queue it for review.</p>
          <button className="add-form-close" onClick={onClose} aria-label="Close add form">×</button>
        </header>

        <label className="add-form-field">
          <span className="add-form-label">Wikipedia topic <em>(e.g. <code>Alpine_Linux</code> or <code>Void_Linux</code>)</em></span>
          <input
            ref={inputRef}
            className="add-form-input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Alpine_Linux"
            autoFocus
          />
        </label>

        {state.status === 'validating' && <div className="add-form-status add-form-status--busy">Looking that up on Wikipedia…</div>}
        {state.status === 'invalid' && <div className="add-form-status add-form-status--error">{state.error}</div>}
        {preview && state.status !== 'invalid' && (
          <div className="add-form-preview">
            <h3>{preview.title}</h3>
            {preview.description && <p>{preview.description}</p>}
            <a href={preview.url} target="_blank" rel="noreferrer">Wikipedia ↗</a>
            {alreadySeen && <p className="add-form-warning">{alreadySeen}</p>}
          </div>
        )}

        <label className="add-form-field">
          <span className="add-form-label">Why should this distro be in DistroMap?</span>
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Briefly describe the significance…"
            rows={3}
          />
        </label>

        <label className="add-form-field">
          <span className="add-form-label">Your handle <em>(optional)</em></span>
          <input
            value={submitter}
            onChange={(e) => setSubmitter(e.target.value)}
            placeholder="@yourname"
          />
        </label>

        {state.status === 'submitting' && <div className="add-form-status add-form-status--busy">Submitting…</div>}
        {state.status === 'success' && (
          <div className="add-form-status add-form-status--ok">
            Queued! Review id <code>{state.id}</code>. We’ll reach out when it lands.
          </div>
        )}
        {state.status === 'error' && <div className="add-form-status add-form-status--error">{state.message}</div>}

        <div className="add-form-actions">
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={submit} disabled={!preview || state.status === 'submitting' || state.status === 'success'}>
            Submit suggestion
          </button>
        </div>
      </div>
    </div>
  );
}
