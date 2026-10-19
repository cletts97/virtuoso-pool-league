import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowUpRight, Inbox, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLeague } from '../app/LeagueContext';
import { participantName } from '../domain/rules';

export function Avatar({ id, large = false }: { id: string; large?: boolean }) {
  const { state } = useLeague();
  const participant = state.participants.find((p) => p.id === id);
  const player = state.players.find((p) => p.id === id || p.id === participant?.playerIds[0]);
  const name = participant?.name ?? player?.name ?? '?';
  return (
    <span
      aria-hidden="true"
      className={`avatar color-${player?.color ?? 0} ${large ? 'large' : ''}`}
    >
      {name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')}
    </span>
  );
}
export function ParticipantLink({ id, subtitle }: { id: string; subtitle?: string }) {
  const { state } = useLeague();
  return (
    <Link className="participant" to={`/players/${id}`}>
      <Avatar id={id} />
      <span>
        <strong>{participantName(state, id)}</strong>
        {subtitle && <small>{subtitle}</small>}
      </span>
    </Link>
  );
}
export function Badge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    scheduled: 'Upcoming',
    pending: 'Awaiting approval',
    confirmed: 'Confirmed',
    disputed: 'Disputed',
    postponed: 'Postponed',
    overdue: 'Overdue',
    cancelled: 'Closed · no result',
    regular: 'In progress',
    complete: 'Completed',
    playoffs: 'Playoffs',
    draft: 'Draft',
  };
  return (
    <span className={`badge badge-${status}`}>
      <span />
      {labels[status] ?? status}
    </span>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Section({
  title,
  subtitle,
  link,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  link?: { to: string; label: string };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {link && (
          <Link className="text-link" to={link.to}>
            {link.label}
            <ArrowUpRight size={16} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Inbox size={28} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose(): void;
}) {
  const { feedback, clearFeedback } = useLeague();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    clearFeedback();
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, [clearFeedback]);
  return (
    <dialog ref={ref} className="modal" aria-labelledby="modal-title" onCancel={onClose}>
      <div className="modal-heading">
        <h2 id="modal-title">{title}</h2>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {feedback?.error && (
        <p className="form-error" role="alert">
          {feedback.text}
        </p>
      )}
      {children}
    </dialog>
  );
}
export function Confirm({
  title,
  children,
  onClose,
  onConfirm,
  label = 'Confirm',
}: {
  title: string;
  children: ReactNode;
  onClose(): void;
  onConfirm(): void;
  label?: string;
}) {
  const { busy } = useLeague();
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted mb-6">{children}</p>
      <div className="form-actions">
        <button className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button disabled={busy} className="button danger" onClick={onConfirm}>
          {label}
        </button>
      </div>
    </Modal>
  );
}
export function Stat({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: ReactNode;
  detail: string;
  icon?: ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">
        {label}
        {icon}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-detail">{detail}</div>
    </div>
  );
}
export function FormDots({ form }: { form: boolean[] }) {
  return (
    <span
      className="form-dots"
      aria-label={`Recent form: ${
        form
          .slice(-5)
          .map((w) => (w ? 'win' : 'loss'))
          .join(', ') || 'no matches'
      }`}
    >
      {form.slice(-5).map((won, i) => (
        <span key={i} className={won ? 'won' : 'lost'}>
          {won ? 'W' : 'L'}
        </span>
      ))}
    </span>
  );
}
