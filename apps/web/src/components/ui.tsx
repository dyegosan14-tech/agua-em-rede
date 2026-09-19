import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 disabled:bg-brand-300',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 disabled:text-slate-400',
  danger: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-red-300',
  ghost: 'text-brand-800 hover:bg-brand-50 disabled:text-slate-400',
};

export function Button({
  variant = 'primary',
  loading = false,
  loadingLabel = 'Aguarde…',
  className = '',
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; loadingLabel?: string }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {loading ? loadingLabel : children}
    </button>
  );
}

interface FieldChrome {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}

const inputClass =
  'block min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-500 aria-[invalid=true]:border-red-700 aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-red-700 disabled:bg-slate-100 sm:text-sm';

function FieldShell({ label, error, hint, id, children }: FieldChrome & { id: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-800">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-600">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-sm font-medium text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  error,
  hint,
  ref,
  ...props
}: FieldChrome & InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <input id={id} ref={ref} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={inputClass} {...props} />
    </FieldShell>
  );
}

export function SelectField({
  label,
  error,
  hint,
  ref,
  children,
  ...props
}: FieldChrome & SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <select id={id} ref={ref} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={inputClass} {...props}>
        {children}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({ label, hint, ref, ...props }: FieldChrome & InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input id={id} ref={ref} type="checkbox" className="mt-1 size-5 rounded border-slate-400 accent-brand-700" {...props} />
      <label htmlFor={id} className="text-sm text-slate-800">
        <span className="font-medium">{label}</span>
        {hint ? <span className="block text-xs text-slate-600">{hint}</span> : null}
      </label>
    </div>
  );
}

/** Diálogo modal nativo (<dialog>): foco preso, Esc fecha e leitores de tela anunciam o título. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-slate-200 bg-white p-0 shadow-xl"
    >
      {open ? (
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
            >
              <X aria-hidden className="size-5" />
              <span className="sr-only">Fechar</span>
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

const badgeTones = {
  neutral: 'bg-slate-100 text-slate-800 ring-slate-300',
  info: 'bg-brand-50 text-brand-900 ring-brand-200',
  ok: 'bg-aqua-50 text-aqua-900 ring-aqua-300',
  warn: 'bg-amber-50 text-amber-900 ring-amber-300',
  critical: 'bg-red-50 text-red-900 ring-red-300',
} as const;

/** Sempre com texto: o significado nunca depende apenas da cor. */
export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${badgeTones[tone]}`}>{children}</span>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-slate-700">{description}</p> : null}
      </div>
      {actions}
    </header>
  );
}
