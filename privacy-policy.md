# Privacy Policy

**Last updated: July 31, 2026**

On It is an invoicing app for tradespeople and home service businesses, operated by Dynasty Web LLC ("we," "us"). This policy explains what information we collect, why, and what we do with it.

We've written this in plain language on purpose. If anything here is unclear, email us at brandon@dynastyweb.co.

---

## 1. Information you give us

**Account information.** Your email address and a password. Passwords are stored as cryptographic hashes — we never see or store your actual password.

Note that the microphone and transcription features can be used before you create an account. If you try On It as a guest, anything you say is still transmitted for transcription as described below.

**Business profile.** Your business name, address, phone number, website, and logo, if you choose to add them. These appear on the invoices you send.

**Your customers' information.** When you create an invoice, you enter details about the person or business you're billing — typically their name, and sometimes an email address, phone number, or physical address.

This is important, so we want to be clear about it: **this information belongs to your customers, not to you or to us.** You are responsible for having the right to enter it. We store it so we can generate your invoices and let you reuse customer details on future jobs. We do not contact your customers for our own purposes, and we do not sell, rent, or share their information with anyone for marketing.

**Invoice and expense records.** Line items, descriptions, amounts, dates, payment status, and the expenses you log.

**Voice recordings.** When you use the microphone to describe a job, the audio is sent to our servers and forwarded to AssemblyAI, a speech-to-text service, which converts it into text.

We do not store your audio. It exists on our servers only for the moment it takes to process your request, and is never written to our database or file storage. AssemblyAI receives a copy in order to transcribe it, and their retention of that copy is governed by their own privacy policy, which you can read at https://www.assemblyai.com/legal/privacy-policy.

Transcription happens on our servers, not on your phone. Please keep in mind that whatever you say into the microphone — including your customers' names and the amounts you're billing — is transmitted for processing.

**Photos and documents.** Receipt photos and any files you upload are stored in our file storage (provided by Supabase). We keep them for as long as your account exists — we do not automatically delete them after a period of time. You can remove individual files from within the app.

**Payment information.** If you subscribe, your card details are collected and stored by Stripe, our payment processor. **We never receive or store your card number.** We store only a customer identifier, your subscription status, and renewal dates.

**Your Zelle handle.** If you choose to add a Zelle phone number or email so customers can pay you directly, we store it encrypted. On It does not connect to your Zelle account, read your payment notifications, or move money — the handle is simply printed on your invoices so your customers know where to send payment.

---

## 2. How we use it

We use your information to:

- Create, format, and send your invoices
- Store your records so you can find them later
- Calculate your income, expenses, and tax summaries
- Process your subscription and send transactional emails (receipts, password resets, invoice delivery)
- Diagnose problems and keep the service working
- Contact you about your account or important changes to the service

We do not sell your information. We do not sell your customers' information. We do not use your data to train AI models.

---

## 3. Artificial intelligence

On It uses AI to turn what you say or photograph into a structured invoice or expense record. When you do this, the relevant content — the text of your description, or the contents of a receipt image — is sent to an AI provider for processing.

That content can include your customers' names and the amounts you're billing.

Our AI provider is Anthropic, which operates the Claude models. Content is sent to their API, processed, and a structured result is returned to us. Under Anthropic's commercial terms, API inputs are not used to train their models. Their policies are at https://www.anthropic.com/legal/privacy.

Speech-to-text is handled separately by AssemblyAI, as described above.

**AI output is not always correct.** Always review an invoice before you send it. You are responsible for what your invoices say.

---

## 4. Who we share information with

We use the following service providers, each of which handles some of your data in order for On It to work:

| Provider | What it does | What it handles |
|---|---|---|
| Supabase | Database, authentication, file storage | Account, business profile, customer details, invoices, expenses, uploaded images |
| Vercel | Application hosting | Requests to the app; standard server logs |
| Stripe | Payment processing | Your email, payment card details, subscription status |
| Resend | Transactional email | Recipient addresses and email contents, including invoices sent to your customers |
| Anthropic | Invoice and receipt parsing (Claude) | Invoice descriptions, receipt image contents |
| AssemblyAI | Speech-to-text | Audio recorded through the microphone |

**We do not use third-party analytics, advertising trackers, or cookies for tracking. We do not sell personal data, and we do not use it for targeted advertising or profiling.**

We may also disclose information if required by law, or if necessary to protect our rights or someone's safety.

If On It is ever sold or transferred, your information may transfer with it. We'd tell you before that happened.

---

## 5. Email sent to your customers

When you send an invoice, we deliver it by email on your behalf. Your customer receives an email containing your invoice.

We use your customers' email addresses only to deliver the invoices you create. We don't add them to any mailing list and we don't market to them.

---

## 6. How long we keep information

We keep your account and records for as long as your account is open.

**Deleting your account.** On It does not currently have a self-service delete button. To close your account and have your data removed, email us at brandon@dynastyweb.co and we will do it for you. We aim to complete deletion requests within 30 days.

When we delete an account, we remove your profile, your customer records, your invoices, your expenses, your uploaded documents and receipts, and your stored Zelle handle.

Some information is retained after deletion:

- **Security logs.** We keep a record of account activity for security and fraud investigation.
- **Payment records.** Stripe retains transaction records, and we retain enough billing history to meet tax and accounting obligations.
- **Transcription and AI processing.** Content previously sent to AssemblyAI or Anthropic for processing is subject to their retention policies, which we do not control.

We're working on a self-service deletion option in the app. Until then, email works and we'll handle it.

---

## 7. Your choices

You can:

- **See and edit** your business profile, invoices, expenses, and customer records at any time in the app
- **Delete your account** by emailing brandon@dynastyweb.co, which removes your data as described above
- **Cancel your subscription** at any time through the billing portal in Settings
- **Ask us questions** about your data at brandon@dynastyweb.co

Depending on where you live, you may have additional rights under state privacy law — including the right to know what we collect, to request deletion, and to not be discriminated against for exercising those rights. Email us and we'll help.

We do not sell personal data, and we do not use it for targeted advertising.

---

## 8. Security

We protect your data with:

- Encryption in transit (HTTPS on every request)
- Encryption at rest for your Zelle handle, which only our server can decrypt
- Row-level security in our database, so one account cannot read another account's records
- Rate limiting on sensitive endpoints
- A content security policy to reduce injection risk
- Restricted access to production systems

No system is perfectly secure. If we ever learn of a breach affecting your information, we will tell you promptly and explain what happened.

---

## 9. Children

On It is a business tool for adults. It is not intended for anyone under 18, and we don't knowingly collect information from children. If you believe a minor has given us information, email us and we'll remove it.

---

## 10. Changes

If we change this policy, we'll update the date at the top. For significant changes, we'll notify you in the app or by email before they take effect.

---

## 11. Contact

Questions about this policy or your data:

**Email:** brandon@dynastyweb.co
**Mailing address:** [TO BE ADDED BEFORE PUBLICATION]
