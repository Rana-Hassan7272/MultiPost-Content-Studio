import { supabase } from '../lib/supabase';

export interface EmailContact {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  status: 'subscribed' | 'unsubscribed' | 'bounced';
  tags: string[];
  created_at: string;
}

export interface EmailList {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface EmailListMembership {
  list_id: string;
  contact_id: string;
  email: string;
  full_name: string | null;
}

export interface EmailCampaign {
  id: string;
  user_id: string;
  list_id: string;
  name: string;
  subject: string;
  content_html: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  scheduled_at: string | null;
  total_recipients: number;
  opens_count: number;
  clicks_count: number;
  replies_count: number;
  bounces_count: number;
  unsubscribes_count: number;
  failed_recipients: number;
  created_at: string;
}

export async function getEmailContacts() {
  const { data, error } = await supabase.from('email_contacts').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as EmailContact[];
}

export async function createEmailContact(email: string, fullName?: string) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('Not authenticated');
  const { error } = await supabase.from('email_contacts').insert({
    user_id: userId,
    email: email.trim().toLowerCase(),
    full_name: fullName?.trim() || null,
  });
  if (error) throw error;
}

export async function getEmailLists() {
  const { data, error } = await supabase.from('email_lists').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as EmailList[];
}

export async function createEmailList(name: string, description?: string) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('Not authenticated');
  const { error } = await supabase.from('email_lists').insert({
    user_id: userId,
    name: name.trim(),
    description: description?.trim() || null,
  });
  if (error) throw error;
}

export async function getEmailListMemberships(): Promise<EmailListMembership[]> {
  const { data, error } = await supabase
    .from('email_list_contacts')
    .select('list_id, contact_id, email_contacts(email, full_name)');
  if (error) throw error;
  return (data || []).map((row: any) => ({
    list_id: row.list_id,
    contact_id: row.contact_id,
    email: row.email_contacts?.email ?? '',
    full_name: row.email_contacts?.full_name ?? null,
  }));
}

export async function addContactToList(listId: string, contactId: string) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('Not authenticated');
  const { error } = await supabase.from('email_list_contacts').insert({
    user_id: userId,
    list_id: listId,
    contact_id: contactId,
  });
  if (error) {
    if (error.code === '23505') {
      throw new Error('This contact is already attached to this list.');
    }
    throw error;
  }
}

export async function getEmailCampaigns() {
  const [campaignsRes, recipientsRes] = await Promise.all([
    supabase.from('email_campaigns').select('*').order('created_at', { ascending: false }),
    supabase.from('email_campaign_recipients').select('campaign_id,status'),
  ]);
  if (campaignsRes.error) throw campaignsRes.error;
  if (recipientsRes.error) throw recipientsRes.error;

  const failedByCampaign = new Map<string, number>();
  for (const row of recipientsRes.data || []) {
    if (row.status !== 'failed') continue;
    failedByCampaign.set(row.campaign_id, (failedByCampaign.get(row.campaign_id) || 0) + 1);
  }

  return ((campaignsRes.data || []).map((c: any) => ({
    ...c,
    failed_recipients: failedByCampaign.get(c.id) || 0,
  })) || []) as EmailCampaign[];
}

export async function createEmailCampaign(params: {
  name: string;
  listId: string;
  subject: string;
  contentHtml: string;
  scheduledAt?: string;
}) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('Not authenticated');
  const { error } = await supabase.from('email_campaigns').insert({
    user_id: userId,
    list_id: params.listId,
    name: params.name.trim(),
    subject: params.subject.trim(),
    content_html: params.contentHtml,
    status: params.scheduledAt ? 'scheduled' : 'draft',
    scheduled_at: params.scheduledAt || null,
  });
  if (error) throw error;
}

export async function sendCampaignNow(campaignId: string) {
  const { data, error } = await supabase.functions.invoke('email-campaign-dispatch', {
    body: { campaignId, mode: 'single' },
  });
  if (error) throw error;
  return (data || {}) as {
    success?: boolean;
    processed?: number;
    provider_mode?: 'resend' | 'mock';
    sent_count?: number;
    failed_count?: number;
    hint?: string;
  };
}

export async function processDueCampaigns() {
  const { error } = await supabase.functions.invoke('email-campaign-dispatch', {
    body: { mode: 'due' },
  });
  if (error) throw error;
}

export async function getEmailAnalytics() {
  const [campaigns, events] = await Promise.all([
    supabase.from('email_campaigns').select('id,total_recipients,opens_count,clicks_count,replies_count,bounces_count,unsubscribes_count'),
    supabase.from('email_events').select('id,event_type'),
  ]);
  if (campaigns.error) throw campaigns.error;
  if (events.error) throw events.error;

  const rows = campaigns.data || [];
  return {
    campaigns: rows.length,
    recipients: rows.reduce((sum, r) => sum + (r.total_recipients || 0), 0),
    opens: rows.reduce((sum, r) => sum + (r.opens_count || 0), 0),
    clicks: rows.reduce((sum, r) => sum + (r.clicks_count || 0), 0),
    replies: rows.reduce((sum, r) => sum + (r.replies_count || 0), 0),
    bounces: rows.reduce((sum, r) => sum + (r.bounces_count || 0), 0),
    unsubscribes: rows.reduce((sum, r) => sum + (r.unsubscribes_count || 0), 0),
    events: (events.data || []).length,
  };
}
