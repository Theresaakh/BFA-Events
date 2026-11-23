# Ledger ERP

A small business-app platform modelled on Odoo, built around double-entry accounting.
It is a standalone project and has no connection to the BFA Events site in this repository.

* **Zero dependencies**: Python 3.9+ standard library (`http.server` + `sqlite3`) and a vanilla-JS single page app.
* **One file of data**: everything is stored in `data/ledger.db` (SQLite). Back it up by copying that file.

## Run it

```bash
cd ledger-erp
python3 server.py --demo      # --demo loads a sample company on first start
```

Then open http://localhost:8069. Options: `PORT=9000`, `HOST=0.0.0.0` (to reach it from other devices on your network), `LEDGER_DB=/path/to/file.db`.

## Apps

| App | What it does |
| --- | --- |
| **Accounting** | Dashboard, customer invoices & credit notes, vendor bills & refunds, payments, journal entries, journal items, reports, configuration |
| **Contacts** | Customers and vendors with their invoices, receivable and payable balances |
| **App Builder** | Create your own apps for your line of work (e.g. Projects, Fleet, Properties, Employees, Asset Register, Construction Sites), with your own fields |
| **Settings** | Company info, currency, default receivable/payable accounts, lock date, demo data |

### Accounting features
* **Chart of accounts** with Odoo-style account types; **journals** (sales, purchase, bank, cash, miscellaneous); **taxes**; **products**.
* **Invoices / bills**: draft → posted → paid workflow. Lines can carry a product, account, analytic account, quantity, price, discount and tax. Posting generates balanced journal items (revenue/expense, tax, receivable/payable). Numbering has no gaps per journal and year (`INV/2026/0001`, `RINV/...`, `BILL/...`).
* **Credit notes / refunds** are created from a posted document. **Reverse** works for any journal entry.
* **Payments**: register from an invoice, or create them directly and match them against chosen open documents (or automatically against the oldest first). Partial payments and advances are supported.
* **Manual journal entries** with a balance check.
* **Analytic accounting**: analytic plans and accounts (with optional budget). Tag any invoice, bill or journal line to track income, cost and margin per project, department, vehicle, and so on.
* **Lock date**: nothing can be posted or changed on or before it.
* **Printable invoices** (Print → Save as PDF).

### Reports
Profit & Loss, Balance Sheet, Trial Balance, General Ledger (with drill-down to entries), Aged Receivable, Aged Payable, Partner Ledger, Analytic Report (income / cost / margin / budget use) and Tax Report. All reports have date filters and quick periods, and can be exported to CSV or printed.

### App Builder + analytic accounts
Each custom app has fields of type text, long text, number, money, date, checkbox, selection, **contact**, **GL account** or **analytic account**.
When an app has an analytic-account field, its list and record views show the **income, costs and margin** booked on that analytic account, along with the journal items. For example, a "Projects" record shows the profitability of that project.
A record can create its own analytic account with one click.

## API

Everything the UI does goes through a JSON API under `/api/`:

* CRUD: `accounts`, `journals`, `partners`, `taxes`, `products`, `analytic_plans`, `analytic_accounts`, `apps`, `app_fields`, `app_records`
* `moves` (+ `/{id}/post|draft|cancel|reverse|register_payment`)
* `payments` (+ `/{id}/post|draft|cancel`, `/open_documents`)
* `reports/{profit_loss|balance_sheet|trial_balance|general_ledger|aged_receivable|aged_payable|partner_ledger|analytic|tax|dashboard|journal_items}`
* `settings`, `app_templates`, `apps/from_template`

## Not included yet (ideas for next steps)
User logins and access rights, multi-company, multi-currency, bank statement import and reconciliation, recurring invoices, email sending, and fiscal-year closing entries.
