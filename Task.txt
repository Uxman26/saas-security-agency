# Simple guide: who can log in, and how pay and billing work

## Login and who sees what

You sign in with **email and password**. Passwords are not stored in readable form. After login, the site keeps a **short pass** in the browser so it knows you are still you.

**Normal users** only ever see their own **company’s** data. **Super admins** (set up in server settings) can see every company in one admin area; others cannot, even if they guess the web address.

If you are not logged in, protected pages send you to login. If your pass stops working, you are signed out and sent back to login.

**Running it safely:** use a strong secret key in production, and remember that **sign-up is open** unless you block it on your hosting.

---

## The pieces you set up first

Think of it as: **who** (guards), **where** (sites), **who you bill** (clients). You link **sites to clients** when a site belongs to a customer.

**Assignments (rota)** are the shifts: which guard is at which site on which day, with start and end times (and breaks).

**Rates** tell the system **how much per hour** to use for pay or for billing. It uses the guard/site/shift rules you have entered.

---

## Allowances

**Allowances** are extra named amounts you define for your company (for example a flat “meal” amount).

Each allowance has two switches:

- **Include in payroll** — counts toward **what you pay the guard**.
- **Include in invoices** — counts toward **what you put on the client’s bill**.

So the same allowance can affect pay only, billing only, or both, depending on those switches.

---

## Payroll (money to guards)

For a chosen **guard** and **date range**, payroll uses that guard’s **scheduled shifts** in that range, works out **hours**, applies **pay rates**, and adds any allowances marked for payroll. The result is saved as a **payroll record** for that period so you have a clear figure for what you owe that guard.

---

## Invoices (money from clients)

For a chosen **client** and **date range**, the system finds **sites linked to that client**, gathers **shifts** at those sites in the range, and builds **invoice lines** from hours and **billing rates**. It also adds allowances marked for invoices. You get an **invoice** (usually starting as a draft) with a total you can track and send.

---

## Payments (money received)

When a client **pays** you toward an invoice, you record a **payment** against that invoice (amount, method, date). That is your record of money **in**, separate from the invoice itself.

---

**In one line:** shifts and rates drive the numbers; allowances tweak pay and/or client bills; payroll is **out** to guards, invoices are **out** to clients, payments are **in** from clients.
