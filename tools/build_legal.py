import html
CO = "Jasper Living Limited"
NUM = '16664307'
ADDR = '82a James Carter Road, Mildenhall, United Kingdom, IP28 7DE'
UPDATED = "18 November 2026"
def page(slug, title, desc, body):
    return f"""<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · Commish</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#FFE45C">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="preload" href="fonts/bricolage-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="styles.css?v=20261118f">
<script>try{{var t=localStorage.getItem('commish-theme');if(t)document.documentElement.dataset.theme=t;}}catch(e){{}}</script>
</head>
<body>
<header class="top">
  <a class="logo" href="/" aria-label="Commish home"><span>C</span><span class="coin t">£</span><span>mmish</span></a>
  <a class="btn ghost legal-back" href="/">Back to Commish</a>
</header>
<main class="legal">
<article class="card t">
<h1>{title}</h1>
<p class="sub">Last updated {UPDATED}</p>
{body}
</article>
<nav class="legal-links" aria-label="Policies"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/refunds">Refunds</a><a href="mailto:hello@commish.fyi">hello@commish.fyi</a></nav>
<p class="foot">Commish is run by {CO}, registered in England and Wales, company number {NUM}. Registered office: {ADDR}. Commish is not affiliated with TikTok.</p>
</main>
</body>
</html>
"""

privacy = f"""
<p>This page explains what Commish collects, why, and what you can do about it. The short version: <b>your TikTok export files never leave your device</b>. We only keep your email address and whether you're on Free or Pro.</p>

<h2>Who we are</h2>
<p>Commish is run by {CO} (company number {NUM}, registered office {ADDR}). We are the data controller for the personal data described here. You can reach us at <a href="mailto:hello@commish.fyi">hello@commish.fyi</a>.</p>

<h2>Your export files</h2>
<p>When you add a TikTok affiliate orders export, it is read by your own browser on your own device. The file and the order details in it are never uploaded to us and never stored on our servers. We can't see them.</p>
<p>If you add files and then leave to sign in or pay, your browser keeps a temporary copy on your device so you don't have to add them again. It's deleted as soon as you're back, or after three hours.</p>

<h2>What we collect</h2>
<ul>
<li><b>Your email address</b>, so you can sign in with an emailed link.</li>
<li><b>Your plan</b> (Free or Pro) and, if you subscribe, your Stripe customer and subscription references, billing period and renewal date.</li>
<li><b>Basic account dates</b>: when you joined and when you last visited.</li>
<li><b>Sign-in links and sessions</b>, stored only as scrambled codes. Unused sign-in links are deleted within a day; sessions end after 30 days or when you sign out.</li>
</ul>
<p>We don't collect your name, address, phone number or card details.</p>

<h2>Payments</h2>
<p>Payments are handled by Stripe. Your card details go straight to Stripe and never reach us. Stripe collects your billing details to take payment and prevent fraud, under its own <a href="https://stripe.com/gb/privacy">privacy policy</a>.</p>

<h2>Emails</h2>
<p>We email you sign-in links and essential messages about your account or subscription. We send these through Resend, from servers in Ireland. We won't send you marketing unless you've said yes to it.</p>

<h2>Visitor stats</h2>
<p>We use Cloudflare Web Analytics to count visits and see which pages are used. It doesn't use cookies, doesn't track you across other sites and doesn't identify you. We only see totals.</p>

<h2>Cookies and storage</h2>
<ul>
<li><b>commish_session</b>: a strictly necessary cookie that keeps you signed in. It's only set when you sign in.</li>
<li><b>Your browser's storage</b>: remembers whether you chose dark mode, and holds the temporary copy of your files described above.</li>
</ul>
<p>We don't use advertising or tracking cookies, so there's no cookie banner.</p>

<h2>Who helps us run Commish</h2>
<ul>
<li><b>Cloudflare</b>: hosts the website, our small account database and the visitor stats.</li>
<li><b>Stripe</b>: takes payments and manages subscriptions.</li>
<li><b>Resend</b>: sends our emails.</li>
</ul>
<p>Some of these companies may process data outside the UK. Where they do, they use legal safeguards approved under UK law, such as the UK International Data Transfer Addendum or the UK-US data bridge.</p>

<h2>Why we're allowed to use your data</h2>
<ul>
<li>To give you your account and your subscription (a contract with you).</li>
<li>To keep Commish secure and understand how it's used, in a way that doesn't identify you (our legitimate interests).</li>
<li>To keep payment records for tax (a legal obligation).</li>
</ul>

<h2>How long we keep it</h2>
<p>We keep your account while you have one. If you ask us to delete it, we'll do so within 30 days. Payment records are kept for six years because HMRC requires it.</p>

<h2>Your rights</h2>
<p>You can ask to see the data we hold about you, correct it, delete it, take a copy, or object to how we use it. Email <a href="mailto:hello@commish.fyi">hello@commish.fyi</a> from the address on your account and we'll reply within a month.</p>
<p>If you're unhappy with how we've handled your data, you can complain to the Information Commissioner's Office at <a href="https://ico.org.uk">ico.org.uk</a>. We'd appreciate the chance to put it right first.</p>

<h2>Changes</h2>
<p>If we change this policy in a way that matters, we'll update the date at the top and, for big changes, email you.</p>
"""

terms = f"""
<p>These terms cover your use of Commish. Please read them along with our <a href="/privacy">privacy policy</a> and <a href="/refunds">refund policy</a>. By using Commish, you agree to them.</p>

<h2>About Commish</h2>
<p>Commish turns your TikTok Shop affiliate orders exports into a dashboard of your earnings. It's run by {CO} (company number {NUM}, registered office {ADDR}). Contact us at <a href="mailto:hello@commish.fyi">hello@commish.fyi</a>.</p>
<p>Commish is not made by, affiliated with or endorsed by TikTok.</p>

<h2>Commish is for the UK</h2>
<p>Commish is built for UK TikTok Shop affiliates, and prices are in pounds. Pro is only available to customers in the United Kingdom. By subscribing, you confirm that you live in the UK.</p>

<h2>What the figures mean</h2>
<p>Everything Commish shows comes from the export files you add. TikTok's figures can change, for example when orders settle, are returned or are cancelled, so treat Commish as a helpful guide rather than an official statement. Commish is not financial or tax advice. For your tax return, check with an accountant or HMRC.</p>

<h2>Your account</h2>
<p>You sign in with a link we email you. Keep access to your email account secure, because anyone who can open your email can sign in as you. Accounts are for one person.</p>

<h2>Free and Pro</h2>
<ul>
<li><b>Free</b> shows your latest 90 days of orders at no cost.</li>
<li><b>Pro</b> costs £2.99 a month or £19.99 a year. It merges all your exports and unlocks every insight and section.</li>
</ul>
<p>Pro starts as soon as you pay and renews automatically at the end of each month or year until you cancel. You can cancel at any time from <b>Your account › Manage subscription</b>. When you cancel, you won't be charged again and you keep Pro until the end of the period you've paid for.</p>
<p>If we change the price, we'll email you at least 30 days before it affects you, so you can cancel first if you'd like to.</p>

<h2>Refunds and your right to cancel</h2>
<p>You can get a full refund within 14 days of paying. See our <a href="/refunds">refund policy</a> for details. When you subscribe, you ask for Pro to start straight away; our 14-day refund promise means you don't lose out by doing so.</p>

<h2>Using Commish fairly</h2>
<p>Please only add exports from your own TikTok account, or ones you have permission to use. Don't try to break, overload, copy or get around the limits of Commish, or use it for anything unlawful.</p>

<h2>Changes and availability</h2>
<p>We're always improving Commish, so features may change. We aim to keep it running smoothly but can't promise it will never be unavailable. If we ever close Commish, we'll give you notice and refund any unused part of a yearly plan.</p>

<h2>Our responsibility to you</h2>
<p>We'll provide Commish with reasonable care and skill. Nothing in these terms limits our liability where the law doesn't allow it, including for death or personal injury caused by our negligence, or for fraud. Otherwise, we're not responsible for business losses or for decisions you make based on the figures, and our total liability to you is limited to what you've paid us in the 12 months before the problem. This doesn't affect your statutory rights as a consumer.</p>

<h2>Ending your account</h2>
<p>You can stop using Commish whenever you like, and ask us to delete your account by emailing us. We may suspend or close an account that breaks these terms, and we'll tell you why.</p>

<h2>The law</h2>
<p>These terms are governed by the law of England and Wales. If you live elsewhere in the UK, you can bring a claim in your local courts.</p>
"""

refunds = f"""
<p>We want you to be happy with Commish Pro. If it isn't for you, you can have your money back.</p>

<h2>14-day money-back promise</h2>
<p>If you're not happy, email <a href="mailto:hello@commish.fyi">hello@commish.fyi</a> from the address on your account within 14 days of paying, and we'll refund that payment in full. No questions asked. This covers:</p>
<ul>
<li>your first payment, monthly or yearly</li>
<li>a yearly renewal you forgot to cancel</li>
</ul>
<p>Refunds go back to the card you paid with, usually within 5 to 10 working days. Pro ends when the refund is made.</p>

<h2>Cancelling</h2>
<p>You can cancel at any time from <b>Your account › Manage subscription</b>. You won't be charged again, and you keep Pro until the end of the period you've paid for.</p>

<h2>After 14 days</h2>
<p>After 14 days we don't usually refund part-used months or years. We always will if something has gone wrong on our side, for example if you were charged twice or Pro didn't work.</p>

<h2>Your legal rights</h2>
<p>This policy is on top of your statutory rights as a consumer, not instead of them.</p>
"""
for slug,title,desc,body in [("privacy","Privacy policy","How Commish handles your data. Your TikTok export files never leave your device.",privacy),("terms","Terms of use","The terms for using Commish Free and Commish Pro.",terms),("refunds","Refund policy","14-day money-back promise for Commish Pro.",refunds)]:
    open(f"public/{slug}.html","w").write(page(slug,title,desc,body))
print("ok")
