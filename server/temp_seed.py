"""Default TEMPERATURE CHECK sheet — the butcher display check every store runs.

One company-wide document (every store sees and prints the same sheet); each
store records its OWN readings per day, so two stores checking at the same time
never overwrite each other.

Seeded into the `temp_check` setting the first time the page is opened. After
that the live document in the database is the source of truth and this file is
only a fallback / "restore the original sheet" source, so editing it here does
not disturb a sheet the stores have already changed.

type picks the safe range the reading is judged against, and matches the ranges
the Checklist module already uses:
    fridge   <= 5 C
    coolroom <= 5 C
    freezer  -25 C to -15 C
"""

TITLE = 'BUTCHER — TEMPERATURE CHECK'

# bumped whenever the seeded units change, so a sheet nobody has edited yet is
# brought up to date instead of being left on the old list
SEED_VERSION = 5

# ---------------------------------------------------------------- sheets
# One sheet per department. Each has its own check times and its own lines, and
# each prints as the record the team fills in: time down the side, the units
# across the top, a column for the product actually probed and one for staff.
#
# A round = one scheduled check of every line, at a set time.
# An item = one line to write a reading on. The sheet does NOT dictate the
# product: whoever does the round writes in what they probed that day.
SHEETS = [
    {
        'id': 'sh_butcher', 'name': 'Butcher',
        'title': 'BUTCHER \u2014 TEMPERATURE CHECK',
        'rounds': [
            {'id': 'tr1', 'name': 'Morning', 'time': '08:00', 'type': 'fridge'},
            {'id': 'tr2', 'name': 'Midday',  'time': '12:30', 'type': 'fridge'},
            {'id': 'tr3', 'name': 'Evening', 'time': '17:30', 'type': 'coolroom'},
        ],
        'items': [
            {'id': 'ti1', 'name': 'Beef Display \u2014 Sample 1'},
            {'id': 'ti2', 'name': 'Beef Display \u2014 Sample 2'},
            {'id': 'ti3', 'name': 'Chicken Display \u2014 Sample 1'},
            {'id': 'ti4', 'name': 'Chicken Display \u2014 Sample 2'},
            {'id': 'ti5', 'name': 'Pork Display \u2014 Sample 1'},
            {'id': 'ti6', 'name': 'Pork Display \u2014 Sample 2'},
            {'id': 'ti7', 'name': 'Cool Room \u2014 Room temperature'},
        ],
    },
    {
        # the chilled lines of the dairy cold room, off the area plan on its door.
        # The dry/preserved goods kept in there (dried tofu, dried fish, tamarind)
        # are not temperature-critical, so they are not on the sheet.
        'id': 'sh_dairy', 'name': 'Dairy',
        'title': 'DAIRY \u2014 TEMPERATURE CHECK',
        'rounds': [
            {'id': 'trd1', 'name': 'Morning',   'time': '08:00', 'type': 'fridge'},
            {'id': 'trd2', 'name': 'Afternoon', 'time': '16:00', 'type': 'fridge'},
        ],
        'items': [
            {'id': 'tid1', 'name': 'Dairy Fridge \u2014 Air temperature'},
            {'id': 'tid2', 'name': 'Fresh Milk'},
            {'id': 'tid3', 'name': 'Yoghurt'},
            {'id': 'tid4', 'name': 'Cheese'},
            {'id': 'tid5', 'name': 'Fresh Tofu'},
            {'id': 'tid6', 'name': 'Tofu Pack'},
            {'id': 'tid7', 'name': 'Kimchi'},
            {'id': 'tid8', 'name': 'Sausages'},
            {'id': 'tid9', 'name': 'Salted Duck Eggs'},
            {'id': 'tid10', 'name': 'Broken Eggs'},
            {'id': 'tid11', 'name': 'Mung Bean Cakes'},
        ],
    },
]

# the first sheet's shape, kept so an older single-sheet document can be folded in
TITLE = SHEETS[0]['title']
ROUNDS = SHEETS[0]['rounds']
ITEMS = SHEETS[0]['items']

# Every earlier version's unit list. A stored sheet still carrying exactly one of
# these has not been touched by anyone, so it is safe to bring up to date.
LEGACY_ITEM_NAMES = [
    ['Beef Display', 'Chicken Display', 'Pork Display'],
    ['Beef Display \u2014 Meat temperature', 'Beef Display \u2014 Fridge temperature',
     'Chicken Display \u2014 Meat temperature', 'Chicken Display \u2014 Fridge temperature',
     'Pork Display \u2014 Meat temperature', 'Pork Display \u2014 Fridge temperature',
     'Cool Room \u2014 Meat temperature', 'Cool Room \u2014 Room temperature'],
    ['Beef Display \u2014 Scotch Fillet', 'Beef Display \u2014 Beef Mince',
     'Chicken Display \u2014 Breast Fillet', 'Chicken Display \u2014 Chicken Wings',
     'Pork Display \u2014 Pork Belly', 'Pork Display \u2014 Pork Mince',
     'Cool Room \u2014 Room temperature'],
    [i['name'] for i in SHEETS[0]['items']],
]

# ---- Goods received log: what arrives at the back door and at what temperature ----
RECV_TITLE = 'BUTCHER \u2014 GOODS RECEIVED TEMPERATURE LOG'
RECV_CATEGORIES = [
    {'id': 'rc1', 'name': 'Pork meat',  'type': 'fridge',  'catalog': 'pork'},
    {'id': 'rc2', 'name': 'Beef meat',  'type': 'fridge',  'catalog': 'beef'},
    {'id': 'rc3', 'name': 'Chicken',    'type': 'fridge',  'catalog': 'chicken'},
    {'id': 'rc4', 'name': 'Pork FZ',    'type': 'freezer', 'catalog': 'pork'},
    {'id': 'rc5', 'name': 'Chicken FZ', 'type': 'freezer', 'catalog': 'chicken'},
    {'id': 'rc7', 'name': 'Offals',     'type': 'fridge',  'catalog': 'offals'},
]
QUALITIES = ['Good', 'Acceptable', 'Rejected']
# the categories the log shipped with before Beef FZ was dropped
LEGACY_RECV_NAMES = [
    ['Pork meat', 'Beef meat', 'Chicken', 'Pork FZ', 'Chicken FZ', 'Beef FZ', 'Offals'],
]
RECV_BLANK_ROWS = 3   # empty lines printed under each category for a paper form

RANGES = {
    'fridge':   {'label': 'Fridge',   'max': 5.0,  'text': '≤ 5 °C'},
    'coolroom': {'label': 'Cool room', 'max': 5.0, 'text': '≤ 5 °C'},
    'freezer':  {'label': 'Freezer',  'min': -25.0, 'max': -15.0, 'text': '-25 °C to -15 °C'},
}


def default_doc():
    """A fresh document, deep-copied so a caller can never mutate the seed."""
    import copy
    return {
        'rev': 1,
        'seed': SEED_VERSION,
        'title': TITLE,
        'sheets': copy.deepcopy(SHEETS),
        'rounds': copy.deepcopy(ROUNDS),   # mirror of the first sheet, for older clients
        'items': copy.deepcopy(ITEMS),
        'recvTitle': RECV_TITLE,
        'recvCategories': copy.deepcopy(RECV_CATEGORIES),
        'qualities': list(QUALITIES),
        'recvBlankRows': RECV_BLANK_ROWS,
        'updatedAt': '',
        'updatedBy': 'seed',
    }
