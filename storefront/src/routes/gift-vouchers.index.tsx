import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { GIFT_VOUCHER_DELIVER_TO, GIFT_VOUCHER_ONLINE_AMOUNTS, POLICY_VERSION, type GiftVoucherDeliverTo } from 'shared';
import { useAuth } from '@/context/AuthContext';
import { useBuyGiftVoucher } from '@/hooks/useGiftVouchers';
import { useSeo } from '@/hooks/useSeo';
import { formatPrice } from '@/lib/format';
import { savePendingPayment } from '@/lib/pending-payment';

export const Route = createFileRoute('/gift-vouchers/')({ component: GiftVouchersPage });

const inputClass =
  'w-full border-0 border-b border-stone bg-transparent px-0 py-2 text-[15px] font-light text-foreground placeholder:text-foreground-faint focus:border-foreground focus:outline-none focus:ring-0 transition-colors duration-200';

function GiftVouchersPage() {
  useSeo({
    title: 'Gift Vouchers',
    description: 'Give a Bagstreet gift voucher: emailed instantly, valid for one year, spent online or in our Nairobi shop.',
    canonicalPath: '/gift-vouchers',
  });
  const { user } = useAuth();
  const navigate = useNavigate();
  const buy = useBuyGiftVoucher();

  const [amount, setAmount] = useState<number>(5000);
  const [deliverTo, setDeliverTo] = useState<GiftVoucherDeliverTo>(GIFT_VOUCHER_DELIVER_TO.RECIPIENT);
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [message, setMessage] = useState('');
  const [buyerName, setBuyerName] = useState(user?.full_name ?? '');
  const [buyerEmail, setBuyerEmail] = useState(user?.email ?? '');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState('');

  const toRecipient = deliverTo === GIFT_VOUCHER_DELIVER_TO.RECIPIENT;
  const canPay = termsAccepted && buyerName.trim().length >= 2 && buyerEmail.trim() && buyerPhone.trim().length >= 9
    && (!toRecipient || recipientEmail.trim()) && !buy.isPending;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      const res = await buy.mutateAsync({
        amount,
        deliver_to: deliverTo,
        recipient_name: recipientName.trim() || undefined,
        recipient_email: toRecipient ? recipientEmail.trim() : undefined,
        message: message.trim() || undefined,
        buyer_name: buyerName.trim(),
        buyer_email: (user?.email ?? buyerEmail).trim(),
        buyer_phone: buyerPhone.trim(),
        policy_acceptance: { accepted: true, version: POLICY_VERSION },
      });
      const order = res.data;
      if (!order) throw new Error('Your voucher could not be ordered. Please try again.');
      savePendingPayment({ ref: order.public_id, token: order.access_token, orderNumber: order.order_number, total: order.amount_due });
      if (order.payment_redirect_url) {
        window.location.assign(order.payment_redirect_url);
        return;
      }
      navigate({ to: '/checkout', search: { order_id: order.public_id, token: order.access_token } });
    } catch (err: any) {
      setError(err?.message || 'We could not start your purchase. Please try again.');
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 pt-[104px] pb-24 sm:px-8 lg:px-20 lg:pt-32">
      <header className="border-b border-border pb-8">
        <p className="text-label-caps text-brass-text">Bagstreet</p>
        <h1 className="mt-4 text-display">Gift <em>vouchers</em></h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-foreground-muted">
          Emailed the moment it's paid for, valid for one year, and spent online or in our Nairobi shop, over one order or several.
        </p>
      </header>

      <form onSubmit={submit} className="mt-12 grid gap-16 lg:grid-cols-[1fr_400px] lg:gap-20">
        <div className="space-y-14">
          <Section number={1} title="Amount">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup" aria-label="Voucher amount">
              {GIFT_VOUCHER_ONLINE_AMOUNTS.map((value) => (
                <button key={value} type="button" role="radio" aria-checked={amount === value} onClick={() => setAmount(value)}
                  className={`ui-press h-[64px] border text-[17px] tabular-nums transition-colors duration-150 ${amount === value
                    ? 'border-espresso bg-espresso text-background' : 'border-stone hover:border-espresso'}`}
                  style={{ fontFamily: 'var(--font-display)' }}>
                  {formatPrice(value)}
                </button>
              ))}
            </div>
          </Section>

          <Section number={2} title="Who it's for">
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Where to send the voucher">
              <Choice selected={toRecipient} onSelect={() => setDeliverTo(GIFT_VOUCHER_DELIVER_TO.RECIPIENT)}
                title="Email it to them" detail="We send the code straight to the person you're giving it to." />
              <Choice selected={!toRecipient} onSelect={() => setDeliverTo(GIFT_VOUCHER_DELIVER_TO.BUYER)}
                title="Email it to me" detail="Print it or pass the code on yourself." />
            </div>
            <div className="mt-8 grid gap-7 sm:grid-cols-2">
              <Field label={toRecipient ? 'Their name' : 'Their name (for the card)'} hint="Optional">
                <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} maxLength={120} className={inputClass} />
              </Field>
              {toRecipient && (
                <Field label="Their email">
                  <input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} maxLength={200} required className={inputClass} />
                </Field>
              )}
              <Field label="Message" hint="Optional" className="sm:col-span-2">
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} rows={2}
                  placeholder="Happy birthday!" className={`${inputClass} resize-none`} />
              </Field>
            </div>
          </Section>

          <Section number={3} title="Your details">
            <div className="grid gap-7 sm:grid-cols-2">
              <Field label="Your name">
                <input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} maxLength={120} required className={inputClass} />
              </Field>
              <Field label="Your email" hint="For your receipt">
                <input type="email" value={user?.email ?? buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} disabled={Boolean(user)}
                  maxLength={200} required className={`${inputClass} disabled:opacity-60`} />
              </Field>
              <Field label="Phone" hint="For M-Pesa">
                <input type="tel" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="0712 345 678" maxLength={20} required className={inputClass} />
              </Field>
            </div>
          </Section>
        </div>

        <aside aria-label="Your gift voucher" className="lg:sticky lg:top-32 lg:self-start">
          <div className="bg-surface p-8">
            <div className="border border-espresso/70 px-6 py-8 text-center">
              <p className="text-[13px] tracking-[0.35em]">BAGSTREET</p>
              <p className="mt-5 text-headline-md">Gift voucher</p>
              <p className="mt-2 text-[40px] tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{formatPrice(amount)}</p>
              {recipientName.trim() && <p className="mt-2 text-[14px] text-foreground-muted">For {recipientName.trim()}</p>}
              {message.trim() && <p className="mt-3 text-[14px] italic text-foreground-muted">“{message.trim()}”</p>}
            </div>
            <p className="mt-5 text-[13px] leading-relaxed text-foreground-muted">
              Valid for one year from today. It can be spent over several orders but not exchanged for cash.
              {toRecipient ? ' Only they receive the code; you get a receipt.' : ' The code comes to your email.'}
            </p>

            <label className="mt-6 flex items-start gap-3 text-sm leading-6">
              <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} required className="mt-1 h-4 w-4 shrink-0 accent-espresso" />
              <span>I accept the <Link to="/terms" target="_blank" rel="noopener noreferrer" className="underline">terms of sale</Link>, including the gift voucher terms.</span>
            </label>

            <button type="submit" disabled={!canPay}
              className="ui-press mt-6 h-[52px] w-full bg-espresso text-label-caps text-background hover:bg-espresso-hover disabled:cursor-not-allowed disabled:bg-surface-oat disabled:text-foreground-faint">
              {buy.isPending ? 'Starting payment…' : `Pay ${formatPrice(amount)}`}
            </button>
            {error && <p className="mt-3 text-[13px] text-destructive" role="alert">{error}</p>}
            <p className="mt-5 flex items-center justify-center gap-2 text-[12px] text-foreground-muted">
              <Lock strokeWidth={1} className="h-3.5 w-3.5 text-brass" aria-hidden="true" />
              Secure payment with M-Pesa
            </p>
          </div>
          <p className="mt-5 text-center text-[13px] text-foreground-muted">
            Already have one? <Link to="/gift-vouchers/balance" className="underline underline-offset-4 hover:text-brass-text">Check its balance</Link>
          </p>
        </aside>
      </form>
    </div>
  );
}

function Section({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="flex items-baseline gap-4 border-b border-border pb-4">
        <span className="text-label-caps text-brass-text">0{number}</span>
        <span className="text-headline-md">{title}</span>
      </h2>
      <div className="mt-7">{children}</div>
    </section>
  );
}

function Field({ label, hint, className = '', children }: { label: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-label-caps">{label}</span>
        {hint && <span className="text-[11px] text-foreground-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Choice({ selected, onSelect, title, detail }: { selected: boolean; onSelect: () => void; title: string; detail: string }) {
  return (
    <button type="button" role="radio" aria-checked={selected} aria-label={`${title}: ${detail}`} onClick={onSelect}
      className={`ui-press border p-5 text-left transition-colors duration-150 ${selected ? 'border-espresso bg-surface' : 'border-stone hover:border-espresso'}`}>
      <span className="flex items-center gap-3">
        <span aria-hidden="true" className={`flex h-4 w-4 items-center justify-center rounded-full border ${selected ? 'border-espresso' : 'border-stone'}`}>
          {selected && <span className="h-2 w-2 rounded-full bg-espresso" />}
        </span>
        <span className="text-[15px]">{title}</span>
      </span>
      <span className="mt-2 block pl-7 text-[13px] text-foreground-muted">{detail}</span>
    </button>
  );
}
