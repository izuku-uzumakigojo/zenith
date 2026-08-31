import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY = process.env.GEMINI_API_KEY;
let ai = null;

if (API_KEY) {
    try {
        ai = new GoogleGenAI({ apiKey: API_KEY });
        console.log('[GEMINI] Gemini API client initialized.');
    } catch (e) {
        console.error('[GEMINI] Failed to initialize client:', e.message);
    }
} else {
    console.warn('[GEMINI] No GEMINI_API_KEY set — running on fallback quest generator only.');
}

const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join(__dirname, 'users.json');

// --- Hologram Coach Chat (live conversation, separate from the Gemini quest generator above) ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
if (!GEMINI_API_KEY) {
    console.warn('[COACH CHAT] No GEMINI_API_KEY set — /api/coach-chat will return an error until it is added.');
}

// These personas are inspired by each player's well-known style/reputation.
// They intentionally do NOT claim to literally be the real person or invent
// quotes attributed to them as if actually said — especially since Kobe
// Bryant has passed away. They're original coach characters with that energy.
const COACH_SYSTEM_PROMPTS = {
    steph: "You are an original basketball shooting coach character in a training app called ShonenSweat, styled with energy inspired by Stephen Curry's well-known reputation for elite shooting precision, footwork, and calm confidence. You are NOT Stephen Curry and must never claim to literally be him or any real person, and never invent quotes as if he personally said them. Speak in short, energetic, encouraging coaching lines (2-4 sentences max) about shooting mechanics, footwork, ball-handling fundamentals, and workout motivation. Stay strictly on-topic: basketball training, fitness, and motivation. If asked something unrelated or inappropriate, gently redirect to training talk.",
    kobe: "You are an original basketball coach character in a training app called ShonenSweat, styled with intensity inspired by the widely-known 'Mamba Mentality' work-ethic philosophy associated with Kobe Bryant. You are NOT Kobe Bryant and must never claim to literally be him or any real person (who has passed away), and never invent quotes as if he personally said them. Speak in short, intense, disciplined coaching lines (2-4 sentences max) about footwork, mid-range scoring, explosiveness, and work ethic. Stay strictly on-topic: basketball training, fitness, and motivation. If asked something unrelated or inappropriate, gently redirect to training talk.",
    kyrie: "You are an original basketball coach character in a training app called ShonenSweat, styled with creative flair and confidence inspired by Kyrie Irving's well-known reputation for elite ball-handling and improvisation. You are NOT Kyrie Irving and must never claim to literally be him or any real person, and never invent quotes as if he personally said them. Speak in short, confident, creative coaching lines (2-4 sentences max) about ball-handling, footwork, finishing, and creativity under pressure. Stay strictly on-topic: basketball training, fitness, and motivation. If asked something unrelated or inappropriate, gently redirect to training talk."
};

function loadUsers() {
    if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '{}');
    try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch { return {}; }
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Shared Gemini call used by both the free-text prompt endpoint and the daily
// quest endpoint. Returns a validated quest object, or null if Gemini is
// unavailable / the call fails / the response doesn't parse into a usable
// quest - callers should fall back to generateFallbackQuest() in that case.
// Failures are logged instead of swallowed so a bad/expired key or network
// issue is actually visible in the server console.
async function askGeminiForQuest({ subject, mentor, level, weight, age }) {
    if (!ai) return null;

    const prompt = `You are a sports mentor. Create a workout quest for: "${subject}". ` +
        `Player mentor persona: ${mentor}. Player age: ${age}, weight: ${weight || 'N/A'}, level: ${level}. ` +
        `Respond with ONLY raw JSON, no markdown fences, no commentary, in exactly this shape: ` +
        `{"title": "Short title (no brackets)", "description": "One-sentence in-character mentor line", ` +
        `"workout": "Title\\n- Exercise 1\\n- Exercise 2", "tasks": ["Exercise 1", "Exercise 2"], "rewardXp": 120}`;

    try {
        const resp = await ai.models.generateContent({ model: 'gemini-3.6-flash', contents: prompt });
        const raw = (resp.text || resp.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
        const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();

        // Model sometimes wraps the JSON with stray text even after stripping
        // fences - pull out the first {...} block defensively.
        const match = cleaned.match(/\{[\s\S]*\}/);
        const jsonText = match ? match[0] : cleaned;

        const parsed = JSON.parse(jsonText);

        if (!parsed.title || !Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
            console.error('[GEMINI] Response missing required fields (title/tasks):', jsonText.slice(0, 300));
            return null;
        }

        if (!parsed.workout) parsed.workout = `${parsed.title}\n` + parsed.tasks.map(t => `- ${t}`).join('\n');
        if (!parsed.rewardXp) parsed.rewardXp = 100 + (Number(level) || 1) * 20;

        return parsed;
    } catch (e) {
        console.error('[GEMINI] Quest generation failed, using fallback:', e.message);
        return null;
    }
}

function sendJson(res, status, data) {
    res.writeHead(status, { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
}

// Calculate Weight & Age Rep Scaling Factor
function getWeightScaleFactor(weightInput) {
    if (!weightInput) return 1.0;
    let lbs = 160;
    const match = String(weightInput).match(/\d+/);
    if (match) {
        let val = parseFloat(match[0]);
        if (String(weightInput).toLowerCase().includes('kg')) val *= 2.20462;
        lbs = val;
    }
    // Scale bodyweight reps: heavier weight = lower rep count for joint safety, lighter = higher reps
    return Math.min(1.3, Math.max(0.65, 160 / lbs));
}

// Fallback Mentor Quest Generator with Weight & Age Tailoring
function generateFallbackQuest(mentor = 'Izuku Midoriya', category = 'Full Body', level = 1, weight = '', age = 18) {
    const xpReward = 100 + (level * 20);
    const m = (mentor || 'Izuku Midoriya').toLowerCase();
    const cat = (category || 'Full Body').toLowerCase();
    const wFactor = getWeightScaleFactor(weight);

    if (m.includes('curry') || cat.includes('shooting')) {
        return {
            title: `[CURRY FLUIDITY] Splash Range & Handle Training - Lvl ${level}`,
            description: `"${mentor}: Distance doesn't matter if your mechanics and footwork are pristine. Focus on quick release and hand speed!"`,
            workout: `[QUEST BRIEFING]: Precision Shooting & Dribble Controls\n- 50 Form Shooting Makes (Swishes inside paint)\n- 50 Catch-and-Shoot 3-Pointers\n- 100 Crossover & Behind-the-Back Combo Dribbles\n- 4x30s Stationary Two-Ball Dribble Burnout\n- 25 Free Throws`,
            tasks: [
                "50 Form Shooting Makes (Swishes inside paint)",
                "50 Catch-and-Shoot 3-Pointers",
                "100 Crossover & Behind-the-Back Combo Dribbles",
                "4x30s Stationary Two-Ball Dribble Burnout",
                "25 Free Throws"
            ],
            rewardXp: xpReward
        };
    }

    if (m.includes('lebron') || cat.includes('vertical') || cat.includes('power')) {
        return {
            title: `[KING'S DOMAIN] Explosive Rim Attack & Power - Lvl ${level}`,
            description: `"${mentor}: Greatness requires relentless conditioning and peak physical dominance."`,
            workout: `[QUEST BRIEFING]: Power, Vertical & Explosive Force\n- 4 Sets x 12 Depth Jumps into Explosive Max Vertical Jumps\n- 5 Sets x 10 Heavy Rim Attacks\n- 4 Sets x 15 Bulgarian Split Squats\n- 4 Reps x 40 Yard Suicide Sprint Shuttles\n- 3 Minutes Core Plank`,
            tasks: [
                "4 Sets x 12 Depth Jumps into Explosive Max Vertical Jumps",
                "5 Sets x 10 Heavy Rim Attacks",
                "4 Sets x 15 Bulgarian Split Squats",
                "4 Reps x 40 Yard Suicide Sprint Shuttles",
                "3 Minutes Core Plank"
            ],
            rewardXp: xpReward
        };
    }

    if (cat.includes('recovery') || cat.includes('mobility') || cat.includes('stretch')) {
        return {
            title: `[RECOVERY PROTOCOL] Active Mobility & Joint Restoration - Lvl ${level}`,
            description: `"${mentor}: Recovery is essential to prevent injury and ascend to peak performance."`,
            workout: `[QUEST BRIEFING]: Specialized Recovery & Mobility Protocol\n- 10 Mins Foam Rolling\n- 3 Sets x 60s 90/90 Hip Mobility Stretches\n- 3 Sets x 20 Tibialis & Ankle Raises\n- 50 Form Swishes (Low Impact Touch)\n- 10 Mins Deep Breathing & Ice Protocol`,
            tasks: [
                "10 Mins Foam Rolling",
                "3 Sets x 60s 90/90 Hip Mobility Stretches",
                "3 Sets x 20 Tibialis & Ankle Raises",
                "50 Form Swishes (Low Impact Touch)",
                "10 Mins Deep Breathing & Ice Protocol"
            ],
            rewardXp: xpReward
        };
    }

    // ESSENTIAL SHADOW MONARCH / ONE FOR ALL CONDITIONING (DYNAMICALLY TAILORED BY WEIGHT)
    // This is the catch-all used when nothing above matched AND Gemini wasn't
    // available/failed. It used to return the exact same workout no matter what
    // the user typed (as long as their text didn't contain one of the few
    // hardcoded keywords above) - which made the "generate from text" feature
    // look broken/ignored. We now fold the user's actual input into the title
    // and description so it's clear this is a fallback tailored to what they
    // asked for, not a random unrelated workout.
    const pushups = Math.round(100 * wFactor);
    const situps = Math.round(100 * wFactor);
    const squats = Math.round(100 * wFactor);
    const boxJumps = Math.round(50 * wFactor);
    const weightLabel = weight ? ` (${weight} Bodyweight Scaled)` : '';

    const rawInput = (category || '').trim();
    const hasCustomInput = rawInput.length > 0 && rawInput.toLowerCase() !== 'full body';
    const titlePrefix = hasCustomInput
        ? `[ESSENTIAL CONDITIONING] Tailored for "${rawInput}"`
        : `[ESSENTIAL MONARCH CONDITIONING]`;
    const descIntro = hasCustomInput
        ? `"${mentor}: The System couldn't reach the AI mentor for a fully custom '${rawInput}' plan, so here's a solid full-body baseline scaled to you instead. PLUS ULTRA!"`
        : `"${mentor}: Complete the essential physical conditioning protocol tailored for your body weight. PLUS ULTRA!"`;

    return {
        title: `${titlePrefix} - Lvl ${level}${weightLabel}`,
        description: descIntro,
        workout: `${titlePrefix}: Bodyweight Scaled\n- ${pushups} Push-ups\n- ${situps} Sit-ups\n- ${squats} Bodyweight Squats\n- 10km Run (or 30 mins High-Intensity Basketball Conditioning)\n- ${boxJumps} Vertical Box Jumps`,
        tasks: [
            `${pushups} Push-ups (Weight-Tailored)`,
            `${situps} Sit-ups (Weight-Tailored)`,
            `${squats} Bodyweight Squats (Weight-Tailored)`,
            `10km Run (or 30 mins High-Intensity Basketball Conditioning)`,
            `${boxJumps} Vertical Box Jumps (Weight-Tailored)`
        ],
        rewardXp: xpReward
    };
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
    const pathname = parsedUrl.pathname;

    if (req.method === 'OPTIONS') return sendJson(res, 204, {});

    // --- API ROUTES ---

    // Auth Login & Signup
    if ((pathname === '/api/login' || pathname === '/api/signup') && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const { username, password, age = 18, height = '', weight = '' } = JSON.parse(body || '{}');
                if (!username || !password) return sendJson(res, 400, { success: false, message: 'Player name and password required.' });

                const users = loadUsers();

                if (pathname === '/api/login') {
                    const user = users[username];
                    if (!user) return sendJson(res, 400, { success: false, message: 'Player not found. Please Sign Up first.' });
                    if (user.password && user.password !== password) return sendJson(res, 401, { success: false, message: 'Invalid Password.' });

                    return sendJson(res, 200, {
                        success: true,
                        username: user.username,
                        level: user.level || 1,
                        xp: user.xp || 0,
                        streak: user.streak || 1,
                        lastQuestDate: user.lastQuestDate || null,
                        dailyQuest: user.currentQuest || user.dailyQuest || null,
                        statPoints: user.statPoints !== undefined ? user.statPoints : 3,
                        stats: user.stats || { str: 10, agi: 10, end: 10, sho: 10, drb: 10, jmp: 10 },
                        activeWorkouts: user.activeWorkouts || [],
                        age: user.age || 18,
                        height: user.height || '',
                        weight: user.weight || '',
                        activeTitle: user.activeTitle || 'E-Rank Trainee',
                        unlockedTitles: user.unlockedTitles || ['t_novice'],
                        dungeonGatesCleared: user.dungeonGatesCleared || 0
                    });
                } else { // Signup
                    if (users[username]) return sendJson(res, 400, { success: false, message: 'Player already exists! Use Login.' });

                    const newUser = {
                        username, password,
                        age: Number(age) || 18, height, weight,
                        level: 1, xp: 0, streak: 1,
                        lastQuestDate: null, currentQuest: null, statPoints: 3,
                        stats: { str: 10, agi: 10, end: 10, sho: 10, drb: 10, jmp: 10 },
                        activeWorkouts: []
                    };
                    users[username] = newUser;
                    saveUsers(users);

                    return sendJson(res, 200, { success: true, ...newUser });
                }
            } catch (err) {
                return sendJson(res, 500, { success: false, message: err.message });
            }
        });
        return;
    }

    // Save Progress
    if (pathname === '/api/save' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const data = JSON.parse(body || '{}');
                const { username } = data;
                if (!username) return sendJson(res, 400, { success: false, message: 'Username required.' });

                const users = loadUsers();
                users[username] = { ...users[username], ...data };
                saveUsers(users);

                return sendJson(res, 200, { success: true, message: 'Progress Saved.' });
            } catch (err) {
                return sendJson(res, 500, { success: false, message: err.message });
            }
        });
        return;
    }

    // AI / Prompt Generator
    if (pathname === '/api/generate-from-prompt' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
            try {
                const { promptText, username, level = 1, weight = '', age = 18 } = JSON.parse(body || '{}');
                let questData = null;

                if (promptText) {
                    questData = await askGeminiForQuest({
                        subject: promptText, mentor: 'Izuku Midoriya', level, weight, age
                    });
                }

                if (!questData) questData = generateFallbackQuest('Izuku Midoriya', promptText, level, weight, age);
                return sendJson(res, 200, { success: true, ...questData });
            } catch (err) {
                return sendJson(res, 500, { success: false, message: err.message });
            }
        });
        return;
    }

    // Generate Daily Quest
    if ((pathname === '/api/generate-daily-quest' || pathname === '/api/generate-quest') && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
            try {
                const { username, mentor = 'Izuku Midoriya', category = 'Full Body', level = 1, weight = '', age = 18 } = JSON.parse(body || '{}');
                const users = loadUsers();
                const user = users[username] || {};
                const userWeight = weight || user.weight || '';
                const userAge = age || user.age || 18;

                let questData = await askGeminiForQuest({
                    subject: category, mentor, level, weight: userWeight, age: userAge
                });

                if (!questData) questData = generateFallbackQuest(mentor, category, level, userWeight, userAge);

                if (users[username]) {
                    users[username].currentQuest = questData.workout;
                    users[username].lastQuestDate = new Date().toDateString();
                    saveUsers(users);
                }

                return sendJson(res, 200, { success: true, ...questData });
            } catch (err) {
                const fb = generateFallbackQuest('Izuku Midoriya', 'Full Body', 1, '', 18);
                return sendJson(res, 200, { success: true, ...fb });
            }
        });
        return;
    }

    // Hologram Coach Chat (live JARVIS-style conversation)
    if (pathname === '/api/coach-chat' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
            try {
                const { coachId, message, history = [] } = JSON.parse(body || '{}');

                if (!message || typeof message !== 'string') {
                    return sendJson(res, 400, { success: false, message: 'Message required.' });
                }
                if (!GEMINI_API_KEY) {
                    return sendJson(res, 200, { success: false, message: 'Coach chat needs GEMINI_API_KEY set on the server.' });
                }

                const systemPrompt = COACH_SYSTEM_PROMPTS[coachId] || COACH_SYSTEM_PROMPTS.steph;

                const geminiMessages = (Array.isArray(history) ? history : [])
                    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
                    .slice(-10)
                    .map(m => ({ role: m.role, content: m.content }));
                geminiMessages.push({ role: 'user', content: message });

                const apiRes = await fetch('https://api.gemini.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'x-api-key': GEMINI_API_KEY,
                        'gemini-version': '2023-06-01'
                    },
                    body: JSON.stringify({
                        model: 'gemini-flash-3.6',
                        max_tokens: 300,
                        system: systemPrompt,
                        messages: geminiMessages
                    })
                });

                if (!apiRes.ok) {
                    const errText = await apiRes.text();
                    console.error('[COACH CHAT] GEMINI API error:', apiRes.status, errText.slice(0, 300));
                    return sendJson(res, 200, { success: false, message: 'Coach is unreachable right now.' });
                }

                const data = await apiRes.json();
                const reply = (data.content && data.content[0] && data.content[0].text) || "Let's keep training — ask me anything about your workout.";

                return sendJson(res, 200, { success: true, reply });
            } catch (err) {
                console.error('[COACH CHAT] Failed:', err.message);
                return sendJson(res, 500, { success: false, message: err.message });
            }
        });
        return;
    }

    // --- STATIC FILE SERVING (`Public/` & `public/`) ---
    let publicDir = path.join(__dirname, 'Public');
    if (!fs.existsSync(publicDir)) publicDir = path.join(__dirname, 'public');

    let reqPath = pathname === '/' ? 'index.html' : pathname.substring(1);
    let filePath = path.join(publicDir, reqPath);
    const ext = path.extname(filePath);
    let cType = 'text/html';
    if (ext === '.js') cType = 'text/javascript';
    else if (ext === '.css') cType = 'text/css';
    else if (ext === '.json') cType = 'application/json';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<h1>404 - Page Not Found</h1>');
        } else {
            res.writeHead(200, { 'Content-Type': cType });
            res.end(content);
        }
    });
});

server.listen(PORT, () => {
    console.log(`⚡ ShonenSweat Workout & Basketball System running at http://localhost:${PORT}`);
});
