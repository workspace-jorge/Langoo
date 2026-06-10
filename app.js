// ================================================================
// LANGOO — app.js
// ================================================================
// All application logic lives here. index.html contains only
// HTML structure and CSS. This file is loaded at the bottom of
// index.html via <script src="app.js"></script>.
//
// TABLE OF CONTENTS
// -----------------
// 1. CONFIG        — constants, prompt seeds, level instructions
// 2. STATE         — all variables that change while the app runs
// 3. LANGUAGES     — all 7 language definitions + UI strings
// 4. GENERATOR     — prompt builders, API calls, save to KV
// 5. RENDERER      — article display, vocab, questions, utilities
// 6. HISTORY       — browse tab: load, filter, paginate, open card
// 7. CORRECTION    — placeholder for the answer-checking feature
// 8. APP INIT      — startup sequence and all event listeners
// ================================================================




// ================================================================
// 1. CONFIG
// ================================================================
// Purpose: constants and prompt content that never change at runtime.
// If you need to update the worker URL, a prompt seed, or a level
// instruction, this is the only section you touch.
//
// What this section does NOT do:
// - It does not hold variables that change while the app runs (→ State)
// - It does not hold UI strings (→ Languages)
// ================================================================

const PROXY_URL = "https://autumn-rice-2cd2.jorgeworkspace-nascimento.workers.dev";
const MAX_CHARS = 6000;

// LEVEL_INSTRUCTIONS are injected verbatim into AI prompts.
// Each entry tells the model how to write at that CEFR level.
// They are strings rather than objects so they paste cleanly into
// a prompt template without serialisation.
const LEVEL_INSTRUCTIONS = {
  A1: "- Very simple sentences (subject+verb+object only).\n- Only most common 1000 words.\n- Max 8 words per sentence.\n- No subjunctive, no passive voice.",
  A2: "- Simple sentences with occasional subordinate clauses.\n- Basic vocabulary, no jargon.\n- Max 12 words per sentence.",
  B1: "- Clear sentences with subordinate clauses.\n- Everyday vocabulary with some terms explained in context.\n- Occasional passive voice.",
  B2: "- Journalistic style.\n- Varied vocabulary, technical terms used in context.\n- Normal use of passive and subordinate clauses.",
  C1: "- Elevated journalistic style.\n- Complex structures, rich vocabulary, reported speech.\n- Nominalisations and abstract concepts.",
  C2: "- Sophisticated literary-journalistic style.\n- Complex hypotaxis, rhetorical devices, near-native vocabulary."
};

// NEWS_SEEDS and READS_SEEDS are injected into prompts as the
// "Category:" line. Keys are the internal German category keys
// stored in KV — this is intentional (see KV schema contract in
// the master plan). Labels shown to users come from LANGUAGES.
const NEWS_SEEDS = {
  Politik:     "a current political story (election, law, protest, diplomatic dispute, corruption, policy debate, or political figure)",
  Wirtschaft:  "an economic story (startup, market shift, company news, strike, trade, bankruptcy, economic trend, or consumer behaviour)",
  Wissenschaft:"a scientific discovery or study (any field: biology, physics, medicine, archaeology, climate, materials, neuroscience, etc.)",
  Technologie: "a technology story (app, device, AI, robotics, digital policy, cybersecurity, biotech, or tech in everyday life)",
  Gesellschaft:"a social or cultural trend (generational change, community, urban life, family, work, identity, values, or social movement)",
  Kultur:      "a cultural story (music, film, literature, visual art, architecture, fashion, food culture, heritage, or cultural conflict)",
  Umwelt:      "an environmental or climate story (wildlife, pollution, energy, extreme weather, conservation, or environmental policy)",
  Gesundheit:  "a health or medical story (study, treatment, public health, mental health, nutrition, sport science, or medical technology)",
  Sport:       "a sports story (any sport — result, record, athlete, club, scandal, business, or a sport gaining or losing popularity)",
  Schule:      "an education story (schools, universities, teachers, students, curriculum, technology in education, or learning trends)",
  Lifestyle:   "a lifestyle or consumer trend (food, travel, fashion, home, relationships, leisure, money habits, or urban culture)",
  Kurioses:    "a quirky, unusual, or surprising real-world story that is mildly amusing or unexpected"
};

const READS_SEEDS = {
  Philosophie: "a philosophical idea, thinker, concept, thought experiment, or ethical dilemma from any tradition or era",
  Geschichte:  "a fascinating, surprising, or little-known historical event, figure, place, or cultural practice from any period or region",
  Gesellschaft:"a question about how modern societies work — social norms, institutions, inequality, community, or human behaviour at scale",
  Wissenschaft:"a scientific concept, discovery, or phenomenon — explained accessibly and chosen for its surprising or counterintuitive nature",
  Psychologie: "a psychological concept, cognitive bias, study, or insight about how human minds and behaviour actually work",
  Kunst:       "an art movement, artistic technique, specific work, creative figure, or the relationship between art and society",
  Mythologie:  "a myth, legend, folklore story, or mythological concept from any culture — and what it reveals about human nature or society"
};




// ================================================================
// 2. STATE
// ================================================================
// Purpose: every variable that changes while the app is running,
// in one place.
//
// Why a dedicated section: when something behaves unexpectedly,
// this is the first place to look. All mutable runtime values are
// visible at a glance, rather than scattered across the file.
//
// What this section does NOT do:
// - It does not initialise the UI (→ App Init)
// - It does not contain constants (→ Config)
// ================================================================

// --- Generator state ---
let selectedLevel    = "B2";   // active CEFR level button
let selectedCategory = null;   // active category key (internal German/English key)
let currentLang      = "de";   // active language code
let currentMode      = "news"; // active tab: news | reads | wiki | lit | custom

// --- Browse state ---
let currentSubMode     = "generate"; // generate | browse
let historyPage        = 0;          // zero-indexed page number sent to /history
let historyDone        = false;      // true when the worker says there are no more pages
let historyFilter      = null;       // active category filter key in browse (null = All)
let historyLevelFilter = null;       // active level filter in browse (null = All)

// --- Correction state ---
// Stores the current article's text and comprehension questions so the
// Correction section can read them without hunting through the DOM.
// Set every time an article is rendered, cleared on new generation.
let currentContext   = "";
let currentQuestions = [];

// --- Exercise state ---
// Tracks the user's progress through the stepped exercise flow:
// MCQ stage → Comprehension stage → Discussion stage.
//
// mcqResults stores per-question state rather than a simple boolean so
// that navigating back to a previous MCQ restores the answer and feedback.
// null = unanswered; { selected: "option text", correct: bool } = answered.
//
// currentExerciseStage starts as "mcq" for new articles (which have the
// multiple_choice field) and "comprehension" for old archived articles
// that predate the multiple choice feature.
let currentExerciseStage = "mcq";
let currentMCQIndex      = 0;
let mcqResults           = [null, null, null, null];
let currentMCQs          = []; // full multiple_choice array for the current article
let currentDiscussion    = []; // discussion questions for the current article

// savedComprehension persists the user's answers and any checked feedback
// across stage transitions. Captured on navigation away from comprehension,
// restored on navigation back. Reset with each new article so stale answers
// never bleed into a fresh article.
// feedback is null until the user hits "Check answers"; then { text, correct }.
let savedComprehension = [
  { answer: "", feedback: null },
  { answer: "", feedback: null },
  { answer: "", feedback: null },
  { answer: "", feedback: null },
];

// savedDiscussion mirrors savedComprehension for the discussion stage.
// Captured when navigating back to comprehension, restored on return.
// feedback is null until the user submits; then { level, feedback }.
let savedDiscussion = [
  { answer: "", feedback: null },
  { answer: "", feedback: null },
  { answer: "", feedback: null },
  { answer: "", feedback: null },
];

// --- Avoidance cache ---
// Stores titles of previously generated articles per lang+mode+category,
// so the prompt can instruct the AI to avoid repeating topics.
// Lives in State (not Generator) because it is shared mutable runtime
// data, even though only the Generator reads and writes it.
// Keyed as "lang::mode::category" to match the KV pattern.
const avoidCache = {};




// ================================================================
// 3. LANGUAGES
// ================================================================
// Purpose: all UI strings, category labels, and language metadata
// for all 7 supported languages.
//
// Design choice — everything in one object:
// Previously the browse sub-tab strings (generate/browse/filter
// labels) lived in a separate SUB_UI object. They are now folded
// into each language entry here. A language is fully self-contained:
// add a new language by adding one entry to LANGUAGES, nothing else.
//
// Design choice — internal category keys are German:
// newsCategories and readsCategories use German keys (e.g. "Politik",
// "Wirtschaft"). These match the keys stored in KV and used in
// NEWS_SEEDS/READS_SEEDS. The display labels are language-specific.
// Never change the keys — only the display values — unless you also
// run a KV migration script.
//
// What this section does NOT do:
// - It does not apply languages to the DOM (→ applyLanguage in Renderer)
// - It does not build the sidebar (→ buildSidebar in App Init)
// ================================================================

const LANGUAGES = {
  de: {
    name:"Deutsch", flag:"🇩🇪", targetLanguage:"German", htmlLang:"de",
    pageTitle:"Langum", sub:"Lesen. Entdecken. Lernen.",
    tabNews:"Nachrichten", tabReads:"Interessante Lektüre", tabWiki:"Wikipedia", tabLit:"Literatur", tabCustom:"Eigener Text",
    levelLabel:"Sprachniveau",
    topicLabelNews:"Thema", topicLabelReads:"Thema", topicLabelWiki:"Bereich", topicLabelLit:"Gattung",
    customLabel:"Text einfügen (max. 6000 Zeichen)",
    generateBtn:"Artikel generieren", fetchWikiBtn:"Wikipedia-Artikel abrufen", fetchLitBtn:"Text abrufen", analyzeBtn:"Text analysieren",
    hint:"Niveau und Thema wählen — jedes Mal ein neuer Artikel",
    hintReads:"Tiefgründige Themen — von Philosophie bis Wissenschaft",
    hintWiki:"Echter Wikipedia-Artikel nach Bereich", hintLit:"Klassische Literatur aus Project Gutenberg",
    hintCustom:"Füge einen beliebigen Text ein und erhalte Vokabeln und Fragen dazu",
    loading:"Redaktion arbeitet", loadingWiki:"Wikipedia wird abgerufen", loadingLit:"Gutenberg wird abgerufen",
    vocabHeader:"Vokabeln", byline:"KI-Redaktion · Tagesgeschehen",
    bylineReads:"KI-Redaktion · Interessante Lektüre", bylineWiki:"Wikipedia", bylineLit:"Project Gutenberg", bylineCustom:"Eigener Text",
    sourceNoticeWiki:"Authentischer Wikipedia-Artikel. Vokabeln und Fragen werden von der KI generiert.",
    sourceNoticeLit:"Klassischer Text aus Project Gutenberg (Public Domain). Vokabeln und Fragen werden von der KI generiert.",
    sourceLink:"Auf Wikipedia ansehen ↗", sourceLinkLit:"Auf Gutenberg ansehen ↗",
    comprehensionHeader:"Fragen zum Text", discussionHeader:"Diskussionsfragen",
    nextBtn:"Nächster Artikel →", nextBtnFetch:"Nächster Text →",
    randomBtn:"↻ Zufall", noCategory:"Bitte wähle zuerst ein Thema aus.", noText:"Bitte füge einen Text ein.",
    // Browse UI strings (formerly SUB_UI)
    browseGenerate:"Generieren", browseBrowse:"Archiv",
    browseEmpty:"Noch keine Artikel gespeichert.",
    browsePrev:"← Zurück", browseNext:"Mehr laden",
    browseFilterAll:"Alle", browseLevelLabel:"Sprachniveau", browseTopicLabel:"Thema",
    wikisub:"de",
    wikiCategories:{ "Philosophie":"Philosophie","Geschichte":"Geschichte","Wissenschaft":"Wissenschaft","Gesellschaft":"Gesellschaft","Kunst":"Kunst","Psychologie":"Psychologie","Geographie":"Geographie" },
    litGenres:{ "fiction":"Fiktion","poetry":"Gedichte","drama":"Drama","adventure":"Abenteuer","philosophy":"Philosophie" },
    newsCategories:{ Politik:"Politik",Wirtschaft:"Wirtschaft",Wissenschaft:"Wissenschaft",Technologie:"Technologie",Gesellschaft:"Gesellschaft",Kultur:"Kultur",Umwelt:"Umwelt",Gesundheit:"Gesundheit",Sport:"Sport",Schule:"Schule",Lifestyle:"Lifestyle",Kurioses:"Kurioses" },
    readsCategories:{ Philosophie:"Philosophie",Geschichte:"Geschichte & Kuriositäten",Gesellschaft:"Gesellschaft",Wissenschaft:"Wissenschaft",Psychologie:"Psychologie",Kunst:"Kunst & Architektur",Mythologie:"Mythologie" },
    btnBackMCQ:"← Multiple Choice", btnCheckAnswers:"✓ Antworten prüfen",
    btnDiscussion:"Diskussion →", btnBackComprehension:"← Verständnisfragen",
    btnSkipMCQ:"Zu den Verständnisfragen", btnComprehension:"Verständnisfragen →",
    mcqCorrect:"✓ Richtig! 🎉", mcqIncorrect:"✗ Die richtige Antwort ist: ",
    discussionSoon:"Bewertete Diskussionsantworten — demnächst verfügbar.",
    errorNoAnswer:"Bitte schreibe mindestens eine Antwort.",
    errorCheckFailed:"Antworten konnten nicht geprüft werden: ",
    discussionLevel1:"⚙️ Ausbaufähig", discussionLevel2:"👍 Solide",
    discussionLevel3:"💪 Stark", discussionLevel4:"💡 Interessant!"
  },
  en: {
    name:"English", flag:"🇬🇧", targetLanguage:"English", htmlLang:"en",
    pageTitle:"Langum", sub:"Read. Discover. Learn.",
    tabNews:"Daily News", tabReads:"Interesting Reads", tabWiki:"Wikipedia", tabLit:"Literature", tabCustom:"Custom Text",
    levelLabel:"Language level",
    topicLabelNews:"Topic", topicLabelReads:"Topic", topicLabelWiki:"Theme", topicLabelLit:"Genre",
    customLabel:"Paste any text (max 6,000 characters)",
    generateBtn:"Generate article", fetchWikiBtn:"Fetch Wikipedia article", fetchLitBtn:"Fetch text", analyzeBtn:"Analyse text",
    hint:"Choose level and topic — a new article every time",
    hintReads:"Deep topics — from philosophy to science",
    hintWiki:"Real Wikipedia article by theme", hintLit:"Classic literature from Project Gutenberg",
    hintCustom:"Paste any text and get vocabulary and questions about it",
    loading:"Newsroom working", loadingWiki:"Fetching Wikipedia", loadingLit:"Fetching Gutenberg",
    vocabHeader:"Vocabulary", byline:"AI Newsroom · Daily Dispatch",
    bylineReads:"AI Newsroom · Interesting Reads", bylineWiki:"Wikipedia", bylineLit:"Project Gutenberg", bylineCustom:"Custom Text",
    sourceNoticeWiki:"Authentic Wikipedia article. Vocabulary and questions are AI-generated.",
    sourceNoticeLit:"Classic text from Project Gutenberg (Public Domain). Vocabulary and questions are AI-generated.",
    sourceLink:"View on Wikipedia ↗", sourceLinkLit:"View on Gutenberg ↗",
    comprehensionHeader:"Comprehension questions", discussionHeader:"Discussion questions",
    nextBtn:"Next article →", nextBtnFetch:"Next text →",
    randomBtn:"↻ Random", noCategory:"Please select a topic first.", noText:"Please paste a text first.",
    browseGenerate:"Generate", browseBrowse:"Browse",
    browseEmpty:"No articles saved yet.",
    browsePrev:"← Back", browseNext:"Load more",
    browseFilterAll:"All", browseLevelLabel:"Level", browseTopicLabel:"Topic",
    wikisub:"en",
    wikiCategories:{ "Philosophy":"Philosophy","History":"History","Science":"Science","Society":"Society","Art":"Art","Psychology":"Psychology","Geography":"Geography" },
    litGenres:{ "fiction":"Fiction","poetry":"Poetry","drama":"Drama","adventure":"Adventure","philosophy":"Philosophy" },
    newsCategories:{ Politik:"Politics",Wirtschaft:"Economics",Wissenschaft:"Science",Technologie:"Technology",Gesellschaft:"Society",Kultur:"Culture",Umwelt:"Environment",Gesundheit:"Health",Sport:"Sport",Schule:"Education",Lifestyle:"Lifestyle",Kurioses:"Curiosities" },
    readsCategories:{ Philosophie:"Philosophy",Geschichte:"Historical Curiosities",Gesellschaft:"Society",Wissenschaft:"Science",Psychologie:"Psychology",Kunst:"Art & Architecture",Mythologie:"Mythology" },
    btnBackMCQ:"← MCQ", btnCheckAnswers:"✓ Check answers",
    btnDiscussion:"Discussion →", btnBackComprehension:"← Comprehension",
    btnSkipMCQ:"Skip to comprehension", btnComprehension:"Comprehension →",
    mcqCorrect:"✓ Correct! 🎉", mcqIncorrect:"✗ The correct answer is: ",
    discussionSoon:"Graded discussion responses coming soon.",
    errorNoAnswer:"Please write at least one answer.",
    errorCheckFailed:"Could not check answers: ",
    discussionLevel1:"⚙️ Needs work", discussionLevel2:"👍 OK",
    discussionLevel3:"💪 Strong", discussionLevel4:"💡 Insightful"
  },
  fr: {
    name:"Français", flag:"🇫🇷", targetLanguage:"French", htmlLang:"fr",
    pageTitle:"Langum", sub:"Lire. Découvrir. Apprendre.",
    tabNews:"Actualités", tabReads:"Lectures intéressantes", tabWiki:"Wikipédia", tabLit:"Littérature", tabCustom:"Texte personnalisé",
    levelLabel:"Niveau de langue",
    topicLabelNews:"Thème", topicLabelReads:"Thème", topicLabelWiki:"Domaine", topicLabelLit:"Genre",
    customLabel:"Collez un texte (max 6 000 caractères)",
    generateBtn:"Générer l'article", fetchWikiBtn:"Obtenir un article Wikipédia", fetchLitBtn:"Obtenir un texte", analyzeBtn:"Analyser le texte",
    hint:"Choisissez le niveau et le thème — un nouvel article à chaque fois",
    hintReads:"Sujets profonds — de la philosophie aux sciences",
    hintWiki:"Vrai article Wikipédia par thème", hintLit:"Littérature classique de Project Gutenberg",
    hintCustom:"Collez un texte et obtenez du vocabulaire et des questions",
    loading:"La rédaction travaille", loadingWiki:"Récupération Wikipédia", loadingLit:"Récupération Gutenberg",
    vocabHeader:"Vocabulaire", byline:"Rédaction IA · Le Quotidien",
    bylineReads:"Rédaction IA · Lectures intéressantes", bylineWiki:"Wikipédia", bylineLit:"Project Gutenberg", bylineCustom:"Texte personnalisé",
    sourceNoticeWiki:"Article Wikipédia authentique. Vocabulaire et questions générés par IA.",
    sourceNoticeLit:"Texte classique de Project Gutenberg (domaine public). Vocabulaire et questions générés par IA.",
    sourceLink:"Voir sur Wikipédia ↗", sourceLinkLit:"Voir sur Gutenberg ↗",
    comprehensionHeader:"Questions de compréhension", discussionHeader:"Questions de discussion",
    nextBtn:"Article suivant →", nextBtnFetch:"Texte suivant →",
    randomBtn:"↻ Aléatoire", noCategory:"Veuillez d'abord sélectionner un thème.", noText:"Veuillez d'abord coller un texte.",
    browseGenerate:"Générer", browseBrowse:"Parcourir",
    browseEmpty:"Aucun article sauvegardé.",
    browsePrev:"← Retour", browseNext:"Plus",
    browseFilterAll:"Tous", browseLevelLabel:"Niveau", browseTopicLabel:"Thème",
    wikisub:"fr",
    wikiCategories:{ "Philosophie":"Philosophie","Histoire":"Histoire","Science":"Science","Société":"Société","Art":"Art","Psychologie":"Psychologie","Géographie":"Géographie" },
    litGenres:{ "fiction":"Fiction","poetry":"Poésie","drama":"Théâtre","adventure":"Aventure","philosophy":"Philosophie" },
    newsCategories:{ Politik:"Politique",Wirtschaft:"Économie",Wissenschaft:"Sciences",Technologie:"Technologie",Gesellschaft:"Société",Kultur:"Culture",Umwelt:"Environnement",Gesundheit:"Santé",Sport:"Sport",Schule:"Éducation",Lifestyle:"Lifestyle",Kurioses:"Insolite" },
    readsCategories:{ Philosophie:"Philosophie",Geschichte:"Curiosités historiques",Gesellschaft:"Société",Wissenschaft:"Sciences",Psychologie:"Psychologie",Kunst:"Art & Architecture",Mythologie:"Mythologie" },
    btnBackMCQ:"← QCM", btnCheckAnswers:"✓ Vérifier les réponses",
    btnDiscussion:"Discussion →", btnBackComprehension:"← Compréhension",
    btnSkipMCQ:"Passer à la compréhension", btnComprehension:"Compréhension →",
    mcqCorrect:"✓ Correct ! 🎉", mcqIncorrect:"✗ La bonne réponse est : ",
    discussionSoon:"Réponses de discussion notées — bientôt disponibles.",
    errorNoAnswer:"Veuillez écrire au moins une réponse.",
    errorCheckFailed:"Impossible de vérifier les réponses : ",
    discussionLevel1:"⚙️ À améliorer", discussionLevel2:"👍 Correct",
    discussionLevel3:"💪 Solide", discussionLevel4:"💡 Intéressant !"
  },
  es: {
    name:"Español", flag:"🇪🇸", targetLanguage:"Spanish", htmlLang:"es",
    pageTitle:"Langum", sub:"Leer. Descubrir. Aprender.",
    tabNews:"Noticias", tabReads:"Lecturas interesantes", tabWiki:"Wikipedia", tabLit:"Literatura", tabCustom:"Texto propio",
    levelLabel:"Nivel de idioma",
    topicLabelNews:"Tema", topicLabelReads:"Tema", topicLabelWiki:"Área", topicLabelLit:"Género",
    customLabel:"Pega un texto (máx. 6.000 caracteres)",
    generateBtn:"Generar artículo", fetchWikiBtn:"Obtener artículo de Wikipedia", fetchLitBtn:"Obtener texto", analyzeBtn:"Analizar texto",
    hint:"Elige nivel y tema — un artículo nuevo cada vez",
    hintReads:"Temas profundos — de filosofía a ciencia",
    hintWiki:"Artículo real de Wikipedia por área", hintLit:"Literatura clásica de Project Gutenberg",
    hintCustom:"Pega cualquier texto y obtén vocabulario y preguntas",
    loading:"La redacción trabaja", loadingWiki:"Obteniendo Wikipedia", loadingLit:"Obteniendo Gutenberg",
    vocabHeader:"Vocabulario", byline:"Redacción IA · El Diario",
    bylineReads:"Redacción IA · Lecturas interesantes", bylineWiki:"Wikipedia", bylineLit:"Project Gutenberg", bylineCustom:"Texto propio",
    sourceNoticeWiki:"Artículo auténtico de Wikipedia. Vocabulario y preguntas generados por IA.",
    sourceNoticeLit:"Texto clásico de Project Gutenberg (dominio público). Vocabulario y preguntas generados por IA.",
    sourceLink:"Ver en Wikipedia ↗", sourceLinkLit:"Ver en Gutenberg ↗",
    comprehensionHeader:"Preguntas de comprensión", discussionHeader:"Preguntas de debate",
    nextBtn:"Siguiente artículo →", nextBtnFetch:"Siguiente texto →",
    randomBtn:"↻ Aleatorio", noCategory:"Por favor selecciona un tema primero.", noText:"Por favor pega un texto primero.",
    browseGenerate:"Generar", browseBrowse:"Explorar",
    browseEmpty:"No hay artículos guardados.",
    browsePrev:"← Atrás", browseNext:"Más",
    browseFilterAll:"Todos", browseLevelLabel:"Nivel", browseTopicLabel:"Tema",
    wikisub:"es",
    wikiCategories:{ "Filosofía":"Filosofía","Historia":"Historia","Ciencia":"Ciencia","Sociedad":"Sociedad","Arte":"Arte","Psicología":"Psicología","Geografía":"Geografía" },
    litGenres:{ "fiction":"Ficción","poetry":"Poesía","drama":"Teatro","adventure":"Aventura","philosophy":"Filosofía" },
    newsCategories:{ Politik:"Política",Wirtschaft:"Economía",Wissenschaft:"Ciencia",Technologie:"Tecnología",Gesellschaft:"Sociedad",Kultur:"Cultura",Umwelt:"Medio ambiente",Gesundheit:"Salud",Sport:"Deporte",Schule:"Educación",Lifestyle:"Estilo de vida",Kurioses:"Curiosidades" },
    readsCategories:{ Philosophie:"Filosofía",Geschichte:"Curiosidades históricas",Gesellschaft:"Sociedad",Wissenschaft:"Ciencia",Psychologie:"Psicología",Kunst:"Arte & Arquitectura",Mythologie:"Mitología" },
    btnBackMCQ:"← Opción múltiple", btnCheckAnswers:"✓ Comprobar respuestas",
    btnDiscussion:"Debate →", btnBackComprehension:"← Comprensión",
    btnSkipMCQ:"Pasar a la comprensión", btnComprehension:"Comprensión →",
    mcqCorrect:"✓ ¡Correcto! 🎉", mcqIncorrect:"✗ La respuesta correcta es: ",
    discussionSoon:"Respuestas de debate calificadas — próximamente.",
    errorNoAnswer:"Por favor escribe al menos una respuesta.",
    errorCheckFailed:"No se pudieron comprobar las respuestas: ",
    discussionLevel1:"⚙️ Mejorable", discussionLevel2:"👍 Bien",
    discussionLevel3:"💪 Sólido", discussionLevel4:"💡 ¡Interesante!"
  },
  it: {
    name:"Italiano", flag:"🇮🇹", targetLanguage:"Italian", htmlLang:"it",
    pageTitle:"Langum", sub:"Leggere. Scoprire. Imparare.",
    tabNews:"Notizie", tabReads:"Letture interessanti", tabWiki:"Wikipedia", tabLit:"Letteratura", tabCustom:"Testo personalizzato",
    levelLabel:"Livello linguistico",
    topicLabelNews:"Argomento", topicLabelReads:"Argomento", topicLabelWiki:"Area", topicLabelLit:"Genere",
    customLabel:"Incolla un testo (max 6.000 caratteri)",
    generateBtn:"Genera articolo", fetchWikiBtn:"Ottieni articolo Wikipedia", fetchLitBtn:"Ottieni testo", analyzeBtn:"Analizza testo",
    hint:"Scegli livello e argomento — ogni volta un articolo nuovo",
    hintReads:"Temi profondi — dalla filosofia alla scienza",
    hintWiki:"Vero articolo Wikipedia per area", hintLit:"Letteratura classica da Project Gutenberg",
    hintCustom:"Incolla un testo e ottieni vocabolario e domande",
    loading:"La redazione è al lavoro", loadingWiki:"Recupero Wikipedia", loadingLit:"Recupero Gutenberg",
    vocabHeader:"Vocabolario", byline:"Redazione IA · Il Quotidiano",
    bylineReads:"Redazione IA · Letture interessanti", bylineWiki:"Wikipedia", bylineLit:"Project Gutenberg", bylineCustom:"Testo personalizzato",
    sourceNoticeWiki:"Articolo autentico di Wikipedia. Vocabolario e domande generati dall'IA.",
    sourceNoticeLit:"Testo classico di Project Gutenberg (pubblico dominio). Vocabolario e domande generati dall'IA.",
    sourceLink:"Vedi su Wikipedia ↗", sourceLinkLit:"Vedi su Gutenberg ↗",
    comprehensionHeader:"Domande di comprensione", discussionHeader:"Domande di discussione",
    nextBtn:"Articolo successivo →", nextBtnFetch:"Testo successivo →",
    randomBtn:"↻ Casuale", noCategory:"Seleziona prima un argomento.", noText:"Incolla prima un testo.",
    browseGenerate:"Genera", browseBrowse:"Sfoglia",
    browseEmpty:"Nessun articolo salvato.",
    browsePrev:"← Indietro", browseNext:"Altro",
    browseFilterAll:"Tutti", browseLevelLabel:"Livello", browseTopicLabel:"Argomento",
    wikisub:"it",
    wikiCategories:{ "Filosofia":"Filosofia","Storia":"Storia","Scienza":"Scienza","Società":"Società","Arte":"Arte","Psicologia":"Psicologia","Geografia":"Geografia" },
    litGenres:{ "fiction":"Narrativa","poetry":"Poesia","drama":"Teatro","adventure":"Avventura","philosophy":"Filosofia" },
    newsCategories:{ Politik:"Politica",Wirtschaft:"Economia",Wissenschaft:"Scienza",Technologie:"Tecnologia",Gesellschaft:"Società",Kultur:"Cultura",Umwelt:"Ambiente",Gesundheit:"Salute",Sport:"Sport",Schule:"Istruzione",Lifestyle:"Lifestyle",Kurioses:"Curiosità" },
    readsCategories:{ Philosophie:"Filosofia",Geschichte:"Curiosità storiche",Gesellschaft:"Società",Wissenschaft:"Scienza",Psychologie:"Psicologia",Kunst:"Arte & Architettura",Mythologie:"Mitologia" },
    btnBackMCQ:"← Scelta multipla", btnCheckAnswers:"✓ Controlla le risposte",
    btnDiscussion:"Discussione →", btnBackComprehension:"← Comprensione",
    btnSkipMCQ:"Passa alla comprensione", btnComprehension:"Comprensione →",
    mcqCorrect:"✓ Corretto! 🎉", mcqIncorrect:"✗ La risposta corretta è: ",
    discussionSoon:"Risposte di discussione valutate — prossimamente.",
    errorNoAnswer:"Per favore scrivi almeno una risposta.",
    errorCheckFailed:"Impossibile controllare le risposte: ",
    discussionLevel1:"⚙️ Da migliorare", discussionLevel2:"👍 OK",
    discussionLevel3:"💪 Solido", discussionLevel4:"💡 Interessante!"
  },
  pt: {
    name:"Português", flag:"🇧🇷", targetLanguage:"Brazilian Portuguese", htmlLang:"pt",
    pageTitle:"Langum", sub:"Ler. Descobrir. Aprender.",
    tabNews:"Notícias", tabReads:"Leituras interessantes", tabWiki:"Wikipédia", tabLit:"Literatura", tabCustom:"Texto próprio",
    levelLabel:"Nível de idioma",
    topicLabelNews:"Tema", topicLabelReads:"Tema", topicLabelWiki:"Área", topicLabelLit:"Gênero",
    customLabel:"Cole um texto (máx. 6.000 caracteres)",
    generateBtn:"Gerar artigo", fetchWikiBtn:"Obter artigo da Wikipédia", fetchLitBtn:"Obter texto", analyzeBtn:"Analisar texto",
    hint:"Escolha o nível e o tema — um artigo novo a cada vez",
    hintReads:"Temas profundos — da filosofia à ciência",
    hintWiki:"Artigo real da Wikipédia por área", hintLit:"Literatura clássica do Project Gutenberg",
    hintCustom:"Cole qualquer texto e receba vocabulário e perguntas sobre ele",
    loading:"Redação trabalhando", loadingWiki:"Obtendo Wikipédia", loadingLit:"Obtendo Gutenberg",
    vocabHeader:"Vocabulário", byline:"Redação IA · O Diário",
    bylineReads:"Redação IA · Leituras interessantes", bylineWiki:"Wikipédia", bylineLit:"Project Gutenberg", bylineCustom:"Texto próprio",
    sourceNoticeWiki:"Artigo auténtico da Wikipédia. Vocabulário e perguntas gerados por IA.",
    sourceNoticeLit:"Texto clássico do Project Gutenberg (domínio público). Vocabulário e perguntas gerados por IA.",
    sourceLink:"Ver na Wikipédia ↗", sourceLinkLit:"Ver no Gutenberg ↗",
    comprehensionHeader:"Perguntas de compreensão", discussionHeader:"Perguntas de discussão",
    nextBtn:"Próximo artigo →", nextBtnFetch:"Próximo texto →",
    randomBtn:"↻ Aleatório", noCategory:"Por favor selecione um tema primeiro.", noText:"Por favor cole um texto primeiro.",
    browseGenerate:"Gerar", browseBrowse:"Explorar",
    browseEmpty:"Nenhum artigo salvo ainda.",
    browsePrev:"← Voltar", browseNext:"Mais",
    browseFilterAll:"Todos", browseLevelLabel:"Nível", browseTopicLabel:"Tema",
    wikisub:"pt",
    wikiCategories:{ "Filosofia":"Filosofia","História":"História","Ciência":"Ciência","Sociedade":"Sociedade","Arte":"Arte","Psicologia":"Psicologia","Geografia":"Geografia" },
    litGenres:{ "fiction":"Ficção","poetry":"Poesia","drama":"Teatro","adventure":"Aventura","philosophy":"Filosofia" },
    newsCategories:{ Politik:"Política",Wirtschaft:"Economia",Wissenschaft:"Ciência",Technologie:"Tecnologia",Gesellschaft:"Sociedade",Kultur:"Cultura",Umwelt:"Meio ambiente",Gesundheit:"Saúde",Sport:"Esporte",Schule:"Educação",Lifestyle:"Lifestyle",Kurioses:"Curiosidades" },
    readsCategories:{ Philosophie:"Filosofia",Geschichte:"Curiosidades históricas",Gesellschaft:"Sociedade",Wissenschaft:"Ciência",Psychologie:"Psicologia",Kunst:"Arte & Arquitetura",Mythologie:"Mitologia" },
    btnBackMCQ:"← Múltipla escolha", btnCheckAnswers:"✓ Verificar respostas",
    btnDiscussion:"Discussão →", btnBackComprehension:"← Compreensão",
    btnSkipMCQ:"Ir para a compreensão", btnComprehension:"Compreensão →",
    mcqCorrect:"✓ Correto! 🎉", mcqIncorrect:"✗ A resposta correta é: ",
    discussionSoon:"Respostas de discussão corrigidas — em breve.",
    errorNoAnswer:"Por favor escreva pelo menos uma resposta.",
    errorCheckFailed:"Não foi possível verificar as respostas: ",
    discussionLevel1:"⚙️ A melhorar", discussionLevel2:"👍 OK",
    discussionLevel3:"💪 Sólido", discussionLevel4:"💡 Interessante!"
  },
  nl: {
    name:"Nederlands", flag:"🇳🇱", targetLanguage:"Dutch", htmlLang:"nl",
    pageTitle:"Langum", sub:"Lezen. Ontdekken. Leren.",
    tabNews:"Nieuws", tabReads:"Interessante lectuur", tabWiki:"Wikipedia", tabLit:"Literatuur", tabCustom:"Eigen tekst",
    levelLabel:"Taalniveau",
    topicLabelNews:"Onderwerp", topicLabelReads:"Onderwerp", topicLabelWiki:"Gebied", topicLabelLit:"Genre",
    customLabel:"Plak een tekst (max. 6.000 tekens)",
    generateBtn:"Artikel genereren", fetchWikiBtn:"Wikipedia-artikel ophalen", fetchLitBtn:"Tekst ophalen", analyzeBtn:"Tekst analyseren",
    hint:"Kies niveau en onderwerp — elke keer een nieuw artikel",
    hintReads:"Diepgaande onderwerpen — van filosofie tot wetenschap",
    hintWiki:"Echt Wikipedia-artikel per gebied", hintLit:"Klassieke literatuur van Project Gutenberg",
    hintCustom:"Plak een tekst en krijg woordenschat en vragen",
    loading:"Redactie is bezig", loadingWiki:"Wikipedia ophalen", loadingLit:"Gutenberg ophalen",
    vocabHeader:"Woordenschat", byline:"AI-redactie · Het Dagblad",
    bylineReads:"AI-redactie · Interessante lectuur", bylineWiki:"Wikipedia", bylineLit:"Project Gutenberg", bylineCustom:"Eigen tekst",
    sourceNoticeWiki:"Authentiek Wikipedia-artikel. Woordenschat en vragen worden door AI gegenereerd.",
    sourceNoticeLit:"Klassieke tekst van Project Gutenberg (publiek domein). Woordenschat en vragen worden door AI gegenereerd.",
    sourceLink:"Bekijken op Wikipedia ↗", sourceLinkLit:"Bekijken op Gutenberg ↗",
    comprehensionHeader:"Begripssvragen", discussionHeader:"Discussievragen",
    nextBtn:"Volgend artikel →", nextBtnFetch:"Volgende tekst →",
    randomBtn:"↻ Willekeurig", noCategory:"Selecteer eerst een onderwerp.", noText:"Plak eerst een tekst.",
    browseGenerate:"Genereren", browseBrowse:"Bladeren",
    browseEmpty:"Nog geen artikelen opgeslagen.",
    browsePrev:"← Terug", browseNext:"Meer",
    browseFilterAll:"Alle", browseLevelLabel:"Niveau", browseTopicLabel:"Onderwerp",
    wikisub:"nl",
    wikiCategories:{ "Filosofie":"Filosofie","Geschiedenis":"Geschiedenis","Wetenschap":"Wetenschap","Samenleving":"Samenleving","Kunst":"Kunst","Psychologie":"Psychologie","Geografie":"Geografie" },
    litGenres:{ "fiction":"Fictie","poetry":"Poëzie","drama":"Toneel","adventure":"Avontuur","philosophy":"Filosofie" },
    newsCategories:{ Politik:"Politiek",Wirtschaft:"Economie",Wissenschaft:"Wetenschap",Technologie:"Technologie",Gesellschaft:"Samenleving",Kultur:"Cultuur",Umwelt:"Milieu",Gesundheit:"Gezondheid",Sport:"Sport",Schule:"Onderwijs",Lifestyle:"Lifestyle",Kurioses:"Curiosa" },
    readsCategories:{ Philosophie:"Filosofie",Geschichte:"Historische curiosa",Gesellschaft:"Samenleving",Wissenschaft:"Wetenschap",Psychologie:"Psychologie",Kunst:"Kunst & Architectuur",Mythologie:"Mythologie" },
    btnBackMCQ:"← Meerkeuzevragen", btnCheckAnswers:"✓ Antwoorden controleren",
    btnDiscussion:"Discussie →", btnBackComprehension:"← Begrip",
    btnSkipMCQ:"Naar de begripssvragen", btnComprehension:"Begripssvragen →",
    mcqCorrect:"✓ Correct! 🎉", mcqIncorrect:"✗ Het juiste antwoord is: ",
    discussionSoon:"Beoordeelde discussieantwoorden — binnenkort beschikbaar.",
    errorNoAnswer:"Schrijf alstublieft ten minste één antwoord.",
    errorCheckFailed:"Antwoorden konden niet worden gecontroleerd: ",
    discussionLevel1:"⚙️ Kan beter", discussionLevel2:"👍 Oké",
    discussionLevel3:"💪 Sterk", discussionLevel4:"💡 Interessant!"
  }
};




// ================================================================
// 4. GENERATOR
// ================================================================
// Purpose: everything that talks to an external API to get content,
// and everything that prepares or validates data before display.
//
// What this section does NOT do:
// - It does not touch the DOM directly (→ Renderer)
// - It does not hold constants or seeds (→ Config)
//
// Key design choice — Generator never renders:
// Every generate function ends by calling renderArticle() or
// renderExternalText() from the Renderer section. This separation
// means swapping the AI provider (e.g. Gemini → Groq) is a
// Generator-only change that cannot accidentally break the display.
// ================================================================

// --- Avoidance cache helpers ---
// These two functions work together to prevent the AI from repeating
// topics. Before generating, we fetch previously saved titles from
// the worker and pass them into the prompt. After generating, we
// add the new title to the local cache so the next generation in
// the same session also avoids it — without another network call.

async function getAvoidList(lang, mode, category) {
  const cacheKey = lang + "::" + mode + "::" + category;
  if (avoidCache[cacheKey]) return avoidCache[cacheKey];
  try {
    const res  = await fetch(PROXY_URL + "/titles?lang=" + encodeURIComponent(lang) + "&mode=" + encodeURIComponent(mode) + "&category=" + encodeURIComponent(category));
    const data = await res.json();
    avoidCache[cacheKey] = data.titles || [];
    return avoidCache[cacheKey];
  } catch(e) { return []; }
}

function addToAvoidCache(lang, mode, category, title) {
  if (!title || title === "—") return;
  const cacheKey = lang + "::" + mode + "::" + category;
  if (!avoidCache[cacheKey]) avoidCache[cacheKey] = [];
  if (!avoidCache[cacheKey].some(t => t.toLowerCase() === title.toLowerCase())) {
    avoidCache[cacheKey].unshift(title);
    if (avoidCache[cacheKey].length > 30) avoidCache[cacheKey].pop();
  }
}

// --- Prompt builders ---

async function buildNewsPrompt(category, level, lang) {
  const avoidList = await getAvoidList(lang.htmlLang, "news", category);
  const avoidSection = avoidList.length > 0
    ? "\nIMPORTANT — Do NOT write about any of these topics already covered. Choose something genuinely different:\n" + avoidList.map((t, i) => (i + 1) + ". " + t).join("\n") + "\n"
    : "";
  return `You are an editor for a language learning platform.
Create a fictional but realistic-sounding daily news article at ${level} level (CEFR).
Category: ${NEWS_SEEDS[category]}
${avoidSection}
Be specific and inventive — pick an unexpected angle, a concrete location, a surprising statistic, or an unusual character. Avoid generic or predictable takes on the category.
Output language: Write the ENTIRE response in ${lang.targetLanguage} only.
Level rules for ${level}: ${LEVEL_INSTRUCTIONS[level]}
Rules: neutral journalistic tone; no opinions; sounds current (use "recently", "this week", etc.); mention at least one specific place/number/organisation; exactly 4 paragraphs of 3-4 sentences; 6 vocabulary entries; 4 comprehension questions; 4 discussion questions; 4 multiple choice questions.
Multiple choice rules: each question must test a DIFFERENT fact from the text than the comprehension questions. Each question has exactly 4 options. The "correct" field must be the FULL TEXT of the correct option, not an index.
Reply with ONLY valid JSON:
{"domain":"...","title":"...","vocab":[{"word":"...","definition":"...","example":"..."}],"paragraphs":["...","...","...","..."],"comprehension":["...","...","...","..."],"discussion":["...","...","...","..."],"multiple_choice":[{"question":"...","options":["...","...","...","..."],"correct":"..."},{"question":"...","options":["...","...","...","..."],"correct":"..."},{"question":"...","options":["...","...","...","..."],"correct":"..."},{"question":"...","options":["...","...","...","..."],"correct":"..."}]}`;
}
async function buildReadsPrompt(category, level, lang) {
  const avoidList = await getAvoidList(lang.htmlLang, "reads", category);
  const avoidSection = avoidList.length > 0
    ? "\nIMPORTANT — Do NOT write about any of these topics already covered. Choose something genuinely different:\n" + avoidList.map((t, i) => (i + 1) + ". " + t).join("\n") + "\n"
    : "";
  return `You are an editor for a language learning platform focused on enriching non-fiction reads.
Create an engaging, well-researched article at ${level} level (CEFR) on the following theme.
Category: ${READS_SEEDS[category]}
${avoidSection}
Be inventive — pick a specific, unexpected, or underexplored angle within this category rather than the most obvious one.
Output language: Write the ENTIRE response in ${lang.targetLanguage} only.
Level rules for ${level}: ${LEVEL_INSTRUCTIONS[level]}
Rules: thoughtful, essay-like tone; factual and informative; no bullet points; include at least one concrete detail (name, date, place, study); exactly 4 paragraphs of 4-5 sentences; 6 vocabulary entries; 4 comprehension questions; 4 open discussion questions; 4 multiple choice questions.
Multiple choice rules: each question must test a DIFFERENT fact from the text than the comprehension questions. Each question has exactly 4 options. The "correct" field must be the FULL TEXT of the correct option, not an index.
Reply with ONLY valid JSON:
{"domain":"...","title":"...","vocab":[{"word":"...","definition":"...","example":"..."}],"paragraphs":["...","...","...","..."],"comprehension":["...","...","...","..."],"discussion":["...","...","...","..."],"multiple_choice":[{"question":"...","options":["...","...","...","..."],"correct":"..."},{"question":"...","options":["...","...","...","..."],"correct":"..."},{"question":"...","options":["...","...","...","..."],"correct":"..."},{"question":"...","options":["...","...","...","..."],"correct":"..."}]}`;
}

// Used for Wikipedia, Literature, and Custom Text modes.
// These modes don't generate the article text — the text comes from
// an external source. The AI only generates vocab and questions around it.
function buildExternalTextPrompt(text, lang) {
  return `You are a language learning content editor. A student is reading the following text in ${lang.targetLanguage}.
TEXT:
"""
${text}
"""
Generate learning scaffolding IN ${lang.targetLanguage}. Be concise.
Rules:
- vocab: exactly 6 challenging words or phrases FROM the text. Definitions in ${lang.targetLanguage}, max 20 words. Example sentences NEW (not from text), max 20 words.
- comprehension: exactly 4 short questions whose answers are in the text, in ${lang.targetLanguage}.
- discussion: exactly 4 short open questions on the text's themes, in ${lang.targetLanguage}.
Reply with ONLY valid JSON:
{"vocab":[{"word":"...","definition":"...","example":"..."},{"word":"...","definition":"...","example":"..."},{"word":"...","definition":"...","example":"..."},{"word":"...","definition":"...","example":"..."},{"word":"...","definition":"...","example":"..."},{"word":"...","definition":"...","example":"..."}],"comprehension":["...","...","...","..."],"discussion":["...","...","...","..."],"multiple_choice":[{"question":"...","options":["...","...","...","..."],"correct":"..."},{"question":"...","options":["...","...","...","..."],"correct":"..."},{"question":"...","options":["...","...","...","..."],"correct":"..."},{"question":"...","options":["...","...","...","..."],"correct":"..."}]}`;
}

// --- Generate functions ---
// Each function handles one mode end-to-end:
// fetch/build → call AI → parse → render → save.

// handleGenerate() is the single entry point called by the Generate
// button. It reads currentMode from State and dispatches accordingly.
// This means the button in the HTML never needs to change — only
// this dispatcher does if a new mode is added.
function handleGenerate() {
  if      (currentMode === "news")   generateArticle("news");
  else if (currentMode === "reads")  generateArticle("reads");
  else if (currentMode === "wiki")   generateWikipedia();
  else if (currentMode === "lit")    generateLiterature();
  else if (currentMode === "custom") generateCustom();
}

async function generateArticle(mode) {
  const lang = LANGUAGES[currentLang];
  if (!selectedCategory) { showError(lang.noCategory); return; }
  setLoading(true, lang.loading);
  hideError(); hideDebug();
  document.getElementById("articleOuter").style.display = "none";
  try {
    const prompt = mode === "news"
      ? await buildNewsPrompt(selectedCategory, selectedLevel, lang)
      : await buildReadsPrompt(selectedCategory, selectedLevel, lang);
    const res = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents:[{role:"user",parts:[{text:prompt}]}], generationConfig:{temperature:1.1,maxOutputTokens:8192,responseMimeType:"application/json"} })
    });
    const raw = await parseProxy(res);
    const d = JSON.parse(raw);
    d.domain = d.domain || selectedCategory;
    d.title  = d.title  || "—";
    ["vocab","paragraphs","comprehension","discussion","multiple_choice"].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
    const byline = mode === "news" ? lang.byline : lang.bylineReads;
    renderArticle(d, lang, selectedLevel, lang.newsCategories[d.domain] || lang.readsCategories[d.domain] || d.domain, byline, lang.nextBtn);
    addToAvoidCache(lang.htmlLang, mode, selectedCategory, d.title);
    saveArticleToKV(lang.htmlLang, mode, selectedCategory, d.title, selectedLevel, d);
  } catch(e) { showError("Error: " + e.message); }
  finally    { setLoading(false); }
}

async function generateWikipedia() {
  const lang = LANGUAGES[currentLang];
  if (!selectedCategory) { showError(lang.noCategory); return; }
  setLoading(true, lang.loadingWiki);
  hideError(); hideDebug();
  document.getElementById("articleOuter").style.display = "none";
  try {
    const searchUrl  = `https://${lang.wikisub}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(selectedCategory)}&srnamespace=0&srlimit=20&format=json&origin=*`;
    const searchData = await (await fetch(searchUrl)).json();
    const results    = searchData?.query?.search || [];
    if (!results.length) throw new Error("No Wikipedia articles found for this theme.");
    const pick      = results[Math.floor(Math.random() * results.length)];
    const title     = pick.title;
    const extractUrl  = `https://${lang.wikisub}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts&explaintext=true&exsectionformat=plain&format=json&origin=*`;
    const extractData = await (await fetch(extractUrl)).json();
    const pages       = extractData?.query?.pages || {};
    const fullText    = Object.values(pages)[0]?.extract || "";
    if (!fullText || fullText.length < 200) throw new Error("Article too short. Try again.");
    const excerpt = trimToWords(fullText, 300);
    const wikiUrl = `https://${lang.wikisub}.wikipedia.org/wiki/${encodeURIComponent(title)}`;
    const res = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents:[{role:"user",parts:[{text:buildExternalTextPrompt(excerpt,lang)}]}], generationConfig:{temperature:0.7,maxOutputTokens:8192,responseMimeType:"application/json"} })
    });
    const d = JSON.parse(await parseProxy(res));
    renderExternalText(d, lang, title, excerpt, wikiUrl, lang.sourceNoticeWiki, lang.sourceLink, "Wikipedia", lang.bylineWiki);
    saveArticleToKV(currentLang, "wiki", selectedCategory, title, "", { ...d, paragraphs: excerpt.split("\n\n") });
  } catch(e) { showError("Error: " + e.message); }
  finally    { setLoading(false); }
}

async function generateLiterature() {
  const lang = LANGUAGES[currentLang];
  if (!selectedCategory) { showError(lang.noCategory); return; }
  setLoading(true, lang.loadingLit);
  hideError(); hideDebug();
  document.getElementById("articleOuter").style.display = "none";
  try {
    const gutData  = await (await fetch(`https://gutendex.com/books/?languages=${lang.wikisub}&topic=${encodeURIComponent(selectedCategory)}&sort=popular`)).json();
    const allBooks = gutData?.results || [];
    if (!allBooks.length) throw new Error("No books found for this genre and language. Try another genre.");
    const shuffled = [...allBooks].sort(() => Math.random() - 0.5);
    let excerpt = null, title = null, gutBookUrl = null;
    for (let i = 0; i < Math.min(8, shuffled.length); i++) {
      const book = shuffled[i];
      try {
        const reliableTxtUrl = `https://www.gutenberg.org/cache/epub/${book.id}/pg${book.id}.txt`;
        const txtData        = await (await fetch(PROXY_URL + "/gutenberg?url=" + encodeURIComponent(reliableTxtUrl))).json();
        const rawText        = txtData?.text || "";
        if (!rawText || rawText.length < 500) continue;
        if (rawText.includes("Read by:") || rawText.includes("#EXTM3U") || rawText.includes("00:0") || rawText.includes("<html") || rawText.includes("Error 404")) continue;
        const lines     = rawText.split("\n");
        const start     = Math.max(60, Math.floor(lines.length * 0.1));
        const candidate = trimToWords(lines.slice(start, start + 150).join("\n"), 250);
        if (candidate.trim().split(/\s+/).length < 80) continue;
        excerpt    = candidate;
        title      = book.title + (book.authors?.length ? " — " + book.authors[0].name : "");
        gutBookUrl = `https://www.gutenberg.org/ebooks/${book.id}`;
        break;
      } catch(e) { continue; }
    }
    if (!excerpt) throw new Error("Could not find a suitable text. Try another genre or press again.");
    const res = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents:[{role:"user",parts:[{text:buildExternalTextPrompt(excerpt,lang)}]}], generationConfig:{temperature:0.7,maxOutputTokens:8192,responseMimeType:"application/json"} })
    });
    const d = JSON.parse(await parseProxy(res));
    renderExternalText(d, lang, title, excerpt, gutBookUrl, lang.sourceNoticeLit, lang.sourceLinkLit, "Gutenberg", lang.bylineLit);
    saveArticleToKV(currentLang, "lit", selectedCategory, title, "", { ...d, paragraphs: excerpt.split("\n\n") });
  } catch(e) { showError("Error: " + e.message); }
  finally    { setLoading(false); }
}

async function generateCustom() {
  const lang = LANGUAGES[currentLang];
  const text = document.getElementById("customText").value.trim();
  if (!text)               { showError(lang.noText); return; }
  if (text.length > MAX_CHARS) { showError("Text is too long. Please trim it to " + MAX_CHARS + " characters."); return; }
  setLoading(true, lang.loading);
  hideError(); hideDebug();
  document.getElementById("articleOuter").style.display = "none";
  try {
    const res = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents:[{role:"user",parts:[{text:buildExternalTextPrompt(text,lang)}]}], generationConfig:{temperature:0.7,maxOutputTokens:8192,responseMimeType:"application/json"} })
    });
    const d = JSON.parse(await parseProxy(res));
    renderExternalText(d, lang, lang.tabCustom, text, null, null, null, "Custom", lang.bylineCustom);
    saveArticleToKV(currentLang, "custom", "custom", lang.tabCustom, "", { ...d, paragraphs: text.split("\n\n") });
  } catch(e) { showError("Error: " + e.message); }
  finally    { setLoading(false); }
}

// parseProxy cleans and validates the raw text returned by the worker.
// The worker proxies Gemini's response, which sometimes wraps JSON in
// markdown code fences (```json ... ```) even when told not to.
// This function strips those fences and extracts the JSON object.
async function parseProxy(res) {
  const responseText = await res.text();
  let data;
  try { data = JSON.parse(responseText); }
  catch(e) { showDebug("Raw HTTP response:\n" + responseText.slice(0, 800)); throw new Error("API response was not valid JSON."); }
  if (!res.ok) { showDebug(JSON.stringify(data, null, 2)); throw new Error(data.error?.message || "HTTP " + res.status); }
  const raw = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("\n").trim();
  if (!raw) { showDebug(JSON.stringify(data, null, 2)); throw new Error("No text returned. Finish reason: " + (data.candidates?.[0]?.finishReason || "unknown")); }
  let cleaned = raw.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
  const objStart = cleaned.indexOf("{"), objEnd = cleaned.lastIndexOf("}");
  if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) cleaned = cleaned.slice(objStart, objEnd + 1);
  return cleaned;
}

// saveArticleToKV sends the finished article to the worker's /save route.
// It is fire-and-forget: failure is silent so it never blocks the user
// from seeing a generated article. The worker handles all KV writes and
// index updates.
async function saveArticleToKV(lang, mode, category, title, level, data) {
  try {
    await fetch(PROXY_URL + "/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang, mode, category, title, level, data }),
    });
  } catch(e) { /* silent — saving failure should never block the user */ }
}




// ================================================================
// 5. RENDERER
// ================================================================
// Purpose: everything that puts content on screen or changes what
// the user sees. No fetch calls, no data transformation — display only.
//
// What this section does NOT do:
// - It does not call external APIs (→ Generator)
// - It does not manage browse/history state (→ History)
//
// Note on switchMode():
// This function is placed here because its primary job is updating
// the UI when the user changes tab. However it also touches State
// (resets currentSubMode) and orchestrates History (resets browse).
// It is intentionally left as a coordinator — if it grows further,
// consider splitting it.
// ================================================================

// switchMode updates the UI for the newly selected tab.
// It shows/hides the level selector, category selector, and custom
// text area based on which mode is active, then rebuilds the category
// buttons for that mode.
function switchMode(mode) {
  currentMode = mode;
  ["news","reads","wiki","lit","custom"].forEach(m => {
    document.getElementById("tab" + m.charAt(0).toUpperCase() + m.slice(1)).classList.toggle("active", m === mode);
  });
  const lang      = LANGUAGES[currentLang];
  const showLevel = mode === "news" || mode === "reads";
  document.getElementById("levelSection").style.display    = showLevel      ? "block" : "none";
  document.getElementById("categorySection").style.display = mode === "custom" ? "none"  : "block";
  document.getElementById("customSection").style.display   = mode === "custom" ? "block" : "none";
  const topicLabelMap = { news:lang.topicLabelNews, reads:lang.topicLabelReads, wiki:lang.topicLabelWiki, lit:lang.topicLabelLit };
  if (mode !== "custom") document.getElementById("uiTopicLabel").textContent = topicLabelMap[mode] || "";
  const hintMap = { news:lang.hint, reads:lang.hintReads, wiki:lang.hintWiki, lit:lang.hintLit, custom:lang.hintCustom };
  document.getElementById("uiHint").textContent = hintMap[mode] || "";
  const btnMap = { news:lang.generateBtn, reads:lang.generateBtn, wiki:lang.fetchWikiBtn, lit:lang.fetchLitBtn, custom:lang.analyzeBtn };
  document.getElementById("genBtn").textContent = "↻  " + (btnMap[mode] || lang.generateBtn);
  if      (mode === "news")   buildPickButtons(lang.newsCategories,  lang);
  else if (mode === "reads")  buildPickButtons(lang.readsCategories, lang);
  else if (mode === "wiki")   buildPickButtons(lang.wikiCategories,  lang);
  else if (mode === "lit")    buildPickButtons(lang.litGenres,       lang, false);
  // Reset sub-tab to Generate whenever the main mode changes
  currentSubMode = "generate";
  document.getElementById("subGenerate").classList.add("active");
  document.getElementById("subBrowse").classList.remove("active");
  document.getElementById("controls-area").style.display = "";
  document.getElementById("historyOuter").style.display  = "none";
  document.getElementById("articleOuter").style.display  = "none";
  hideError(); hideDebug();
}

// applyLanguage switches the entire UI to the given language code.
// It updates all static text labels, then calls switchMode to
// rebuild the category buttons in the new language.
function applyLanguage(code) {
  currentLang = code;
  const lang  = LANGUAGES[code];
  document.documentElement.lang                            = lang.htmlLang;
  document.title                                           = lang.pageTitle;
  document.getElementById("uiSub").textContent             = lang.sub;
  document.getElementById("uiTabNews").textContent         = lang.tabNews;
  document.getElementById("uiTabReads").textContent        = lang.tabReads;
  document.getElementById("uiTabWiki").textContent         = lang.tabWiki;
  document.getElementById("uiTabLit").textContent          = lang.tabLit;
  document.getElementById("uiTabCustom").textContent       = lang.tabCustom;
  document.getElementById("uiLevelLabel").textContent      = lang.levelLabel;
  document.getElementById("uiCustomLabel").textContent     = lang.customLabel;
  document.getElementById("uiVocabHeader").textContent     = lang.vocabHeader;
  document.getElementById("uiComprehensionHeader").textContent = lang.comprehensionHeader;
  document.getElementById("uiDiscussionHeader").textContent    = lang.discussionHeader;
  document.getElementById("uiLoading").textContent         = lang.loading;
  document.querySelectorAll(".lang-btn").forEach(b => b.classList.toggle("active", b.dataset.lang === code));
  updateSubLabels();
  switchMode(currentMode);
}

// updateSubLabels refreshes the Generate/Browse button text and the
// browse filter section labels for the active language.
function updateSubLabels() {
  const lang = LANGUAGES[currentLang];
  document.getElementById("uiSubGenerate").textContent       = lang.browseGenerate;
  document.getElementById("uiSubBrowse").textContent         = lang.browseBrowse;
  document.getElementById("uiHistoryLevelLabel").textContent = lang.browseLevelLabel;
  document.getElementById("uiHistoryTopicLabel").textContent = lang.browseTopicLabel;
}

// renderArticle renders a fully AI-generated article (news or reads).
// It populates all article elements, then calls showArticle().
function renderArticle(d, lang, levelTag, domainLabel, byline, nextLabel) {
  document.getElementById("tagRow").innerHTML = `<span class="tag">${escapeHtml(levelTag)}</span><span class="tag tag-domain">${escapeHtml(domainLabel)}</span>`;
  document.getElementById("sourceBar").style.display    = "none";
  document.getElementById("sourceNotice").style.display = "none";
  document.getElementById("uiVocabHeader").textContent             = lang.vocabHeader;
  document.getElementById("articleTitle").textContent              = d.title;
  document.getElementById("uiByline").textContent                  = byline;
  document.getElementById("uiComprehensionHeader").textContent     = lang.comprehensionHeader;
  document.getElementById("uiDiscussionHeader").textContent        = lang.discussionHeader;
  document.getElementById("uiNextBtn").textContent                 = nextLabel;
  currentContext   = (d.paragraphs || []).slice(0, 4).join("\n\n");
  currentQuestions = (d.comprehension || []).slice(0, 4);
  currentMCQs      = (d.multiple_choice || []).slice(0, 4);
  currentDiscussion = (d.discussion || []).slice(0, 4);
  // Start at MCQ stage only if multiple choice questions exist (new articles).
  // Old archived articles predate this feature and go straight to comprehension.
  currentExerciseStage = currentMCQs.length > 0 ? "mcq" : "comprehension";
  currentMCQIndex      = 0;
  mcqResults           = [null, null, null, null];
  savedComprehension   = [
    { answer: "", feedback: null },
    { answer: "", feedback: null },
    { answer: "", feedback: null },
    { answer: "", feedback: null },
  ];
  savedDiscussion = [
    { answer: "", feedback: null },
    { answer: "", feedback: null },
    { answer: "", feedback: null },
    { answer: "", feedback: null },
  ];
  renderVocab(d.vocab || []);
  document.getElementById("articleBody").innerHTML = (d.paragraphs || []).slice(0, 4).map(p => `<p>${escapeHtml(p)}</p>`).join("");
  renderQuestions(d.comprehension || [], d.discussion || []);
  showArticle();
}

// renderExternalText renders a Wikipedia, Gutenberg, or custom article.
// The text is authentic (not AI-generated), so it is displayed as-is.
// Only the vocab and questions come from the AI.
function renderExternalText(d, lang, title, text, url, notice, linkLabel, tagLabel, byline) {
  document.getElementById("tagRow").innerHTML = `<span class="tag">${escapeHtml(tagLabel)}</span><span class="tag tag-source">${escapeHtml(title)}</span>`;
  const bar = document.getElementById("sourceBar");
  if (url) {
    bar.style.display = "flex";
    document.getElementById("sourceTitle").textContent = title;
    const lnk = document.getElementById("sourceLink");
    lnk.href = url; lnk.textContent = linkLabel || "View source ↗";
  } else { bar.style.display = "none"; }
  const noticeEl = document.getElementById("sourceNotice");
  if (notice) { noticeEl.style.display = "block"; noticeEl.textContent = notice; }
  else        { noticeEl.style.display = "none"; }
  document.getElementById("uiVocabHeader").textContent             = lang.vocabHeader;
  document.getElementById("articleTitle").textContent              = title;
  document.getElementById("uiByline").textContent                  = byline;
  document.getElementById("uiComprehensionHeader").textContent     = lang.comprehensionHeader;
  document.getElementById("uiDiscussionHeader").textContent        = lang.discussionHeader;
  document.getElementById("uiNextBtn").textContent                 = lang.nextBtnFetch;
  currentContext   = text;
  currentQuestions = (d.comprehension || []).slice(0, 4);
  currentMCQs      = (d.multiple_choice || []).slice(0, 4);
  currentDiscussion = (d.discussion || []).slice(0, 4);
currentExerciseStage = currentMCQs.length > 0 ? "mcq" : "comprehension";
  currentMCQIndex      = 0;
  mcqResults           = [null, null, null, null];
  savedComprehension   = [
    { answer: "", feedback: null },
    { answer: "", feedback: null },
    { answer: "", feedback: null },
    { answer: "", feedback: null },
  ];
  savedDiscussion = [
    { answer: "", feedback: null },
    { answer: "", feedback: null },
    { answer: "", feedback: null },
    { answer: "", feedback: null },
  ];
  renderVocab(d.vocab || []);
  const paras = text.split("\n\n").filter(p => p.trim().length > 0).map(p => `<p>${escapeHtml(p.trim())}</p>`).join("");
  document.getElementById("articleBody").innerHTML = paras || `<p>${escapeHtml(text)}</p>`;
  renderQuestions(d.comprehension || [], d.discussion || []);
  showArticle();
}

function renderVocab(vocab) {
  document.getElementById("vocabGrid").innerHTML = vocab.slice(0, 6).map(v =>
    `<div class="vocab-card">
      <div class="vocab-word">${escapeHtml(v.word || "")}</div>
      <div class="vocab-def">${escapeHtml(v.definition || "")}</div>
      <div class="vocab-ex">${escapeHtml(v.example || "")}</div>
    </div>`
  ).join("");
}

// renderQuestions is the entry point for the exercise panel.
// It reads currentExerciseStage from State and renders the appropriate stage.
// Called after every article render and after stage transitions.
function renderQuestions(comp, disc) {
  if (currentExerciseStage === "mcq" && currentMCQs.length > 0) {
    renderMCQStage();
  } else if (currentExerciseStage === "comprehension") {
    renderComprehensionStage(comp, disc);
  } else if (currentExerciseStage === "discussion") {
    renderDiscussionStage(disc);
  }
}

// renderMCQStage renders the full MCQ exercise panel, showing one question
// at a time. Options are shuffled at render time so the correct answer
// position is never predictable. The correct answer is identified by
// matching option text against the "correct" field from the JSON.

// captureComprehension reads the current textarea values and any visible
// feedback from the DOM and saves them into savedComprehension in State.
// Called whenever the user navigates away from the comprehension stage,
// so nothing is lost if they return.
function captureComprehension() {
  [0, 1, 2, 3].forEach(i => {
    const textarea  = document.getElementById("answer-" + i);
    const feedbackEl = document.getElementById("feedback-" + i);
    savedComprehension[i] = {
      answer: textarea ? textarea.value : "",
      feedback: (feedbackEl && feedbackEl.style.display !== "none")
        ? { text: feedbackEl.textContent, correct: feedbackEl.classList.contains("feedback-correct") }
        : null,
    };
  });
}
function renderMCQStage() {
  const mcq     = currentMCQs[currentMCQIndex];
  const result  = mcqResults[currentMCQIndex];
  const isFirst = currentMCQIndex === 0;
  const isLast  = currentMCQIndex === currentMCQs.length - 1;

  const shuffled = shuffleMCQOptions(mcq.options, currentMCQIndex);

  const optionsHTML = shuffled.map((opt, i) => {
    let cls = "mcq-option";
    if (result) {
      const isSelected = opt === result.selected;
      const isCorrect  = opt === mcq.correct;
      if (isSelected && result.correct)  cls += " mcq-correct";
      if (isSelected && !result.correct) cls += " mcq-incorrect";
      if (!isSelected && isCorrect && !result.correct) cls += " mcq-reveal";
    }
    return `<button class="${cls}" data-option="${escapeHtml(opt)}" ${result ? "disabled" : ""}>${escapeHtml(opt)}</button>`;
  }).join("");

const lang = LANGUAGES[currentLang];
  const feedbackHTML = result
    ? result.correct
      ? `<div class="mcq-feedback mcq-feedback-correct">${escapeHtml(lang.mcqCorrect)}</div>`
      : `<div class="mcq-feedback mcq-feedback-incorrect">${escapeHtml(lang.mcqIncorrect)}${escapeHtml(mcq.correct)}</div>`
    : "";

  document.querySelector(".questions-row").style.gridTemplateColumns = "1fr";
  document.getElementById("discussionList").closest(".questions-block").style.display = "none";
  document.getElementById("comprehensionList").innerHTML = `
    <div class="mcq-progress">${currentMCQIndex + 1} / ${currentMCQs.length}</div>
    <div class="mcq-question">${escapeHtml(mcq.question)}</div>
    <div class="mcq-options">${optionsHTML}</div>
    ${feedbackHTML}
    <div class="mcq-nav">
      <button class="mcq-nav-btn" id="mcqBack" ${isFirst ? "disabled" : ""}>‹</button>
      <button class="mcq-nav-btn mcq-nav-skip" id="mcqSkip" title="${escapeHtml(lang.btnSkipMCQ)}">›› <span class="mcq-nav-label">${escapeHtml(lang.btnSkipMCQ)}</span></button>
      <button class="mcq-nav-btn mcq-nav-next" id="mcqNext">› <span class="mcq-nav-label">${isLast ? escapeHtml(lang.btnComprehension) : ""}</span></button>
    </div>`;

  document.querySelectorAll(".mcq-option").forEach(btn => {
    btn.addEventListener("click", () => handleMCQAnswer(btn.dataset.option, mcq.correct));
  });

  document.getElementById("mcqBack").addEventListener("click", () => {
    if (currentMCQIndex > 0) { currentMCQIndex--; renderMCQStage(); }
  });

  document.getElementById("mcqSkip").addEventListener("click", () => {
    currentExerciseStage = "comprehension";
    renderComprehensionStage(currentQuestions, currentDiscussion);
  });

  document.getElementById("mcqNext").addEventListener("click", () => {
    if (isLast) {
      currentExerciseStage = "comprehension";
      renderComprehensionStage(currentQuestions, currentDiscussion);
    } else {
      currentMCQIndex++;
      renderMCQStage();
    }
  });
}

// handleMCQAnswer records the user's answer, updates mcqResults, and
// re-renders the current MCQ to show feedback. The correct answer is
// identified by text match, not index, so shuffling never breaks it.
function handleMCQAnswer(selected, correct) {
  mcqResults[currentMCQIndex] = {
    selected,
    correct: selected === correct,
  };
  renderMCQStage();
}

// shuffleMCQOptions returns a deterministically shuffled copy of the options
// array for a given question index. Using the index as a seed means the same
// question always shuffles the same way — so navigating back shows the same
// order the user saw originally.
function shuffleMCQOptions(options, seed) {
  const arr = [...options];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (seed * 7 + i * 3) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// renderComprehensionStage renders all 4 comprehension questions with
// answer textareas and navigation buttons.
// Restores any previously saved answers and feedback if the user has
// navigated back from the discussion stage.
function renderComprehensionStage(comp, disc) {
  document.querySelector(".questions-row").style.gridTemplateColumns = "1fr";
  document.getElementById("discussionList").closest(".questions-block").style.display = "none";

  // Build the back-to-MCQ button only if this article has MCQ questions.
  // An article without MCQs has no MCQ stage to go back to.
  const lang = LANGUAGES[currentLang];
  const backToMCQBtn = currentMCQs.length > 0
    ? `<button class="check-btn" id="backToMCQBtn">${escapeHtml(lang.btnBackMCQ)}</button>`
    : "";

  document.getElementById("comprehensionList").innerHTML = comp.slice(0, 4).map((q, i) =>
    `<div class="q-item" id="q-item-${i}">
      <span class="q-num">${i + 1}</span>
      <div class="q-item-inner">
        <span class="q-text">${escapeHtml(q)}</span>
        <textarea class="answer-textarea" id="answer-${i}" placeholder="…"></textarea>
        <div class="answer-feedback" id="feedback-${i}" style="display:none"></div>
      </div>
    </div>`
  ).join("") + `<div class="check-row">
    ${backToMCQBtn}
    <button class="check-btn" id="checkBtn">${escapeHtml(lang.btnCheckAnswers)}</button>
    <span class="check-hint" id="checkHint"></span>
    <button class="check-btn" id="discussionBtn" style="margin-left:auto">${escapeHtml(lang.btnDiscussion)}</button>
  </div>`;

  // Restore saved answers and feedback from State.
  // This runs after innerHTML is set so the elements exist in the DOM.
  [0, 1, 2, 3].forEach(i => {
    const saved      = savedComprehension[i];
    const textarea   = document.getElementById("answer-" + i);
    const feedbackEl = document.getElementById("feedback-" + i);
    if (textarea)   textarea.value = saved.answer;
    if (feedbackEl && saved.feedback) {
      feedbackEl.textContent  = saved.feedback.text;
      feedbackEl.className    = "answer-feedback " + (saved.feedback.correct ? "feedback-correct" : "feedback-incorrect");
      feedbackEl.style.display = "block";
    }
  });

  if (currentMCQs.length > 0) {
    document.getElementById("backToMCQBtn").addEventListener("click", () => {
      captureComprehension();
      currentExerciseStage = "mcq";
      // Return to the last MCQ question (most natural landing point when going back).
      currentMCQIndex = currentMCQs.length - 1;
      renderMCQStage();
    });
  }

  document.getElementById("checkBtn").addEventListener("click", checkAnswers);

  document.getElementById("discussionBtn").addEventListener("click", () => {
    captureComprehension();
    currentExerciseStage = "discussion";
    renderDiscussionStage(currentDiscussion);
  });

  document.getElementById("discussionList").innerHTML = "";
}

// renderDiscussionStage shows the discussion questions and a back button
// to return to the comprehension stage. Left column is a placeholder for
// the graded discussion response feature (coming soon).
// captureDiscussion saves textarea values and any visible feedback into
// savedDiscussion in State before navigating away from the discussion stage.
function captureDiscussion() {
  [0, 1, 2, 3].forEach(i => {
    const textarea   = document.getElementById("disc-answer-" + i);
    const feedbackEl = document.getElementById("disc-feedback-" + i);
    savedDiscussion[i] = {
      answer: textarea ? textarea.value : "",
      feedback: (feedbackEl && feedbackEl.style.display !== "none")
        ? {
            level:    parseInt(feedbackEl.dataset.level || "0"),
            feedback: feedbackEl.querySelector(".disc-feedback-text")?.textContent || ""
          }
        : null,
    };
  });
}

// restoreDiscussionFeedback applies level class, label, and feedback text
// to a feedback element. Used by both the restore path (navigating back)
// and the fresh submission path so rendering logic is never duplicated.
function restoreDiscussionFeedback(el, level, feedbackText, lang) {
  const labelMap = {
    1: lang.discussionLevel1,
    2: lang.discussionLevel2,
    3: lang.discussionLevel3,
    4: lang.discussionLevel4,
  };
  el.className     = `discussion-feedback discussion-level-${level}`;
  el.dataset.level = level;
  el.querySelector(".disc-feedback-label").textContent = (labelMap[level] || "") + " — ";
  el.querySelector(".disc-feedback-text").textContent  = feedbackText;
  el.style.display = "block";
}

// renderDiscussionStage renders discussion questions with answer textareas,
// a submit button, and inline level feedback after submission.
// Restores saved state if the user navigates back and returns.
function renderDiscussionStage(disc) {
  const row    = document.querySelector(".questions-row");
  const blocks = row.querySelectorAll(".questions-block");
  row.style.gridTemplateColumns = "1fr";
  blocks[0].style.display = "none";
  blocks[1].style.display = "";

  document.getElementById("comprehensionList").innerHTML = "";

  const lang = LANGUAGES[currentLang];

  document.getElementById("discussionList").innerHTML =
    `<button class="check-btn" id="backToCompBtn" style="margin-bottom:1rem">${escapeHtml(lang.btnBackComprehension)}</button>` +
    disc.slice(0, 4).map((q, i) =>
      `<div class="q-item" id="disc-item-${i}">
        <span class="q-num">${i + 1}</span>
        <div class="q-item-inner">
          <span class="q-text">${escapeHtml(q)}</span>
          <textarea class="answer-textarea" id="disc-answer-${i}" placeholder="${escapeHtml(lang.discussionPlaceholder)}"></textarea>
          <div class="discussion-feedback" id="disc-feedback-${i}" data-level="0">
            <span class="disc-feedback-label"></span>
            <span class="disc-feedback-text"></span>
          </div>
        </div>
      </div>`
    ).join("") +
    `<div class="check-row">
      <button class="check-btn" id="checkDiscBtn">${escapeHtml(lang.btnCheckDiscussion)}</button>
      <span class="check-hint" id="checkDiscHint"></span>
    </div>`;

  // Restore saved state if returning from comprehension.
  [0, 1, 2, 3].forEach(i => {
    const saved      = savedDiscussion[i];
    const textarea   = document.getElementById("disc-answer-" + i);
    const feedbackEl = document.getElementById("disc-feedback-" + i);
    if (textarea) textarea.value = saved.answer;
    if (feedbackEl && saved.feedback) {
      restoreDiscussionFeedback(feedbackEl, saved.feedback.level, saved.feedback.feedback, lang);
    }
  });

  document.getElementById("backToCompBtn").addEventListener("click", () => {
    captureDiscussion();
    blocks[0].style.display = "";
    currentExerciseStage = "comprehension";
    renderComprehensionStage(currentQuestions, currentDiscussion);
  });

  document.getElementById("checkDiscBtn").addEventListener("click", checkDiscussionAnswers);
}

function showArticle() {
  document.getElementById("articleOuter").style.display = "block";
  document.getElementById("articleOuter").scrollIntoView({ behavior:"smooth", block:"start" });
}

// --- Utilities ---
// Small helper functions used by multiple sections above.
// They live at the bottom of Renderer because they are all about
// what the user sees or how displayed text is handled.

// setLoading shows/hides the loading spinner and disables/re-enables
// the generate button. The button label is restored on hide because
// it changes per mode.
function setLoading(on, loadingText) {
  document.getElementById("loadingBox").style.display = on ? "block" : "none";
  document.getElementById("uiLoading").textContent    = loadingText || "";
  document.getElementById("genBtn").disabled          = on;
  if (!on) {
    const lang   = LANGUAGES[currentLang];
    const btnMap = { news:lang.generateBtn, reads:lang.generateBtn, wiki:lang.fetchWikiBtn, lit:lang.fetchLitBtn, custom:lang.analyzeBtn };
    document.getElementById("genBtn").textContent = "↻  " + (btnMap[currentMode] || lang.generateBtn);
  }
}

function showError(m) { const e = document.getElementById("errorBox");  e.textContent = m; e.style.display = "block"; }
function hideError()   { document.getElementById("errorBox").style.display  = "none"; }
function showDebug(m)  { const e = document.getElementById("debugBox");  e.textContent = m; e.style.display = "block"; }
function hideDebug()   { document.getElementById("debugBox").style.display  = "none"; }

// buildPickButtons creates the category/genre selector buttons.
// withRandom controls whether a "Random" button is appended — it is
// omitted for Literature because Gutenberg already picks randomly.
function buildPickButtons(cats, lang, withRandom = true) {
  const row = document.getElementById("categoryRow");
  row.innerHTML = ""; selectedCategory = null;
  Object.entries(cats).forEach(([key, label]) => {
    const btn = document.createElement("button");
    btn.className = "pick-btn"; btn.dataset.cat = key; btn.textContent = label;
    row.appendChild(btn);
  });
  if (withRandom) {
    const rnd = document.createElement("button");
    rnd.className = "pick-btn random-btn"; rnd.textContent = lang.randomBtn;
    rnd.addEventListener("click", () => {
      const keys = Object.keys(cats);
      selectCat(row, keys[Math.floor(Math.random() * keys.length)]);
    });
    row.appendChild(rnd);
  }
  row.addEventListener("click", e => {
    const btn = e.target.closest(".pick-btn");
    if (!btn || btn.classList.contains("random-btn")) return;
    selectCat(row, btn.dataset.cat);
  });
}

function selectCat(row, key) {
  row.querySelectorAll(".pick-btn").forEach(b => b.classList.remove("active"));
  const t = row.querySelector(`[data-cat="${CSS.escape(key)}"]`);
  if (t) t.classList.add("active");
  selectedCategory = key;
}

// trimToWords cleans and trims text to a maximum word count while
// preserving paragraph breaks. Used for Wikipedia and Gutenberg excerpts.
function trimToWords(text, max) {
  const clean = text.replace(/\n{3,}/g, "\n\n").trim();
  const paras = clean.split("\n\n").map(p => p.trim()).filter(p => p.length > 15);
  return paras.join("\n\n").split(/\s+/).slice(0, max).join(" ");
}

// escapeHtml prevents user-supplied or AI-generated text from being
// interpreted as HTML. Every string inserted into innerHTML must pass
// through this function first.
function escapeHtml(v) {
  return String(v)
    .replaceAll("&",  "&amp;")
    .replaceAll("<",  "&lt;")
    .replaceAll(">",  "&gt;")
    .replaceAll('"',  "&quot;")
    .replaceAll("'",  "&#039;");
}




// ================================================================
// 6. HISTORY (Browse)
// ================================================================
// Purpose: everything that powers the Browse sub-tab — loading the
// article grid, building filter chips, paginating, and opening a
// saved article from a card click.
//
// What this section does NOT do:
// - It does not generate new content (→ Generator)
// - It does not render article content (→ Renderer handles that,
//   called at the end of loadSavedArticle)
//
// Key design choice — zero list operations:
// loadHistory reads from a single index key (index::lang::mode)
// via the /history worker route. The worker filters and paginates
// in memory. This means Browse costs exactly 1 KV read per page,
// regardless of how many articles exist. Never add a list() call here.
// ================================================================

function switchSubMode(sub) {
  currentSubMode = sub;
  document.getElementById("subGenerate").classList.toggle("active", sub === "generate");
  document.getElementById("subBrowse").classList.toggle("active",   sub === "browse");
  document.getElementById("controls-area").style.display = sub === "generate" ? "" : "none";
  document.getElementById("historyOuter").style.display  = sub === "browse"   ? "block" : "none";
  document.getElementById("articleOuter").style.display  = "none";
  hideError(); hideDebug();
  if (sub === "browse") {
    historyPage = 0; historyDone = false; historyFilter = null; historyLevelFilter = null;
    loadHistory();
  }
}

// loadHistory fetches one page of articles and renders the browse grid.
// It also rebuilds the level and category filter chips on every call,
// because the active filter state needs to be reflected in the chip UI.
//
// Important: filter chip onclick handlers call loadHistory() directly
// after updating the filter state variables. Do NOT call loadHistory()
// from anywhere inside this function after rendering — that was the
// infinite loop bug fixed in Phase 0.
async function loadHistory() {
  const lang    = LANGUAGES[currentLang];
  const grid    = document.getElementById("historyGrid");
  const pageRow = document.getElementById("paginationRow");

  grid.innerHTML    = `<div class="history-loading">…</div>`;
  pageRow.innerHTML = "";

  // Build level filter chips
  const levelRow = document.getElementById("historyLevelRow");
  levelRow.innerHTML = "";
  const allLevelChip = document.createElement("button");
  allLevelChip.className   = "pick-btn" + (historyLevelFilter === null ? " active" : "");
  allLevelChip.textContent = lang.browseFilterAll;
  allLevelChip.onclick     = () => { historyLevelFilter = null; historyPage = 0; historyDone = false; loadHistory(); };
  levelRow.appendChild(allLevelChip);
  ["A1","A2","B1","B2","C1","C2"].forEach(lvl => {
    const chip = document.createElement("button");
    chip.className   = "pick-btn" + (historyLevelFilter === lvl ? " active" : "");
    chip.textContent = lvl;
    chip.style.cssText = "min-width:44px;text-align:center;flex:1";
    chip.onclick     = () => { historyLevelFilter = lvl; historyPage = 0; historyDone = false; loadHistory(); };
    levelRow.appendChild(chip);
  });

  // Build category filter chips
  const filterRow = document.getElementById("historyFilterRow");
  filterRow.innerHTML = "";
  const cats = currentMode === "news"  ? lang.newsCategories
             : currentMode === "reads" ? lang.readsCategories
             : currentMode === "wiki"  ? lang.wikiCategories
             : currentMode === "lit"   ? lang.litGenres : {};
  const allCatChip = document.createElement("button");
  allCatChip.className   = "pick-btn" + (historyFilter === null ? " active" : "");
  allCatChip.textContent = lang.browseFilterAll;
  allCatChip.onclick     = () => { historyFilter = null; historyPage = 0; historyDone = false; loadHistory(); };
  filterRow.appendChild(allCatChip);
  Object.entries(cats).forEach(([key, label]) => {
    const chip = document.createElement("button");
    chip.className   = "pick-btn" + (historyFilter === key ? " active" : "");
    chip.textContent = label;
    chip.onclick     = () => { historyFilter = key; historyPage = 0; historyDone = false; loadHistory(); };
    filterRow.appendChild(chip);
  });

  // Fetch from worker
  try {
    let fetchUrl = PROXY_URL + "/history"
      + "?lang="  + encodeURIComponent(currentLang)
      + "&mode="  + encodeURIComponent(currentMode)
      + "&page="  + historyPage
      + "&limit=" + 12;
    if (historyFilter)      fetchUrl += "&category=" + encodeURIComponent(historyFilter);
    if (historyLevelFilter) fetchUrl += "&level="    + encodeURIComponent(historyLevelFilter);

    const data  = await (await fetch(fetchUrl)).json();
    const items = data.items || [];
    historyDone = data.done;

    if (!items.length) {
      grid.innerHTML = `<div class="history-empty"><span>📭</span>${lang.browseEmpty}</div>`;
    } else {
      grid.innerHTML = items.map(item => {
        const catLabel = cats[item.category] || item.category || "";
        const date     = item.savedAt ? new Date(item.savedAt).toLocaleDateString() : "";
        const levelTag = item.level   ? `<span class='tag' style='font-size:9px;padding:2px 7px'>${escapeHtml(item.level)}</span>`    : "";
        const catTag   = catLabel     ? `<span class='tag tag-domain' style='font-size:9px;padding:2px 7px'>${escapeHtml(catLabel)}</span>` : "";
        return `<div class='history-card' data-key='${escapeHtml(item.key)}'>
          <div class='history-card-title'>${escapeHtml(item.title || "—")}</div>
          <div class='history-card-meta'>${levelTag}${catTag}</div>
          <div class='history-card-date'>${date}</div>
        </div>`;
      }).join("");

      // Card click: fetch and render the full article.
      // The handler is added once and removes itself after a click to
      // avoid stacking duplicate listeners on each page load.
      grid.addEventListener("click", function handler(e) {
        const card = e.target.closest(".history-card");
        if (card && card.dataset.key) {
          grid.removeEventListener("click", handler);
          loadSavedArticle(card.dataset.key);
        }
      });
    }

    // Pagination buttons
    const prevBtn = document.createElement("button");
    prevBtn.className   = "page-btn";
    prevBtn.textContent = lang.browsePrev;
    prevBtn.disabled    = historyPage === 0;
    prevBtn.onclick     = () => { historyPage--; loadHistory(); };

    const nextBtn = document.createElement("button");
    nextBtn.className   = "page-btn";
    nextBtn.textContent = lang.browseNext + " →";
    nextBtn.disabled    = historyDone;
    nextBtn.onclick     = () => { historyPage++; loadHistory(); };

    pageRow.appendChild(prevBtn);
    pageRow.appendChild(nextBtn);

  } catch(e) {
    grid.innerHTML = `<div class="history-empty"><span>⚠️</span>Could not load history: ${e.message}</div>`;
  }
}

// loadSavedArticle fetches one full article from KV by its key and
// renders it using the same Renderer functions used for new articles.
async function loadSavedArticle(key) {
  const lang = LANGUAGES[currentLang];
  try {
    const saved = await (await fetch(PROXY_URL + "/article?key=" + encodeURIComponent(key))).json();
    if (saved.error) throw new Error(saved.error);
    const d    = saved.data;
    const mode = saved.mode;
    if (mode === "news" || mode === "reads") {
      const domainLabel = lang.newsCategories[d.domain] || lang.readsCategories[d.domain] || d.domain || saved.category;
      renderArticle(d, lang, saved.level || "—", domainLabel, mode === "news" ? lang.byline : lang.bylineReads, lang.nextBtn);
    } else {
      const noticeMap = { wiki:lang.sourceNoticeWiki, lit:lang.sourceNoticeLit, custom:null };
      const linkMap   = { wiki:lang.sourceLink,       lit:lang.sourceLinkLit,   custom:null };
      const tagMap    = { wiki:"Wikipedia", lit:"Gutenberg", custom:"Custom" };
      const bylineMap = { wiki:lang.bylineWiki, lit:lang.bylineLit, custom:lang.bylineCustom };
      renderExternalText(d, lang, saved.title, (d.paragraphs || []).join("\n\n") || saved.title, null, noticeMap[mode] || null, linkMap[mode] || null, tagMap[mode] || "", bylineMap[mode] || "");
    }
    document.getElementById("historyOuter").style.display = "none";
    document.getElementById("articleOuter").style.display = "block";
    document.getElementById("articleOuter").scrollIntoView({ behavior:"smooth", block:"start" });
  } catch(e) { showError("Could not load article: " + e.message); }
}




// ================================================================
// 7. CORRECTION (placeholder)
// ================================================================
// Purpose: will handle the answer-checking feature for comprehension
// questions. Not yet built — this section reserves the space so the
// feature has a clear home when the time comes.
//
// Planned shape (agreed, not built):
// - Answer textareas rendered below each comprehension question
//   by an extension to renderQuestions() in the Renderer section
// - A single "Check answers" button submits all 4 at once
// - Worker route: POST /correct
//   Payload:  { lang, context, questions[4], answers[4] }
//   Response: { results: [{ correct, feedback }] × 4 }
// - Groq (Llama 3.3 70B) handles correction — high volume,
//   quality-tolerant. Gemini stays reserved for generation.
// - GROQ_API_KEY must be added as a Cloudflare Worker secret
//   before this section is built.
// ================================================================

// checkAnswers collects the student's 4 answers, sends them to the
// worker's /correct route along with the article context and questions,
// and displays inline feedback below each comprehension question.
//
// Reads currentContext and currentQuestions from State — set by
// renderArticle() and renderExternalText() in the Renderer each time
// a new article is displayed.
async function checkAnswers() {
  const btn  = document.getElementById("checkBtn");
  const hint = document.getElementById("checkHint");
  const lang = LANGUAGES[currentLang];

  const answers = [0, 1, 2, 3].map(i => {
    const el = document.getElementById("answer-" + i);
    return el ? el.value.trim() : "";
  });

  if (answers.every(a => a === "")) {
    hint.textContent = lang.errorNoAnswer;
    return;
  }

  btn.disabled     = true;
  btn.textContent  = "…";
  hint.textContent = "";

  [0, 1, 2, 3].forEach(i => {
    const el = document.getElementById("feedback-" + i);
    if (el) { el.style.display = "none"; el.textContent = ""; el.className = "answer-feedback"; }
  });

  try {
    const res = await fetch(PROXY_URL + "/correct", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        lang:      lang.targetLanguage,
        context:   currentContext,
        questions: currentQuestions,
        answers,
      }),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    data.results.forEach((result, i) => {
      const el = document.getElementById("feedback-" + i);
      if (!el) return;
      el.textContent   = result.feedback;
      el.className     = "answer-feedback " + (result.correct ? "feedback-correct" : "feedback-incorrect");
      el.style.display = "block";
    });

  } catch(e) {
    hint.textContent = lang.errorCheckFailed + e.message;
  } finally {
    btn.disabled    = false;
    btn.textContent = LANGUAGES[currentLang].btnCheckAnswers;
  }
}

// checkDiscussionAnswers submits the student's discussion responses to
// the worker's /correct route with mode:"discussion" and renders
// quality level feedback inline per question.
async function checkDiscussionAnswers() {
  const btn  = document.getElementById("checkDiscBtn");
  const hint = document.getElementById("checkDiscHint");
  const lang = LANGUAGES[currentLang];

  const answers = [0, 1, 2, 3].map(i => {
    const el = document.getElementById("disc-answer-" + i);
    return el ? el.value.trim() : "";
  });

  if (answers.every(a => a === "")) {
    hint.textContent = lang.errorNoAnswer;
    return;
  }

  btn.disabled     = true;
  btn.textContent  = "…";
  hint.textContent = "";

  [0, 1, 2, 3].forEach(i => {
    const el = document.getElementById("disc-feedback-" + i);
    if (el) { el.style.display = "none"; el.className = "discussion-feedback"; }
  });

  try {
    const res = await fetch(PROXY_URL + "/correct", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        lang:      lang.targetLanguage,
        context:   currentContext,
        questions: currentDiscussion,
        answers,
        mode:      "discussion",
      }),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    data.results.forEach((result, i) => {
      const el = document.getElementById("disc-feedback-" + i);
      if (!el) return;
      restoreDiscussionFeedback(el, result.level, result.feedback, lang);
    });

  } catch(e) {
    hint.textContent = lang.errorCheckFailed + e.message;
  } finally {
    btn.disabled    = false;
    btn.textContent = lang.btnCheckDiscussion;
  }
}

// ================================================================
// 8. APP INIT
// ================================================================
// Purpose: the startup sequence. Runs once when the page loads.
// Wires all event listeners and calls the first render.
//
// Why last: every function and variable above must be defined before
// this section runs. JS hoists function declarations but not const/let,
// so the section order in this file matters.
//
// What this section does NOT do:
// - It does not contain any logic beyond wiring and startup calls.
//   If a listener needs complex logic, that logic lives in the
//   appropriate section above and is just called from here.
// ================================================================

// Build the language sidebar buttons
function buildSidebar() {
  const sidebar = document.getElementById("sidebar");
  Object.entries(LANGUAGES).forEach(([code, lang]) => {
    const btn = document.createElement("button");
    btn.className    = "lang-btn";
    btn.dataset.lang = code;
    btn.innerHTML    = `<span class="lang-flag">${lang.flag}</span><span class="lang-name">${lang.name}</span>`;
    btn.addEventListener("click", () => applyLanguage(code));
    sidebar.appendChild(btn);
  });
}

// Level selector — clicking any level chip updates selectedLevel in State
document.getElementById("levelRow").addEventListener("click", e => {
  const btn = e.target.closest(".pick-btn");
  if (!btn) return;
  document.querySelectorAll("#levelRow .pick-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  selectedLevel = btn.dataset.level;
});

// Custom text character counter
document.getElementById("customText").addEventListener("input", function() {
  const len = this.value.length;
  const el  = document.getElementById("charCount");
  el.textContent = len + " / " + MAX_CHARS;
  el.classList.toggle("over", len > MAX_CHARS);
});

// Mode tab buttons — moved from inline onclick in HTML to here so
// all event wiring lives in one place and app.js is the single
// source of truth for application behaviour.
document.getElementById("tabNews").addEventListener("click",   () => switchMode("news"));
document.getElementById("tabReads").addEventListener("click",  () => switchMode("reads"));
document.getElementById("tabWiki").addEventListener("click",   () => switchMode("wiki"));
document.getElementById("tabLit").addEventListener("click",    () => switchMode("lit"));
document.getElementById("tabCustom").addEventListener("click", () => switchMode("custom"));

// Sub-tab buttons (Generate / Browse)
document.getElementById("subGenerate").addEventListener("click", () => switchSubMode("generate"));
document.getElementById("subBrowse").addEventListener("click",   () => switchSubMode("browse"));

// Generate button and Next Article button
document.getElementById("genBtn").addEventListener("click",    handleGenerate);
document.getElementById("uiNextBtn").addEventListener("click", handleGenerate);

// --- Startup ---
buildSidebar();
applyLanguage("de");
updateSubLabels();

// Pre-select a random news category on load so the user can generate
// immediately without having to pick a topic first.
const newsKeys = Object.keys(LANGUAGES.de.newsCategories);
selectCat(document.getElementById("categoryRow"), newsKeys[Math.floor(Math.random() * newsKeys.length)]);
