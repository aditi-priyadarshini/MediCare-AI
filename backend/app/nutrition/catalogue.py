"""A small, plain-language collection of general meal ideas, and the word lists used to filter it.

This is educational reference data, not a clinical dataset: no portions, calories, nutrient
targets or health claims. Dietary tags are NOT hand-written per idea. They are derived from the
ingredient words by `WORD_TAGS`, so a diet or avoid-list filter can never disagree with the
ingredients it displays. Bump `CATALOGUE_VERSION` whenever ideas or word lists change.
"""

from dataclasses import dataclass

CATALOGUE_VERSION = "2026-11-demo-1"

SLOTS = ("breakfast", "lunch", "snack", "dinner")
_MAIN = ("lunch", "dinner")


def stem(word: str) -> str:
    """Crude singularisation applied to BOTH sides of every comparison ("peas" == "pea")."""
    w = word.strip().lower()
    if len(w) > 4 and w.endswith("ies"):
        return w[:-3] + "y"
    if len(w) > 4 and w.endswith("oes"):
        return w[:-2]
    if len(w) > 2 and w.endswith("s") and not w.endswith(("ss", "us")):
        return w[:-1]
    return w


def tokens(phrase: str) -> tuple[str, ...]:
    return tuple(stem(t) for t in phrase.replace("-", " ").split() if t)


# Stemmed ingredient word -> the dietary tags it implies. Over-tagging is the safe direction.
_RAW_WORD_TAGS: dict[str, set[str]] = {
    "dairy": {"dairy"},
    **dict.fromkeys(
        (
            "milk",
            "curd",
            "yogurt",
            "yoghurt",
            "dahi",
            "paneer",
            "ghee",
            "butter",
            "cheese",
            "cream",
            "buttermilk",
            "chaas",
        ),
        {"dairy"},
    ),
    "egg": {"egg"},
    "fish": {"fish"},
    **dict.fromkeys(("prawn", "shrimp", "crab", "lobster"), {"shellfish"}),
    "chicken": {"poultry"},
    **dict.fromkeys(("mutton", "lamb", "goat", "beef", "pork"), {"meat"}),
    **dict.fromkeys(("peanut", "groundnut"), {"peanut"}),
    **dict.fromkeys(("almond", "cashew", "walnut", "pistachio", "hazelnut"), {"tree_nut"}),
    **dict.fromkeys(
        (
            "wheat",
            "atta",
            "maida",
            "semolina",
            "suji",
            "rava",
            "oat",
            "bread",
            "barley",
            "roti",
            "chapati",
            "paratha",
        ),
        {"gluten"},
    ),
    **dict.fromkeys(("soy", "soya", "tofu"), {"soy"}),
    **dict.fromkeys(("sesame", "til"), {"sesame"}),
    "mustard": {"mustard"},
    "honey": {"honey"},
    **dict.fromkeys(("onion", "garlic", "shallot"), {"onion_garlic", "root_veg"}),
    **dict.fromkeys(
        ("potato", "carrot", "beetroot", "radish", "turnip", "ginger", "yam", "colocasia", "arbi"),
        {"root_veg"},
    ),
}
WORD_TAGS: dict[str, frozenset[str]] = {stem(k): frozenset(v) for k, v in _RAW_WORD_TAGS.items()}

# Words a patient may type that name a group rather than one ingredient.
GROUP_TERMS: dict[str, frozenset[str]] = {
    "dairy": frozenset({"dairy"}),
    "lactose": frozenset({"dairy"}),
    "nut": frozenset({"tree_nut", "peanut"}),
    "seafood": frozenset({"fish", "shellfish"}),
    "shellfish": frozenset({"shellfish"}),
    "meat": frozenset({"meat", "poultry"}),
    "poultry": frozenset({"poultry"}),
    "gluten": frozenset({"gluten"}),
    "treenut": frozenset({"tree_nut"}),
}

# Tags each diet rules out.
DIET_EXCLUDES: dict[str, frozenset[str]] = {
    "no_restriction": frozenset(),
    "vegetarian": frozenset({"meat", "poultry", "fish", "shellfish", "egg"}),
    "eggetarian": frozenset({"meat", "poultry", "fish", "shellfish"}),
    "pescatarian": frozenset({"meat", "poultry"}),
    "vegan": frozenset({"meat", "poultry", "fish", "shellfish", "egg", "dairy", "honey"}),
    "jain": frozenset(
        {"meat", "poultry", "fish", "shellfish", "egg", "honey", "onion_garlic", "root_veg"}
    ),
}


@dataclass(frozen=True)
class MealIdea:
    id: str
    name: str
    slots: tuple[str, ...]
    cuisines: tuple[str, ...]  # "general" = suits any regional preference
    ingredients: tuple[str, ...]
    description: str

    @property
    def tags(self) -> frozenset[str]:
        found: set[str] = set()
        for ingredient in self.ingredients:
            for tok in tokens(ingredient):
                found |= WORD_TAGS.get(tok, frozenset())
        return frozenset(found)

    @property
    def words(self) -> frozenset[str]:
        return frozenset(tok for ingredient in self.ingredients for tok in tokens(ingredient))


def _i(id, name, slots, cuisines, ingredients, description) -> MealIdea:
    return MealIdea(id, name, tuple(slots), tuple(cuisines), tuple(ingredients), description)


G, N, S, E, W = "general", "north_indian", "south_indian", "east_indian", "western_indian"

IDEAS: tuple[MealIdea, ...] = (
    # ------------------------------------------------------------------ breakfast
    _i(
        "b-poha",
        "Poha with peas and lemon",
        ["breakfast"],
        [G, W],
        ["flattened rice", "peas", "turmeric", "lemon", "curry leaves", "mustard seeds"],
        "Flattened rice lightly cooked with peas, turmeric and lemon.",
    ),
    _i(
        "b-upma",
        "Vegetable upma",
        ["breakfast"],
        [S, G],
        ["semolina", "beans", "peas", "curry leaves", "mustard seeds"],
        "Savoury semolina porridge with beans and peas.",
    ),
    _i(
        "b-idli",
        "Idli with tomato and lentil sambar",
        ["breakfast"],
        [S],
        ["rice", "urad dal", "toor dal", "tomato", "tamarind", "mustard seeds"],
        "Steamed rice and lentil cakes with a tangy lentil stew.",
    ),
    _i(
        "b-dosa",
        "Dosa with coconut chutney",
        ["breakfast"],
        [S],
        ["rice", "urad dal", "coconut", "green chilli"],
        "Thin fermented rice and lentil crepe with coconut chutney.",
    ),
    _i(
        "b-moong-chilla",
        "Moong dal chilla",
        ["breakfast"],
        [N, G],
        ["moong dal", "green chilli", "coriander"],
        "Savoury pancake made from soaked and ground split mung beans.",
    ),
    _i(
        "b-besan-chilla",
        "Besan chilla with mint chutney",
        ["breakfast"],
        [N, W],
        ["gram flour", "mint", "green chilli"],
        "Savoury gram flour pancake served with mint chutney.",
    ),
    _i(
        "b-paratha",
        "Spinach paratha with curd",
        ["breakfast"],
        [N],
        ["whole wheat flour", "spinach", "curd"],
        "Whole wheat flatbread with spinach, served with curd.",
    ),
    _i(
        "b-oats",
        "Oats porridge with banana and milk",
        ["breakfast"],
        [G],
        ["oats", "milk", "banana"],
        "Warm oats cooked in milk with sliced banana.",
    ),
    _i(
        "b-egg-bhurji",
        "Egg bhurji with toast",
        ["breakfast"],
        [G, N],
        ["egg", "tomato", "coriander", "wheat bread"],
        "Scrambled eggs with tomato and coriander, with wheat toast.",
    ),
    _i(
        "b-pakhala",
        "Pakhala with leafy greens stir-fry",
        ["breakfast", "lunch"],
        [E],
        ["rice", "spinach", "green chilli", "lemon"],
        "Water-soaked rice served with lightly stir-fried leafy greens.",
    ),
    _i(
        "b-chuda-dahi",
        "Chuda with curd and jaggery",
        ["breakfast"],
        [E],
        ["flattened rice", "curd", "jaggery"],
        "Flattened rice softened with curd and sweetened with jaggery.",
    ),
    _i(
        "b-fruit-bowl",
        "Fruit bowl with almonds and pumpkin seeds",
        ["breakfast"],
        [G],
        ["papaya", "apple", "banana", "almonds", "pumpkin seeds"],
        "Seasonal fruit with a few almonds and pumpkin seeds.",
    ),
    _i(
        "b-ragi",
        "Ragi porridge with banana",
        ["breakfast"],
        [S, G],
        ["ragi", "banana", "water"],
        "Finger millet porridge cooked in water with banana.",
    ),
    _i(
        "b-dhokla",
        "Khaman dhokla",
        ["breakfast"],
        [W],
        ["gram flour", "lemon", "mustard seeds", "green chilli"],
        "Steamed, savoury gram flour cake.",
    ),
    _i(
        "b-thepla",
        "Methi thepla with curd",
        ["breakfast"],
        [W],
        ["whole wheat flour", "fenugreek leaves", "curd"],
        "Spiced whole wheat flatbread with fenugreek leaves, with curd.",
    ),
    # ----------------------------------------------------------- lunch and dinner
    _i(
        "m-dal-rice",
        "Dal tadka with rice and cucumber",
        _MAIN,
        [G, N],
        ["toor dal", "rice", "cucumber", "tomato", "cumin", "ghee"],
        "Tempered lentils with steamed rice and sliced cucumber.",
    ),
    _i(
        "m-khichdi",
        "Moong dal khichdi with stir-fried beans",
        _MAIN,
        [G],
        ["moong dal", "rice", "beans", "spinach", "cumin"],
        "Soft rice and split mung bean porridge with stir-fried beans.",
    ),
    _i(
        "m-rajma",
        "Rajma with rice",
        _MAIN,
        [N],
        ["kidney beans", "rice", "tomato", "onion", "ginger"],
        "Kidney bean curry with steamed rice.",
    ),
    _i(
        "m-chana",
        "Chana masala with roti",
        _MAIN,
        [N],
        ["chickpeas", "tomato", "onion", "whole wheat roti"],
        "Spiced chickpea curry with whole wheat flatbread.",
    ),
    _i(
        "m-palak-paneer",
        "Palak paneer with roti",
        _MAIN,
        [N],
        ["spinach", "paneer", "tomato", "whole wheat roti"],
        "Spinach gravy with cottage cheese and whole wheat flatbread.",
    ),
    _i(
        "m-pulao",
        "Vegetable pulao with raita",
        _MAIN,
        [G, N],
        ["rice", "peas", "beans", "carrot", "curd", "cumin"],
        "Lightly spiced rice with vegetables and a curd side.",
    ),
    _i(
        "m-lemon-rice",
        "Lemon rice with peanuts and sambar",
        _MAIN,
        [S],
        ["rice", "lemon", "peanuts", "mustard seeds", "toor dal", "tomato"],
        "Tangy lemon rice with roasted peanuts and a lentil stew.",
    ),
    _i(
        "m-curd-rice",
        "Curd rice with cabbage thoran",
        _MAIN,
        [S],
        ["rice", "curd", "cabbage", "coconut", "mustard seeds"],
        "Cooling curd rice with a coconut and cabbage stir-fry.",
    ),
    _i(
        "m-rasam",
        "Rasam with rice and beans stir-fry",
        _MAIN,
        [S],
        ["tomato", "tamarind", "toor dal", "rice", "beans", "black pepper"],
        "Peppery tomato and tamarind soup with rice and stir-fried beans.",
    ),
    _i(
        "m-dalma",
        "Dalma with rice",
        _MAIN,
        [E],
        ["toor dal", "raw banana", "pumpkin", "brinjal", "rice", "cumin"],
        "Lentils cooked with vegetables, served with rice.",
    ),
    _i(
        "m-santula",
        "Santula with rice",
        _MAIN,
        [E],
        ["pumpkin", "beans", "brinjal", "raw papaya", "rice"],
        "Lightly cooked mixed vegetables served with rice.",
    ),
    _i(
        "m-machha-jhola",
        "Light fish curry with rice",
        _MAIN,
        [E, G],
        ["fish", "tomato", "ginger", "mustard seeds", "rice"],
        "Thin, lightly spiced fish curry with steamed rice.",
    ),
    _i(
        "m-egg-curry",
        "Egg curry with rice",
        _MAIN,
        [G],
        ["egg", "tomato", "onion", "rice"],
        "Boiled eggs in a tomato and onion gravy with rice.",
    ),
    _i(
        "m-chicken-roti",
        "Grilled chicken with vegetables and roti",
        _MAIN,
        [G],
        ["chicken", "beans", "capsicum", "whole wheat roti"],
        "Grilled chicken with sautéed vegetables and flatbread.",
    ),
    _i(
        "m-chicken-curry",
        "Chicken curry with rice and salad",
        _MAIN,
        [G, N],
        ["chicken", "onion", "tomato", "rice", "cucumber"],
        "Home-style chicken curry with steamed rice and a cucumber salad.",
    ),
    _i(
        "m-prawn",
        "Prawn masala with rice",
        _MAIN,
        [G, W],
        ["prawns", "tomato", "onion", "rice"],
        "Prawns cooked in a tomato and onion masala, with rice.",
    ),
    _i(
        "m-baked-fish",
        "Baked fish with steamed vegetables and rice",
        _MAIN,
        [G],
        ["fish", "beans", "cauliflower", "rice", "lemon"],
        "Oven-baked fish with steamed vegetables and rice.",
    ),
    _i(
        "m-mutton-stew",
        "Mutton stew with roti",
        _MAIN,
        [G, N],
        ["mutton", "carrot", "peas", "whole wheat roti"],
        "Slow-cooked mutton and vegetable stew with flatbread.",
    ),
    _i(
        "m-veg-stew",
        "Vegetable stew with appam",
        _MAIN,
        [S],
        ["beans", "peas", "cauliflower", "coconut", "rice"],
        "Mild coconut vegetable stew with rice and lentil pancakes.",
    ),
    _i(
        "m-lauki",
        "Bottle gourd sabzi with roti",
        _MAIN,
        [N, W, G],
        ["bottle gourd", "tomato", "peas", "whole wheat roti"],
        "Lightly spiced bottle gourd and peas with flatbread.",
    ),
    _i(
        "m-methi-dal",
        "Methi dal with bajra roti",
        _MAIN,
        [W],
        ["toor dal", "fenugreek leaves", "pearl millet"],
        "Lentils with fenugreek leaves, with pearl millet flatbread.",
    ),
    _i(
        "m-kadhi",
        "Gujarati kadhi with rice",
        _MAIN,
        [W],
        ["gram flour", "curd", "rice", "cumin"],
        "Mildly sweet and tangy curd and gram flour soup with rice.",
    ),
    _i(
        "m-tofu",
        "Tofu and vegetable stir-fry with rice",
        _MAIN,
        [G],
        ["tofu", "beans", "capsicum", "rice", "ginger"],
        "Tofu stir-fried with vegetables, served over rice.",
    ),
    _i(
        "m-sprouts",
        "Sprouted moong salad with chapati",
        _MAIN,
        [G],
        ["moong sprouts", "cucumber", "tomato", "lemon", "wheat chapati"],
        "Fresh sprouted mung bean salad with a chapati.",
    ),
    # ----------------------------------------------------------------------- snack
    _i("s-chana", "Roasted chana", ["snack"], [G], ["chickpeas"], "Dry roasted chickpeas."),
    _i(
        "s-fruit",
        "Seasonal fruit",
        ["snack"],
        [G],
        ["seasonal fruit"],
        "Whatever fruit is in season.",
    ),
    _i(
        "s-chaas",
        "Buttermilk (chaas)",
        ["snack"],
        [G, N, W],
        ["buttermilk", "cumin"],
        "Spiced buttermilk.",
    ),
    _i("s-makhana", "Roasted makhana", ["snack"], [G], ["fox nuts"], "Dry roasted fox nuts."),
    _i(
        "s-sprouts",
        "Sprouts chaat",
        ["snack"],
        [G],
        ["moong sprouts", "tomato", "lemon"],
        "Sprouted mung beans with tomato and lemon.",
    ),
    _i(
        "s-nuts",
        "A few almonds and walnuts",
        ["snack"],
        [G],
        ["almonds", "walnuts"],
        "A small handful of almonds and walnuts.",
    ),
    _i(
        "s-soup",
        "Vegetable soup",
        ["snack"],
        [G],
        ["tomato", "beans", "spinach"],
        "A light soup of tomato, beans and spinach.",
    ),
    _i("s-egg", "Boiled egg", ["snack"], [G], ["egg"], "One boiled egg."),
    _i(
        "s-coconut-water",
        "Coconut water",
        ["snack"],
        [S, E, G],
        ["coconut water"],
        "Fresh coconut water.",
    ),
    _i(
        "s-corn",
        "Steamed corn with lemon",
        ["snack"],
        [G],
        ["corn", "lemon"],
        "Steamed corn with a squeeze of lemon.",
    ),
    _i(
        "s-peanuts",
        "Roasted peanuts",
        ["snack"],
        [G],
        ["peanuts"],
        "A small handful of dry roasted peanuts.",
    ),
    _i(
        "s-murmura",
        "Puffed rice with cucumber and lemon",
        ["snack"],
        [E, G],
        ["puffed rice", "cucumber", "lemon"],
        "Light puffed rice tossed with cucumber and lemon.",
    ),
    _i(
        "s-curd-fruit",
        "Curd with fruit",
        ["snack"],
        [G],
        ["curd", "seasonal fruit"],
        "Plain curd with chopped fruit.",
    ),
)

# Every word we can recognise: a patient term outside this set cannot be checked.
KNOWN_WORDS: frozenset[str] = frozenset(
    set(WORD_TAGS) | {w for idea in IDEAS for w in idea.words} | {stem(k) for k in GROUP_TERMS}
)
