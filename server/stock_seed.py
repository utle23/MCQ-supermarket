"""Default STOCK LIST — transcribed from the printed Stock_List_Landscape sheet
(33 categories / 256 items, in the order and grouping the stores already use).

Seeded into the `stock_list` setting the first time the page is opened. After that
the live document in the database is the source of truth and this file is only a
fallback / "restore the original sheet" source, so editing it does not disturb a
list the stores have already changed.

tone: veg (green band) | fruit (orange band) | other (grey band) — the colours on
the paper form.
"""

CATEGORIES = [
  {
    "id": "sc01",
    "name": "OTHER",
    "tone": "veg",
    "items": [
      {
        "id": "si001",
        "name": "Broccolini"
      },
      {
        "id": "si002",
        "name": "Asparagus"
      },
      {
        "id": "si003",
        "name": "Beetroot"
      },
      {
        "id": "si004",
        "name": "Parsnip"
      },
      {
        "id": "si005",
        "name": "Turnip"
      },
      {
        "id": "si006",
        "name": "Swede"
      },
      {
        "id": "si007",
        "name": "Red Salad Onion"
      },
      {
        "id": "si008",
        "name": "Yellow Squash"
      },
      {
        "id": "si009",
        "name": "Baby Zucchini"
      },
      {
        "id": "si010",
        "name": "Brussels Sprout"
      },
      {
        "id": "si011",
        "name": "Kohlrabi"
      },
      {
        "id": "si012",
        "name": "Baby Corn"
      },
      {
        "id": "si013",
        "name": "Basil"
      },
      {
        "id": "si014",
        "name": "Dill"
      },
      {
        "id": "si015",
        "name": "Garlic Shoot"
      },
      {
        "id": "si016",
        "name": "Lemongrass"
      },
      {
        "id": "si017",
        "name": "Turmeric"
      },
      {
        "id": "si018",
        "name": "Galangal"
      },
      {
        "id": "si019",
        "name": "Red Salad Mix"
      },
      {
        "id": "si020",
        "name": "Baby Carrot"
      }
    ]
  },
  {
    "id": "sc02",
    "name": "VEGIES",
    "tone": "veg",
    "items": [
      {
        "id": "si021",
        "name": "Broccoli Ice"
      },
      {
        "id": "si022",
        "name": "Cabbage"
      },
      {
        "id": "si023",
        "name": "Cabbage Chinese"
      },
      {
        "id": "si024",
        "name": "Cabbage Red"
      },
      {
        "id": "si025",
        "name": "Cabbage Savoy"
      },
      {
        "id": "si026",
        "name": "Cauliflower"
      },
      {
        "id": "si027",
        "name": "Celery"
      },
      {
        "id": "si028",
        "name": "Lettuce COS"
      },
      {
        "id": "si029",
        "name": "Lettuce Festival Green"
      },
      {
        "id": "si030",
        "name": "Lettuce Festival Red"
      },
      {
        "id": "si031",
        "name": "Lettuce Iceberg"
      },
      {
        "id": "si032",
        "name": "English Spinach"
      },
      {
        "id": "si033",
        "name": "Spring Onion"
      },
      {
        "id": "si034",
        "name": "Kale"
      },
      {
        "id": "si035",
        "name": "Silver Beet"
      },
      {
        "id": "si036",
        "name": "Leeks"
      },
      {
        "id": "si037",
        "name": "Parsley"
      },
      {
        "id": "si038",
        "name": "Italian Parsley"
      },
      {
        "id": "si039",
        "name": "Cauli Blossom"
      }
    ]
  },
  {
    "id": "sc03",
    "name": "CHILLI & CAPS & PAPRIKA",
    "tone": "veg",
    "items": [
      {
        "id": "si040",
        "name": "Capsicum Green 8kg / 10kg"
      },
      {
        "id": "si041",
        "name": "Capsicum Orange"
      },
      {
        "id": "si042",
        "name": "Capsicum Red 8kg / 10kg"
      },
      {
        "id": "si043",
        "name": "Capsicum Red NZ"
      },
      {
        "id": "si044",
        "name": "Capsicum Yellow"
      },
      {
        "id": "si045",
        "name": "Capsicum Yellow NZ"
      },
      {
        "id": "si046",
        "name": "Chilli Green 6kg / ___kg"
      },
      {
        "id": "si047",
        "name": "Chilli Hot 1kg / 0.5kg (Bag)"
      },
      {
        "id": "si048",
        "name": "Chilli Red ___kg"
      },
      {
        "id": "si049",
        "name": "Paprika Green"
      },
      {
        "id": "si050",
        "name": "Paprika Red"
      },
      {
        "id": "si051",
        "name": "Paprika Yellow"
      }
    ]
  },
  {
    "id": "sc04",
    "name": "BEANS & PEAS",
    "tone": "veg",
    "items": [
      {
        "id": "si052",
        "name": "Bean Flat"
      },
      {
        "id": "si053",
        "name": "Bean Snake"
      },
      {
        "id": "si054",
        "name": "Bean Stringless"
      },
      {
        "id": "si055",
        "name": "Pea Snow Local"
      },
      {
        "id": "si056",
        "name": "Pea Snow China"
      },
      {
        "id": "si057",
        "name": "Sugar Snap Local"
      },
      {
        "id": "si058",
        "name": "Sugar Snap China"
      }
    ]
  },
  {
    "id": "sc05",
    "name": "CUCUMBER & ZUCCHINI",
    "tone": "veg",
    "items": [
      {
        "id": "si059",
        "name": "Cucumber Burpless"
      },
      {
        "id": "si060",
        "name": "Cucumber Lebanese No.1"
      },
      {
        "id": "si061",
        "name": "Cucumber Lebanese CTN"
      },
      {
        "id": "si062",
        "name": "Cucumber Pickle"
      },
      {
        "id": "si063",
        "name": "Zucchini"
      }
    ]
  },
  {
    "id": "sc06",
    "name": "CARROT & RADISH",
    "tone": "veg",
    "items": [
      {
        "id": "si064",
        "name": "Carrot 1kg"
      },
      {
        "id": "si065",
        "name": "Carrot No.1"
      },
      {
        "id": "si066",
        "name": "Sweet Corn"
      },
      {
        "id": "si067",
        "name": "Carrot 15kg"
      }
    ]
  },
  {
    "id": "sc07",
    "name": "ASIAN VEGIES",
    "tone": "veg",
    "items": [
      {
        "id": "si068",
        "name": "Choko"
      },
      {
        "id": "si069",
        "name": "Eggplant"
      },
      {
        "id": "si070",
        "name": "Eggplant Baby"
      },
      {
        "id": "si071",
        "name": "Eggplant Purple"
      },
      {
        "id": "si072",
        "name": "Melon Bitter SML / BIG"
      },
      {
        "id": "si073",
        "name": "Okra 10kg (L) / 4kg (S)"
      },
      {
        "id": "si074",
        "name": "Taro CTN"
      },
      {
        "id": "si075",
        "name": "Lotus Root"
      },
      {
        "id": "si076",
        "name": "Pawpaw Green"
      },
      {
        "id": "si077",
        "name": "Green Mango"
      },
      {
        "id": "si078",
        "name": "Thai Eggplant (cà pháo)"
      },
      {
        "id": "si079",
        "name": "Luffa / Sinqua (mướp khía)"
      }
    ]
  },
  {
    "id": "sc08",
    "name": "GINGER & GARLIC",
    "tone": "veg",
    "items": [
      {
        "id": "si080",
        "name": "Ginger Old CTN"
      },
      {
        "id": "si081",
        "name": "Ginger Young CTN"
      },
      {
        "id": "si082",
        "name": "Garlic Peeled 5kg CTN"
      }
    ]
  },
  {
    "id": "sc09",
    "name": "LEMON & LIME",
    "tone": "fruit",
    "items": [
      {
        "id": "si083",
        "name": "Lemon No.1"
      },
      {
        "id": "si084",
        "name": "Lime No.1"
      },
      {
        "id": "si085",
        "name": "Lemon Pack"
      }
    ]
  },
  {
    "id": "sc10",
    "name": "MIX LEAVES",
    "tone": "veg",
    "items": [
      {
        "id": "si086",
        "name": "Baby Spinach (200g)"
      },
      {
        "id": "si087",
        "name": "Mixed Lettuce (200g)"
      },
      {
        "id": "si088",
        "name": "Rocket (200g)"
      },
      {
        "id": "si089",
        "name": "Baby Spinach (1kg ctn)"
      },
      {
        "id": "si090",
        "name": "Mixed Lettuce (1kg ctn)"
      },
      {
        "id": "si091",
        "name": "Rocket (1kg ctn)"
      }
    ]
  },
  {
    "id": "sc11",
    "name": "ASIAN GREENS",
    "tone": "veg",
    "items": [
      {
        "id": "si092",
        "name": "Choy Sum (L)"
      },
      {
        "id": "si093",
        "name": "Kailan"
      },
      {
        "id": "si094",
        "name": "Choy Sum (S)"
      },
      {
        "id": "si095",
        "name": "Kai Choy"
      },
      {
        "id": "si096",
        "name": "Pak Choy"
      },
      {
        "id": "si097",
        "name": "Tat Choy"
      },
      {
        "id": "si098",
        "name": "Bok Choy"
      },
      {
        "id": "si099",
        "name": "Water Spinach (kg)"
      }
    ]
  },
  {
    "id": "sc12",
    "name": "APPLE",
    "tone": "fruit",
    "items": [
      {
        "id": "si100",
        "name": "Granny Smith No.1"
      },
      {
        "id": "si101",
        "name": "Pink Lady No.1"
      },
      {
        "id": "si102",
        "name": "Royal Gala No.1"
      },
      {
        "id": "si103",
        "name": "Sundowner No.1"
      },
      {
        "id": "si104",
        "name": "Fuji No.1"
      },
      {
        "id": "si105",
        "name": "Hi Early No.1"
      },
      {
        "id": "si106",
        "name": "Kanzi"
      },
      {
        "id": "si107",
        "name": "Bravo"
      },
      {
        "id": "si108",
        "name": "Dazzle"
      },
      {
        "id": "si109",
        "name": "Missile"
      },
      {
        "id": "si110",
        "name": "Sassy"
      }
    ]
  },
  {
    "id": "sc13",
    "name": "BERRIES & CHERRIES",
    "tone": "fruit",
    "items": [
      {
        "id": "si111",
        "name": "Strawberry 250g L"
      },
      {
        "id": "si112",
        "name": "Strawberry 250g XL"
      },
      {
        "id": "si113",
        "name": "Strawberry 500g L"
      },
      {
        "id": "si114",
        "name": "Strawberry 500g XL"
      },
      {
        "id": "si115",
        "name": "Blueberries Tray"
      },
      {
        "id": "si116",
        "name": "Raspberries Tray"
      },
      {
        "id": "si117",
        "name": "Cherry No.1"
      }
    ]
  },
  {
    "id": "sc14",
    "name": "GRAPES & KIWI",
    "tone": "fruit",
    "items": [
      {
        "id": "si118",
        "name": "Grape Autumn Crisp"
      },
      {
        "id": "si119",
        "name": "Grape Crimson"
      },
      {
        "id": "si120",
        "name": "Grape Red Globe"
      },
      {
        "id": "si121",
        "name": "Grape White Seedless"
      },
      {
        "id": "si122",
        "name": "Grape Black"
      },
      {
        "id": "si123",
        "name": "Kiwi"
      },
      {
        "id": "si124",
        "name": "Kiwi Gold"
      }
    ]
  },
  {
    "id": "sc15",
    "name": "DATES, LONGAN & LYCHEE",
    "tone": "fruit",
    "items": [
      {
        "id": "si125",
        "name": "Date 900g"
      },
      {
        "id": "si126",
        "name": "Date 200g"
      },
      {
        "id": "si127",
        "name": "Longan"
      },
      {
        "id": "si128",
        "name": "Lychee"
      }
    ]
  },
  {
    "id": "sc16",
    "name": "PEARS",
    "tone": "fruit",
    "items": [
      {
        "id": "si129",
        "name": "Bartlett"
      },
      {
        "id": "si130",
        "name": "Bosc"
      },
      {
        "id": "si131",
        "name": "Cocktail"
      },
      {
        "id": "si132",
        "name": "Corella"
      },
      {
        "id": "si133",
        "name": "Gold Rush"
      },
      {
        "id": "si134",
        "name": "Josephine"
      },
      {
        "id": "si135",
        "name": "Korean"
      },
      {
        "id": "si136",
        "name": "Nashi 10kg"
      },
      {
        "id": "si137",
        "name": "Nashi 5kg"
      },
      {
        "id": "si138",
        "name": "Packham"
      },
      {
        "id": "si139",
        "name": "Red"
      },
      {
        "id": "si140",
        "name": "Sand 10kg"
      },
      {
        "id": "si141",
        "name": "Singo"
      },
      {
        "id": "si142",
        "name": "Yarly"
      }
    ]
  },
  {
    "id": "sc17",
    "name": "MUSHROOM",
    "tone": "veg",
    "items": [
      {
        "id": "si143",
        "name": "Button No.1"
      },
      {
        "id": "si144",
        "name": "Enoki"
      },
      {
        "id": "si145",
        "name": "King Oyster"
      },
      {
        "id": "si146",
        "name": "Baby King Oyster"
      },
      {
        "id": "si147",
        "name": "Shimeji"
      },
      {
        "id": "si148",
        "name": "Shiitake"
      },
      {
        "id": "si149",
        "name": "Mixed Gourmet"
      },
      {
        "id": "si150",
        "name": "Baby Oyster"
      },
      {
        "id": "si151",
        "name": "Swiss Brown"
      },
      {
        "id": "si152",
        "name": "Portobello"
      },
      {
        "id": "si153",
        "name": "Field"
      },
      {
        "id": "si154",
        "name": "Blue Oyster"
      },
      {
        "id": "si155",
        "name": "Beech Mushroom 300g"
      }
    ]
  },
  {
    "id": "sc18",
    "name": "STONE FRUIT",
    "tone": "fruit",
    "items": [
      {
        "id": "si156",
        "name": "Nectarine White"
      },
      {
        "id": "si157",
        "name": "Nectarine Yellow"
      },
      {
        "id": "si158",
        "name": "Apricot"
      },
      {
        "id": "si159",
        "name": "Peach White"
      },
      {
        "id": "si160",
        "name": "Peach Yellow"
      },
      {
        "id": "si161",
        "name": "Donut Peach"
      },
      {
        "id": "si162",
        "name": "Plum Angelino"
      },
      {
        "id": "si163",
        "name": "Plum Black Kat"
      },
      {
        "id": "si164",
        "name": "Plum Flavour Fall"
      },
      {
        "id": "si165",
        "name": "Plum October Sun"
      },
      {
        "id": "si166",
        "name": "Plum Queen Garnet"
      },
      {
        "id": "si167",
        "name": "Plum September Candy"
      },
      {
        "id": "si168",
        "name": "Plum Teagan Blue"
      },
      {
        "id": "si169",
        "name": "Prune"
      }
    ]
  },
  {
    "id": "sc19",
    "name": "OTHER",
    "tone": "other",
    "items": [
      {
        "id": "si170",
        "name": "Carry Bag S CTN"
      },
      {
        "id": "si171",
        "name": "Carry Bag M CTN"
      },
      {
        "id": "si172",
        "name": "Carry Bag L CTN"
      },
      {
        "id": "si173",
        "name": "Cling Wrap CTN"
      },
      {
        "id": "si174",
        "name": "Roll Bag CTN"
      },
      {
        "id": "si175",
        "name": "Gas 15kg"
      }
    ]
  },
  {
    "id": "sc20",
    "name": "BANANA & AVOCADO",
    "tone": "fruit",
    "items": [
      {
        "id": "si176",
        "name": "Banana 13kg / 15kg"
      },
      {
        "id": "si177",
        "name": "Banana Bag / Carnarvon"
      },
      {
        "id": "si178",
        "name": "Lady Finger 8kg / 12kg"
      },
      {
        "id": "si179",
        "name": "Banana Ducasse"
      },
      {
        "id": "si180",
        "name": "Avocado No.1 Tray"
      },
      {
        "id": "si181",
        "name": "Avocado Bulk Sp"
      },
      {
        "id": "si182",
        "name": "Mangosteen"
      },
      {
        "id": "si183",
        "name": "Custard Apple"
      }
    ]
  },
  {
    "id": "sc21",
    "name": "MANGO",
    "tone": "fruit",
    "items": [
      {
        "id": "si184",
        "name": "Calypso"
      },
      {
        "id": "si185",
        "name": "Kensington No.1"
      },
      {
        "id": "si186",
        "name": "R2E2 No.1"
      }
    ]
  },
  {
    "id": "sc22",
    "name": "CITRUS",
    "tone": "fruit",
    "items": [
      {
        "id": "si187",
        "name": "Mandarin Afourer"
      },
      {
        "id": "si188",
        "name": "Mandarin Clementine"
      },
      {
        "id": "si189",
        "name": "Mandarin Honey Murcott"
      },
      {
        "id": "si190",
        "name": "Mandarin Imperial"
      },
      {
        "id": "si191",
        "name": "Mandarin Gold Nugget"
      },
      {
        "id": "si192",
        "name": "Orange Navel No.1 (13kg / 18kg)"
      },
      {
        "id": "si193",
        "name": "Orange Navel 15kg"
      },
      {
        "id": "si194",
        "name": "Orange Navel Sp"
      },
      {
        "id": "si195",
        "name": "Orange Cara No.1 15kg"
      },
      {
        "id": "si196",
        "name": "Orange Navel 3kg x 6 Bag"
      },
      {
        "id": "si197",
        "name": "Orange Valencia 3kg x 6 Bag"
      },
      {
        "id": "si198",
        "name": "Pomelo CTN"
      },
      {
        "id": "si199",
        "name": "Tangelo"
      },
      {
        "id": "si200",
        "name": "Grapefruit Red BIG / SML"
      }
    ]
  },
  {
    "id": "sc23",
    "name": "PINEAPPLE & PAPAYA",
    "tone": "fruit",
    "items": [
      {
        "id": "si201",
        "name": "Pineapple No.1"
      },
      {
        "id": "si202",
        "name": "Sugar Pineapple No.1"
      },
      {
        "id": "si203",
        "name": "Sugar Pineapple Sp"
      },
      {
        "id": "si204",
        "name": "Papaya"
      }
    ]
  },
  {
    "id": "sc24",
    "name": "MELON",
    "tone": "fruit",
    "items": [
      {
        "id": "si205",
        "name": "Honey Dew White"
      },
      {
        "id": "si206",
        "name": "Honey Gold Melon"
      },
      {
        "id": "si207",
        "name": "Rockmelon"
      },
      {
        "id": "si208",
        "name": "Hami Melon"
      }
    ]
  },
  {
    "id": "sc25",
    "name": "ONION",
    "tone": "veg",
    "items": [
      {
        "id": "si209",
        "name": "Brown 2kg (200 Bag)"
      },
      {
        "id": "si210",
        "name": "Brown 2kg Bag"
      },
      {
        "id": "si211",
        "name": "Brown No.1 (20kg) Bag"
      },
      {
        "id": "si212",
        "name": "Brown No.2 (20kg) Bag"
      },
      {
        "id": "si213",
        "name": "Red 10kg (Bag)"
      },
      {
        "id": "si214",
        "name": "Red 2kg (Bag)"
      },
      {
        "id": "si215",
        "name": "White Onion (Bag)"
      },
      {
        "id": "si216",
        "name": "Shallot"
      }
    ]
  },
  {
    "id": "sc26",
    "name": "GARLIC",
    "tone": "veg",
    "items": [
      {
        "id": "si217",
        "name": "Garlic Import"
      },
      {
        "id": "si218",
        "name": "Garlic Bag"
      },
      {
        "id": "si219",
        "name": "Garlic Local"
      }
    ]
  },
  {
    "id": "sc27",
    "name": "COCONUT",
    "tone": "fruit",
    "items": [
      {
        "id": "si220",
        "name": "Dry Coconut"
      }
    ]
  },
  {
    "id": "sc28",
    "name": "WATERMELON",
    "tone": "fruit",
    "items": [
      {
        "id": "si221",
        "name": "Watermelon Mini"
      },
      {
        "id": "si222",
        "name": "Watermelon Seed M BIN (kg)"
      },
      {
        "id": "si223",
        "name": "Watermelon Seed L BIN (kg)"
      },
      {
        "id": "si224",
        "name": "Watermelon Seed XL BIN (kg)"
      }
    ]
  },
  {
    "id": "sc29",
    "name": "POTATO & SWEET POTATO",
    "tone": "veg",
    "items": [
      {
        "id": "si225",
        "name": "Potato Red 4kg"
      },
      {
        "id": "si226",
        "name": "Potato White 4kg"
      },
      {
        "id": "si227",
        "name": "Potato Royal Blue 4kg"
      },
      {
        "id": "si228",
        "name": "Potato White 15kg"
      },
      {
        "id": "si229",
        "name": "Potato Red 15kg"
      },
      {
        "id": "si230",
        "name": "Potato Royal Blue 15kg"
      },
      {
        "id": "si231",
        "name": "Sweet Potato Purple (CTN)"
      },
      {
        "id": "si232",
        "name": "Sweet Potato Red (CTN)"
      },
      {
        "id": "si233",
        "name": "Sweet Potato White (CTN)"
      }
    ]
  },
  {
    "id": "sc30",
    "name": "PUMPKIN",
    "tone": "veg",
    "items": [
      {
        "id": "si234",
        "name": "Butternut (unit)"
      },
      {
        "id": "si235",
        "name": "Butternut BIN (kg)"
      },
      {
        "id": "si236",
        "name": "Grey BIN (kg)"
      },
      {
        "id": "si237",
        "name": "Japanese BIN (kg)"
      }
    ]
  },
  {
    "id": "sc31",
    "name": "YAM & ASIAN MELON",
    "tone": "veg",
    "items": [
      {
        "id": "si238",
        "name": "Purple Yam"
      },
      {
        "id": "si239",
        "name": "Yam Bean"
      },
      {
        "id": "si240",
        "name": "Melon Chinese"
      },
      {
        "id": "si241",
        "name": "Melon Winter"
      }
    ]
  },
  {
    "id": "sc32",
    "name": "TOMATO",
    "tone": "veg",
    "items": [
      {
        "id": "si242",
        "name": "Tomato No.1"
      },
      {
        "id": "si243",
        "name": "Roma No.1"
      },
      {
        "id": "si244",
        "name": "Cherry Tomato 200g"
      },
      {
        "id": "si245",
        "name": "Cherry Grape 200g"
      },
      {
        "id": "si246",
        "name": "Truss Tomato CTN"
      },
      {
        "id": "si247",
        "name": "Heirloom"
      }
    ]
  },
  {
    "id": "sc33",
    "name": "EGGS (in CTN only please)",
    "tone": "other",
    "items": [
      {
        "id": "si248",
        "name": "Egg 600g 15DOZ"
      },
      {
        "id": "si249",
        "name": "Egg 700g 15DOZ"
      },
      {
        "id": "si250",
        "name": "Egg 800g 15DOZ"
      },
      {
        "id": "si251",
        "name": "Egg 840g 15DOZ"
      },
      {
        "id": "si252",
        "name": "Free Range 600g 15DOZ"
      },
      {
        "id": "si253",
        "name": "Free Range 700g 15DOZ"
      },
      {
        "id": "si254",
        "name": "Free Range 800g 15DOZ"
      },
      {
        "id": "si255",
        "name": "Free Range 900g 18PKT x 9EA"
      },
      {
        "id": "si256",
        "name": "Free Range 1.5kg 30PKT x 6EA"
      }
    ]
  }
]


def default_doc():
    """A fresh document, deep-copied so a caller can never mutate the seed."""
    import copy
    return {
        'rev': 1,
        'categories': copy.deepcopy(CATEGORIES),
        'updatedAt': '',
        'updatedBy': 'seed',
    }
