import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Send } from 'lucide-react';
import { PRIVACY_REQUEST_KIND, type PrivacyRequest, type PrivacyRequestKind } from 'shared';
import { apiClient } from '@/services/api';

export function PrivacyControls() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<PrivacyRequestKind>('ACCESS');
  const [details, setDetails] = useState('');
  const [feedback, setFeedback] = useState('');
  const requests = useQuery({ queryKey: ['privacy-requests'], queryFn: () => apiClient.get<PrivacyRequest[]>('/api/compliance/me/requests'), retry: false });
  const submit = useMutation({
    mutationFn: () => apiClient.post('/api/compliance/me/requests', { kind, details }),
    onSuccess: () => { setDetails(''); setFeedback('Request recorded. Our team will contact you at your account email.'); void qc.invalidateQueries({ queryKey: ['privacy-requests'] }); },
  });
  const download = useMutation({ mutationFn: async () => {
    const response = await apiClient.get('/api/compliance/me/export');
    const url = URL.createObjectURL(new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'bagstreet-my-data.json'; a.click(); URL.revokeObjectURL(url);
    setFeedback('Your account data has been downloaded. Guest purchases can be requested through privacy support.');
  } });
  const error = submit.error || download.error || requests.error;
  return <section className="mt-12 max-w-3xl border-t border-border pt-8">
    <h2 className="mb-4 text-base font-medium">Your privacy</h2>
    <button type="button" onClick={() => { setFeedback(''); submit.reset(); download.mutate(); }} disabled={download.isPending} className="inline-flex min-h-11 items-center gap-2 border border-border px-4 text-sm disabled:opacity-50"><Download className="h-4 w-4" />{download.isPending ? 'Preparing...' : 'Download my data'}</button>
    <form className="mt-6 space-y-4" onSubmit={event => { event.preventDefault(); setFeedback(''); download.reset(); submit.mutate(); }}>
      <label className="block text-sm">Request type<select value={kind} onChange={event => setKind(event.target.value as PrivacyRequestKind)} className="mt-2 block min-h-11 w-full border border-input bg-background px-3">{PRIVACY_REQUEST_KIND.map(value => <option key={value} value={value}>{({ ACCESS: 'Access to information', CORRECTION: 'Correct my information', ERASURE: 'Erase my account data', OBJECTION: 'Object to or restrict processing' })[value]}</option>)}</select></label>
      <label className="block text-sm">Details<textarea value={details} onChange={event => setDetails(event.target.value)} minLength={5} maxLength={2000} required className="mt-2 block min-h-24 w-full border border-input bg-background p-3" /></label>
      <p className="text-xs leading-6 text-foreground-muted">Account erasure is reviewed before action. Order and payment evidence may need to be retained. Do not include passwords or payment card details.</p>
      <button type="submit" disabled={submit.isPending} className="inline-flex min-h-11 items-center gap-2 bg-espresso px-4 text-sm text-background disabled:opacity-50"><Send className="h-4 w-4" />{submit.isPending ? 'Sending...' : 'Submit request'}</button>
    </form>
    {error && <p role="alert" className="mt-4 text-sm">{error.message || 'Unable to process this request.'}</p>}
    {feedback && !error && <p role="status" className="mt-4 text-sm">{feedback}</p>}
    <ul className="mt-6 divide-y divide-border">{requests.data?.data?.map(request => <li key={request.id} className="py-3 text-sm"><span className="font-medium">{request.kind.toLowerCase()} - {request.status.toLowerCase().replace(/_/g, ' ')}</span><p className="mt-1 break-words text-foreground-muted">{request.resolution || request.details}</p></li>)}</ul>
  </section>;
}
