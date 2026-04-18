const fs = require('fs');
const d = JSON.parse(fs.readFileSync('C:/Users/СРЦН/Documents/anixard-pc/anixard-pc/data.json', 'utf8'));
const mangaMap = {};
d.manga_cache.forEach(m => mangaMap[m.id] = m);

const ruStopWords = new Set(['озвучка', 'манги', 'манхвы', 'главы', 'глава', 'стал', 'стала', 'стало', 'был', 'была', 'было', 'получил', 'попал', 'мире', 'после', 'перед', 'через', 'всех', 'этот', 'свой', 'один', 'мной', 'тебя', 'него', 'себя', 'очень', 'другой', 'новый', 'самый', 'более', 'менее', 'когда', 'тоже', 'даже', 'если', 'этом', 'этой', 'этих', 'свою', 'своё', 'свои', 'моей', 'моего']);

// Reject keywords — not a voiceover
const rejectRe = /реакция|reaction|обзор|review|трейлер|trailer|amv|mmv|edit(?!\w)|мем|meme|прикол|tiktok|тикток|shorts|short|opening|эндинг|опенинг|ending|ost\b|саундтрек|клип|топ\s*\d|top\s*\d|сравнение|versus|\bvs\s|теори[яи]|theory|разбор\s|новости|стрим|stream|live\b|дорам[аы]|dorama|drama\b|фильм|movie|сериал[аыов]?\b|\d+\s*сери[яи]|series|k-?drama|c-?drama|аниме.?сериал|аниме.?онлайн|аниме\s*за\s*\d+\s*мин|\bмарафон\b|resumen|за\s*\d+\s*мин|gacha|гача|roblox|роблокс|minecraft|майнкрафт|fortnite|все\s*серии\s*подряд|hogwarts|hellblade|прохождение/i;

// Extract the "core title" from a video title — the part before markers
function extractVideoCoreName(title) {
    const t = title.toLowerCase();
    // Try to find text before озвучка/главы markers
    const before = t.match(/^(.+?)(?:\s*[|/\\•·—–\-]\s*|\s+)(?:озвучк|дубляж|глав[аыи]?\s*\d)/i);
    if (before && before[1].length >= 4) return before[1].replace(/[|•·—–\[\](){}«»""!?#@\d]/g, ' ').replace(/\s+/g, ' ').trim();
    return t;
}

let removed = 0;
let removedList = [];

d.manga_voiceovers = d.manga_voiceovers.filter(v => {
    const manga = mangaMap[v.manga_id];
    if (!manga || !v.is_auto) return true;
    const t = v.title || '';
    const vt = t.toLowerCase();

    // 1) Reject by keywords
    if (rejectRe.test(t)) {
        removed++;
        removedList.push(`[KEYWORD] "${t}" ≠ ${manga.title_ru}`);
        return false;
    }

    const ruLower = (manga.title_ru || '').toLowerCase().trim();
    const enLower = (manga.title_en || '').toLowerCase().trim();
    const ruWordCount = ruLower.split(/\s+/).length;
    const enWordCount = enLower.split(/\s+/).length;

    // 2) Single-word manga names (e.g. "Некромант", "Синева", "Стальной", "Мстители", "Реальность")
    //    Must appear as a standalone title, not as a random word in a sentence
    if (ruWordCount === 1 && ruLower.length < 15) {
        // The manga name must be in quotes OR right after "озвучка манги" OR as the first word in a segment
        const segments = t.split(/[|•·—–/\\]/).map(s => s.trim());
        const nameRe = new RegExp('(^|\\s)' + ruLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)', 'i');

        const inTitlePosition = segments.some(seg => {
            const sl = seg.toLowerCase().trim();
            if (!nameRe.test(sl)) return false;
            // Name must be the main subject of the segment, not buried in a long sentence
            // If segment has more than 6 words and name is just one of them — suspicious
            const segWords = sl.split(/\s+/).length;
            if (segWords > 8) return false; // Too long a sentence, name is probably coincidental
            // Must have manga/voice context in same segment
            return /озвучк|манг|манхв|глав|\d+\s*[-–]\s*\d+/i.test(seg);
        });
        const quoted = new RegExp(`["«"']\\s*${ruLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*["»"']`, 'i').test(vt);
        const afterOz = new RegExp(`озвучк[аи]?\\s+(манг[аиы]?\\s+)?["«]?${ruLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(vt);

        if (!inTitlePosition && !quoted && !afterOz) {
            removed++;
            removedList.push(`[1WORD] "${t}" ≠ ${manga.title_ru}`);
            return false;
        }
        return true;
    }

    // 3) Two-word manga names — stricter context check
    if (ruWordCount === 2 && ruLower.length < 20) {
        if (ruLower.length >= 5 && vt.includes(ruLower)) {
            const segments = t.split(/[|•·—–/\\]/).map(s => s.toLowerCase().trim());
            const inContext = segments.some(seg => seg.includes(ruLower) && /озвучк|манг|манхв|глав|\d+\s*[-–]\s*\d+/i.test(seg));
            const quoted = new RegExp(`["«"'].*${ruLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*["»"']`, 'i').test(vt);
            const afterOz = new RegExp(`озвучк[аи]?\\s+(манг[аиы]?\\s+)?${ruLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(vt);
            // Also check: the name should be a significant portion of the video's "core title"
            const core = extractVideoCoreName(t);
            const nameIsCore = core.includes(ruLower) && core.length < ruLower.length * 4;

            if (inContext || quoted || afterOz || nameIsCore) return true;
            removed++;
            removedList.push(`[2WORD] "${t}" ≠ ${manga.title_ru}`);
            return false;
        }
    }

    // 4) Full name match (3+ words)
    if (ruLower.length >= 5 && vt.includes(ruLower)) return true;
    if (enLower.length >= 5 && vt.includes(enLower)) return true;

    // 5) Word matching — strict
    const ruWords = ruLower.split(/\s+/).filter(w => w.length >= 3 && !ruStopWords.has(w));
    const ruMatched = ruWords.filter(w => vt.includes(w)).length;
    // For names with 1-3 significant words: ALL must match
    // For 4+ words: 60% must match (was 50%)
    const ruThresh = ruWords.length <= 3 ? ruWords.length : Math.ceil(ruWords.length * 0.6);
    if (ruWords.length >= 2 && ruMatched >= ruThresh) return true;
    // Single significant word — not enough for word matching (too ambiguous)
    if (ruWords.length <= 1) {
        removed++;
        removedList.push(`[FEWWORDS] "${t}" ≠ ${manga.title_ru}`);
        return false;
    }

    removed++;
    removedList.push(`[NOMATCH] "${t}" ≠ ${manga.title_ru}`);
    return false;
});

console.log('Removed:', removed, 'Remaining:', d.manga_voiceovers.length);
removedList.forEach(r => console.log('  ' + r));
fs.writeFileSync('C:/Users/СРЦН/Documents/anixard-pc/anixard-pc/data.json', JSON.stringify(d, null, 2));