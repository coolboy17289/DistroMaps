import { useEffect, useState } from 'react';
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

export function AddDistroForm({ open, onClose, onSubmitted }: AddDistroFormProps) {
  const [topic, setTopic] = useState('');
  const [rationale, setRationale] = useState('');
  const [submitter, setSubmitter] = useState('');
  const [preview, setPreview] = useState<{ title: string; description?: string; url: string } | null>(null);
  const [state, setState] = useState<SubmissionState>({ status: 'idle' });
  const [alreadySeen, setAlreadySeen] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setState({ status: 'idle' });
      setPreview(null);
      setAlreadySeen(null);
      return;
    }
    setState({ status: 'idle' });
    setPreview(null);
    setAlreadySeen(null);
  }, [open]);

  useEffect(() => {
    if (!topic) {
      setPreview(null);
      setAlreadySeen(null);
      return;
    }
    setState({ status: 'validating', topic });
    const handle = setTimeout(async () => {
      try {
        const slugLike = topic.replace(/\s+/g, '_');
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slugLike)}`);
        if (!res.ok) {
          setState({ status: 'invalid', topic, error: res.status === 404 ? 'No Wikipedia page found for that topic.' : `Wikipedia error (HTTP ${res.status}).` });
          setPreview(null);
          return;
        }
        const json = (await res.json()) as { title: string; description?: string; extract?: string; content_urls?: { desktop?: { page?: string } } };
        setPreview({
          title: json.title,
          description: json.description ?? json.extract?.slice(0, 200),
          url: json.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(slugLike)}`,
        });
        // Cross-check if a distro with this id is already in the dataset.
        const list = await fetchSearch(json.title).catch(() => []);
        const id = json.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const match = list.find((d) => d.id === id || d.name.toLowerCase() === json.title.toLowerCase());
        setAlreadySeen(match ? `Already in DistroMap: ${match.name}` : null);
        setState({ status: 'idle' });
      } catch (e) {
        setState({ status: 'invalid', topic, error: (e as Error).message });
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [topic]);

  if (!open) return null;

  async function submit() {
    if (!preview) return;
    setState({ status: 'submitting', topic: preview.title });
    try {
      const result = await suggestDistro(preview.title, rationale || undefined, submitter || undefined);
      const info = result?.validated ?? preview;
      setState({ status: 'success', id: result.id, ...info });
      onSubmitted?.({ id: result.id, title: info.title, description: info.description, url: info.url });
    } catch (err) {
      setState({ status: 'error', message: (err as Error).message });
    }
  }

  return (
    <div className="add-form-backdrop" role="dialog" aria-label="Suggest a distro">
      <div className="add-form">
        <header className="add-form-header">
          <h2>Add a distro</h2>
          <p>Tell us what to add. We’ll validate it against Wikipedia and queue it for review.</p>
          <button className="add-form-close" onClick={onClose} aria-label="Close add form">×</button>
        </header>

        <label className="add-form-field">
          <span className="add-form-label">Wikipedia topic <em>(e.g. <code>Alpine_Linux</code> or <code>Void_Linux</code>)</em></span>
          <input
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
          <button className="btn btn--primary" onClick={submit} disabled={!preview || state.status === 'submitting'}>
            Submit suggestion
          </button>
        </div>
      </div>
    </div>
  );
}
