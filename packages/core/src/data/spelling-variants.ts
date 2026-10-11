/**
 * US spelling -> Commonwealth (AU/GB/NZ) spelling.
 * Explicit pairs only. Rule-based suffixes (-ize, -yze) are handled in code.
 * Words whose meaning differs by dialect (tire, check, program, meter, practice, license)
 * are left out on purpose.
 */
export const US_TO_UK_WORDS: Record<string, string> = {
  color: "colour", colors: "colours", colored: "coloured", coloring: "colouring", colorful: "colourful",
  flavor: "flavour", flavors: "flavours", flavored: "flavoured", flavorful: "flavourful",
  honor: "honour", honors: "honours", honored: "honoured", honorable: "honourable",
  humor: "humour", labor: "labour", labored: "laboured", labors: "labours",
  neighbor: "neighbour", neighbors: "neighbours", neighborhood: "neighbourhood", neighborhoods: "neighbourhoods",
  favor: "favour", favors: "favours", favored: "favoured", favorite: "favourite", favorites: "favourites",
  favorable: "favourable", behavior: "behaviour", behaviors: "behaviours", behavioral: "behavioural",
  harbor: "harbour", harbors: "harbours", rumor: "rumour", rumors: "rumours", savior: "saviour",
  vapor: "vapour", odor: "odour", odors: "odours", rigor: "rigour", valor: "valour", armor: "armour",
  endeavor: "endeavour", endeavors: "endeavours", parlor: "parlour", splendor: "splendour", vigor: "vigour",
  clamor: "clamour", tumor: "tumour", tumors: "tumours", demeanor: "demeanour", glamor: "glamour",
  center: "centre", centers: "centres", centered: "centred", theater: "theatre", theaters: "theatres",
  liter: "litre", liters: "litres", fiber: "fibre", fibers: "fibres", caliber: "calibre", somber: "sombre",
  luster: "lustre", saber: "sabre", specter: "spectre", meager: "meagre", sepulcher: "sepulchre",
  traveling: "travelling", traveled: "travelled", traveler: "traveller", travelers: "travellers",
  canceled: "cancelled", canceling: "cancelling", modeling: "modelling", modeled: "modelled",
  labeled: "labelled", labeling: "labelling", fueled: "fuelled", fueling: "fuelling",
  jeweler: "jeweller", jewelry: "jewellery", counselor: "counsellor", counseling: "counselling",
  signaled: "signalled", signaling: "signalling", leveled: "levelled", leveling: "levelling",
  marveled: "marvelled", marvelous: "marvellous", quarreled: "quarrelled", tunneled: "tunnelled",
  defense: "defence", offense: "offence", pretense: "pretence",
  catalog: "catalogue", catalogs: "catalogues", analog: "analogue", monolog: "monologue",
  gray: "grey", aluminum: "aluminium", mom: "mum", moms: "mums", pajamas: "pyjamas", plow: "plough",
  skeptical: "sceptical", skeptic: "sceptic", maneuver: "manoeuvre", maneuvers: "manoeuvres",
  pediatric: "paediatric", pediatrician: "paediatrician", anemia: "anaemia", anesthetic: "anaesthetic",
  encyclopedia: "encyclopaedia", esophagus: "oesophagus", estrogen: "oestrogen", fetus: "foetus",
  enroll: "enrol", enrollment: "enrolment", fulfill: "fulfil", fulfillment: "fulfilment",
  installment: "instalment", skillful: "skilful", willful: "wilful", mold: "mould", molding: "moulding",
  smolder: "smoulder", cozy: "cosy", airplane: "aeroplane", airplanes: "aeroplanes", omelet: "omelette",
  donut: "doughnut", donuts: "doughnuts", mustache: "moustache", ax: "axe",
  sulfur: "sulphur", yogurt: "yoghurt", kilometer: "kilometre", kilometers: "kilometres",
  centimeter: "centimetre", centimeters: "centimetres", millimeter: "millimetre", millimeters: "millimetres",
};

/** Words ending in -ize that are spelled the same everywhere. */
export const IZE_EXCEPTIONS = new Set([
  "size", "sizes", "sized", "sizing", "prize", "prizes", "prized", "seize", "seizes", "seized", "seizing",
  "capsize", "capsized", "maize", "baize", "resize", "resized", "resizing", "downsize", "downsized",
  "oversize", "oversized", "supersize", "outsize", "outsized", "upsize", "bite-size", "bite-sized",
]);

/** Commonwealth -> US map, derived. */
export const UK_TO_US_WORDS: Record<string, string> = Object.fromEntries(
  Object.entries(US_TO_UK_WORDS)
    .filter(([us, uk]) => us !== uk)
    .map(([us, uk]) => [uk, us]),
);
