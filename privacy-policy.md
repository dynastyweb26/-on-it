# Privacy Policy

**Last updated: October 17, 2026**

On It is an invoicing and bookkeeping app for tradespeople and home service businesses, operated by Brandon Fotsing Talla, doing business as Dynasty Web ("we," "us," "our"). This policy explains what information we collect, why we collect it, who we share it with, how long we keep it, and the choices you have.

We wrote this in plain language on purpose. If anything here is unclear, email us at brandon@dynastyweb.co.

**The short version:**

- We collect what On It needs to make your invoices, track your money, and get you paid. Nothing more.
- We do not sell your information or your customers' information. We do not use it for advertising, and we do not run ad trackers or analytics trackers.
- On It uses AI (Anthropic's Claude models) to read what you type, say, paste, or photograph and turn it into invoices and expense records. AI can make mistakes, so you review everything before it goes out.
- On It never holds, moves, or receives your money. Payments go straight from your customer to you.

---

## 1. Who this policy covers

**You, the business owner using On It.** Most of this policy is about you.

**Your customers.** When you bill someone through On It, you enter some of their information, and they may open the payment page for an invoice you send them. Section 10 explains how we handle their information. For that information, we act on your behalf, as your service provider. If you are one of those customers and have a question about an invoice, the business that billed you is the right first contact.

**Visitors who try On It before signing up.** You can try the chat and the microphone without an account. Section 2 explains what that involves.

---

## 2. Information you give us

### Account

Your email address and password. Passwords are stored as cryptographic hashes by our authentication provider. We never see or store your actual password.

### Trying On It without an account

You can type to On It, or use the microphone a limited number of times, before you create an account. What you type or say is processed the same way as for signed-in users (see Section 4). Your in-progress conversation is kept only in your own browser until you sign up. We use a small cookie to count your free previews (see Section 6).

### Business profile

Your business name, trade, slogan, website, logo, brand colors, and preferred invoice template, if you choose to add them. These appear on the invoices and payment pages you send.

**Your logo is stored at a public web address** so it can show on your invoices and payment pages. Anyone who has that address can view the image.

### Your customers' information

When you create an invoice or quote, or save a client, you enter details about the person or business you are billing: typically a name, and sometimes a phone number, email address, or street address.

This matters, so we want to be clear: **this information is about your customers, who have no relationship with us.** You are responsible for having the right to enter it. We store it so we can build your invoices and let you reuse saved clients. We never contact your customers for our own purposes, and we never sell, rent, or share their information for marketing.

### Invoices, quotes, and expenses

Line items, descriptions, quantities, prices, units, tax rates, due dates, deposits, notes, and payment status. Private notes you add to an invoice (for example, a technician's name from a pasted work order) are saved with the invoice but never printed on the PDF or shown on the payment page.

Expenses you log, including the amount, vendor, category, date, and a short description.

### Saved items

Your saved clients, your saved products and services (name, unit, price, and description), and your recurring expenses (for example, a monthly phone bill). If you turn on automatic logging for a recurring expense, On It adds that expense to your books on its due date without you doing anything.

### Payments you record

When you mark an invoice paid or partly paid, we store the amount, the date, and the method you chose (for example, cash, check, Zelle, or bank transfer). On It does not verify these payments. They are your records.

### Voice

When you use the microphone, the audio is sent to our servers and forwarded to AssemblyAI, a speech-to-text service, which converts it to text. We do not save your audio. It passes through our servers only for as long as it takes to process your request and is never written to our database or file storage.

Whatever you say into the microphone, including your customers' names and the amounts you are billing, is transmitted for processing.

When On It reads a reply out loud, it uses the text-to-speech voices built into your phone or browser. We do not send replies to a separate voice service.

### Photos and files

Receipt photos are sent for AI reading (see Section 4) and then saved in our file storage so you can see them with the expense. Documents and photos you add to your records (the Vault) are saved in our file storage. HEIC photos from iPhones are converted to standard images on your device before upload.

### Notes you paste

If you paste job notes or a work order into the chat, that text is processed to build an invoice. On It copies priced lines into line items and sorts the rest into customer-facing notes or private notes. Cost prices from pasted work orders are never placed on the invoice.

### Your subscription

If you subscribe, your card details are collected and stored by Stripe, our payment processor. **We never receive or store your card number.** We store a Stripe customer identifier, your subscription status, your trial and renewal dates, and whether we have sent your trial reminder and your yearly renewal reminder.

### Codes and referrals

If you redeem an invite, referral, or founder code, we record which code you used and when. Each account has its own referral code. If you joined through someone's referral, we record who referred you.

### Feedback you send us

If you use **Tell us about On It**, we save what you write, the kind you picked (idea, problem, or love it), your star rating if you gave one, which screen you were on, and the app version, together with your account. Only we can read it, and other users never see it. We also email it to ourselves, with your account email as the reply address, so we can write back. Replies are ordinary email in our business mailbox. Feedback is deleted with your account; email us if you also want our email replies deleted.

---

## 3. Getting paid: payment methods and bank details

On It lets you show your customers how to pay you. **On It never holds, receives, moves, or has access to your money or your customers' money.** Payments go directly from your customer to you, outside On It or through Stripe.

### Card and Cash App Pay through Stripe (optional)

If you connect your own Stripe account, Stripe collects your business and identity details directly during setup, and your customers enter their payment details directly on Stripe's checkout page. **We never see or store card numbers, bank account details, or Cash App credentials, yours or your customers'.**

What we store:

- Your Stripe account identifier and the status flags Stripe reports about it (for example, whether it can accept card payments and receive payouts), plus your own on/off setting for card payments
- For each payment a customer makes through Stripe: the amount, the method (card or Cash App Pay), the date, and Stripe's checkout session identifier, so the payment shows up on your invoice

We do not store your customers' names, email addresses, or billing details from Stripe. Information Stripe collects is governed by Stripe's privacy policy: https://stripe.com/privacy

### Payment handles (Zelle, Venmo, PayPal, Cash App)

If you add a Zelle phone number or email, a Venmo username, a PayPal.me username, or a Cash App $cashtag, we store it. Your Zelle handle is stored encrypted, and only our server can decrypt it. On It does not connect to these accounts, read your payment notifications, or move money. The handles are shown to your customers so they know where to send payment.

### Bank transfer details

If you choose to accept bank transfers, you can add your bank details: the account holder name, bank name, routing number, account number, and account type (checking or savings). Here is exactly how we handle them:

- **Your account number is stored encrypted**, and only our server can decrypt it. We keep its last four digits unencrypted so Settings can show which account is on file. The holder name, bank name, routing number (a public number that identifies your bank), and account type are stored with the rest of your business profile.
- **They are shown on the payment page of invoices you have sent that are still unpaid**, with copy buttons, so your customer can send a transfer from their own bank. They never show on drafts or quotes.
- **They are never printed on your invoice PDFs.** The PDF links to the payment page instead.
- **They stop showing once an invoice is paid in full.**
- **On It does not connect to your bank**, verify that the account is yours, start transfers, or see when a transfer arrives. You confirm the money landed in your bank and mark the invoice paid yourself.

You can turn bank transfers off or remove your bank details at any time in Settings. When you remove them, they are erased from your profile and stop appearing on all of your payment pages.

### Payment pages are visible to anyone with the link

Each invoice you send has its own unguessable link to a payment page. **Anyone who has that link, not only the customer you sent it to, can see** your business name and logo, the invoice number, line items and amounts, and the payment details you have turned on, including your Zelle handle and bank details. The page does not show your customer's name or contact details.

Account and routing numbers are the same details printed on every check you write, but they are still sensitive. **Share invoice links only with the people you are billing**, and watch your bank account for activity you do not recognize.

---

## 4. Artificial intelligence

On It uses artificial intelligence to understand what you type, say, paste, or photograph and turn it into a structured invoice, quote, or expense record. The replies On It sends you in the chat are written by AI, not by a person.

### What is sent to AI providers

- **Chat messages.** What you type (or what your speech was transcribed into), the recent messages in that conversation, and the invoice or expense draft you are working on, plus today's date. This can include your customers' names, addresses, phone numbers, and the amounts you are billing.
- **Pasted notes.** The text of job notes or work orders you paste in.
- **Receipt photos.** The image of the receipt. Anything visible in the photo is sent.

### Who processes it

- **Anthropic** (the Claude models) reads chat messages, pasted notes, and receipt images and returns structured data such as line items, amounts, vendors, and dates. Under Anthropic's commercial terms, our inputs are not used to train their models. Anthropic states that it deletes API inputs and outputs within 30 days, except where it must keep them longer for legal reasons or to enforce its usage policies. See https://www.anthropic.com/legal/privacy
- **AssemblyAI** converts microphone audio to text. AssemblyAI states that uploaded audio is deleted within 24 to 48 hours and transcripts after 30 days by default. See https://www.assemblyai.com/legal/privacy-policy

### What AI does not do

- **We do not use your data, or your customers' data, to train AI models.**
- AI does not make decisions about you that have legal or similarly significant effects. It drafts records. You decide what is saved and what is sent.
- AI does not decide whether an expense is tax deductible.

### AI makes mistakes

AI can mishear an amount, misread a receipt, put a description next to the wrong price, or get a name wrong. **Always review an invoice or expense before you save or send it.** You are responsible for what your invoices say.

---

## 5. Information collected automatically

We keep this to what the app needs to work and stay secure.

- **Server logs.** Our hosting provider (Vercel) and database provider (Supabase) record standard request information, such as IP address, browser type, the page or action requested, and timestamps. We use these to keep the service running and to investigate problems and abuse.
- **Rate limiting.** To stop abuse of our AI and voice features, we count requests per account, or per IP address if you are not signed in, for short periods using Upstash.
- **Time zone.** We save your device's time zone so reminders, recaps, and due dates line up with your local day.
- **Push notifications.** If you allow notifications, we store your device's push subscription (a delivery address and encryption keys issued by your browser) and your browser type, so we can send notifications to the right device.
- **Activity records.** We keep a log of changes to your profile and invoices for security, fraud investigation, and troubleshooting (see Section 9 for what happens to it when you delete your account).

We do not collect your precise location. We do not use analytics, advertising, or cross-site tracking tools.

---

## 6. Cookies and storage on your device

On It uses only the cookies and on-device storage it needs to work. **We do not use cookies for advertising, analytics, or tracking you across other websites,** so there is nothing to opt out of and we do not show a cookie banner. Your browser's Do Not Track or Global Privacy Control settings do not change anything, because we do not do the tracking those settings are meant to stop.

### Cookies

| Cookie | What it does | How long it lasts |
|---|---|---|
| Sign-in session (set by Supabase, our authentication provider) | Keeps you signed in and refreshes your session securely | Until you sign out or the session expires |
| onit_guest and onit_guest_tx | Count your free chat and voice previews before you sign up | Until you close your browser |
| onit_grant | Holds an invite or referral code from a link you opened until you finish signing up | Up to 30 days, or until it is used |
| A short sign-in marker | Tells the app you just signed in from an email link, so it can highlight the walkthrough once | 2 minutes |

### Storage on your device

On It also saves some information in your browser's local storage, on your own device, so the app works smoothly:

- **Your current chat and your 5 most recent conversations,** so you do not lose your place if you switch apps. These can include customer names and amounts. They are separated by account, the in-progress conversation is cleared when you sign out, and all of it is cleared when you delete your account.
- **Display preferences,** such as how your lists are sorted, whether recap sound is muted, and which tips and banners you have already seen.

You can clear cookies and local storage in your browser settings at any time. If you do, you may be signed out and lose unsent chat drafts on that device.

### Device permissions

On It asks for permission before using your **microphone** (for voice input) or sending **notifications**. Photos are only accessed when you choose them with your device's photo picker or camera. You can turn these permissions off in your device or browser settings at any time.

---

## 7. How we use information

We use your information to:

- Build, format, and store your invoices, quotes, expenses, and records
- Show your payment page and the payment methods you have turned on
- Record payments, including payments Stripe reports to us
- Calculate your income and expense summaries and recaps
- Send you notifications you have allowed, such as a payment received, an invoice your customer opened, an unpaid invoice, an unsent draft, a recurring expense, or a weekly or monthly recap
- Process your subscription and send account emails, such as sign-up confirmation, password resets, and a reminder before your free trial ends, and a yearly reminder that your subscription renews
- Prevent abuse, protect accounts, and enforce our Terms
- Diagnose problems and improve how the app works
- Contact you about your account or important changes to the service
- Meet legal, tax, and accounting obligations

**We do not sell your information. We do not sell your customers' information. We do not use either for targeted advertising or profiling. We do not use either to train AI models.**

---

## 8. Who we share information with

We share information only with service providers that help us run On It, and only as needed for them to do that. They are not allowed to use it for their own purposes.

| Provider | What it does | What it handles |
|---|---|---|
| Supabase | Database, sign-in, file storage, account emails | Your account, profile, customer details, invoices, expenses, saved items, uploaded images and documents, encrypted payment details |
| Vercel | Hosts the app | Requests to the app and standard server logs |
| Anthropic | AI reading of chat messages, pasted notes, and receipts (Claude) | Message text, conversation context, draft details, receipt images |
| AssemblyAI | Speech-to-text | Microphone audio |
| Stripe | Your On It subscription, and card and Cash App Pay payments if you connect a Stripe account | Your email and subscription details; your connected account's details; your customers' payment details (collected by Stripe directly, never passed to us) |
| Resend | Email delivery | Your email address and the content of account emails we send you, such as trial and yearly renewal reminders; and the feedback notifications we send to ourselves, which include what you wrote and your account email |
| Upstash | Rate limiting | Account identifiers or IP addresses, briefly |
| Your device's push service (for example Apple, Google, or Mozilla) | Delivers notifications you have allowed | Encrypted notification content, which the push service cannot read |

We may also disclose information if the law requires it, to respond to valid legal process, or when needed to protect the rights, property, or safety of our users, the public, or us.

If On It or Dynasty Web is sold, merged, or transferred, your information may transfer with it. We will tell you before that happens, and this policy will continue to apply to it.

---

## 9. How long we keep information

We keep your account and records for as long as your account is open.

**Deleting an item in the app.** When you delete an invoice, quote, or expense, it disappears from your app right away, but it is kept in our database until you delete your account, so your invoice numbering and payment history stay consistent. Saved clients, products, and recurring expenses you delete work the same way, and receipt photos and files stay in storage too. If you want any of these removed from our systems before you delete your account, email us and we will remove them.

**Deleting your account.** You can delete your account yourself: **Settings, then Delete account.** It takes effect immediately and cancels any active subscription. If you cannot get into the app, email brandon@dynastyweb.co and we will do it for you within 30 days.

When your account is deleted, we remove your profile, customers, invoices, quotes, expenses, saved items, recurring expenses, recaps, payment records, push subscriptions, feedback you sent, uploaded files and receipts, logo, and stored payment details including your Zelle handle and bank details.

Some information is kept after deletion:

- **Activity records.** We keep a record that changes happened, for security and fraud investigation, but we erase their contents. No customer names, amounts, or business details remain in them.
- **Billing records.** Stripe keeps its own transaction records, and we keep the billing history we need for tax and accounting obligations.
- **Your Stripe account.** If you connected one, it belongs to you and stays with Stripe. Deleting your On It account removes our record of it but does not close it.
- **AI and transcription providers.** Content already sent to Anthropic or AssemblyAI is deleted on their schedules described in Section 4.
- **Backups.** Deleted data may remain in our providers' encrypted backups for a limited time until those backups expire.
- **Your device.** Account deletion clears On It's chat storage on the device you delete from. Other devices keep their local data until you sign out or clear the browser.

---

## 10. Information about your customers

If you are a customer of a business that uses On It:

- The business entered your information (usually your name, and sometimes your phone number, email, or address) to bill you. We process it on the business's behalf. We do not contact you, market to you, or sell your information.
- **When you open a payment page,** we record the time of the first view and let the business know you opened it. We briefly process your IP address to prevent abuse. We do not set tracking cookies on payment pages.
- **If you pay by card or Cash App Pay,** you pay on Stripe's checkout page. Stripe collects your payment details under its own privacy policy. We do not receive your card or bank details.
- **If you pay by Zelle, Venmo, PayPal, Cash App, or bank transfer,** you pay through your own app or bank. On It is not involved in the transfer and never sees it.
- **To see, correct, or delete your information,** contact the business that billed you. You can also email us at brandon@dynastyweb.co and we will help or pass your request to the business.

---

## 11. Your rights and choices

### What you can do in the app

- **See and edit** your business profile, invoices, expenses, saved clients, products, and recurring expenses
- **Remove** your payment handles and bank details at any time
- **Turn notifications on or off** in Settings or in your device settings
- **Cancel your subscription** at any time through the billing portal in Settings
- **Delete your account** (Settings, then Delete account)

### Privacy rights

Depending on where you live, privacy laws may give you rights to:

- **Know** whether we process your personal data, and **get a copy** of it in a portable format
- **Correct** inaccurate personal data
- **Delete** personal data you gave us or that we hold about you
- **Opt out** of the sale of personal data, targeted advertising, and certain profiling. We do none of these.
- **Not be discriminated against** for using these rights

We offer these rights to all users, wherever they live.

**How to make a request:** email brandon@dynastyweb.co from the email address on your account (or tell us how to verify that the request comes from you). You can use an authorized agent if you give them written permission. We will respond within 45 days. If we need more time, we will tell you why within that period, and we may take up to 45 more days. Requests are free.

**Appeals:** if we decline your request, we will explain why. You can appeal by replying to that email with "Appeal" in the subject line. We will respond to your appeal within 60 days. If you are a Texas resident and you disagree with our decision on your appeal, you can file a complaint with the Texas Attorney General at https://www.texasattorneygeneral.gov/consumer-protection

---

## 12. Security

We protect your information with:

- Encryption in transit (HTTPS on every request)
- Encryption at rest through our database and storage providers
- Additional encryption for your Zelle handle and bank account number, which only our server can decrypt
- Database rules that stop one account from reading another account's records
- Unguessable links for payment pages
- Rate limiting on sensitive features
- A content security policy and other browser security headers
- Defenses that treat text and images sent to AI as data, never as instructions
- Restricted access to production systems

No system is perfectly secure. If we learn of a breach that affects your information, we will notify you, and any authorities we are required to notify, as required by law, and explain what happened and what you can do.

---

## 13. Children

On It is a business tool for adults. It is not intended for anyone under 18, and we do not knowingly collect information from anyone under 18. If you believe a minor has given us information, email us and we will delete it.

---

## 14. Where information is processed

On It is operated from Texas, United States, and our service providers process information in the United States. If you use On It from outside the United States, your information will be transferred to and processed in the United States.

---

## 15. Changes to this policy

If we change this policy, we will update the date at the top. For significant changes, such as using your information in a new way, we will notify you in the app or by email before the change takes effect.

---

## 16. Contact

Questions, requests, or concerns about this policy or your information:

**Email:** brandon@dynastyweb.co

Brandon Fotsing Talla, doing business as Dynasty Web, Forney, Texas
