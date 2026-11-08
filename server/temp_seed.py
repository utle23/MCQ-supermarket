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
SEED_VERSION = 3

# a round = one scheduled check of every unit, at a set time
ROUNDS = [
    {'id': 'tr1', 'name': 'Morning',  'time': '08:00', 'type': 'fridge'},
    {'id': 'tr2', 'name': 'Midday',   'time': '12:30', 'type': 'fridge'},
    {'id': 'tr3', 'name': 'Evening',  'time': '17:30', 'type': 'coolroom'},
]

# an item = one line to write a reading on. Each counter is checked by probing TWO
# representative products rather than the cabinet's air, so the line names the
# counter and the sample taken. Sample names come from the meat order list.
ITEMS = [
    {'id': 'ti1', 'name': 'Beef Display \u2014 Scotch Fillet'},
    {'id': 'ti2', 'name': 'Beef Display \u2014 Beef Mince'},
    {'id': 'ti3', 'name': 'Chicken Display \u2014 Breast Fillet'},
    {'id': 'ti4', 'name': 'Chicken Display \u2014 Chicken Wings'},
    {'id': 'ti5', 'name': 'Pork Display \u2014 Pork Belly'},
    {'id': 'ti6', 'name': 'Pork Display \u2014 Pork Mince'},
    {'id': 'ti7', 'name': 'Cool Room \u2014 Room temperature'},
]

# Each earlier version's unit list. A stored sheet still carrying exactly one of
# these has not been touched by anyone, so it is safe to bring up to date.
LEGACY_ITEM_NAMES = [
    ['Beef Display', 'Chicken Display', 'Pork Display'],
    ['Beef Display \u2014 Meat temperature', 'Beef Display \u2014 Fridge temperature',
     'Chicken Display \u2014 Meat temperature', 'Chicken Display \u2014 Fridge temperature',
     'Pork Display \u2014 Meat temperature', 'Pork Display \u2014 Fridge temperature',
     'Cool Room \u2014 Meat temperature', 'Cool Room \u2014 Room temperature'],
]

# ---- Goods received log: what arrives at the back door and at what temperature ----
RECV_TITLE = 'BUTCHER \u2014 GOODS RECEIVED TEMPERATURE LOG'
RECV_CATEGORIES = [
    {'id': 'rc1', 'name': 'Pork meat',  'type': 'fridge',  'catalog': 'pork'},
    {'id': 'rc2', 'name': 'Beef meat',  'type': 'fridge',  'catalog': 'beef'},
    {'id': 'rc3', 'name': 'Chicken',    'type': 'fridge',  'catalog': 'chicken'},
    {'id': 'rc4', 'name': 'Pork FZ',    'type': 'freezer', 'catalog': 'pork'},
    {'id': 'rc5', 'name': 'Chicken FZ', 'type': 'freezer', 'catalog': 'chicken'},
    {'id': 'rc6', 'name': 'Beef FZ',    'type': 'freezer', 'catalog': 'beef'},
    {'id': 'rc7', 'name': 'Offals',     'type': 'fridge',  'catalog': 'offals'},
]
QUALITIES = ['Good', 'Acceptable', 'Rejected']
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
        'rounds': copy.deepcopy(ROUNDS),
        'items': copy.deepcopy(ITEMS),
        'recvTitle': RECV_TITLE,
        'recvCategories': copy.deepcopy(RECV_CATEGORIES),
        'qualities': list(QUALITIES),
        'recvBlankRows': RECV_BLANK_ROWS,
        'updatedAt': '',
        'updatedBy': 'seed',
    }
