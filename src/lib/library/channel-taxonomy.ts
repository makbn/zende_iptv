import type { M3uChannel } from "@/core/playlist/m3u-parse";
import type { LibraryContentType } from "@/lib/channels/content-type";

export type ChannelTaxonomy = {
  categoryKey: string;
  categoryLabel: string;
  languageKey: string | null;
  countryKey: string | null;
};

type CountryRule = {
  key: string;
  label: string;
  language: string | null;
  aliases: string[];
};

const COUNTRY_RULES: CountryRule[] = [
  { key: "us", label: "United States", language: "en", aliases: ["united states", "usa", "us"] },
  { key: "uk", label: "United Kingdom", language: "en", aliases: ["united kingdom", "great britain", "british", "britain", "uk"] },
  { key: "nz", label: "New Zealand", language: "en", aliases: ["new zealand", "nz"] },
  { key: "ca", label: "Canada", language: "en", aliases: ["canada", "ca"] },
  { key: "au", label: "Australia", language: "en", aliases: ["australia", "au"] },
  { key: "ie", label: "Ireland", language: "en", aliases: ["ireland", "irish", "ie"] },
  { key: "fr", label: "France", language: "fr", aliases: ["france", "french", "fr"] },
  { key: "de", label: "Germany", language: "de", aliases: ["germany", "deutschland", "german", "de"] },
  { key: "nl", label: "Netherlands", language: "nl", aliases: ["netherlands", "nederland", "holland", "dutch", "nl"] },
  { key: "es", label: "Spain", language: "es", aliases: ["spain", "spanish", "espana", "es"] },
  { key: "pt", label: "Portugal", language: "pt", aliases: ["portugal", "portuguese", "pt"] },
  { key: "it", label: "Italy", language: "it", aliases: ["italy", "italian", "it"] },
  { key: "se", label: "Sweden", language: "sv", aliases: ["sweden", "swedish", "se", "sw"] },
  { key: "dk", label: "Denmark", language: "da", aliases: ["denmark", "danish", "dk"] },
  { key: "no", label: "Norway", language: "no", aliases: ["norway", "norwegian", "no"] },
  { key: "fi", label: "Finland", language: "fi", aliases: ["finland", "finnish", "fi"] },
  { key: "is", label: "Iceland", language: "is", aliases: ["iceland", "icelandic", "is", "ic"] },
  { key: "be", label: "Belgium", language: null, aliases: ["belgium", "belgian", "be"] },
  { key: "ch", label: "Switzerland", language: null, aliases: ["switzerland", "swiss", "ch", "sh"] },
  { key: "at", label: "Austria", language: "de", aliases: ["austria", "austrian", "at"] },
  { key: "pl", label: "Poland", language: "pl", aliases: ["poland", "polish", "pl"] },
  { key: "cz", label: "Czechia", language: "cs", aliases: ["czech republic", "czechia", "czech", "cz"] },
  { key: "sk", label: "Slovakia", language: "sk", aliases: ["slovakia", "slovak", "sk"] },
  { key: "hu", label: "Hungary", language: "hu", aliases: ["hungary", "hungarian", "hu"] },
  { key: "ro", label: "Romania", language: "ro", aliases: ["romania", "romanian", "ro"] },
  { key: "bg", label: "Bulgaria", language: "bg", aliases: ["bulgaria", "bulgarian", "bg"] },
  { key: "gr", label: "Greece", language: "el", aliases: ["greece", "greek", "gr"] },
  { key: "tr", label: "Turkey", language: "tr", aliases: ["turkiye", "turkey", "turkish", "turk", "tr"] },
  { key: "ru", label: "Russia", language: "ru", aliases: ["russia", "russian", "rus", "ru"] },
  { key: "ua", label: "Ukraine", language: "uk", aliases: ["ukraine", "ukrainian", "ua"] },
  { key: "al", label: "Albania", language: "sq", aliases: ["albania", "albanian", "al"] },
  { key: "rs", label: "Serbia", language: "sr", aliases: ["serbia", "srbija", "serbian", "rs"] },
  { key: "ba", label: "Bosnia and Herzegovina", language: "bs", aliases: ["bosnia", "bosnian", "ba"] },
  { key: "hr", label: "Croatia", language: "hr", aliases: ["croatia", "croatian", "hr"] },
  { key: "si", label: "Slovenia", language: "sl", aliases: ["slovenia", "slovenian", "si"] },
  { key: "mk", label: "North Macedonia", language: "mk", aliases: ["north macedonia", "macedonia", "mk"] },
  { key: "cy", label: "Cyprus", language: "el", aliases: ["cyprus", "cy"] },
  { key: "mt", label: "Malta", language: "en", aliases: ["malta", "maltese", "mt"] },
  { key: "ee", label: "Estonia", language: "et", aliases: ["estonia", "estonian", "ee"] },
  { key: "lv", label: "Latvia", language: "lv", aliases: ["latvia", "latvian", "lv"] },
  { key: "lt", label: "Lithuania", language: "lt", aliases: ["lithuania", "lithuanian", "lt"] },
  { key: "am", label: "Armenia", language: "hy", aliases: ["armenia", "armenian"] },
  { key: "az", label: "Azerbaijan", language: "az", aliases: ["azerbaijan", "azeri", "az"] },
  { key: "ge", label: "Georgia", language: "ka", aliases: ["georgia", "georgian", "ge"] },
  { key: "ma", label: "Morocco", language: "ar", aliases: ["morocco", "maroc", "ma"] },
  { key: "dz", label: "Algeria", language: "ar", aliases: ["algeria", "dz"] },
  { key: "tn", label: "Tunisia", language: "ar", aliases: ["tunisia", "tn"] },
  { key: "eg", label: "Egypt", language: "ar", aliases: ["egypt", "egyptian", "eg"] },
  { key: "iq", label: "Iraq", language: "ar", aliases: ["iraq", "iraqi", "iq"] },
  { key: "sa", label: "Saudi Arabia", language: "ar", aliases: ["saudi arabia", "saudi", "sa"] },
  { key: "ae", label: "United Arab Emirates", language: "ar", aliases: ["united arab emirates", "emirates", "uae", "ae"] },
  { key: "jo", label: "Jordan", language: "ar", aliases: ["jordan", "jo"] },
  { key: "lb", label: "Lebanon", language: "ar", aliases: ["lebanon", "lebanese", "lb"] },
  { key: "sy", label: "Syria", language: "ar", aliases: ["syria", "syrian", "sy"] },
  { key: "ps", label: "Palestine", language: "ar", aliases: ["palestine", "palestinian", "ps"] },
  { key: "kw", label: "Kuwait", language: "ar", aliases: ["kuwait", "kw"] },
  { key: "qa", label: "Qatar", language: "ar", aliases: ["qatar", "qa"] },
  { key: "bh", label: "Bahrain", language: "ar", aliases: ["bahrain", "bh"] },
  { key: "om", label: "Oman", language: "ar", aliases: ["oman", "om"] },
  { key: "ye", label: "Yemen", language: "ar", aliases: ["yemen", "ye"] },
  { key: "ly", label: "Libya", language: "ar", aliases: ["libya", "ly"] },
  { key: "sd", label: "Sudan", language: "ar", aliases: ["sudan", "sd"] },
  { key: "mr", label: "Mauritania", language: "ar", aliases: ["mauritania", "mr"] },
  { key: "sn", label: "Senegal", language: "fr", aliases: ["senegal", "sn"] },
  { key: "ng", label: "Nigeria", language: "en", aliases: ["nigeria", "nigerian", "ng"] },
  { key: "gh", label: "Ghana", language: "en", aliases: ["ghana", "gh"] },
  { key: "ke", label: "Kenya", language: "en", aliases: ["kenya", "ke"] },
  { key: "ug", label: "Uganda", language: "en", aliases: ["uganda", "ug"] },
  { key: "so", label: "Somalia", language: "so", aliases: ["somalia", "somali", "so"] },
  { key: "et", label: "Ethiopia", language: "am", aliases: ["ethiopia", "ethiopian", "et"] },
  { key: "cm", label: "Cameroon", language: "fr", aliases: ["cameroon", "cm"] },
  { key: "cd", label: "Congo", language: "fr", aliases: ["congo", "cd"] },
  { key: "in", label: "India", language: null, aliases: ["india", "indian", "in"] },
  { key: "kr", label: "South Korea", language: "ko", aliases: ["south korea", "korean", "korea", "ko", "kr"] },
];

const COUNTRY_BY_KEY = new Map(COUNTRY_RULES.map((rule) => [rule.key, rule]));

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English", multi: "Multilingual", ar: "Arabic", fr: "French", de: "German",
  es: "Spanish", pt: "Portuguese", it: "Italian", nl: "Dutch", sv: "Swedish",
  da: "Danish", no: "Norwegian", fi: "Finnish", is: "Icelandic", pl: "Polish",
  cs: "Czech", sk: "Slovak", hu: "Hungarian", ro: "Romanian", bg: "Bulgarian",
  el: "Greek", tr: "Turkish", ru: "Russian", uk: "Ukrainian", sq: "Albanian",
  sr: "Serbian", bs: "Bosnian", hr: "Croatian", sl: "Slovenian", mk: "Macedonian",
  et: "Estonian", lv: "Latvian", lt: "Lithuanian", hy: "Armenian", az: "Azerbaijani",
  ka: "Georgian", ku: "Kurdish", fa: "Persian", so: "Somali", am: "Amharic",
  ko: "Korean",
};

const LANGUAGE_ALIASES: Record<string, string> = {
  en: "en", english: "en", multi: "multi", multilingual: "multi", "multi lang": "multi",
  ar: "ar", arabic: "ar", arabe: "ar", fr: "fr", french: "fr", de: "de", german: "de",
  es: "es", spanish: "es", pt: "pt", portuguese: "pt", it: "it", italian: "it",
  nl: "nl", dutch: "nl", sv: "sv", swedish: "sv", da: "da", danish: "da",
  no: "no", norwegian: "no", fi: "fi", finnish: "fi", pl: "pl", polish: "pl",
  el: "el", greek: "el", tr: "tr", turkish: "tr", ru: "ru", russian: "ru",
  uk: "uk", ukrainian: "uk", sq: "sq", albanian: "sq", ku: "ku", kurdish: "ku",
  fa: "fa", farsi: "fa", persian: "fa", ko: "ko", korean: "ko",
};

function normalizedWords(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPhrase(words: string, phrase: string): boolean {
  const normalizedPhrase = normalizedWords(phrase);
  return ` ${words} `.includes(` ${normalizedPhrase} `);
}

function leadingTag(value: string): string | null {
  const bracket = value.match(/^\s*\[\s*([^\]]+)\s*\]/i)?.[1];
  if (bracket) return normalizedWords(bracket);
  const pipe = value.match(/^\s*([a-z]{2,12}(?:[- ]lang)?)\s*\|/i)?.[1];
  return pipe ? normalizedWords(pipe) : null;
}

function languageFromToken(token: string | null): string | null {
  if (!token) return null;
  return LANGUAGE_ALIASES[token] ?? null;
}

function countryFromText(value: string): CountryRule | null {
  const words = normalizedWords(value);
  if (!words) return null;
  for (const rule of COUNTRY_RULES) {
    if (rule.aliases.some((alias) => containsPhrase(words, alias))) return rule;
  }
  return null;
}

function languageFromExplicit(value: string | undefined): string | null {
  const words = normalizedWords(value ?? "");
  if (!words) return null;
  for (const part of words.split(/\s+/)) {
    const match = languageFromToken(part);
    if (match) return match;
  }
  return languageFromToken(words);
}

function languageFromNamePrefix(name: string): string | null {
  const token = name.match(/^\s*(?:[^a-z0-9]{0,8})?([a-z]{2,5})\s*[|:\-]/i)?.[1];
  if (!token) return null;
  const normalized = token.toLowerCase();
  const direct = languageFromToken(normalized);
  if (direct) return direct;
  return COUNTRY_BY_KEY.get(normalized)?.language ?? null;
}

function category(key: string, label: string) {
  return { categoryKey: key, categoryLabel: label };
}

function hasAny(words: string, phrases: string[]): boolean {
  return phrases.some((phrase) => containsPhrase(words, phrase));
}

function categoryFor(groupTitle: string, contentType: LibraryContentType) {
  const words = normalizedWords(groupTitle);
  if (hasAny(words, ["adult", "por"+"n", "xxx", "+18"])) return category("adult", "Adult");

  if (contentType === "movie") {
    if (hasAny(words, ["new releases", "top 2026", "top 2025", "top 2024", "top 2023", "top 2022", "top 2021"])) return category("new-releases", "New Releases");
    if (hasAny(words, ["documentary", "documentaries"])) return category("documentary", "Documentary");
    if (hasAny(words, ["horror"])) return category("horror", "Horror");
    if (hasAny(words, ["drama", "romance"])) return category("drama-romance", "Drama & Romance");
    if (hasAny(words, ["action", "war", "super heros", "super heroes"])) return category("action-adventure", "Action & Adventure");
    if (hasAny(words, ["comedy", "stand up"])) return category("comedy", "Comedy");
    if (hasAny(words, ["thriller", "crime", "mystery"])) return category("thriller-crime", "Thriller, Crime & Mystery");
    if (hasAny(words, ["sci fi", "fantasy"])) return category("sci-fi-fantasy", "Sci-Fi & Fantasy");
    if (hasAny(words, ["kids", "family", "children", "disney", "anime"])) return category("kids-family", "Kids & Family");
    if (hasAny(words, ["sport", "world cup", "fitness", "exercise", "yoga"])) return category("sports-fitness", "Sports & Fitness");
    if (hasAny(words, ["music", "concert", "festival"])) return category("music-concerts", "Music & Concerts");
    if (hasAny(words, ["netflix", "amazon", "hbo", "streaming"])) return category("streaming", "Streaming Collections");
    if (hasAny(words, ["classic", "western", "3d movies", "urban", "british"])) return category("collections", "Movie Collections");
    return category("movies", "Movies");
  }

  if (contentType === "series") {
    if (hasAny(words, ["kids", "children", "family"])) return category("kids-family", "Kids & Family");
    if (hasAny(words, ["anime"])) return category("anime", "Anime");
    if (hasAny(words, ["documentary"])) return category("documentary", "Documentary");
    if (hasAny(words, ["korean", "turkish", "uk series"])) return category("international-shows", "International Shows");
    if (hasAny(words, ["netflix", "amazon", "hulu", "quibi"])) return category("streaming", "Streaming Collections");
    if (hasAny(words, ["classic"])) return category("classic-shows", "Classic Shows");
    if (hasAny(words, ["latest"])) return category("new-shows", "New Shows");
    return category("shows", "Shows");
  }

  if (hasAny(words, ["sport", "sports", "ppv", "live events", "espn", "nba", "nfl", "nhl", "mlb", "milb", "ncaa", "fifa", "ufc", "f1", "motogp", "viaplay", "dazn", "racing", "hockey", "football", "victory+", "btn", "flo"])) return category("sports-events", "Sports & Events");
  if (hasAny(words, ["kids", "kidz", "family", "children", "enfants", "cocuk", "femijet", "paidika"])) return category("kids-family", "Kids & Family");
  if (hasAny(words, ["news", "information", "lajme", "haber"])) return category("news", "News");
  if (hasAny(words, ["documentary", "documentaries", "documentries", "dokumentare", "belgesel"])) return category("documentary", "Documentary");
  if (hasAny(words, ["music", "muzik", "radio", "concert"])) return category("music-radio", "Music & Radio");
  if (hasAny(words, ["cinema", "cinemania", "movie", "movies", "filma", "sinema", "kino"])) return category("movies", "Movies");
  if (hasAny(words, ["islamic", "islame", "christian", "dini", "ramadan", "religious"])) return category("faith", "Faith & Religion");
  if (hasAny(words, ["24 7", "on demand", "series", "sereis"])) return category("24-7", "24/7 Channels");
  if (hasAny(words, ["entertainment", "entertaiment", "divertissement", "psihagogia"])) return category("entertainment", "Entertainment");
  if (hasAny(words, ["abc", "cbs", "nbc", "fox", "pbs", "cw", "telemundo", "univision", "spectrum", "paramount", "peacock", "hulu", "hbo max", "apple tv"])) return category("networks", "Broadcast & Streaming Networks");
  return category("general", "General");
}

export function languageLabel(key: string): string {
  return LANGUAGE_LABELS[key] ?? key.toUpperCase();
}

export function countryLabel(key: string): string {
  return COUNTRY_BY_KEY.get(key)?.label ?? key.toUpperCase();
}

export function languageSortRank(key: string): number {
  if (key === "en") return 0;
  if (key === "multi") return 1;
  if (key === "ar") return 2;
  return 100;
}

export function deriveChannelTaxonomy(
  channel: Pick<M3uChannel, "name" | "groupTitle" | "tvgLanguage">,
  contentType: LibraryContentType,
): ChannelTaxonomy {
  const groupTitle = channel.groupTitle?.trim() ?? "";
  const tag = leadingTag(groupTitle);
  const country = countryFromText(groupTitle);
  const explicitLanguage = languageFromExplicit(channel.tvgLanguage);
  const taggedLanguage = languageFromToken(tag);
  const regionLanguage = tag === "ar" ? "ar" : null;
  const wordLanguage = Object.entries(LANGUAGE_ALIASES).find(([alias]) =>
    alias.length > 2 && containsPhrase(normalizedWords(groupTitle), alias),
  )?.[1] ?? null;
  const languageKey =
    explicitLanguage ??
    taggedLanguage ??
    regionLanguage ??
    country?.language ??
    wordLanguage ??
    languageFromNamePrefix(channel.name);

  return {
    ...categoryFor(groupTitle, contentType),
    languageKey,
    countryKey: country?.key ?? null,
  };
}
