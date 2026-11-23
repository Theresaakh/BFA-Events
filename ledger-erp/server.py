#!/usr/bin/env python3
"""
Ledger ERP - a small Odoo-style business app platform with double-entry accounting.

Zero dependencies: Python 3.9+ standard library only (http.server + sqlite3).

    python3 server.py            # http://localhost:8069
    python3 server.py --demo     # also load demo data on first start
    PORT=9000 python3 server.py
"""
import datetime
import json
import mimetypes
import os
import re
import sqlite3
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("LEDGER_DB", os.path.join(BASE, "data", "ledger.db"))
STATIC = os.path.join(BASE, "static")
WRITE_LOCK = threading.Lock()


class UserError(Exception):
    status = 400


class NotFound(UserError):
    status = 404


# --------------------------------------------------------------------------- schema

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS accounts(
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  type TEXT NOT NULL, reconcile INTEGER DEFAULT 0, active INTEGER DEFAULT 1);

CREATE TABLE IF NOT EXISTS journals(
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  type TEXT NOT NULL, default_account_id INTEGER REFERENCES accounts(id),
  seq INTEGER DEFAULT 0, color TEXT);

CREATE TABLE IF NOT EXISTS partners(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT, phone TEXT, street TEXT,
  city TEXT, country TEXT, vat TEXT, is_customer INTEGER DEFAULT 1,
  is_vendor INTEGER DEFAULT 0, payment_term_days INTEGER DEFAULT 30, notes TEXT);

CREATE TABLE IF NOT EXISTS analytic_plans(id INTEGER PRIMARY KEY, name TEXT NOT NULL, color TEXT);

CREATE TABLE IF NOT EXISTS analytic_accounts(
  id INTEGER PRIMARY KEY, code TEXT, name TEXT NOT NULL,
  plan_id INTEGER REFERENCES analytic_plans(id), partner_id INTEGER REFERENCES partners(id),
  budget REAL DEFAULT 0, active INTEGER DEFAULT 1);

CREATE TABLE IF NOT EXISTS taxes(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, rate REAL NOT NULL DEFAULT 0,
  type_tax_use TEXT NOT NULL, account_id INTEGER REFERENCES accounts(id), active INTEGER DEFAULT 1);

CREATE TABLE IF NOT EXISTS products(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, code TEXT, sale_price REAL DEFAULT 0, cost REAL DEFAULT 0,
  income_account_id INTEGER REFERENCES accounts(id), expense_account_id INTEGER REFERENCES accounts(id),
  sale_tax_id INTEGER REFERENCES taxes(id), purchase_tax_id INTEGER REFERENCES taxes(id),
  active INTEGER DEFAULT 1);

CREATE TABLE IF NOT EXISTS moves(
  id INTEGER PRIMARY KEY, name TEXT, move_type TEXT NOT NULL DEFAULT 'entry',
  journal_id INTEGER NOT NULL REFERENCES journals(id), partner_id INTEGER REFERENCES partners(id),
  date TEXT NOT NULL, invoice_date_due TEXT, ref TEXT, narration TEXT,
  state TEXT NOT NULL DEFAULT 'draft', amount_untaxed REAL DEFAULT 0, amount_tax REAL DEFAULT 0,
  amount_total REAL DEFAULT 0, reversed_entry_id INTEGER, payment_id INTEGER, created_at TEXT);

CREATE TABLE IF NOT EXISTS invoice_lines(
  id INTEGER PRIMARY KEY, move_id INTEGER NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
  sequence INTEGER, product_id INTEGER REFERENCES products(id), name TEXT,
  account_id INTEGER REFERENCES accounts(id), analytic_account_id INTEGER REFERENCES analytic_accounts(id),
  quantity REAL DEFAULT 1, price_unit REAL DEFAULT 0, discount REAL DEFAULT 0,
  tax_id INTEGER REFERENCES taxes(id), price_subtotal REAL DEFAULT 0, price_tax REAL DEFAULT 0);

CREATE TABLE IF NOT EXISTS move_lines(
  id INTEGER PRIMARY KEY, move_id INTEGER NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id), partner_id INTEGER REFERENCES partners(id),
  name TEXT, debit REAL DEFAULT 0, credit REAL DEFAULT 0,
  analytic_account_id INTEGER REFERENCES analytic_accounts(id),
  tax_line_id INTEGER REFERENCES taxes(id), date_maturity TEXT, sequence INTEGER);

CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY, name TEXT, payment_type TEXT NOT NULL, partner_type TEXT NOT NULL,
  partner_id INTEGER REFERENCES partners(id), amount REAL NOT NULL DEFAULT 0, date TEXT NOT NULL,
  journal_id INTEGER NOT NULL REFERENCES journals(id), memo TEXT, state TEXT DEFAULT 'draft',
  move_id INTEGER);

CREATE TABLE IF NOT EXISTS payment_allocations(
  id INTEGER PRIMARY KEY, payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  move_id INTEGER NOT NULL REFERENCES moves(id) ON DELETE CASCADE, amount REAL NOT NULL);

CREATE TABLE IF NOT EXISTS apps(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, icon TEXT, color TEXT, description TEXT);

CREATE TABLE IF NOT EXISTS app_fields(
  id INTEGER PRIMARY KEY, app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  name TEXT NOT NULL, label TEXT NOT NULL, ftype TEXT NOT NULL DEFAULT 'char', options TEXT,
  required INTEGER DEFAULT 0, in_list INTEGER DEFAULT 1, sequence INTEGER DEFAULT 10);

CREATE TABLE IF NOT EXISTS app_records(
  id INTEGER PRIMARY KEY, app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{}', created_at TEXT, updated_at TEXT);

CREATE INDEX IF NOT EXISTS ix_ml_move ON move_lines(move_id);
CREATE INDEX IF NOT EXISTS ix_ml_account ON move_lines(account_id);
CREATE INDEX IF NOT EXISTS ix_il_move ON invoice_lines(move_id);
CREATE INDEX IF NOT EXISTS ix_alloc_move ON payment_allocations(move_id);
CREATE INDEX IF NOT EXISTS ix_rec_app ON app_records(app_id);
"""

INVOICE_TYPES = ("out_invoice", "out_refund", "in_invoice", "in_refund")
INCOME_TYPES = ("income", "income_other")
EXPENSE_TYPES = ("expense", "expense_direct_cost", "expense_depreciation")
PL_TYPES = INCOME_TYPES + EXPENSE_TYPES


def today():
    return datetime.date.today().isoformat()


def now():
    return datetime.datetime.now().isoformat(timespec="seconds")


def add_days(d, n):
    return (datetime.date.fromisoformat(d) + datetime.timedelta(days=int(n or 0))).isoformat()


def r2(x):
    return round(float(x or 0) + 0.0, 2)


def connect():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    return db


def one(db, sql, args=()):
    r = db.execute(sql, args).fetchone()
    return dict(r) if r else None


def allrows(db, sql, args=()):
    return [dict(r) for r in db.execute(sql, args)]


def get_setting(db, key, default=None):
    r = db.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return r[0] if r and r[0] not in (None, "") else default


def set_setting(db, key, value):
    db.execute("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
               (key, None if value is None else str(value)))


# --------------------------------------------------------------------------- seed

def seed_base(db):
    if db.execute("SELECT COUNT(*) FROM accounts").fetchone()[0]:
        return False
    accounts = [
        ("1010", "Cash", "asset_cash"), ("1020", "Bank", "asset_cash"),
        ("1100", "Accounts Receivable", "asset_receivable"), ("1200", "Inventory", "asset_current"),
        ("1300", "Prepaid Expenses", "asset_current"), ("1400", "VAT Receivable (Input)", "asset_current"),
        ("1500", "Equipment & Furniture", "asset_fixed"), ("1590", "Accumulated Depreciation", "asset_fixed"),
        ("2010", "Accounts Payable", "liability_payable"), ("2100", "VAT Payable (Output)", "liability_current"),
        ("2200", "Salaries Payable", "liability_current"), ("2500", "Long-term Loans", "liability_non_current"),
        ("3000", "Owner's Capital", "equity"), ("3900", "Retained Earnings", "equity"),
        ("4000", "Product Sales", "income"), ("4100", "Service Revenue", "income"),
        ("4900", "Other Income", "income_other"), ("5000", "Cost of Goods Sold", "expense_direct_cost"),
        ("6000", "Rent", "expense"), ("6100", "Salaries & Wages", "expense"), ("6200", "Utilities", "expense"),
        ("6300", "Office Supplies", "expense"), ("6400", "Marketing & Advertising", "expense"),
        ("6500", "Bank Fees", "expense"), ("6600", "Travel", "expense"),
        ("6700", "Depreciation", "expense_depreciation"), ("6900", "General Expenses", "expense"),
    ]
    for code, name, typ in accounts:
        db.execute("INSERT INTO accounts(code,name,type,reconcile) VALUES(?,?,?,?)",
                   (code, name, typ, 1 if typ in ("asset_receivable", "liability_payable") else 0))
    acc = {r["code"]: r["id"] for r in db.execute("SELECT id, code FROM accounts")}
    for code, name, typ, a, color in [
        ("INV", "Customer Invoices", "sale", "4100", "#2e7d32"),
        ("BILL", "Vendor Bills", "purchase", "6900", "#c62828"),
        ("BNK1", "Bank", "bank", "1020", "#1565c0"),
        ("CSH1", "Cash", "cash", "1010", "#ef6c00"),
        ("MISC", "Miscellaneous Operations", "general", None, "#6a1b9a"),
    ]:
        db.execute("INSERT INTO journals(code,name,type,default_account_id,color) VALUES(?,?,?,?,?)",
                   (code, name, typ, acc.get(a), color))
    for name, rate, use, a in [("VAT 15%", 15, "sale", "2100"), ("VAT 15%", 15, "purchase", "1400"),
                               ("Exempt 0%", 0, "sale", "2100"), ("Exempt 0%", 0, "purchase", "1400")]:
        db.execute("INSERT INTO taxes(name,rate,type_tax_use,account_id) VALUES(?,?,?,?)", (name, rate, use, acc[a]))
    db.execute("INSERT INTO analytic_plans(name,color) VALUES('Projects','#714B67'),('Departments','#00838f')")
    for k, v in {"company_name": "My Company", "currency": "$", "receivable_account_id": acc["1100"],
                 "payable_account_id": acc["2010"], "company_email": "", "company_address": "",
                 "company_vat": ""}.items():
        set_setting(db, k, v)
    return True


def seed_demo(db):
    """Sample customers, vendors, projects, invoices, bills and payments."""
    if db.execute("SELECT COUNT(*) FROM moves").fetchone()[0]:
        raise UserError("Demo data can only be loaded into an empty database (there are already entries).")
    acc = {r["code"]: r["id"] for r in db.execute("SELECT id, code FROM accounts")}
    jr = {r["code"]: r["id"] for r in db.execute("SELECT id, code FROM journals")}
    tax_s = one(db, "SELECT id FROM taxes WHERE type_tax_use='sale' AND rate=15")["id"]
    tax_p = one(db, "SELECT id FROM taxes WHERE type_tax_use='purchase' AND rate=15")["id"]

    def partner(name, cust, vend, city, email):
        return db.execute("INSERT INTO partners(name,is_customer,is_vendor,city,email) VALUES(?,?,?,?,?)",
                          (name, cust, vend, city, email)).lastrowid

    acme = partner("Acme Corporation", 1, 0, "New York", "billing@acme.example")
    blue = partner("Blue Ocean Ltd", 1, 0, "London", "accounts@blueocean.example")
    cedar = partner("Cedar Retail Group", 1, 0, "Dubai", "finance@cedar.example")
    landlord = partner("Prime Properties LLC", 0, 1, "New York", "rent@prime.example")
    power = partner("City Power & Water", 0, 1, "New York", "billing@citypower.example")
    office = partner("OfficeHub Supplies", 0, 1, "Chicago", "sales@officehub.example")

    plan_p = one(db, "SELECT id FROM analytic_plans WHERE name='Projects'")["id"]
    plan_d = one(db, "SELECT id FROM analytic_plans WHERE name='Departments'")["id"]

    def analytic(code, name, plan, partner_id, budget):
        return db.execute("INSERT INTO analytic_accounts(code,name,plan_id,partner_id,budget) VALUES(?,?,?,?,?)",
                          (code, name, plan, partner_id, budget)).lastrowid

    web = analytic("PRJ-001", "Acme Website Redesign", plan_p, acme, 15000)
    app = analytic("PRJ-002", "Blue Ocean Mobile App", plan_p, blue, 30000)
    ret = analytic("PRJ-003", "Cedar Consulting Retainer", plan_p, cedar, 12000)
    adm = analytic("DEP-ADM", "Administration", plan_d, None, 20000)

    def product(name, code, price, cost, inc, exp):
        return db.execute("INSERT INTO products(name,code,sale_price,cost,income_account_id,expense_account_id,"
                          "sale_tax_id,purchase_tax_id) VALUES(?,?,?,?,?,?,?,?)",
                          (name, code, price, cost, acc[inc], acc[exp], tax_s, tax_p)).lastrowid

    consult = product("Consulting (hour)", "SRV-CONS", 120, 0, "4100", "6900")
    webpkg = product("Website Package", "SRV-WEB", 4500, 0, "4100", "6900")
    hosting = product("Hosting (monthly)", "SRV-HOST", 80, 25, "4100", "5000")
    supplies = product("Office Supplies", "EXP-SUP", 0, 150, "4000", "6300")

    d0 = datetime.date.today()

    def ago(days):
        return (d0 - datetime.timedelta(days=days)).isoformat()

    # opening capital
    m = save_move(db, {"move_type": "entry", "journal_id": jr["MISC"], "date": ago(170), "ref": "Opening capital",
                       "lines": [{"account_id": acc["1020"], "name": "Capital injection", "debit": 50000},
                                 {"account_id": acc["3000"], "name": "Capital injection", "credit": 50000}]})
    post_move(db, m)
    m = save_move(db, {"move_type": "entry", "journal_id": jr["MISC"], "date": ago(168), "ref": "Petty cash funding",
                       "lines": [{"account_id": acc["1010"], "name": "Bank to cash transfer", "debit": 3000},
                                 {"account_id": acc["1020"], "name": "Bank to cash transfer", "credit": 3000}]})
    post_move(db, m)

    def inv(t, partner_id, days, lines, ref=None):
        jid = jr["INV"] if t.startswith("out") else jr["BILL"]
        mid = save_move(db, {"move_type": t, "journal_id": jid, "partner_id": partner_id, "date": ago(days),
                             "ref": ref, "invoice_lines": lines})
        post_move(db, mid)
        return mid

    def L(prod, qty, analytic_id, price=None, account=None, tax=None, name=None):
        p = one(db, "SELECT * FROM products WHERE id=?", (prod,))
        return {"product_id": prod, "name": name or p["name"], "quantity": qty,
                "price_unit": price if price is not None else p["sale_price"],
                "account_id": account or p["income_account_id"], "tax_id": tax or p["sale_tax_id"],
                "analytic_account_id": analytic_id}

    i1 = inv("out_invoice", acme, 150, [L(webpkg, 1, web), L(consult, 20, web)])
    i2 = inv("out_invoice", blue, 120, [L(consult, 60, app)])
    i3 = inv("out_invoice", cedar, 95, [L(consult, 25, ret), L(hosting, 3, ret)])
    i4 = inv("out_invoice", acme, 60, [L(consult, 35, web)])
    i5 = inv("out_invoice", blue, 40, [L(consult, 80, app), L(hosting, 6, app)])
    inv("out_invoice", cedar, 12, [L(consult, 25, ret)])
    inv("out_refund", acme, 55, [L(consult, 5, web, name="Discount - delayed delivery")])

    def B(prod, price, analytic_id, account=None, name=None):
        p = one(db, "SELECT * FROM products WHERE id=?", (prod,))
        return {"product_id": prod, "name": name or p["name"], "quantity": 1, "price_unit": price,
                "account_id": account or p["expense_account_id"], "tax_id": tax_p, "analytic_account_id": analytic_id}

    for k, days in enumerate([165, 135, 105, 75, 45, 15]):
        b = inv("in_invoice", landlord, days, [B(supplies, 2200, adm, acc["6000"], "Office rent")], f"RENT-{k + 1}")
        if days > 20:
            register_payment(db, b, {"journal_id": jr["BNK1"], "date": ago(days - 3)})
    for k, days in enumerate([140, 80, 20]):
        b = inv("in_invoice", power, days, [B(supplies, 340 + 40 * k, adm, acc["6200"], "Electricity & water")])
        if days > 30:
            register_payment(db, b, {"journal_id": jr["BNK1"], "date": ago(days - 10)})
    b = inv("in_invoice", office, 70, [B(supplies, 640, adm), B(supplies, 900, app, acc["6900"], "Test devices")])
    register_payment(db, b, {"journal_id": jr["CSH1"], "date": ago(65)})
    inv("in_invoice", office, 8, [B(supplies, 310, web, acc["6400"], "Launch campaign ads")])

    register_payment(db, i1, {"journal_id": jr["BNK1"], "date": ago(120)})
    register_payment(db, i2, {"journal_id": jr["BNK1"], "date": ago(80)})
    register_payment(db, i3, {"journal_id": jr["BNK1"], "date": ago(60), "amount": 2000})
    register_payment(db, i4, {"journal_id": jr["BNK1"], "date": ago(20)})
    _ = i5  # left open on purpose -> shows up in aged receivable

    # salaries
    for days in (150, 120, 90, 60, 30):
        m = save_move(db, {"move_type": "entry", "journal_id": jr["MISC"], "date": ago(days), "ref": "Monthly payroll",
                           "lines": [{"account_id": acc["6100"], "name": "Salaries", "debit": 2500,
                                      "analytic_account_id": adm},
                                     {"account_id": acc["1020"], "name": "Salaries paid", "credit": 2500}]})
        post_move(db, m)

    # a custom app from template, linked to the analytic accounts
    app_id = create_app_from_template(db, "projects")
    for name, cust, an, stage, budget in [("Acme Website Redesign", acme, web, "In Progress", 15000),
                                          ("Blue Ocean Mobile App", blue, app, "In Progress", 30000),
                                          ("Cedar Consulting Retainer", cedar, ret, "Done", 12000)]:
        db.execute("INSERT INTO app_records(app_id,data,created_at,updated_at) VALUES(?,?,?,?)",
                   (app_id, json.dumps({"name": name, "customer": cust, "analytic": an, "stage": stage,
                                        "budget": budget, "start_date": ago(160)}), now(), now()))


APP_TEMPLATES = {
    "projects": {"name": "Projects", "icon": "📁", "color": "#714B67",
                 "description": "Track client projects and their profitability through analytic accounts.",
                 "fields": [("name", "Project Name", "char", "", 1), ("customer", "Customer", "partner", "", 0),
                            ("analytic", "Analytic Account", "analytic", "", 0),
                            ("stage", "Stage", "selection", "New,In Progress,On Hold,Done", 0),
                            ("start_date", "Start Date", "date", "", 0), ("deadline", "Deadline", "date", "", 0),
                            ("budget", "Budget", "money", "", 0), ("notes", "Notes", "text", "", 0)]},
    "fleet": {"name": "Fleet", "icon": "🚚", "color": "#00838f",
              "description": "Vehicles, drivers and running costs per vehicle.",
              "fields": [("vehicle", "Vehicle", "char", "", 1), ("plate", "License Plate", "char", "", 0),
                         ("driver", "Driver", "char", "", 0), ("analytic", "Cost Center", "analytic", "", 0),
                         ("acquired", "Acquisition Date", "date", "", 0), ("value", "Purchase Value", "money", "", 0),
                         ("status", "Status", "selection", "Active,In Repair,Sold", 0)]},
    "real_estate": {"name": "Properties", "icon": "🏠", "color": "#ef6c00",
                    "description": "Rental properties, tenants and income per property.",
                    "fields": [("name", "Property", "char", "", 1), ("address", "Address", "text", "", 0),
                               ("tenant", "Tenant", "partner", "", 0), ("analytic", "Analytic Account", "analytic", "", 0),
                               ("ptype", "Type", "selection", "Apartment,House,Office,Shop,Land", 0),
                               ("rent", "Monthly Rent", "money", "", 0),
                               ("status", "Status", "selection", "Vacant,Rented,Under Maintenance", 0)]},
    "employees": {"name": "Employees", "icon": "👥", "color": "#2e7d32",
                  "description": "Staff directory with departments and salary cost centers.",
                  "fields": [("name", "Employee Name", "char", "", 1), ("job", "Job Position", "char", "", 0),
                             ("department", "Department", "selection", "Management,Sales,Operations,Finance,IT", 0),
                             ("email", "Work Email", "char", "", 0), ("phone", "Phone", "char", "", 0),
                             ("hired", "Hire Date", "date", "", 0), ("salary", "Monthly Salary", "money", "", 0),
                             ("analytic", "Cost Center", "analytic", "", 0)]},
    "assets": {"name": "Asset Register", "icon": "🏷️", "color": "#5d4037",
               "description": "Fixed assets with purchase value and the account they are booked on.",
               "fields": [("name", "Asset", "char", "", 1),
                          ("category", "Category", "selection", "IT Equipment,Furniture,Vehicles,Machinery", 0),
                          ("purchase_date", "Purchase Date", "date", "", 0), ("value", "Purchase Value", "money", "", 0),
                          ("account", "Asset Account", "account", "", 0), ("vendor", "Vendor", "partner", "", 0),
                          ("analytic", "Analytic Account", "analytic", "", 0)]},
    "construction": {"name": "Construction Sites", "icon": "🏗️", "color": "#f9a825",
                     "description": "Job sites with contract value, client and job costing.",
                     "fields": [("name", "Site", "char", "", 1), ("client", "Client", "partner", "", 0),
                                ("analytic", "Job Cost Account", "analytic", "", 0),
                                ("contract", "Contract Value", "money", "", 0),
                                ("phase", "Phase", "selection", "Planning,Foundation,Structure,Finishing,Handover", 0),
                                ("start", "Start Date", "date", "", 0), ("end", "Planned End", "date", "", 0)]},
}


def create_app_from_template(db, key):
    t = APP_TEMPLATES.get(key)
    if not t:
        raise UserError("Unknown template")
    app_id = db.execute("INSERT INTO apps(name,icon,color,description) VALUES(?,?,?,?)",
                        (t["name"], t["icon"], t["color"], t["description"])).lastrowid
    for i, (name, label, ftype, opts, req) in enumerate(t["fields"]):
        db.execute("INSERT INTO app_fields(app_id,name,label,ftype,options,required,in_list,sequence) "
                   "VALUES(?,?,?,?,?,?,?,?)", (app_id, name, label, ftype, opts, req, 1 if i < 6 else 0, (i + 1) * 10))
    return app_id


# --------------------------------------------------------------------------- generic CRUD

RESOURCES = {
    "accounts": ["code", "name", "type", "reconcile", "active"],
    "journals": ["code", "name", "type", "default_account_id", "color"],
    "partners": ["name", "email", "phone", "street", "city", "country", "vat", "is_customer", "is_vendor",
                 "payment_term_days", "notes"],
    "analytic_plans": ["name", "color"],
    "analytic_accounts": ["code", "name", "plan_id", "partner_id", "budget", "active"],
    "taxes": ["name", "rate", "type_tax_use", "account_id", "active"],
    "products": ["name", "code", "sale_price", "cost", "income_account_id", "expense_account_id", "sale_tax_id",
                 "purchase_tax_id", "active"],
    "apps": ["name", "icon", "color", "description"],
    "app_fields": ["app_id", "name", "label", "ftype", "options", "required", "in_list", "sequence"],
    "app_records": ["app_id", "data"],
}
ORDER = {"accounts": "code", "partners": "name COLLATE NOCASE", "analytic_accounts": "code, name",
         "products": "name COLLATE NOCASE", "app_fields": "sequence, id", "app_records": "id DESC"}
SEARCH = {"accounts": ["code", "name"], "partners": ["name", "email", "phone", "city", "vat"],
          "analytic_accounts": ["code", "name"], "products": ["name", "code"], "journals": ["code", "name"],
          "taxes": ["name"], "apps": ["name"], "app_records": ["data"]}
REQUIRED = {"accounts": ["code", "name", "type"], "journals": ["code", "name", "type"], "partners": ["name"],
            "analytic_accounts": ["name"], "analytic_plans": ["name"], "taxes": ["name", "type_tax_use"],
            "products": ["name"], "apps": ["name"], "app_fields": ["app_id", "label"]}


def clean_values(res, data, partial):
    vals = {}
    for k in RESOURCES[res]:
        if k not in data:
            continue
        v = data[k]
        if isinstance(v, bool):
            v = int(v)
        if k.endswith("_id") and v in ("", 0, "0"):
            v = None
        if res == "app_records" and k == "data":
            v = json.dumps(v if isinstance(v, dict) else {})
        if isinstance(v, str):
            v = v.strip()
        vals[k] = v
    if not partial:
        for k in REQUIRED.get(res, []):
            if vals.get(k) in (None, ""):
                raise UserError(f"Field '{k}' is required.")
    else:
        for k in REQUIRED.get(res, []):
            if k in vals and vals[k] in (None, ""):
                raise UserError(f"Field '{k}' is required.")
    if res == "app_fields":
        if not partial and not vals.get("name"):
            vals["name"] = re.sub(r"[^a-z0-9]+", "_", vals["label"].lower()).strip("_") or "field"
        if vals.get("name"):
            vals["name"] = re.sub(r"[^a-z0-9_]+", "_", vals["name"].lower())
    return vals


def out_row(res, row):
    if row and res == "app_records":
        row["data"] = json.loads(row["data"] or "{}")
    return row


def crud_list(db, res, q):
    sql, args = f"SELECT * FROM {res}", []
    where = []
    for k, v in q.items():
        if k in RESOURCES[res] or k == "id":
            where.append(f"{k}=?")
            args.append(v)
    if q.get("q") and res in SEARCH:
        where.append("(" + " OR ".join(f"{c} LIKE ?" for c in SEARCH[res]) + ")")
        args += [f"%{q['q']}%"] * len(SEARCH[res])
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY " + ORDER.get(res, "id")
    return [out_row(res, r) for r in allrows(db, sql, args)]


def crud_get(db, res, rid):
    r = one(db, f"SELECT * FROM {res} WHERE id=?", (rid,))
    if not r:
        raise NotFound("Record not found")
    return out_row(res, r)


def crud_create(db, res, data):
    vals = clean_values(res, data, partial=False)
    if res == "app_fields":
        base, n = vals["name"], 1
        while db.execute("SELECT 1 FROM app_fields WHERE app_id=? AND name=?", (vals["app_id"], vals["name"])).fetchone():
            n += 1
            vals["name"] = f"{base}_{n}"
    if res == "app_records":
        vals["created_at"] = vals["updated_at"] = now()
        validate_record(db, vals["app_id"], json.loads(vals.get("data") or "{}"))
    cols = list(vals)
    rid = db.execute(f"INSERT INTO {res}({','.join(cols)}) VALUES({','.join('?' * len(cols))})",
                     [vals[c] for c in cols]).lastrowid
    return crud_get(db, res, rid)


def crud_update(db, res, rid, data):
    crud_get(db, res, rid)
    vals = clean_values(res, data, partial=True)
    if res == "app_records":
        vals["updated_at"] = now()
        app_id = one(db, "SELECT app_id FROM app_records WHERE id=?", (rid,))["app_id"]
        if "data" in vals:
            validate_record(db, app_id, json.loads(vals["data"]))
    if vals:
        db.execute(f"UPDATE {res} SET {','.join(c + '=?' for c in vals)} WHERE id=?", [*vals.values(), rid])
    return crud_get(db, res, rid)


def crud_delete(db, res, rid):
    crud_get(db, res, rid)
    try:
        db.execute(f"DELETE FROM {res} WHERE id=?", (rid,))
    except sqlite3.IntegrityError:
        raise UserError("This record is used elsewhere (e.g. in journal entries) and cannot be deleted. "
                        "Archive it instead if the model supports it.")
    return {"ok": True}


def validate_record(db, app_id, data):
    for f in allrows(db, "SELECT * FROM app_fields WHERE app_id=?", (app_id,)):
        if f["required"] and data.get(f["name"]) in (None, ""):
            raise UserError(f"'{f['label']}' is required.")


# --------------------------------------------------------------------------- moves (invoices / bills / entries)

def check_lock(db, date):
    lock = get_setting(db, "lock_date")
    if lock and date <= lock:
        raise UserError(f"The period up to {lock} is locked. Change the lock date in Settings to modify it.")


def default_journal(db, move_type):
    jtype = {"out_invoice": "sale", "out_refund": "sale", "in_invoice": "purchase", "in_refund": "purchase"}.get(
        move_type, "general")
    r = one(db, "SELECT id FROM journals WHERE type=? ORDER BY id LIMIT 1", (jtype,))
    if not r:
        r = one(db, "SELECT id FROM journals ORDER BY id LIMIT 1")
    if not r:
        raise UserError("Create a journal first.")
    return r["id"]


def get_move_row(db, mid):
    m = one(db, "SELECT * FROM moves WHERE id=?", (mid,))
    if not m:
        raise NotFound("Entry not found")
    return m


def compute_invoice_line(db, l):
    qty = float(l.get("quantity") or 0)
    pu = float(l.get("price_unit") or 0)
    disc = float(l.get("discount") or 0)
    sub = r2(qty * pu * (1 - disc / 100.0))
    rate = 0
    if l.get("tax_id"):
        t = one(db, "SELECT rate FROM taxes WHERE id=?", (l["tax_id"],))
        rate = t["rate"] if t else 0
    return sub, r2(sub * rate / 100.0)


def save_move(db, data, mid=None):
    old = None
    if mid:
        old = get_move_row(db, mid)
        if old["state"] != "draft":
            raise UserError("Only draft entries can be modified. Reset it to draft first.")
    mtype = (old or {}).get("move_type") or data.get("move_type") or "entry"
    if mtype not in INVOICE_TYPES + ("entry",):
        raise UserError("Invalid move type")
    get = lambda k, d=None: data[k] if k in data else (old or {}).get(k, d)
    date = get("date") or today()
    journal_id = get("journal_id") or default_journal(db, mtype)
    partner_id = get("partner_id") or None
    due = get("invoice_date_due") or None
    if mtype in INVOICE_TYPES and (not due or ("date" in data and "invoice_date_due" not in data)):
        days = 30
        if partner_id:
            p = one(db, "SELECT payment_term_days FROM partners WHERE id=?", (partner_id,))
            days = p["payment_term_days"] if p and p["payment_term_days"] is not None else 30
        due = due or add_days(date, days)
    vals = {"move_type": mtype, "journal_id": journal_id, "partner_id": partner_id, "date": date,
            "invoice_date_due": due if mtype in INVOICE_TYPES else None,
            "ref": get("ref"), "narration": get("narration")}
    if mid:
        db.execute(f"UPDATE moves SET {','.join(k + '=?' for k in vals)} WHERE id=?", [*vals.values(), mid])
    else:
        vals["created_at"] = now()
        vals["reversed_entry_id"] = data.get("reversed_entry_id")
        mid = db.execute(f"INSERT INTO moves({','.join(vals)}) VALUES({','.join('?' * len(vals))})",
                         list(vals.values())).lastrowid

    if mtype in INVOICE_TYPES:
        if "invoice_lines" in data:
            db.execute("DELETE FROM invoice_lines WHERE move_id=?", (mid,))
            for i, l in enumerate(data["invoice_lines"] or []):
                sub, tax = compute_invoice_line(db, l)
                db.execute("INSERT INTO invoice_lines(move_id,sequence,product_id,name,account_id,analytic_account_id,"
                           "quantity,price_unit,discount,tax_id,price_subtotal,price_tax) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                           (mid, i, l.get("product_id") or None, l.get("name"), l.get("account_id") or None,
                            l.get("analytic_account_id") or None, float(l.get("quantity") or 0),
                            float(l.get("price_unit") or 0), float(l.get("discount") or 0),
                            l.get("tax_id") or None, sub, tax))
        t = one(db, "SELECT COALESCE(SUM(price_subtotal),0) u, COALESCE(SUM(price_tax),0) t FROM invoice_lines "
                    "WHERE move_id=?", (mid,))
        db.execute("UPDATE moves SET amount_untaxed=?, amount_tax=?, amount_total=? WHERE id=?",
                   (r2(t["u"]), r2(t["t"]), r2(t["u"] + t["t"]), mid))
    else:
        if "lines" in data:
            db.execute("DELETE FROM move_lines WHERE move_id=?", (mid,))
            for i, l in enumerate(data["lines"] or []):
                debit, credit = r2(l.get("debit")), r2(l.get("credit"))
                if not l.get("account_id") and not debit and not credit:
                    continue
                if not l.get("account_id"):
                    raise UserError(f"Line {i + 1}: an account is required.")
                if debit < 0 or credit < 0:
                    raise UserError("Debit and credit must be positive.")
                db.execute("INSERT INTO move_lines(move_id,account_id,partner_id,name,debit,credit,analytic_account_id,"
                           "sequence) VALUES(?,?,?,?,?,?,?,?)",
                           (mid, l["account_id"], l.get("partner_id") or partner_id, l.get("name"), debit, credit,
                            l.get("analytic_account_id") or None, i))
        t = one(db, "SELECT COALESCE(SUM(debit),0) d FROM move_lines WHERE move_id=?", (mid,))
        db.execute("UPDATE moves SET amount_total=?, amount_untaxed=?, amount_tax=0 WHERE id=?", (r2(t["d"]), r2(t["d"]), mid))
    return mid


def next_name(db, journal_id, date, prefix=None):
    """Gap-free numbering per prefix and year, e.g. INV/2026/0001, RINV/2026/0001, PBNK1/2026/0001."""
    prefix = prefix or one(db, "SELECT code FROM journals WHERE id=?", (journal_id,))["code"]
    base = f"{prefix}/{date[:4]}/"
    last = one(db, "SELECT MAX(CAST(SUBSTR(name, ?) AS INTEGER)) n FROM moves WHERE name LIKE ?",
               (len(base) + 1, base + "%"))["n"] or 0
    db.execute("UPDATE journals SET seq=? WHERE id=?", (last + 1, journal_id))
    return f"{base}{last + 1:04d}"


def counterpart_account(db, mtype_or_partner_type):
    key = "receivable_account_id" if mtype_or_partner_type in ("out_invoice", "out_refund", "customer") \
        else "payable_account_id"
    aid = get_setting(db, key)
    if not aid:
        raise UserError("Set the default receivable/payable accounts in Settings.")
    return int(aid)


def post_move(db, mid):
    m = get_move_row(db, mid)
    if m["state"] != "draft":
        raise UserError("Only draft entries can be posted.")
    check_lock(db, m["date"])
    mtype = m["move_type"]
    if mtype in INVOICE_TYPES:
        if not m["partner_id"]:
            raise UserError("Please select a customer/vendor before confirming.")
        lines = allrows(db, "SELECT * FROM invoice_lines WHERE move_id=? ORDER BY sequence", (mid,))
        if not lines:
            raise UserError("Add at least one line before confirming.")
        if m["amount_total"] < 0:
            raise UserError("The total cannot be negative. Create a credit note instead.")
        j = one(db, "SELECT default_account_id FROM journals WHERE id=?", (m["journal_id"],))
        sign = -1 if mtype in ("out_invoice", "in_refund") else 1   # balance sign of product lines
        db.execute("DELETE FROM move_lines WHERE move_id=?", (mid,))

        def add(account_id, name, balance, analytic=None, tax_line=None, maturity=None, seq=0):
            balance = r2(balance)
            if not balance:
                return
            db.execute("INSERT INTO move_lines(move_id,account_id,partner_id,name,debit,credit,analytic_account_id,"
                       "tax_line_id,date_maturity,sequence) VALUES(?,?,?,?,?,?,?,?,?,?)",
                       (mid, account_id, m["partner_id"], name, max(balance, 0), max(-balance, 0), analytic,
                        tax_line, maturity, seq))

        taxes = {}
        for l in lines:
            acc_id = l["account_id"] or (j and j["default_account_id"])
            if not acc_id:
                raise UserError(f"Line '{l['name'] or ''}' has no account.")
            add(acc_id, l["name"], sign * l["price_subtotal"], l["analytic_account_id"], seq=l["sequence"])
            if l["tax_id"] and l["price_tax"]:
                taxes[l["tax_id"]] = taxes.get(l["tax_id"], 0) + l["price_tax"]
        for tax_id, amount in taxes.items():
            t = one(db, "SELECT name, account_id FROM taxes WHERE id=?", (tax_id,))
            if not t["account_id"]:
                raise UserError(f"Tax '{t['name']}' has no account configured.")
            add(t["account_id"], t["name"], sign * amount, tax_line=tax_id, seq=900)
        add(counterpart_account(db, mtype), m["name"] or (m["ref"] or ""), -sign * m["amount_total"],
            maturity=m["invoice_date_due"], seq=999)
    else:
        t = one(db, "SELECT COUNT(*) n, COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM move_lines "
                    "WHERE move_id=?", (mid,))
        if not t["n"] or (not t["d"] and not t["c"]):
            raise UserError("The entry has no lines.")
        if abs(t["d"] - t["c"]) > 0.005:
            raise UserError(f"The entry is not balanced: debit {t['d']:.2f} ≠ credit {t['c']:.2f}.")
    prefix = None
    if mtype in ("out_refund", "in_refund"):
        prefix = "R" + one(db, "SELECT code FROM journals WHERE id=?", (m["journal_id"],))["code"]
    name = m["name"] or next_name(db, m["journal_id"], m["date"], prefix)
    db.execute("UPDATE moves SET state='posted', name=? WHERE id=?", (name, mid))
    if mtype in INVOICE_TYPES:
        db.execute("UPDATE move_lines SET name=? WHERE move_id=? AND sequence=999", (name, mid))
    return mid


def draft_move(db, mid, from_payment=False):
    m = get_move_row(db, mid)
    if m["state"] == "draft":
        return mid
    check_lock(db, m["date"])
    if m["payment_id"] and not from_payment:
        raise UserError("This entry belongs to a payment. Reset the payment to draft instead.")
    if db.execute("SELECT 1 FROM payment_allocations a JOIN payments p ON p.id=a.payment_id "
                  "WHERE a.move_id=? AND p.state='posted'", (mid,)).fetchone():
        raise UserError("This document has payments. Reset or cancel those payments first.")
    if m["move_type"] in INVOICE_TYPES:
        db.execute("DELETE FROM move_lines WHERE move_id=?", (mid,))
    db.execute("UPDATE moves SET state='draft' WHERE id=?", (mid,))
    return mid


def cancel_move(db, mid):
    draft_move(db, mid)
    db.execute("UPDATE moves SET state='cancel' WHERE id=?", (mid,))
    return mid


def delete_move(db, mid):
    m = get_move_row(db, mid)
    if m["state"] == "posted":
        raise UserError("Posted entries cannot be deleted. Reset to draft or cancel them first.")
    if m["payment_id"]:
        raise UserError("Delete the payment instead.")
    db.execute("DELETE FROM moves WHERE id=?", (mid,))
    return {"ok": True}


def reverse_move(db, mid):
    m = get_move_row(db, mid)
    if m["state"] != "posted":
        raise UserError("Only posted entries can be reversed.")
    if m["move_type"] in INVOICE_TYPES:
        new_type = {"out_invoice": "out_refund", "out_refund": "out_invoice",
                    "in_invoice": "in_refund", "in_refund": "in_invoice"}[m["move_type"]]
        lines = allrows(db, "SELECT * FROM invoice_lines WHERE move_id=? ORDER BY sequence", (mid,))
        return save_move(db, {"move_type": new_type, "journal_id": m["journal_id"], "partner_id": m["partner_id"],
                              "date": today(), "ref": f"Reversal of {m['name']}", "reversed_entry_id": mid,
                              "invoice_lines": lines})
    lines = allrows(db, "SELECT * FROM move_lines WHERE move_id=? ORDER BY sequence", (mid,))
    for l in lines:
        l["debit"], l["credit"] = l["credit"], l["debit"]
    return save_move(db, {"move_type": "entry", "journal_id": m["journal_id"], "partner_id": m["partner_id"],
                          "date": today(), "ref": f"Reversal of {m['name']}", "reversed_entry_id": mid,
                          "lines": lines})


PAID_SQL = ("COALESCE((SELECT SUM(a.amount) FROM payment_allocations a JOIN payments py ON py.id=a.payment_id "
            "WHERE a.move_id=m.id AND py.state='posted'),0)")


def enrich_move(m):
    if m["move_type"] in INVOICE_TYPES:
        paid = r2(m.get("amount_paid"))
        m["amount_residual"] = r2(m["amount_total"] - paid) if m["state"] == "posted" else r2(m["amount_total"])
        if m["state"] != "posted":
            m["payment_state"] = None
        elif m["amount_residual"] <= 0.005:
            m["payment_state"] = "paid"
        elif paid > 0:
            m["payment_state"] = "partial"
        else:
            m["payment_state"] = "not_paid"
        m["overdue"] = bool(m["state"] == "posted" and m["amount_residual"] > 0.005 and m["invoice_date_due"]
                            and m["invoice_date_due"] < today())
    return m


def list_moves(db, q):
    sql = (f"SELECT m.*, {PAID_SQL} amount_paid, p.name partner_name, j.name journal_name, j.code journal_code "
           "FROM moves m LEFT JOIN partners p ON p.id=m.partner_id JOIN journals j ON j.id=m.journal_id")
    where, args = [], []
    if q.get("move_type"):
        types = q["move_type"].split(",")
        where.append(f"m.move_type IN ({','.join('?' * len(types))})")
        args += types
    for k in ("state", "partner_id", "journal_id"):
        if q.get(k):
            where.append(f"m.{k}=?")
            args.append(q[k])
    if q.get("q"):
        where.append("(m.name LIKE ? OR m.ref LIKE ? OR p.name LIKE ?)")
        args += [f"%{q['q']}%"] * 3
    if q.get("date_from"):
        where.append("m.date>=?")
        args.append(q["date_from"])
    if q.get("date_to"):
        where.append("m.date<=?")
        args.append(q["date_to"])
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY m.date DESC, m.id DESC"
    res = [enrich_move(r) for r in allrows(db, sql, args)]
    if q.get("payment_state"):
        res = [r for r in res if r.get("payment_state") == q["payment_state"] or
               (q["payment_state"] == "open" and r.get("payment_state") in ("not_paid", "partial"))]
    if q.get("limit"):
        res = res[:int(q["limit"])]
    return res


def read_move(db, mid):
    m = one(db, f"SELECT m.*, {PAID_SQL} amount_paid, p.name partner_name, j.name journal_name, j.code journal_code "
                "FROM moves m LEFT JOIN partners p ON p.id=m.partner_id JOIN journals j ON j.id=m.journal_id "
                "WHERE m.id=?", (mid,))
    if not m:
        raise NotFound("Entry not found")
    enrich_move(m)
    m["invoice_lines"] = allrows(db, "SELECT * FROM invoice_lines WHERE move_id=? ORDER BY sequence", (mid,))
    m["lines"] = allrows(db, "SELECT l.*, a.code account_code, a.name account_name, p.name partner_name, "
                             "aa.name analytic_name FROM move_lines l JOIN accounts a ON a.id=l.account_id "
                             "LEFT JOIN partners p ON p.id=l.partner_id "
                             "LEFT JOIN analytic_accounts aa ON aa.id=l.analytic_account_id "
                             "WHERE l.move_id=? ORDER BY l.sequence, l.id", (mid,))
    m["payments"] = allrows(db, "SELECT a.amount, py.id payment_id, py.name, py.date, py.state, j.name journal_name "
                                "FROM payment_allocations a JOIN payments py ON py.id=a.payment_id "
                                "JOIN journals j ON j.id=py.journal_id WHERE a.move_id=? AND py.state='posted' "
                                "ORDER BY py.date", (mid,))
    if m["reversed_entry_id"]:
        r = one(db, "SELECT name FROM moves WHERE id=?", (m["reversed_entry_id"],))
        m["reversed_entry_name"] = r and r["name"]
    m["reversals"] = allrows(db, "SELECT id, name, state FROM moves WHERE reversed_entry_id=?", (mid,))
    return m


# --------------------------------------------------------------------------- payments

PAY_TARGET = {("customer", "inbound"): "out_invoice", ("customer", "outbound"): "out_refund",
              ("supplier", "outbound"): "in_invoice", ("supplier", "inbound"): "in_refund"}


def save_payment(db, data, pid=None):
    old = None
    if pid:
        old = one(db, "SELECT * FROM payments WHERE id=?", (pid,))
        if not old:
            raise NotFound("Payment not found")
        if old["state"] != "draft":
            raise UserError("Only draft payments can be modified.")
    get = lambda k, d=None: data[k] if k in data else (old or {}).get(k, d)
    vals = {"payment_type": get("payment_type", "inbound"), "partner_type": get("partner_type", "customer"),
            "partner_id": get("partner_id") or None, "amount": r2(get("amount", 0)), "date": get("date") or today(),
            "journal_id": get("journal_id"), "memo": get("memo")}
    if vals["payment_type"] not in ("inbound", "outbound") or vals["partner_type"] not in ("customer", "supplier"):
        raise UserError("Invalid payment type")
    if not vals["journal_id"]:
        j = one(db, "SELECT id FROM journals WHERE type IN ('bank','cash') ORDER BY id LIMIT 1")
        if not j:
            raise UserError("Create a bank or cash journal first.")
        vals["journal_id"] = j["id"]
    if pid:
        db.execute(f"UPDATE payments SET {','.join(k + '=?' for k in vals)} WHERE id=?", [*vals.values(), pid])
    else:
        pid = db.execute(f"INSERT INTO payments({','.join(vals)}) VALUES({','.join('?' * len(vals))})",
                         list(vals.values())).lastrowid
    return pid


def open_documents(db, partner_id, partner_type, payment_type):
    target = PAY_TARGET[(partner_type, payment_type)]
    return [m for m in list_moves(db, {"move_type": target, "state": "posted", "partner_id": partner_id})
            if m["amount_residual"] > 0.005]


def post_payment(db, pid, allocations=None):
    p = one(db, "SELECT * FROM payments WHERE id=?", (pid,))
    if not p:
        raise NotFound("Payment not found")
    if p["state"] != "draft":
        raise UserError("Only draft payments can be confirmed.")
    if not p["partner_id"]:
        raise UserError("Select a partner.")
    if p["amount"] <= 0:
        raise UserError("The amount must be positive.")
    check_lock(db, p["date"])
    j = one(db, "SELECT * FROM journals WHERE id=?", (p["journal_id"],))
    if j["type"] not in ("bank", "cash") or not j["default_account_id"]:
        raise UserError("Payments need a bank/cash journal with a default account.")
    name = p["name"] or next_name(db, j["id"], p["date"], "P" + j["code"])
    counter = counterpart_account(db, p["partner_type"])
    sign = 1 if p["payment_type"] == "inbound" else -1
    label = p["memo"] or name
    mid = db.execute("INSERT INTO moves(name,move_type,journal_id,partner_id,date,ref,state,amount_total,"
                     "amount_untaxed,payment_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                     (name, "entry", j["id"], p["partner_id"], p["date"], label, "posted", p["amount"], p["amount"],
                      pid, now())).lastrowid
    for acc, bal, seq in ((j["default_account_id"], sign * p["amount"], 0), (counter, -sign * p["amount"], 1)):
        db.execute("INSERT INTO move_lines(move_id,account_id,partner_id,name,debit,credit,sequence) "
                   "VALUES(?,?,?,?,?,?,?)", (mid, acc, p["partner_id"], label, max(bal, 0), max(-bal, 0), seq))
    db.execute("UPDATE payments SET state='posted', name=?, move_id=? WHERE id=?", (name, mid, pid))

    db.execute("DELETE FROM payment_allocations WHERE payment_id=?", (pid,))
    docs = {d["id"]: d for d in open_documents(db, p["partner_id"], p["partner_type"], p["payment_type"])}
    remaining = p["amount"]
    if allocations:
        for a in allocations:
            d = docs.get(int(a["move_id"]))
            amt = r2(a.get("amount"))
            if not d or amt <= 0:
                continue
            amt = min(amt, d["amount_residual"], remaining)
            if amt > 0:
                db.execute("INSERT INTO payment_allocations(payment_id,move_id,amount) VALUES(?,?,?)", (pid, d["id"], amt))
                remaining = r2(remaining - amt)
    else:   # automatic: oldest first
        for d in sorted(docs.values(), key=lambda d: (d["invoice_date_due"] or d["date"], d["id"])):
            if remaining <= 0.005:
                break
            amt = min(d["amount_residual"], remaining)
            db.execute("INSERT INTO payment_allocations(payment_id,move_id,amount) VALUES(?,?,?)", (pid, d["id"], amt))
            remaining = r2(remaining - amt)
    return pid


def draft_payment(db, pid, cancel=False):
    p = one(db, "SELECT * FROM payments WHERE id=?", (pid,))
    if not p:
        raise NotFound("Payment not found")
    if p["state"] == "posted":
        check_lock(db, p["date"])
    if p["move_id"]:
        db.execute("DELETE FROM moves WHERE id=?", (p["move_id"],))
    db.execute("DELETE FROM payment_allocations WHERE payment_id=?", (pid,))
    db.execute("UPDATE payments SET state=?, move_id=NULL WHERE id=?", ("cancel" if cancel else "draft", pid))
    return pid


def delete_payment(db, pid):
    p = one(db, "SELECT * FROM payments WHERE id=?", (pid,))
    if not p:
        raise NotFound("Payment not found")
    if p["state"] == "posted":
        raise UserError("Reset the payment to draft before deleting it.")
    db.execute("DELETE FROM payments WHERE id=?", (pid,))
    return {"ok": True}


def read_payment(db, pid):
    p = one(db, "SELECT py.*, pa.name partner_name, j.name journal_name FROM payments py "
                "LEFT JOIN partners pa ON pa.id=py.partner_id JOIN journals j ON j.id=py.journal_id WHERE py.id=?", (pid,))
    if not p:
        raise NotFound("Payment not found")
    p["allocations"] = allrows(db, "SELECT a.*, m.name move_name, m.move_type, m.date move_date, m.amount_total "
                                   "FROM payment_allocations a JOIN moves m ON m.id=a.move_id WHERE a.payment_id=?", (pid,))
    p["amount_allocated"] = r2(sum(a["amount"] for a in p["allocations"]))
    p["amount_unallocated"] = r2(p["amount"] - p["amount_allocated"]) if p["state"] == "posted" else None
    return p


def list_payments(db, q):
    sql = ("SELECT py.*, pa.name partner_name, j.name journal_name, "
           "COALESCE((SELECT SUM(amount) FROM payment_allocations WHERE payment_id=py.id),0) amount_allocated "
           "FROM payments py LEFT JOIN partners pa ON pa.id=py.partner_id JOIN journals j ON j.id=py.journal_id")
    where, args = [], []
    for k in ("partner_type", "payment_type", "state", "partner_id", "journal_id"):
        if q.get(k):
            where.append(f"py.{k}=?")
            args.append(q[k])
    if q.get("q"):
        where.append("(py.name LIKE ? OR py.memo LIKE ? OR pa.name LIKE ?)")
        args += [f"%{q['q']}%"] * 3
    if where:
        sql += " WHERE " + " AND ".join(where)
    return allrows(db, sql + " ORDER BY py.date DESC, py.id DESC", args)


def register_payment(db, mid, data):
    m = read_move(db, mid)
    if m["move_type"] not in INVOICE_TYPES or m["state"] != "posted":
        raise UserError("Only posted invoices/bills can be paid.")
    if m["amount_residual"] <= 0.005:
        raise UserError("This document is already paid.")
    partner_type = "customer" if m["move_type"].startswith("out") else "supplier"
    payment_type = "inbound" if m["move_type"] in ("out_invoice", "in_refund") else "outbound"
    amount = r2(data.get("amount") or m["amount_residual"])
    pid = save_payment(db, {"payment_type": payment_type, "partner_type": partner_type, "partner_id": m["partner_id"],
                            "amount": amount, "date": data.get("date") or today(), "journal_id": data.get("journal_id"),
                            "memo": data.get("memo") or m["name"]})
    post_payment(db, pid, [{"move_id": mid, "amount": amount}])
    return pid


# --------------------------------------------------------------------------- reports

def posted_filter(q, alias="m"):
    where, args = [f"{alias}.state='posted'"], []
    if q.get("date_from"):
        where.append(f"{alias}.date>=?")
        args.append(q["date_from"])
    if q.get("date_to"):
        where.append(f"{alias}.date<=?")
        args.append(q["date_to"])
    if q.get("journal_id"):
        where.append(f"{alias}.journal_id=?")
        args.append(q["journal_id"])
    if q.get("partner_id"):
        where.append("l.partner_id=?")
        args.append(q["partner_id"])
    if q.get("analytic_account_id"):
        where.append("l.analytic_account_id=?")
        args.append(q["analytic_account_id"])
    if q.get("account_id"):
        where.append("l.account_id=?")
        args.append(q["account_id"])
    return " AND ".join(where), args


def account_balances(db, q):
    w, args = posted_filter(q)
    return allrows(db, "SELECT a.id, a.code, a.name, a.type, COALESCE(SUM(l.debit),0) debit, "
                       "COALESCE(SUM(l.credit),0) credit, COALESCE(SUM(l.debit-l.credit),0) balance "
                       f"FROM move_lines l JOIN moves m ON m.id=l.move_id JOIN accounts a ON a.id=l.account_id "
                       f"WHERE {w} GROUP BY a.id ORDER BY a.code", args)


def report_trial_balance(db, q):
    dfrom = q.get("date_from")
    period = {r["id"]: r for r in account_balances(db, q)}
    opening = {}
    if dfrom:
        oq = dict(q)
        oq.pop("date_from")
        oq["date_to"] = add_days(dfrom, -1)
        opening = {r["id"]: r for r in account_balances(db, oq)}
    rows = []
    for aid in sorted(set(period) | set(opening), key=lambda i: (period.get(i) or opening.get(i))["code"]):
        base = period.get(aid) or opening.get(aid)
        ob = r2(opening.get(aid, {}).get("balance", 0))
        d = r2(period.get(aid, {}).get("debit", 0))
        c = r2(period.get(aid, {}).get("credit", 0))
        rows.append({"id": aid, "code": base["code"], "name": base["name"], "type": base["type"],
                     "opening": ob, "debit": d, "credit": c, "ending": r2(ob + d - c)})
    tot = {k: r2(sum(r[k] for r in rows)) for k in ("opening", "debit", "credit", "ending")}
    return {"rows": rows, "totals": tot}


def report_profit_loss(db, q):
    bal = [r for r in account_balances(db, q) if r["type"] in PL_TYPES]

    def section(types, sign):
        rows = [{"id": r["id"], "code": r["code"], "name": r["name"], "amount": r2(sign * r["balance"])}
                for r in bal if r["type"] in types]
        return {"rows": rows, "total": r2(sum(r["amount"] for r in rows))}

    revenue = section(("income",), -1)
    cogs = section(("expense_direct_cost",), 1)
    other = section(("income_other",), -1)
    expenses = section(("expense", "expense_depreciation"), 1)
    gross = r2(revenue["total"] - cogs["total"])
    net = r2(gross + other["total"] - expenses["total"])
    return {"sections": [{"name": "Revenue", **revenue}, {"name": "Cost of Revenue", **cogs},
                         {"name": "Gross Profit", "total": gross, "subtotal": True},
                         {"name": "Other Income", **other}, {"name": "Operating Expenses", **expenses},
                         {"name": "Net Profit", "total": net, "subtotal": True, "grand": True}],
            "net_profit": net, "revenue": revenue["total"], "expenses": r2(cogs["total"] + expenses["total"])}


def report_balance_sheet(db, q):
    q = {"date_to": q.get("date_to") or today()}
    bal = account_balances(db, q)

    def section(name, types, sign):
        rows = [{"id": r["id"], "code": r["code"], "name": r["name"], "amount": r2(sign * r["balance"])}
                for r in bal if r["type"] in types and abs(r["balance"]) > 0.004]
        return {"name": name, "rows": rows, "total": r2(sum(r["amount"] for r in rows))}

    ca = section("Current Assets", ("asset_receivable", "asset_cash", "asset_current", "asset_prepayments"), 1)
    fa = section("Fixed Assets", ("asset_fixed", "asset_non_current"), 1)
    cl = section("Current Liabilities", ("liability_payable", "liability_current", "liability_credit_card"), -1)
    nl = section("Non-current Liabilities", ("liability_non_current",), -1)
    eq = section("Equity", ("equity",), -1)
    earnings = r2(-sum(r["balance"] for r in bal if r["type"] in PL_TYPES))
    eq["rows"].append({"id": None, "code": "", "name": "Current Earnings (unallocated)", "amount": earnings})
    eq["total"] = r2(eq["total"] + earnings)
    assets = r2(ca["total"] + fa["total"])
    liab = r2(cl["total"] + nl["total"])
    return {"date_to": q["date_to"],
            "assets": {"sections": [ca, fa], "total": assets},
            "liabilities": {"sections": [cl, nl], "total": liab},
            "equity": {"sections": [eq], "total": eq["total"]},
            "liabilities_equity": r2(liab + eq["total"]), "balanced": abs(assets - liab - eq["total"]) < 0.01}


def report_general_ledger(db, q):
    w, args = posted_filter(q)
    lines = allrows(db, "SELECT l.id, l.account_id, l.debit, l.credit, l.name, m.date, m.name move_name, m.id move_id, "
                        "m.move_type, m.ref, p.name partner_name, aa.name analytic_name, a.code, a.name account_name "
                        "FROM move_lines l JOIN moves m ON m.id=l.move_id JOIN accounts a ON a.id=l.account_id "
                        "LEFT JOIN partners p ON p.id=l.partner_id "
                        "LEFT JOIN analytic_accounts aa ON aa.id=l.analytic_account_id "
                        f"WHERE {w} ORDER BY a.code, m.date, m.id, l.sequence", args)
    opening = {}
    if q.get("date_from"):
        oq = {k: v for k, v in q.items() if k != "date_from"}
        oq["date_to"] = add_days(q["date_from"], -1)
        opening = {r["id"]: r for r in account_balances(db, oq)}
    accounts = {}
    for aid, o in opening.items():
        accounts[aid] = {"id": aid, "code": o["code"], "name": o["name"], "opening": r2(o["balance"]), "lines": []}
    for l in lines:
        a = accounts.setdefault(l["account_id"], {"id": l["account_id"], "code": l["code"], "name": l["account_name"],
                                                  "opening": 0, "lines": []})
        a["lines"].append(l)
    result = []
    for a in sorted(accounts.values(), key=lambda a: a["code"]):
        run = a["opening"]
        for l in a["lines"]:
            run = r2(run + l["debit"] - l["credit"])
            l["balance"] = run
        a["debit"] = r2(sum(l["debit"] for l in a["lines"]))
        a["credit"] = r2(sum(l["credit"] for l in a["lines"]))
        a["ending"] = run
        result.append(a)
    return {"accounts": result}


def report_aged(db, q, kind):
    as_of = q.get("date_to") or today()
    types = "out_invoice,out_refund" if kind == "receivable" else "in_invoice,in_refund"
    docs = [d for d in list_moves(db, {"move_type": types, "state": "posted", "date_to": as_of})
            if d["amount_residual"] > 0.005]
    buckets = ["current", "1-30", "31-60", "61-90", "90+"]
    partners = {}
    for d in docs:
        due = d["invoice_date_due"] or d["date"]
        days = (datetime.date.fromisoformat(as_of) - datetime.date.fromisoformat(due)).days
        b = "current" if days <= 0 else "1-30" if days <= 30 else "31-60" if days <= 60 else "61-90" if days <= 90 else "90+"
        amt = d["amount_residual"] * (-1 if d["move_type"].endswith("refund") else 1)
        p = partners.setdefault(d["partner_id"], {"partner_id": d["partner_id"], "partner_name": d["partner_name"],
                                                  "docs": [], "total": 0, **{k: 0 for k in buckets}})
        p[b] = r2(p[b] + amt)
        p["total"] = r2(p["total"] + amt)
        p["docs"].append({"id": d["id"], "name": d["name"], "date": d["date"], "due": due, "days": days,
                          "bucket": b, "amount": r2(amt)})
    rows = sorted(partners.values(), key=lambda p: -p["total"])
    totals = {k: r2(sum(p[k] for p in rows)) for k in buckets + ["total"]}
    return {"as_of": as_of, "buckets": buckets, "rows": rows, "totals": totals}


def report_analytic(db, q):
    w, args = posted_filter(q)
    rows = allrows(db, "SELECT aa.id, aa.code, aa.name, aa.budget, ap.name plan_name, pa.name partner_name, "
                       f"COALESCE(SUM(CASE WHEN a.type IN ({','.join('?' * len(INCOME_TYPES))}) THEN l.credit-l.debit END),0) income, "
                       f"COALESCE(SUM(CASE WHEN a.type IN ({','.join('?' * len(EXPENSE_TYPES))}) THEN l.debit-l.credit END),0) expense, "
                       "COUNT(l.id) n_lines "
                       "FROM analytic_accounts aa LEFT JOIN analytic_plans ap ON ap.id=aa.plan_id "
                       "LEFT JOIN partners pa ON pa.id=aa.partner_id "
                       f"LEFT JOIN (move_lines l JOIN moves m ON m.id=l.move_id AND {w} JOIN accounts a ON a.id=l.account_id) "
                       "ON l.analytic_account_id=aa.id "
                       + ("WHERE aa.id=? " if q.get("only_id") else "") +
                       "GROUP BY aa.id ORDER BY ap.name, aa.code, aa.name",
                       [*INCOME_TYPES, *EXPENSE_TYPES, *args] + ([q["only_id"]] if q.get("only_id") else []))
    for r in rows:
        r["income"], r["expense"] = r2(r["income"]), r2(r["expense"])
        r["net"] = r2(r["income"] - r["expense"])
        r["budget_used"] = round(100 * r["expense"] / r["budget"], 1) if r["budget"] else None
    totals = {k: r2(sum(r[k] for r in rows)) for k in ("income", "expense", "net", "budget")}
    return {"rows": rows, "totals": totals}


def report_tax(db, q):
    where, args = ["m.state='posted'"], []
    if q.get("date_from"):
        where.append("m.date>=?")
        args.append(q["date_from"])
    if q.get("date_to"):
        where.append("m.date<=?")
        args.append(q["date_to"])
    rows = allrows(db, "SELECT t.id, t.name, t.rate, t.type_tax_use, "
                       "SUM(CASE WHEN m.move_type LIKE '%refund' THEN -il.price_subtotal ELSE il.price_subtotal END) base, "
                       "SUM(CASE WHEN m.move_type LIKE '%refund' THEN -il.price_tax ELSE il.price_tax END) tax "
                       "FROM invoice_lines il JOIN moves m ON m.id=il.move_id JOIN taxes t ON t.id=il.tax_id "
                       f"WHERE {' AND '.join(where)} GROUP BY t.id ORDER BY t.type_tax_use DESC, t.name", args)
    for r in rows:
        r["base"], r["tax"] = r2(r["base"]), r2(r["tax"])
    sales = r2(sum(r["tax"] for r in rows if r["type_tax_use"] == "sale"))
    purchases = r2(sum(r["tax"] for r in rows if r["type_tax_use"] == "purchase"))
    return {"rows": rows, "sales_tax": sales, "purchase_tax": purchases, "net_due": r2(sales - purchases)}


def report_partner_ledger(db, q):
    w, args = posted_filter(q)
    types = ("asset_receivable", "liability_payable")
    rows = allrows(db, "SELECT p.id, p.name, "
                       "COALESCE(SUM(CASE WHEN a.type='asset_receivable' THEN l.debit-l.credit END),0) receivable, "
                       "COALESCE(SUM(CASE WHEN a.type='liability_payable' THEN l.credit-l.debit END),0) payable "
                       "FROM move_lines l JOIN moves m ON m.id=l.move_id JOIN accounts a ON a.id=l.account_id "
                       "JOIN partners p ON p.id=l.partner_id "
                       f"WHERE {w} AND a.type IN (?,?) GROUP BY p.id ORDER BY p.name", [*args, *types])
    for r in rows:
        r["receivable"], r["payable"] = r2(r["receivable"]), r2(r["payable"])
    return {"rows": rows}


def report_dashboard(db, q):
    t = today()
    month_start = t[:8] + "01"
    year_start = t[:5] + "01-01"
    journals = []
    for j in allrows(db, "SELECT * FROM journals ORDER BY id"):
        card = dict(j)
        if j["type"] in ("sale", "purchase"):
            docs = list_moves(db, {"journal_id": j["id"]})
            card["draft"] = sum(1 for d in docs if d["state"] == "draft")
            open_docs = [d for d in docs if d.get("payment_state") in ("not_paid", "partial")]
            card["unpaid_count"] = len(open_docs)
            card["unpaid_amount"] = r2(sum(d["amount_residual"] * (-1 if d["move_type"].endswith("refund") else 1)
                                           for d in open_docs))
            od = [d for d in open_docs if d["overdue"]]
            card["overdue_count"] = len(od)
            card["overdue_amount"] = r2(sum(d["amount_residual"] for d in od))
        elif j["type"] in ("bank", "cash") and j["default_account_id"]:
            card["balance"] = r2(one(db, "SELECT COALESCE(SUM(l.debit-l.credit),0) b FROM move_lines l JOIN moves m "
                                         "ON m.id=l.move_id WHERE m.state='posted' AND l.account_id=?",
                                     (j["default_account_id"],))["b"])
            card["payments"] = one(db, "SELECT COUNT(*) n FROM payments WHERE journal_id=? AND state='posted'",
                                   (j["id"],))["n"]
        else:
            card["entries"] = one(db, "SELECT COUNT(*) n FROM moves WHERE journal_id=? AND state='posted'", (j["id"],))["n"]
            card["draft"] = one(db, "SELECT COUNT(*) n FROM moves WHERE journal_id=? AND state='draft'", (j["id"],))["n"]
        journals.append(card)

    def bal_types(types, date_to=None, date_from=None):
        sql = ("SELECT COALESCE(SUM(l.debit-l.credit),0) b FROM move_lines l JOIN moves m ON m.id=l.move_id "
               f"JOIN accounts a ON a.id=l.account_id WHERE m.state='posted' AND a.type IN ({','.join('?' * len(types))})")
        args = list(types)
        if date_from:
            sql += " AND m.date>=?"
            args.append(date_from)
        if date_to:
            sql += " AND m.date<=?"
            args.append(date_to)
        return r2(one(db, sql, args)["b"])

    months = []
    d = datetime.date.today().replace(day=1)
    for _ in range(12):
        start = d.isoformat()
        nxt = (d.replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
        end = (nxt - datetime.timedelta(days=1)).isoformat()
        months.append({"month": start[:7], "income": -bal_types(INCOME_TYPES, end, start),
                       "expense": bal_types(EXPENSE_TYPES, end, start)})
        d = (d - datetime.timedelta(days=1)).replace(day=1)
    months.reverse()
    kpis = {"cash": bal_types(("asset_cash",)), "receivable": bal_types(("asset_receivable",)),
            "payable": -bal_types(("liability_payable",)),
            "income_month": -bal_types(INCOME_TYPES, t, month_start),
            "expense_month": bal_types(EXPENSE_TYPES, t, month_start),
            "profit_year": -bal_types(PL_TYPES, t, year_start)}
    return {"journals": journals, "months": months, "kpis": kpis}


def report_journal_items(db, q):
    w, args = posted_filter(q)
    return allrows(db, "SELECT l.*, m.date, m.name move_name, m.move_type, j.code journal_code, a.code account_code, "
                       "a.name account_name, p.name partner_name, aa.name analytic_name "
                       "FROM move_lines l JOIN moves m ON m.id=l.move_id JOIN journals j ON j.id=m.journal_id "
                       "JOIN accounts a ON a.id=l.account_id LEFT JOIN partners p ON p.id=l.partner_id "
                       "LEFT JOIN analytic_accounts aa ON aa.id=l.analytic_account_id "
                       f"WHERE {w} ORDER BY m.date DESC, m.id DESC, l.sequence LIMIT 2000", args)


REPORTS = {"trial_balance": report_trial_balance, "profit_loss": report_profit_loss,
           "balance_sheet": report_balance_sheet, "general_ledger": report_general_ledger,
           "aged_receivable": lambda db, q: report_aged(db, q, "receivable"),
           "aged_payable": lambda db, q: report_aged(db, q, "payable"),
           "analytic": report_analytic, "tax": report_tax, "partner_ledger": report_partner_ledger,
           "dashboard": report_dashboard, "journal_items": report_journal_items}


# --------------------------------------------------------------------------- cloud persistence
# When DATABASE_URL (Postgres) is set, the SQLite file is restored from Postgres at startup and a
# snapshot is saved back after every change. This keeps data safe on hosts with a temporary disk.
PG_URL = os.environ.get("DATABASE_URL")


def _pg():
    import psycopg  # only needed in the cloud: pip install "psycopg[binary]"
    return psycopg.connect(PG_URL, autocommit=True)


def pg_restore():
    if not PG_URL:
        return
    with _pg() as c:
        c.execute("CREATE TABLE IF NOT EXISTS ledger_snapshot(id INT PRIMARY KEY, data BYTEA NOT NULL, "
                  "updated_at TIMESTAMPTZ DEFAULT now())")
        row = c.execute("SELECT data FROM ledger_snapshot WHERE id=1").fetchone()
    if row:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        for suffix in ("", "-wal", "-shm"):
            if os.path.exists(DB_PATH + suffix):
                os.remove(DB_PATH + suffix)
        with open(DB_PATH, "wb") as f:
            f.write(bytes(row[0]))
        print(f"Restored database from Postgres ({len(row[0])} bytes)")


def pg_save():
    if not PG_URL:
        return
    tmp = DB_PATH + ".snapshot"
    src, dst = sqlite3.connect(DB_PATH), sqlite3.connect(tmp)
    src.backup(dst)
    dst.close()
    src.close()
    with open(tmp, "rb") as f:
        data = f.read()
    os.remove(tmp)
    with _pg() as c:
        c.execute("INSERT INTO ledger_snapshot(id, data, updated_at) VALUES(1, %s, now()) "
                  "ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=now()", (data,))


def reset_database(db):
    for t in ("payment_allocations", "payments", "move_lines", "invoice_lines", "moves", "app_records", "app_fields",
              "apps", "products", "taxes", "analytic_accounts", "analytic_plans", "partners", "journals", "accounts",
              "settings"):
        db.execute(f"DELETE FROM {t}")
    seed_base(db)


APP_PASSWORD = os.environ.get("APP_PASSWORD")
APP_USER = os.environ.get("APP_USER", "admin")


# --------------------------------------------------------------------------- HTTP

def handle_api(db, method, parts, q, body):
    res = parts[0] if parts else ""
    rid = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else None
    action = parts[2] if len(parts) > 2 else (parts[1] if len(parts) > 1 and not parts[1].isdigit() else None)

    if res == "settings":
        if method == "PUT":
            for k, v in body.items():
                set_setting(db, k, v)
        return {r["key"]: r["value"] for r in allrows(db, "SELECT * FROM settings")}

    if res == "reports" and action in REPORTS:
        return REPORTS[action](db, q)

    if res == "demo" and method == "POST":
        seed_demo(db)
        return {"ok": True}

    if res == "reset" and method == "POST":
        if body.get("confirm") != "DELETE":
            raise UserError("Type DELETE to confirm.")
        reset_database(db)
        return {"ok": True}

    if res == "app_templates":
        return [{"key": k, "name": t["name"], "icon": t["icon"], "color": t["color"],
                 "description": t["description"], "fields": [f[1] for f in t["fields"]]}
                for k, t in APP_TEMPLATES.items()]

    if res == "apps" and action == "from_template" and method == "POST":
        return crud_get(db, "apps", create_app_from_template(db, body.get("template")))

    if res == "moves":
        if method == "GET":
            return read_move(db, rid) if rid else list_moves(db, q)
        if method == "POST" and not rid:
            return read_move(db, save_move(db, body))
        if method == "PUT" and rid:
            return read_move(db, save_move(db, body, rid))
        if method == "DELETE" and rid:
            return delete_move(db, rid)
        if method == "POST" and rid:
            if action == "post":
                if body:
                    save_move(db, body, rid)
                post_move(db, rid)
            elif action == "draft":
                draft_move(db, rid)
            elif action == "cancel":
                cancel_move(db, rid)
            elif action == "reverse":
                return read_move(db, reverse_move(db, rid))
            elif action == "register_payment":
                register_payment(db, rid, body)
            else:
                raise NotFound("Unknown action")
            return read_move(db, rid)

    if res == "payments":
        if method == "GET":
            if action == "open_documents":
                return open_documents(db, q.get("partner_id"), q.get("partner_type", "customer"),
                                      q.get("payment_type", "inbound"))
            return read_payment(db, rid) if rid else list_payments(db, q)
        if method == "POST" and not rid:
            return read_payment(db, save_payment(db, body))
        if method == "PUT" and rid:
            return read_payment(db, save_payment(db, body, rid))
        if method == "DELETE" and rid:
            return delete_payment(db, rid)
        if method == "POST" and rid:
            if action == "post":
                fields = {k: v for k, v in body.items() if k != "allocations"}
                if fields:
                    save_payment(db, fields, rid)
                post_payment(db, rid, body.get("allocations"))
            elif action == "draft":
                draft_payment(db, rid)
            elif action == "cancel":
                draft_payment(db, rid, cancel=True)
            else:
                raise NotFound("Unknown action")
            return read_payment(db, rid)

    if res in RESOURCES:
        if method == "GET":
            return crud_get(db, res, rid) if rid else crud_list(db, res, q)
        if method == "POST" and not rid:
            return crud_create(db, res, body)
        if method == "PUT" and rid:
            return crud_update(db, res, rid, body)
        if method == "DELETE" and rid:
            return crud_delete(db, res, rid)

    raise NotFound(f"Unknown endpoint /api/{'/'.join(parts)}")


class Handler(BaseHTTPRequestHandler):
    server_version = "LedgerERP/1.0"

    def log_message(self, fmt, *args):
        if os.environ.get("LEDGER_LOG"):
            super().log_message(fmt, *args)

    def send(self, status, payload, ctype="application/json"):
        data = payload if isinstance(payload, bytes) else json.dumps(payload, default=str).encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def api(self, method):
        url = urlparse(self.path)
        parts = [p for p in url.path.split("/")[2:] if p]
        q = {k: v[-1] for k, v in parse_qs(url.query).items()}
        body = {}
        if method in ("POST", "PUT"):
            n = int(self.headers.get("Content-Length") or 0)
            if n:
                try:
                    body = json.loads(self.rfile.read(n) or b"{}")
                except json.JSONDecodeError:
                    return self.send(400, {"error": "Invalid JSON"})
        db = connect()
        try:
            if method == "GET":
                result = handle_api(db, method, parts, q, body)
            else:
                with WRITE_LOCK:
                    result = handle_api(db, method, parts, q, body)
                    db.commit()
                    pg_save()
            self.send(200, result)
        except UserError as e:
            db.rollback()
            self.send(e.status, {"error": str(e)})
        except sqlite3.IntegrityError as e:
            db.rollback()
            msg = str(e)
            if "UNIQUE" in msg:
                msg = "A record with this code already exists."
            elif "FOREIGN KEY" in msg:
                msg = "This record is referenced by other records."
            self.send(400, {"error": msg})
        except Exception as e:  # pragma: no cover
            db.rollback()
            import traceback
            traceback.print_exc()
            self.send(500, {"error": f"Server error: {e}"})
        finally:
            db.close()

    def static(self):
        path = urlparse(self.path).path
        if path in ("", "/"):
            path = "/index.html"
        full = os.path.normpath(os.path.join(STATIC, path.lstrip("/")))
        if not full.startswith(STATIC) or not os.path.isfile(full):
            full = os.path.join(STATIC, "index.html")
        with open(full, "rb") as f:
            data = f.read()
        ext = os.path.splitext(full)[1].lower()
        # explicit types: on Windows, mimetypes reads the registry and can return text/plain for .js/.css
        ctype = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
                 ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json"}.get(ext) \
            or mimetypes.guess_type(full)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype.endswith("javascript"):
            ctype += "; charset=utf-8"
        self.send(200, data, ctype)

    def authorized(self):
        if not APP_PASSWORD:
            return True
        import base64
        import hmac
        h = self.headers.get("Authorization", "")
        if h.startswith("Basic "):
            try:
                user, _, pwd = base64.b64decode(h[6:]).decode().partition(":")
                if hmac.compare_digest(user, APP_USER) and hmac.compare_digest(pwd, APP_PASSWORD):
                    return True
            except Exception:
                pass
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="Ledger ERP"')
        self.send_header("Content-Length", "0")
        self.end_headers()
        return False

    def do_GET(self):
        if self.path == "/healthz":
            return self.send(200, {"ok": True})
        if self.authorized():
            self.api("GET") if self.path.startswith("/api/") else self.static()

    def do_POST(self):
        if self.authorized():
            self.api("POST")

    def do_PUT(self):
        if self.authorized():
            self.api("PUT")

    def do_DELETE(self):
        if self.authorized():
            self.api("DELETE")


def init_db(demo=False):
    pg_restore()
    db = connect()
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript(SCHEMA)
    fresh = seed_base(db)
    if demo and fresh:   # demo data only for a brand-new database
        seed_demo(db)
    db.commit()
    db.close()
    pg_save()


def main():
    init_db(demo="--demo" in sys.argv)
    port = int(os.environ.get("PORT", 8069))
    host = os.environ.get("HOST", "0.0.0.0" if os.environ.get("RENDER") else "127.0.0.1")
    srv = ThreadingHTTPServer((host, port), Handler)
    print(f"Ledger ERP running on http://localhost:{port}  (database: {DB_PATH})")
    print("Keep this window open while you use the app. Press Ctrl+C to stop.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
