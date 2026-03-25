import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  addContactToList,
  createEmailCampaign,
  createEmailContact,
  createEmailList,
  getEmailAnalytics,
  getEmailCampaigns,
  getEmailContacts,
  getEmailListMemberships,
  getEmailLists,
  processDueCampaigns,
  sendCampaignNow,
  type EmailCampaign,
  type EmailContact,
  type EmailList,
  type EmailListMembership,
} from '../../services/emailMarketingService';

type Tab = 'contacts' | 'lists' | 'campaigns' | 'analytics';

export function EmailMarketing() {
  const [tab, setTab] = useState<Tab>('contacts');
  const [contacts, setContacts] = useState<EmailContact[]>([]);
  const [lists, setLists] = useState<EmailList[]>([]);
  const [listMemberships, setListMemberships] = useState<EmailListMembership[]>([]);
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [contactEmail, setContactEmail] = useState('');
  const [contactName, setContactName] = useState('');
  const [listName, setListName] = useState('');
  const [listDescription, setListDescription] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  const [selectedContactId, setSelectedContactId] = useState('');

  const [campaignName, setCampaignName] = useState('');
  const [campaignListId, setCampaignListId] = useState('');
  const [campaignSubject, setCampaignSubject] = useState('');
  const [campaignBody, setCampaignBody] = useState('<p>Hello from ContentFlow.</p>');
  const [campaignSchedule, setCampaignSchedule] = useState('');
  const [attachLoading, setAttachLoading] = useState(false);
  const [attachMessage, setAttachMessage] = useState<string | null>(null);
  const [sendingCampaignId, setSendingCampaignId] = useState<string | null>(null);
  const [campaignMessage, setCampaignMessage] = useState<string | null>(null);
  const [autoProcessingDue, setAutoProcessingDue] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [c, l, m, cp, a] = await Promise.all([
        getEmailContacts(),
        getEmailLists(),
        getEmailListMemberships(),
        getEmailCampaigns(),
        getEmailAnalytics(),
      ]);
      setContacts(c);
      setLists(l);
      setListMemberships(m);
      setCampaigns(cp);
      setAnalytics(a);
    } catch (e) {
      console.error('Email module load error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      // While the app is open, auto-process due scheduled campaigns every minute.
      try {
        setAutoProcessingDue(true);
        await processDueCampaigns();
        await loadAll();
      } catch {
        // Silent on purpose to avoid noisy UX.
      } finally {
        setAutoProcessingDue(false);
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const membersByListId = useMemo(() => {
    const m = new Map<string, EmailListMembership[]>();
    for (const row of listMemberships) {
      const arr = m.get(row.list_id) ?? [];
      arr.push(row);
      m.set(row.list_id, arr);
    }
    return m;
  }, [listMemberships]);

  const availableContactsForList = useMemo(() => {
    if (!selectedListId) return contacts;
    const inList = new Set(
      listMemberships.filter((x) => x.list_id === selectedListId).map((x) => x.contact_id),
    );
    return contacts.filter((c) => !inList.has(c.id));
  }, [contacts, selectedListId, listMemberships]);

  const onCreateContact = async (e: FormEvent) => {
    e.preventDefault();
    if (!contactEmail.trim()) return;
    await createEmailContact(contactEmail, contactName);
    setContactEmail('');
    setContactName('');
    await loadAll();
  };

  const onCreateList = async (e: FormEvent) => {
    e.preventDefault();
    if (!listName.trim()) return;
    await createEmailList(listName, listDescription);
    setListName('');
    setListDescription('');
    await loadAll();
  };

  const onAddToList = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedListId || !selectedContactId) return;
    setAttachLoading(true);
    setAttachMessage(null);
    try {
      await addContactToList(selectedListId, selectedContactId);
      setAttachMessage('Attached successfully.');
      setSelectedContactId('');
      await loadAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Attach failed.';
      if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')) {
        setAttachMessage('This contact is already attached to this list.');
      } else {
        setAttachMessage(msg);
      }
    } finally {
      setAttachLoading(false);
    }
  };

  const onCreateCampaign = async (e: FormEvent) => {
    e.preventDefault();
    if (!campaignName || !campaignListId || !campaignSubject || !campaignBody) return;
    await createEmailCampaign({
      name: campaignName,
      listId: campaignListId,
      subject: campaignSubject,
      contentHtml: campaignBody,
      scheduledAt: campaignSchedule ? new Date(campaignSchedule).toISOString() : undefined,
    });
    setCampaignName('');
    setCampaignSubject('');
    setCampaignBody('<p>Hello from ContentFlow.</p>');
    setCampaignSchedule('');
    setCampaignMessage(campaignSchedule ? 'Campaign scheduled successfully.' : 'Campaign saved.');
    await loadAll();
  };

  const sendNow = async (id: string) => {
    setSendingCampaignId(id);
    setCampaignMessage(null);
    try {
      const result = await sendCampaignNow(id);
      if (result.provider_mode === 'mock') {
        const sent = result.sent_count ?? 0;
        const failed = result.failed_count ?? 0;
        const base = failed > 0
          ? `Campaign failed. Sent: ${sent}, Failed: ${failed}.`
          : `Campaign not sent. Sent: ${sent}, Failed: ${failed}.`;
        setCampaignMessage(result.hint ? `${base} ${result.hint}` : base);
      } else {
        const sent = result.sent_count ?? 0;
        const failed = result.failed_count ?? 0;
        if (failed === 0 && sent > 0) {
          setCampaignMessage('Campaign sent successfully.');
        } else {
          const base = `Campaign sent. Sent: ${sent}, Failed: ${failed}.`;
          setCampaignMessage(result.hint ? `${base} ${result.hint}` : base);
        }
      }
      await loadAll();
    } catch (err) {
      setCampaignMessage(err instanceof Error ? err.message : 'Send failed.');
    } finally {
      setSendingCampaignId(null);
    }
  };

  const runDue = async () => {
    setCampaignMessage(null);
    try {
      await processDueCampaigns();
      setCampaignMessage('Processed due campaigns.');
      await loadAll();
    } catch (err) {
      setCampaignMessage(err instanceof Error ? err.message : 'Failed to process due campaigns.');
    }
  };

  const formatScheduled = (iso: string | null) => {
    if (!iso) return 'Not scheduled';
    const date = new Date(iso);
    return date.toLocaleString();
  };

  const timeUntil = (iso: string | null) => {
    if (!iso) return null;
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return 'Due now';
    const mins = Math.floor(ms / 60000);
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    if (hours > 0) return `In ${hours}h ${remainingMins}m`;
    return `In ${remainingMins}m`;
  };

  if (loading) {
    return <div className="text-slate-600">Loading email marketing module...</div>;
  }

  const trackingProbablyNotEnabled =
    analytics?.opens === 0 && analytics?.clicks === 0 && analytics?.replies === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Email Marketing</h1>
        <p className="text-slate-600 mt-2">Manage contacts, lists, campaigns, scheduling, and tracking.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['contacts', 'lists', 'campaigns', 'analytics'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'contacts' && (
        <div className="grid md:grid-cols-2 gap-6">
          <form onSubmit={onCreateContact} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-slate-900">Add Contact</h2>
            <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Email" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Name (optional)" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg">Save Contact</button>
          </form>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="font-semibold text-slate-900 mb-3">Contacts ({contacts.length})</h2>
            <div className="space-y-2 max-h-72 overflow-auto">
              {contacts.map((c) => (
                <div key={c.id} className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2">
                  <div>
                    <p className="font-medium text-slate-800">{c.full_name || 'Unnamed'}</p>
                    <p className="text-sm text-slate-500">{c.email}</p>
                  </div>
                  <span className="text-xs text-slate-500">{c.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'lists' && (
        <div className="grid md:grid-cols-2 gap-6">
          <form onSubmit={onCreateList} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-slate-900">Create List</h2>
            <input value={listName} onChange={(e) => setListName(e.target.value)} placeholder="List name" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
            <input value={listDescription} onChange={(e) => setListDescription(e.target.value)} placeholder="Description (optional)" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg">Create List</button>
          </form>
          <form onSubmit={onAddToList} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-slate-900">Add Contact to List</h2>
            <select value={selectedListId} onChange={(e) => setSelectedListId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg">
              <option value="">Select list</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <select
              value={selectedContactId}
              onChange={(e) => setSelectedContactId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              disabled={!selectedListId || availableContactsForList.length === 0}
            >
              <option value="">
                {!selectedListId
                  ? 'Select a list first'
                  : availableContactsForList.length === 0
                    ? 'No available contacts for this list'
                    : 'Select contact (not already in this list)'}
              </option>
              {availableContactsForList.map((c) => (
                <option key={c.id} value={c.id}>{c.email}</option>
              ))}
            </select>
            {selectedListId && availableContactsForList.length === 0 && (
              <p className="text-sm text-slate-600">All contacts are already in this list.</p>
            )}
            <button
              disabled={attachLoading || !selectedListId || !selectedContactId}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
            >
              {attachLoading ? 'Attaching...' : 'Attach'}
            </button>
            {attachMessage && (
              <p className={`text-sm ${attachMessage.includes('successfully') ? 'text-green-600' : 'text-amber-600'}`}>
                {attachMessage}
              </p>
            )}
          </form>
          <div className="bg-white border border-slate-200 rounded-xl p-5 md:col-span-2">
            <h2 className="font-semibold text-slate-900 mb-3">Lists ({lists.length})</h2>
            <div className="grid md:grid-cols-2 gap-3">
              {lists.map((l) => {
                const members = membersByListId.get(l.id) ?? [];
                return (
                  <div key={l.id} className="border border-slate-100 rounded-lg px-3 py-2">
                    <p className="font-medium text-slate-800">{l.name}</p>
                    <p className="text-sm text-slate-500">{l.description || 'No description'}</p>
                    <div className="mt-2 pt-2 border-t border-slate-100">
                      <p className="text-xs font-medium text-slate-600 mb-1">
                        Attached ({members.length})
                      </p>
                      {members.length === 0 ? (
                        <p className="text-xs text-slate-400">No contacts yet.</p>
                      ) : (
                        <ul className="text-xs text-slate-700 space-y-0.5 max-h-28 overflow-auto">
                          {members.map((m) => (
                            <li key={`${m.list_id}-${m.contact_id}`}>{m.email}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'campaigns' && (
        <div className="space-y-6">
          <form onSubmit={onCreateCampaign} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-slate-900">Create Campaign</h2>
            <input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Campaign name" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
            <select value={campaignListId} onChange={(e) => setCampaignListId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg">
              <option value="">Select list</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <input value={campaignSubject} onChange={(e) => setCampaignSubject(e.target.value)} placeholder="Email subject" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
            <textarea value={campaignBody} onChange={(e) => setCampaignBody(e.target.value)} rows={7} className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm" />
            <input type="datetime-local" value={campaignSchedule} onChange={(e) => setCampaignSchedule(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
            <div className="flex gap-3">
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg">Save Campaign</button>
              <button type="button" onClick={runDue} className="px-4 py-2 bg-slate-700 text-white rounded-lg">
                {autoProcessingDue ? 'Auto checks running…' : 'Process Due Campaigns'}
              </button>
            </div>
          </form>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="font-semibold text-slate-900 mb-3">Campaigns ({campaigns.length})</h2>
            {campaignMessage && (
              <p className="mb-3 text-sm text-slate-700 bg-slate-100 rounded-lg px-3 py-2">{campaignMessage}</p>
            )}
            <div className="space-y-3">
              {campaigns.map((c) => (
                <div key={c.id} className="border border-slate-100 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{c.name}</p>
                    <p className="text-sm text-slate-600">{c.subject}</p>
                    <p className="text-xs text-slate-500">
                      Status: {c.status === 'sent' && (c.failed_recipients || 0) > 0 ? 'partially sent' : c.status}
                      {' | '}Recipients: {c.total_recipients}
                      {' | '}Failed: {c.failed_recipients || 0}
                    </p>
                    <p className="text-xs text-slate-500">
                      Scheduled: {formatScheduled(c.scheduled_at)}
                      {c.status === 'scheduled' && c.scheduled_at && ` (${timeUntil(c.scheduled_at)})`}
                    </p>
                    {c.status === 'scheduled' &&
                      c.scheduled_at &&
                      new Date(c.scheduled_at).getTime() > Date.now() && (
                        <p className="text-xs text-blue-700 mt-1">
                          Will send automatically at this time (no need to click Send Now). This tab rechecks every
                          minute while open, or use Process Due Campaigns.
                        </p>
                      )}
                    {c.status === 'scheduled' &&
                      c.scheduled_at &&
                      new Date(c.scheduled_at).getTime() <= Date.now() && (
                        <p className="text-xs text-amber-700 mt-1">
                          Send time reached — should send on the next automatic check (within about a minute), or use
                          Send Now below.
                        </p>
                      )}
                  </div>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const isSent = c.status === 'sent';
                      const isSending = c.status === 'sending';
                      const scheduledFuture =
                        c.status === 'scheduled' &&
                        !!c.scheduled_at &&
                        new Date(c.scheduled_at).getTime() > Date.now();

                      if (scheduledFuture) {
                        return (
                          <span className="px-3 py-2 rounded-lg text-sm bg-slate-100 text-slate-600">
                            Auto-send scheduled
                          </span>
                        );
                      }

                      return (
                        <button
                          type="button"
                          onClick={() => sendNow(c.id)}
                          disabled={sendingCampaignId === c.id || isSent || isSending}
                          className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50"
                        >
                          {sendingCampaignId === c.id || isSending ? 'Sending...' : isSent ? 'Sent' : 'Send Now'}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              If only some emails are delivered, check provider limits/sandbox rules (Resend test mode often limits recipients).
            </p>
          </div>
        </div>
      )}

      {tab === 'analytics' && analytics && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Campaigns" value={analytics.campaigns} />
            <StatCard label="Recipients" value={analytics.recipients} />
            {!trackingProbablyNotEnabled && <StatCard label="Opens" value={analytics.opens} />}
            {!trackingProbablyNotEnabled && <StatCard label="Clicks" value={analytics.clicks} />}
            {!trackingProbablyNotEnabled && <StatCard label="Replies" value={analytics.replies} />}
            <StatCard label="Bounces" value={analytics.bounces} />
            <StatCard label="Unsubscribes" value={analytics.unsubscribes} />
            <StatCard label="Events" value={analytics.events} />
          </div>
          {trackingProbablyNotEnabled && (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Open/click/reply tracking appears disabled right now. Make sure you created the Resend webhooks
              for `email.opened`, `email.clicked`, and `email.replied` and pointed them to the
              `resend-email-webhook` Edge Function.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
    </div>
  );
}
