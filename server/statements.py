"""Restaurant statements — monthly statements built from photographed delivery notes.

Each delivery note (the carbon-copy "DELIVERY NOTE" books) is photographed, read by
AI vision, and checked against the price list. A month's notes for one customer are
added up into a statement: one row per day, one column per product, totals at the
foot.

Everything here is pure (no I/O) so it can be tested without a database, a network
or an AI key. app.py owns the routes, storage and the call to the model.

Money read off handwriting is never trusted blindly: every line is re-priced from
the price list and any disagreement with what is written on the paper becomes a
warning the person reviewing the statement sees first.
"""
import calendar
import re
import unicodedata

# ---------------------------------------------------------------- defaults
# Seeded the first time the app is opened; after that the stored copy (editable by
# a Super) is the source of truth. Aliases are what people actually write on the
# notes — in Vietnamese, often abbreviated.
DEFAULT_CONFIG = {
    'supplier': 'MCQ Street Food',
    'abn': '',
    'customers': [
        # stores: managers of these stores may also build its statements. Empty = Super only;
        # a Super grants stores from the page's Settings.
        {'id': 'beechboro', 'name': 'M&MW Beechboro', 'folder': 'beechboro', 'stores': []},
    ],
    'products': [
        {'id': 'pork',    'name': 'Roast Pork Roll',  'price': 6.50,
         'aliases': ['quay', 'thit quay', 'roast pork', 'pork roll', 'roast']},
        {'id': 'trad',    'name': 'Traditional Roll', 'price': 5.50,
         'aliases': ['thit', 'traditional', 'banh mi thit', 'trad']},
        {'id': 'chicken', 'name': 'Chicken',          'price': 6.50,
         'aliases': ['chicken', 'ga', 'banh mi ga']},
    ],
}

def ai_prompt(config, month=None):
    """What the model is asked to return — kept beside the parser that reads it. The price
    list is given so an unclear digit can be settled against the amount on the same line,
    but the model is told to COPY the paper, never fix it: a wrong sum on the paper is
    exactly what the person checking the statement needs to see."""
    items = '; '.join('%s ($%.2f, written e.g. %s)' % (p['name'], float(p.get('price') or 0),
                      ', '.join("'%s'" % a for a in (p.get('aliases') or [])[:3]))
                      for p in (config.get('products') or []))
    when = ''
    if month:
        try:
            when = (' The notes in this batch should be from %s %s, but copy the date exactly as written.'
                    % (calendar.month_name[int(month[5:7])], month[:4]))
        except Exception:
            when = ''
    return (
        "This photo is a handwritten DELIVERY NOTE from a carbon-copy book (often a faint carbon "
        "copy). Read it slowly and carefully, digit by digit, and return ONLY compact JSON, no prose, "
        "no code fence, in exactly this shape:\n"
        '{"number":"<the printed note number, top right>","number_sure":true,'
        '"date":"<the DATE exactly as written, e.g. 30/10/26>","date_sure":true,'
        '"to":"<the TO line>","from":"<the RECEIVED FROM line>",'
        '"lines":[{"qty":<the number in the narrow QTY column on the left>,'
        '"item":"<the item name as written>","amount":<the dollar amount written at the right of that line>,'
        '"sure":true}],'
        '"total":<the total written under the lines>,"readable":true}\n'
        "The items sold are: " + items + ". Item names are often Vietnamese and abbreviated "
        "('Quay', 'Thit', 'Th\u1ecbt', 'Ga'). One line on the paper is one entry in lines, in order, top "
        "to bottom; skip blank rows. A comma inside a number is a decimal point (97,5 means 97.5). "
        "Handwritten digits are easy to confuse (1/7, 4/9, 3/8, 5/6, 0/6): the amount on a line is "
        "usually qty x the price above, so use it to settle an unclear quantity, and the total to "
        "settle an unclear amount. But copy what is written: if the paper's own arithmetic is wrong, "
        "keep the numbers as written and never correct them. Set sure / date_sure / number_sure to "
        "false whenever you are not certain of that value. Ignore signatures and tick marks. "
        "Use null for anything you cannot read."
        + when +
        ' If the photo is not a delivery note, return {"readable":false}.'
    )


TOLERANCE = 0.01


# ---------------------------------------------------------------- small helpers
def fold(s):
    """Lowercase, strip Vietnamese diacritics and punctuation: 'Thịt ' -> 'thit'."""
    s = unicodedata.normalize('NFKD', str(s or ''))
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = s.replace('đ', 'd').replace('Đ', 'd')
    return re.sub(r'[^a-z0-9 ]+', ' ', s.lower()).strip()


def to_number(v):
    """39 / '39' / '$39.00' / '97,5' / '97.5' -> float, or None."""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace('$', '').replace(' ', '')
    if not s:
        return None
    # a lone comma is a decimal point on these notes; a comma before 3 digits is thousands
    if ',' in s and '.' not in s:
        s = s.replace(',', '') if re.search(r',\d{3}$', s) else s.replace(',', '.')
    else:
        s = s.replace(',', '')
    m = re.search(r'-?\d+(?:\.\d+)?', s)
    return float(m.group(0)) if m else None


def parse_date(s, month=None):
    """'30/10/26' -> '2026-10-30'. Australian DAY/MONTH order. ISO passes through.
    A day with no year takes the year of `month` (YYYY-MM)."""
    s = str(s or '').strip()
    if not s:
        return None
    m = re.match(r'^(\d{4})-(\d{1,2})-(\d{1,2})$', s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    else:
        m = re.match(r'^(\d{1,2})\s*[/.\-]\s*(\d{1,2})(?:\s*[/.\-]\s*(\d{2,4}))?$', s)
        if not m:
            return None
        d, mo = int(m.group(1)), int(m.group(2))
        if m.group(3):
            y = int(m.group(3))
            y = y + 2000 if y < 100 else y
        elif month:
            y = int(month[:4])
        else:
            return None
    try:
        if not (1 <= mo <= 12 and 1 <= d <= calendar.monthrange(y, mo)[1]):
            return None
    except Exception:
        return None
    return '%04d-%02d-%02d' % (y, mo, d)


def match_product(item, products):
    """The product a handwritten item name refers to, or None. Exact alias first, then
    an alias contained in the text — so 'Thit quay' is pork, not traditional."""
    t = fold(item)
    if not t:
        return None
    best = None
    for p in products:
        names = [fold(p.get('name'))] + [fold(a) for a in (p.get('aliases') or [])]
        for a in names:
            if not a:
                continue
            if t == a:
                return p['id']
            if re.search(r'(^| )' + re.escape(a) + r'( |$)', t):
                # prefer the LONGEST matching alias: 'thit quay' beats 'thit'
                if best is None or len(a) > best[1]:
                    best = (p['id'], len(a))
    return best[0] if best else None


def price_of(product_id, products):
    for p in products:
        if p.get('id') == product_id:
            return float(p.get('price') or 0)
    return None


def month_bounds(month):
    y, mo = int(month[:4]), int(month[5:7])
    return '%s-01' % month, '%s-%02d' % (month, calendar.monthrange(y, mo)[1])


# ---------------------------------------------------------------- one note
def normalise(ai, config, month):
    """Turn the model's JSON into a note record: dates parsed, items matched to the
    price list, and every line re-priced so a misread shows up as a warning."""
    products = config.get('products') or []
    ai = ai if isinstance(ai, dict) else {}
    if ai.get('readable') is False:
        return {'number': '', 'date': None, 'to': '', 'from': '', 'lines': [], 'total': None,
                'raw_date': '', 'readable': False}
    lines, unsure = [], []
    for ln in (ai.get('lines') or [])[:30]:
        if not isinstance(ln, dict):
            continue
        qty = to_number(ln.get('qty'))
        amount = to_number(ln.get('amount'))
        item = str(ln.get('item') or '').strip()[:60]
        if qty is None and amount is None and not item:
            continue
        lines.append({'qty': qty, 'item': item, 'product': match_product(item, products),
                      'amount': amount})
        if ln.get('sure') is False:
            unsure.append('line %d (%s)' % (len(lines), item or 'item'))
    raw_date = str(ai.get('date') or '').strip()[:20]
    digits = re.sub(r'\D', '', str(ai.get('number') or ''))[:10]
    if ai.get('date_sure') is False:
        unsure.insert(0, 'the date')
    if ai.get('number_sure') is False:
        unsure.insert(0, 'the note number')
    return {'number': str(int(digits)) if digits else '',
            'date': parse_date(raw_date, month), 'raw_date': raw_date,
            'to': str(ai.get('to') or '').strip()[:60],
            'from': str(ai.get('from') or '').strip()[:60],
            'lines': lines, 'total': to_number(ai.get('total')), 'readable': True,
            'unsure': unsure[:12]}


def note_warnings(note, config, month):
    """Everything about ONE note a person should look at before it goes on a statement."""
    out = []
    if not note.get('readable', True):
        return [{'code': 'unreadable', 'text': 'AI could not read this note — enter it by hand.'}]
    products = config.get('products') or []
    if note.get('unsure') and not note.get('by') == 'person':
        out.append({'code': 'unsure', 'text': 'Claude was not sure of %s \u2014 compare with the photo'
                    % ', '.join(note['unsure'])})
    if not note.get('date'):
        out.append({'code': 'no_date', 'text': ('No date (read as \u201c%s\u201d)' % note['raw_date']) if note.get('raw_date') else 'No date'})
    else:
        first, last = month_bounds(month)
        if not (first <= note['date'] <= last):
            out.append({'code': 'date_outside',
                        'text': 'Dated %s — outside %s' % (note['date'], month)})
    if not note.get('number'):
        out.append({'code': 'no_number', 'text': 'No note number'})
    lines = note.get('lines') or []
    if not lines:
        out.append({'code': 'no_lines', 'text': 'No items'})
    sum_written = 0.0
    for i, ln in enumerate(lines):
        label = ln.get('item') or ('line %d' % (i + 1))
        if not ln.get('product'):
            out.append({'code': 'unknown_product', 'line': i,
                        'text': '"%s" is not on the price list' % label})
            continue
        if ln.get('qty') is None:
            out.append({'code': 'no_qty', 'line': i, 'text': 'Quantity not read for %s' % label})
            continue
        price = price_of(ln['product'], products) or 0
        expect = round(ln['qty'] * price, 2)
        if ln.get('amount') is None:
            continue
        sum_written += ln['amount']
        if abs(expect - ln['amount']) > TOLERANCE:
            out.append({'code': 'line_math', 'line': i,
                        'text': '%g × $%.2f = $%.2f, but the note says $%.2f'
                                % (ln['qty'], price, expect, ln['amount'])})
    if note.get('total') is not None and lines and all(l.get('amount') is not None for l in lines):
        if abs(sum_written - note['total']) > TOLERANCE:
            out.append({'code': 'total_math',
                        'text': 'Lines add up to $%.2f, but the total written is $%.2f'
                                % (sum_written, note['total'])})
    return out


# ---------------------------------------------------------------- across notes
def set_warnings(notes):
    """Problems you only see across the whole month: the same note number twice, and
    numbers missing from the run (a note lost, or never photographed)."""
    out = {'duplicates': [], 'missing': []}
    seen = {}
    nums = []
    for n in notes:
        num = (n.get('data') or {}).get('number')
        if not num:
            continue
        seen.setdefault(num, []).append(n.get('id'))
        try:
            nums.append(int(num))
        except ValueError:
            pass
    out['duplicates'] = sorted([k for k, v in seen.items() if len(v) > 1], key=lambda x: int(x) if x.isdigit() else 0)
    if nums:
        lo, hi = min(nums), max(nums)
        have = set(nums)
        if hi - lo <= 400:      # a sane run; a misread "8" as "800" must not list 700 gaps
            out['missing'] = [str(x) for x in range(lo, hi + 1) if x not in have]
    return out


def build_statement(notes, config, customer_id, month):
    """The month as a grid: a row per calendar day, a column per product, quantities
    summed across every note that day, then totals, unit prices and amounts.

    Uses the price list, not the amounts written on paper — the written amounts are
    only there to catch misreads. A note with no date cannot be placed on a day, so it
    is reported and left out rather than guessed into one."""
    products = config.get('products') or []
    first, last = month_bounds(month)
    y, mo = int(month[:4]), int(month[5:7])
    ndays = calendar.monthrange(y, mo)[1]
    days = []
    for d in range(1, ndays + 1):
        iso = '%s-%02d' % (month, d)
        days.append({'date': iso, 'weekday': calendar.weekday(y, mo, d),
                     'qty': {p['id']: 0 for p in products}, 'notes': []})
    by_date = {d['date']: d for d in days}
    left_out = []
    for n in notes:
        data = n.get('data') or {}
        dt = data.get('date')
        if not dt or dt not in by_date:
            left_out.append({'id': n.get('id'), 'number': data.get('number') or '',
                             'reason': 'no date' if not dt else 'outside the month'})
            continue
        row = by_date[dt]
        if data.get('number'):
            row['notes'].append(data['number'])
        for ln in data.get('lines') or []:
            pid = ln.get('product')
            if pid in row['qty'] and ln.get('qty') is not None:
                row['qty'][pid] += ln['qty']
    totals = []
    grand = 0.0
    for p in products:
        q = sum(d['qty'][p['id']] for d in days)
        amt = round(q * float(p.get('price') or 0), 2)
        grand += amt
        totals.append({'product': p['id'], 'name': p['name'], 'qty': q,
                       'price': float(p.get('price') or 0), 'amount': amt})
    cust = next((c for c in config.get('customers') or [] if c.get('id') == customer_id), {})
    return {'customer': cust.get('name') or customer_id, 'supplier': config.get('supplier') or '',
            'month': month, 'products': [{'id': p['id'], 'name': p['name']} for p in products],
            'days': days, 'totals': totals, 'grand_total': round(grand, 2),
            'notes_used': sum(1 for n in notes if (n.get('data') or {}).get('date') in by_date),
            'left_out': left_out}


def folder_for(customer):
    """ImageKit folder for a customer's delivery notes. Derived on the server from the
    customer's own config, never from anything the browser sends."""
    slug = re.sub(r'[^a-z0-9]+', '-', fold((customer or {}).get('folder') or (customer or {}).get('id') or 'unknown')).strip('-')
    return '/mcq/invoices/' + (slug or 'unknown')
