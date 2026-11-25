import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Icon from './Icon';
import { Spinner } from './ui';
import { cx, timeAgo } from '../utils/format';

const KIND_ICONS = {
  expiry: 'calendar',
  fraud_alert: 'flag',
  risk: 'gauge',
  report: 'qr',
  user_report: 'alert',
  supplier: 'building',
};

function normalizeLink(link) {
  if (!link) return '/app';
  return link
    .replace('/app/fraud-intelligence', '/app/fraud')
    .replace('/app/public-safety', '/app/safety')
    .replace('/app/history', '/app/documents');
}

export default function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const container = useRef(null);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const { data } = await api.get('/notifications', { per_page: 15 });
      setItems(data.notifications || []);
      setUnread(data.unread_count || 0);
    } catch {
      /* notification failures should not break the shell */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if (container.current && !container.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const openNotification = async (notification) => {
    if (!notification.is_read) {
      try {
        await api.post(`/notifications/${notification.id}/read`);
        setItems((current) => current.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item)));
        setUnread((value) => Math.max(0, value - 1));
      } catch {
        /* non-blocking */
      }
    }
    setOpen(false);
    navigate(normalizeLink(notification.link));
  };

  const markAll = async () => {
    try {
      await api.post('/notifications/read-all');
      setItems((current) => current.map((item) => ({ ...item, is_read: true })));
      setUnread(0);
    } catch {
      /* non-blocking */
    }
  };

  return (
    <div className="relative" ref={container}>
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) load();
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:border-accent-400/30 hover:text-accent-200"
        aria-label="Notifications"
      >
        <Icon name="bell" size={17} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 font-mono text-[9px] font-bold text-navy-950">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[340px] max-w-[calc(100vw-2rem)] animate-fadeUp overflow-hidden rounded-2xl border border-white/10 bg-charcoal-900/95 shadow-card backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-slate-100">Notifications</p>
              <p className="text-[10px] text-slate-500">In-app alerts only · no emails are sent</p>
            </div>
            {unread > 0 && (
              <button type="button" onClick={markAll} className="text-[10px] font-medium text-accent-300 hover:text-accent-200">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            {loading && (
              <div className="flex justify-center py-8">
                <Spinner size={18} />
              </div>
            )}
            {!loading && !items.length && (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-slate-500">
                <Icon name="bell" size={20} />
                <p className="text-[11px]">No notifications yet.</p>
              </div>
            )}
            {items.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => openNotification(notification)}
                className={cx(
                  'flex w-full items-start gap-3 border-b border-white/5 px-4 py-3 text-left transition hover:bg-white/[0.04]',
                  !notification.is_read && 'bg-accent-400/[0.04]',
                )}
              >
                <span
                  className={cx(
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border',
                    notification.is_read
                      ? 'border-white/10 bg-white/5 text-slate-500'
                      : 'border-accent-400/25 bg-accent-400/10 text-accent-300',
                  )}
                >
                  <Icon name={KIND_ICONS[notification.kind] || 'info'} size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11.5px] font-medium leading-snug text-slate-200">{notification.title}</span>
                  <span className="mt-0.5 block line-clamp-2 text-[10.5px] leading-relaxed text-slate-400">{notification.message}</span>
                  <span className="mt-1 block text-[9.5px] uppercase tracking-wider text-slate-600">{timeAgo(notification.created_at)}</span>
                </span>
                {!notification.is_read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
