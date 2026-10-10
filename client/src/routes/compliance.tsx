import { createFileRoute } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { USER_ROLE, PRIVACY_REQUEST_KIND, PRIVACY_REQUEST_STATUS, ACCOUNTING_DATASET,
  type PrivacyRequest, type ComplianceIncident, type ProductEvidence, type ProductResponse, type AccountingExport } from 'shared';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/context/AuthContext';
import { apiClient } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export const Route = createFileRoute('/compliance')({ component: CompliancePage });
const input = 'min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
const errorMessage = (error: unknown) => error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Unable to save. Please try again.';
const localTime = (value: string) => new Date(value).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' });
const tabs = ['Requests', 'Incidents', 'Supplier evidence', 'Monthly records'];
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-2 text-sm font-medium"><span>{label}</span>{children}</label>;
}

function CompliancePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('Requests');
  return <DashboardLayout>{user?.role === USER_ROLE.ADMIN && <div className="space-y-6 p-4 sm:p-6">
    <header><h1 className="flex items-center gap-2 text-2xl font-semibold"><ShieldCheck className="h-6 w-6" />Compliance</h1></header>
    <div role="tablist" aria-label="Compliance records" className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((name, index) => <button key={name} id={`compliance-tab-${index}`} type="button" role="tab" aria-controls="compliance-panel" tabIndex={tab === name ? 0 : -1} aria-selected={tab === name} onClick={() => setTab(name)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
        if (next == null) return;
        event.preventDefault(); setTab(tabs[next]); document.getElementById(`compliance-tab-${next}`)?.focus();
      }} className={`min-h-11 shrink-0 border-b-2 px-3 text-sm ${tab === name ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground'}`}>{name}</button>)}
    </div>
    <div id="compliance-panel" role="tabpanel" aria-labelledby={`compliance-tab-${tabs.indexOf(tab)}`}>{tab === 'Requests' ? <PrivacyRequests /> : tab === 'Incidents' ? <Incidents /> : tab === 'Supplier evidence' ? <Evidence /> : <MonthlyRecords />}</div>
  </div>}</DashboardLayout>;
}

function PrivacyRequests() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const rows = useQuery({ queryKey: ['compliance','requests',page], queryFn: () => apiClient.get<PrivacyRequest[]>('/api/compliance/admin/requests', { page }), retry: false });
  const [selected, setSelected] = useState<PrivacyRequest | null>(null);
  const [status, setStatus] = useState<PrivacyRequest['status']>('IN_PROGRESS');
  const [resolution, setResolution] = useState('');
  const [verified, setVerified] = useState(false);
  const [erase, setErase] = useState(false);
  const [newRequest, setNewRequest] = useState(false);
  const [feedback, setFeedback] = useState('');
  const change = useMutation({ mutationFn: async () => {
    if (!selected) return;
    return erase ? apiClient.post(`/api/compliance/admin/requests/${selected.id}/erase-account`, { confirmed: true, retention_reason: resolution })
      : apiClient.patch(`/api/compliance/admin/requests/${selected.id}`, { status, resolution, verify_identity: verified });
  }, onSuccess: () => { setSelected(null); setFeedback('Request updated.'); void qc.invalidateQueries({ queryKey: ['compliance','requests'] }); } });
  const create = useMutation({ mutationFn: async (form: FormData) => {
    return apiClient.post('/api/compliance/admin/requests', { email: form.get('email'), kind: form.get('kind'), details: form.get('details') });
  }, onSuccess: () => { setNewRequest(false); void qc.invalidateQueries({ queryKey: ['compliance','requests'] }); } });
  const exported = useMutation({ mutationFn: async (request: PrivacyRequest) => {
    const data = await apiClient.get<unknown>(`/api/compliance/admin/requests/${request.id}/export`);
    download(`privacy-${request.id}.json`, JSON.stringify(data, null, 2), 'application/json');
    setFeedback('Data exported. Use an identity-verified, secure delivery channel.');
  } });
  return <section className="space-y-4">
    <div className="flex items-center justify-between gap-4"><h2 className="text-lg font-semibold">Privacy requests</h2><Button onClick={() => setNewRequest(true)}><Plus className="h-4 w-4" />Record request</Button></div>
    {(rows.error || exported.error) && <p role="alert" className="text-sm text-destructive">{errorMessage(rows.error || exported.error)}</p>}
    {feedback && <p role="status" className="text-sm">{feedback}</p>}
    {rows.isLoading ? <p className="text-sm text-muted-foreground">Loading requests...</p> : rows.data?.length === 0 ? <p className="py-8 text-sm text-muted-foreground">No privacy requests.</p> : <ul className="divide-y divide-border">{rows.data?.map(request => <li key={request.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="break-all text-sm">{request.email}</strong><Badge variant={request.status === 'COMPLETED' ? 'success' : 'neutral'}>{request.status.replace(/_/g,' ').toLowerCase()}</Badge></div><p className="mt-1 text-sm">{request.kind.toLowerCase()} - {localTime(request.created_at)}</p><p className="mt-2 max-w-2xl break-words text-sm text-muted-foreground">{request.resolution || request.details}</p><p className="mt-1 text-xs text-muted-foreground">{request.identity_verified_at ? 'Identity verified' : 'Identity verification required'}{!request.user_id ? ' - guest record review' : ''}</p></div>
      <div className="flex gap-2">{request.user_id && request.identity_verified_at && <Button size="icon" variant="outline" title="Export account-linked data" aria-label="Export account-linked data" onClick={() => exported.mutate(request)} disabled={exported.isPending}><Download className="h-4 w-4" /></Button>}{!['COMPLETED','REJECTED'].includes(request.status) && <Button variant="outline" onClick={() => { setSelected(request); setStatus('IN_PROGRESS'); setResolution(''); setVerified(false); setErase(false); change.reset(); }}>Review</Button>}</div>
    </li>)}</ul>}
    <div className="flex justify-end gap-2"><Button variant="outline" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</Button><Button variant="outline" disabled={(rows.data?.length ?? 0) < 50} onClick={() => setPage(value => value + 1)}>Next</Button></div>
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent><DialogHeader><DialogTitle>Review privacy request</DialogTitle></DialogHeader>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); change.mutate(); }}>
        <p className="break-all text-sm">{selected?.email} - {selected?.kind.toLowerCase()}</p>
        <Field label="Status"><select className={input} value={status} onChange={event => setStatus(event.target.value as PrivacyRequest['status'])} disabled={erase}>{PRIVACY_REQUEST_STATUS.map(value => <option key={value}>{value}</option>)}</select></Field>
        {!selected?.identity_verified_at && <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={verified} onChange={event => setVerified(event.target.checked)} className="mt-1" />Identity has been independently verified; evidence and method are recorded below.</label>}
        <Field label={erase ? 'Why financial/delivery records must be retained' : 'Action, verification evidence and decision'}><textarea className={`${input} min-h-28`} value={resolution} onChange={event => setResolution(event.target.value)} minLength={8} maxLength={2000} required /></Field>
        {selected?.kind === 'ERASURE' && selected.user_id && selected.identity_verified_at && <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={erase} onChange={event => setErase(event.target.checked)} className="mt-1" />Erase account credentials, profile, sessions and cart. This action cannot be undone. Order, payment and legally required evidence remain.</label>}
        {change.error && <p role="alert" className="text-sm text-destructive">{errorMessage(change.error)}</p>}
        <Button type="submit" variant={erase ? 'destructive' : 'default'} disabled={change.isPending}>{erase ? <Trash2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}{change.isPending ? 'Saving...' : erase ? 'Erase account data' : 'Save decision'}</Button>
      </form>
    </DialogContent></Dialog>
    <Dialog open={newRequest} onOpenChange={setNewRequest}><DialogContent><DialogHeader><DialogTitle>Record a guest privacy request</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={event => { event.preventDefault(); create.mutate(new FormData(event.currentTarget)); }}>
      <Field label="Requester email"><Input name="email" type="email" required /></Field><Field label="Request"><select name="kind" className={input}>{PRIVACY_REQUEST_KIND.map(kind => <option key={kind}>{kind}</option>)}</select></Field><Field label="Details"><textarea name="details" className={`${input} min-h-24`} required minLength={5} maxLength={2000} /></Field>
      {create.error && <p role="alert" className="text-sm text-destructive">{errorMessage(create.error)}</p>}<Button type="submit" disabled={create.isPending}><Plus className="h-4 w-4" />Record request</Button>
    </form></DialogContent></Dialog>
  </section>;
}

function Incidents() {
  const qc = useQueryClient();
  const rows = useQuery({ queryKey: ['compliance','incidents'], queryFn: () => apiClient.get<ComplianceIncident[]>('/api/compliance/admin/incidents'), retry: false });
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ComplianceIncident | null>(null);
  const save = useMutation({ mutationFn: async (form: FormData) => {
    if (selected) return apiClient.patch(`/api/compliance/admin/incidents/${selected.id}`, {
      status: form.get('status'), notification_decision: form.get('decision'), decision_reason: form.get('reason'),
      regulator_notified_at: form.get('regulator') ? new Date(String(form.get('regulator'))).toISOString() : null,
      customers_notified_at: form.get('customers') ? new Date(String(form.get('customers'))).toISOString() : null,
    });
    return apiClient.post('/api/compliance/admin/incidents', { title: form.get('title'), severity: form.get('severity'), aware_at: new Date(String(form.get('aware'))).toISOString(), summary: form.get('summary') });
  }, onSuccess: () => { setOpen(false); setSelected(null); void qc.invalidateQueries({ queryKey: ['compliance','incidents'] }); } });
  const datetime = (value: string | null) => value ? new Date(Date.parse(value) - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,16) : '';
  return <section className="space-y-4"><div className="flex items-center justify-between gap-4"><h2 className="text-lg font-semibold">Incident register</h2><Button onClick={() => { setSelected(null); save.reset(); setOpen(true); }}><Plus className="h-4 w-4" />Record incident</Button></div>
    {rows.error && <p role="alert" className="text-sm text-destructive">{errorMessage(rows.error)}</p>}
    {rows.isLoading ? <p>Loading incidents...</p> : rows.data?.length === 0 ? <p className="py-8 text-sm text-muted-foreground">No incidents recorded.</p> : <ul className="divide-y divide-border">{rows.data?.map(row => <li key={row.id} className="flex flex-wrap justify-between gap-4 py-4"><div className="min-w-0"><h3 className="break-words text-sm font-semibold">{row.title}</h3><p className="mt-1 text-sm">{row.severity.toLowerCase()} - {row.status.toLowerCase()}</p><p className="mt-2 text-xs text-muted-foreground">Aware: {localTime(row.aware_at)} - notification review: {localTime(row.review_due_at)}</p><p className="mt-1 text-sm">{row.notification_decision.replace(/_/g,' ').toLowerCase()}</p></div><Button variant="outline" onClick={() => { setSelected(row); save.reset(); setOpen(true); }}>Review</Button></li>)}</ul>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90svh] overflow-y-auto"><DialogHeader><DialogTitle>{selected ? 'Review incident' : 'Record incident'}</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={event => { event.preventDefault(); save.mutate(new FormData(event.currentTarget)); }}>
      {selected ? <><Field label="Status"><select className={input} name="status" defaultValue={selected.status}>{['OPEN','CONTAINED','CLOSED'].map(v => <option key={v}>{v}</option>)}</select></Field><Field label="Notification decision"><select name="decision" className={input} defaultValue={selected.notification_decision}>{['PENDING','REQUIRED','NOT_REQUIRED'].map(v => <option key={v}>{v}</option>)}</select></Field><Field label="Assessment, containment and evidence"><textarea name="reason" className={`${input} min-h-24`} defaultValue={selected.decision_reason ?? ''} required minLength={8} maxLength={2000} /></Field><Field label="Regulator notified at"><Input name="regulator" type="datetime-local" defaultValue={datetime(selected.regulator_notified_at)} /></Field><Field label="Customers notified at"><Input name="customers" type="datetime-local" defaultValue={datetime(selected.customers_notified_at)} /></Field></>
      : <><Field label="Incident title"><Input name="title" required minLength={5} maxLength={200} /></Field><Field label="Severity"><select name="severity" className={input}>{['LOW','MEDIUM','HIGH','CRITICAL'].map(v => <option key={v}>{v}</option>)}</select></Field><Field label="Time first aware"><Input name="aware" type="datetime-local" required /></Field><Field label="Summary and containment"><textarea name="summary" className={`${input} min-h-24`} required minLength={8} maxLength={2000} /></Field></>}
      {save.error && <p role="alert" className="text-sm text-destructive">{errorMessage(save.error)}</p>}<Button type="submit" disabled={save.isPending}><Save className="h-4 w-4" />{save.isPending ? 'Saving...' : 'Save incident'}</Button>
    </form></DialogContent></Dialog>
  </section>;
}

function Evidence() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [product, setProduct] = useState<ProductResponse | null>(null);
  const [saved, setSaved] = useState(false);
  const products = useQuery({ queryKey: ['compliance','products',query], queryFn: () => apiClient.get<ProductResponse[]>('/api/products', { search: query, limit: 50 }), retry: false });
  const evidence = useQuery({ queryKey: ['compliance','evidence',product?.id], queryFn: () => apiClient.get<ProductEvidence | null>(`/api/compliance/admin/evidence/${product!.id}`), enabled: Boolean(product), retry: false });
  const save = useMutation({ mutationFn: async ({ form, productId }: { form: FormData; productId: string }) => {
    return apiClient.put<ProductEvidence>(`/api/compliance/admin/evidence/${productId}`, Object.fromEntries(form));
  }, onSuccess: (response, variables) => { qc.setQueryData(['compliance','evidence',variables.productId], response); if (product?.id === variables.productId) setSaved(true); } });
  return <section className="max-w-3xl space-y-6"><h2 className="text-lg font-semibold">Supplier and image evidence</h2>
    <form className="flex gap-2" onSubmit={event => { event.preventDefault(); setProduct(null); setQuery(search); setSaved(false); save.reset(); }}><Input aria-label="Search products" value={search} onChange={event => setSearch(event.target.value)} placeholder="Product name or SKU" /><Button variant="outline">Search</Button></form>
    <Field label="Product"><select className={input} value={product?.id ?? ''} onChange={event => { setProduct(products.data?.find(p => p.id === event.target.value) ?? null); setSaved(false); save.reset(); }}><option value="">Select product</option>{products.data?.map(p => <option key={p.id} value={p.id}>{p.name} - {p.sku}</option>)}</select></Field>
    {(products.error || evidence.error) && <p role="alert" className="text-sm text-destructive">{errorMessage(products.error || evidence.error)}</p>}
    {product && !evidence.isLoading && !evidence.error && <form key={`${product.id}-${evidence.data?.updated_at}`} className="space-y-4" onSubmit={event => { event.preventDefault(); save.mutate({ form: new FormData(event.currentTarget), productId: product.id }); }}>
      {[['supplier','Supplier'],['invoice_reference','Supplier invoice reference'],['authenticity_evidence','Authenticity assessment and evidence location'],['image_rights','Photography owner or permission evidence'],['notes','Internal notes']].map(([key,label]) => <Field key={key} label={label}><textarea name={key} className={`${input} min-h-20`} required={key !== 'notes'} minLength={key === 'notes' ? undefined : ['supplier','invoice_reference'].includes(key!) ? 1 : 8} maxLength={2000} defaultValue={String(evidence.data?.[key as keyof ProductEvidence] ?? '')} /></Field>)}
      {save.error && <p role="alert" className="text-sm text-destructive">{errorMessage(save.error)}</p>}{saved && <p role="status" className="text-sm">Evidence saved.</p>}<Button type="submit" disabled={save.isPending}><Save className="h-4 w-4" />Save evidence</Button>
    </form>}
  </section>;
}

function MonthlyRecords() {
  const [initialMonth] = useState(() => {
    const parts = new Intl.DateTimeFormat('en', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
    return `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}`;
  });
  const [result, setResult] = useState<AccountingExport | null>(null);
  const exported = useMutation({ mutationFn: async ({ month, dataset }: { month: string; dataset: typeof ACCOUNTING_DATASET[number] }) => {
    const record = await apiClient.get<AccountingExport>('/api/compliance/admin/accounting', { month, dataset });
    if (!record) throw new Error('No export returned');
    download(`bagstreet-${record.month}-${record.dataset}.csv`, record.csv, 'text/csv;charset=utf-8');
    setResult(record);
  } });
  return <section className="max-w-2xl space-y-6"><h2 className="text-lg font-semibold">Monthly accounting records</h2>
    <form className="space-y-6" onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      exported.mutate({ month: String(form.get('month')), dataset: form.get('dataset') as typeof ACCOUNTING_DATASET[number] });
    }}>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Month (Nairobi)"><Input name="month" type="month" defaultValue={initialMonth} min="2020-01" max="2100-12" required /></Field><Field label="Records"><select name="dataset" defaultValue="orders" className={input}>{ACCOUNTING_DATASET.map(value => <option key={value}>{value}</option>)}</select></Field></div>
      <Button type="submit" disabled={exported.isPending}><Download className="h-4 w-4" />{exported.isPending ? 'Preparing...' : 'Download CSV'}</Button>
    </form>
    {exported.error && <p role="alert" className="text-sm text-destructive">{errorMessage(exported.error)}</p>}
    {result && <div role="status" className="space-y-2 border-t border-border pt-4 text-sm"><p>{result.row_count} records exported - {result.month} - {result.dataset}</p><p className="break-all font-mono text-xs">SHA-256: {result.sha256}</p><Button variant="outline" onClick={() => { const { csv: _csv, ...manifest } = result; download(`bagstreet-${result.month}-${result.dataset}-manifest.json`, JSON.stringify(manifest,null,2), 'application/json'); }}><Download className="h-4 w-4" />Download integrity manifest</Button></div>}
  </section>;
}
