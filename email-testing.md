1) Why only 1 email gets delivered out of 3
This is almost certainly your provider test restriction, not your app loop.
With onboarding@resend.dev and no verified domain, Resend commonly limits who can receive. So your app tries all 3, but provider accepts only one and rejects others (hence Failed: 2).
To send to all contacts reliably, you need:
verified domain in Resend
EMAIL_FROM from that domain (e.g. noreply@yourdomain.com)
SPF/DKIM configured
2) Why Opens/Clicks/Replies stay 0
Current MVP tracks send/fail events only.
Open/click/reply metrics need extra infrastructure:
opens: tracking pixel endpoint + event logging
clicks: tracked redirect links
replies: inbound webhook/mailbox integration
delivery/bounce/unsubscribe: provider webhooks
So right now “sent/failed” works, but opens/replies won’t increase automatically yet.



