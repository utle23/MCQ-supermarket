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

# a round = one scheduled check of every unit, at a set time
ROUNDS = [
    {'id': 'tr1', 'name': 'Morning',  'time': '08:00', 'type': 'fridge'},
    {'id': 'tr2', 'name': 'Midday',   'time': '12:30', 'type': 'fridge'},
    {'id': 'tr3', 'name': 'Evening',  'time': '17:30', 'type': 'coolroom'},
]

# an item = a unit whose temperature is written down
ITEMS = [
    {'id': 'ti1', 'name': 'Beef Display'},
    {'id': 'ti2', 'name': 'Chicken Display'},
    {'id': 'ti3', 'name': 'Pork Display'},
]

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
        'title': TITLE,
        'rounds': copy.deepcopy(ROUNDS),
        'items': copy.deepcopy(ITEMS),
        'updatedAt': '',
        'updatedBy': 'seed',
    }
