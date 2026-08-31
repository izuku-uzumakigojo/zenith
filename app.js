/* ============================================================
   SHONENSWEAT — Professional Athletic Progression System
   app.js
   ============================================================ */

const USE_LOCAL_FALLBACK = true;

/* ---------------------------------------------------------
   STATE
--------------------------------------------------------- */
let state = {
    username: '',
    rank: 'E-RANK',
    level: 1,
    xp: 0,
    xpMax: 100,
    stats: { str: 10, agi: 10, end: 10, sho: 10, drb: 10, jmp: 10 },
    statPoints: 3,
    streak: 1,
    lastLogin: null,
    lastQuestDate: null,
    age: 18,
    height: '',
    weight: '',
    enrolled: [],          // array of program ids (max 3)
    activeWorkouts: [],    // enrolled workout details
    activeQuest: null,     // { title, desc, tasks: [{text, done}], source, xpReward, programMeta }
    customQuests: {},      // saved custom quests
    activeTitle: 'E-Rank Trainee',
    unlockedTitles: ['t_novice'],
    voiceEnabled: true,
    dungeonGatesCleared: 0
};

let timerInterval = null;
let timerSeconds = 60;
let gateInterval = null;
let currentModalProgramId = null;

/* ---------------------------------------------------------
   HOLOGRAM COACHES (Steph / Kobe / Kyrie — inspired-by, not
   literal-identity personas; see server.js system prompts)
--------------------------------------------------------- */
const HOLOGRAM_COACHES = {
    steph: {
        id: 'steph',
        label: 'COACH SPLASH',
        subtitle: 'Shooting specialist — precision & footwork',
        color: 0x00f0ff,
        greeting: "Let's talk shooting. What's on your mind — form, range, or reps?"
    },
    kobe: {
        id: 'kobe',
        label: 'COACH MAMBA',
        subtitle: 'Relentless discipline — footwork & mid-range',
        color: 0xfbbf24,
        greeting: "No shortcuts today. What are we drilling — footwork, mid-range, or mentality?"
    },
    kyrie: {
        id: 'kyrie',
        label: 'COACH HANDLES',
        subtitle: 'Creative ball-handling & confidence',
        color: 0x60a5fa,
        greeting: "Let's get shifty. Handles, footwork, or finishing at the rim — where do we start?"
    }
};

let currentHologramCoach = 'steph';
let hologramChatHistory = [];
let threeRenderer = null, threeScene = null, threeCamera = null, hologramMesh = null, hologramParticles = null;
let hologramSpeakingPulse = 0;

/* ---------------------------------------------------------
   ROUNDED SETS & REPS HELPER
--------------------------------------------------------- */
function roundToCleanReps(rawVal, isDuration = false) {
    const val = Number(rawVal) || 10;
    if (isDuration) {
        // Clean seconds intervals: 15, 30, 45, 60, 75, 90, 120
        const roundedSecs = Math.round(val / 15) * 15;
        return Math.max(15, roundedSecs);
    }
    if (val >= 25) {
        // Round to nearest clean 5 or 10
        return Math.max(5, Math.round(val / 5) * 5);
    }
    if (val >= 10) {
        return Math.max(5, Math.round(val / 5) * 5);
    }
    return Math.max(4, Math.round(val / 2) * 2);
}

/* ---------------------------------------------------------
   COLLAPSIBLE EXERCISE GUIDE ENCYCLOPEDIA
--------------------------------------------------------- */
const EXERCISE_GUIDES = [
    {
        keys: ['push-up', 'push up', 'pushup', 'diamond push', 'chest press'],
        name: 'Standard & Incline Push-ups',
        muscles: 'Pectoralis Major, Triceps Brachii, Anterior Deltoids, Core',
        execution: 'Place hands slightly wider than shoulder-width, engage abdominal wall, and lower chest until elbows reach a 90-degree angle. Drive through palms back to lockout.',
        cues: [
            'Tuck elbows at a 45-degree angle relative to torso',
            'Maintain a rigid straight line from head to heels (no sagging hips)',
            'Inhale on the descent, exhale forcefully on the press'
        ]
    },
    {
        keys: ['squat', 'jump squat', 'bodyweight squat', 'box squat'],
        name: 'Bodyweight & Jump Squats',
        muscles: 'Quadriceps, Gluteus Maximus, Hamstrings, Calves',
        execution: 'Stand with feet shoulder-width apart. Hinge hips backward and descend until thighs are parallel to ground. Drive through midfoot to stand or explode upward into jump.',
        cues: [
            'Keep chest tall and cervical spine neutral throughout',
            'Track knees outward in line with second toes',
            'Land softly on balls-to-midfoot if performing explosive jumps'
        ]
    },
    {
        keys: ['split squat', 'bulgarian', 'lunge'],
        name: 'Bulgarian Split Squat & Lunges',
        muscles: 'Quadriceps, Gluteus Medius, Adductors, Hamstrings',
        execution: 'Elevate rear foot on bench or ledge. Descend straight down until front thigh is parallel to floor, then press through front heel to return to top.',
        cues: [
            'Maintain upright torso with slight hip hinge',
            'Keep front knee directly over ankle without collapsing inward',
            'Drive 85% of total load through front leg heel'
        ]
    },
    {
        keys: ['plank', 'side plank', 'core hold'],
        name: 'Isometric Forearm Plank',
        muscles: 'Rectus Abdominis, Transverse Abdominis, Obliques, Shoulders',
        execution: 'Rest on forearms with elbows stacked under shoulders. Maintain neutral spine and contract glutes and abdominal wall isometrically.',
        cues: [
            'Pull navel firmly toward spine to lock core engagement',
            'Do not allow lower back to hyperextend or hips to hike',
            'Breathe rhythmically in a controlled 4-second tempo'
        ]
    },
    {
        keys: ['depth jump', 'box jump', 'vertical', 'rim attack', 'jump'],
        name: 'Depth Jumps & Vertical Overload',
        muscles: 'Quadriceps, Glutes, Calves, Achilles Tendon Complex',
        execution: 'Step off a box, land on midfoot with active knee flexion, and immediately redirect ground reaction force into a maximum explosive vertical jump.',
        cues: [
            'Minimize ground contact time (< 0.20 seconds)',
            'Swing arms aggressively upward during take-off',
            'Extend ankles, knees, and hips completely at peak height'
        ]
    },
    {
        keys: ['crossover', 'dribble', 'handle', 'between-legs', 'behind the back', 'hesitation'],
        name: 'Low-Pound Crossover & Handle Combinations',
        muscles: 'Forearm Flexor Digitorum, Deltoids, Hip Stabilizers, Core',
        execution: 'Drop into a low athletic triple-threat stance. Pound the ball below knee height, snapping the wrist forcefully from hand to hand.',
        cues: [
            'Keep eyes up scanning the floor and chest lifted',
            'Pound the ball violently using fingertips and wrist flexion',
            'Shift body weight laterally on every crossover cadence'
        ]
    },
    {
        keys: ['shooting', 'form shooting', 'jumper', 'free throw', 'catch-and-shoot', 'pull-up jumper'],
        name: 'Form Shooting & Perimeter Precision',
        muscles: 'Anterior Deltoids, Triceps Brachii, Wrist Extensors, Lower Body',
        execution: 'Align shooting foot with target. Dip ball into shot pocket and transfer leg drive through elbow extension and loose wrist snap.',
        cues: [
            'Form a 90-degree angle with shooting elbow under the ball',
            'Release the ball off index and middle finger pads',
            'Hold high goose-neck follow-through until ball swishes through net'
        ]
    },
    {
        keys: ['pull-up', 'chin-up', 'pullup', 'chinup'],
        name: 'Strict Bodyweight Pull-ups & Chin-ups',
        muscles: 'Latissimus Dorsi, Biceps Brachii, Rhomboids, Posterior Deltoids',
        execution: 'Hang with full arm extension. Depress and retract scapulae, then pull chest up toward the bar until chin clears the bar plane.',
        cues: [
            'Strict form: no kipping or swinging of lower legs',
            'Drive elbows down and back into your back pockets',
            'Control the lowering eccentric phase for 2 full seconds'
        ]
    },
    {
        keys: ['dips', 'bench dip'],
        name: 'Bench & Bar Dips',
        muscles: 'Triceps Brachii, Pectoralis Major (Lower), Anterior Deltoids',
        execution: 'Support torso with straight arms. Lower body until elbows reach 90 degrees, keeping chest proud, then press upward to full extension.',
        cues: [
            'Keep shoulders packed down away from ears',
            'Do not flare elbows excessively outward',
            'Maintain steady 2-second eccentric tempo'
        ]
    },
    {
        keys: ['crunch', 'sit-up', 'bicycle', 'leg raise', 'knee raise'],
        name: 'Functional Core & Abdominal Crunches',
        muscles: 'Rectus Abdominis, Obliques, Iliopsoas, Transverse Abdominis',
        execution: 'Contract abdominal muscles to curl shoulders and upper torso forward or elevate legs while keeping lower back anchored.',
        cues: [
            'Initiate movement by flexing abdominal wall, not pulling on neck',
            'Exhale all air on contraction at top of movement',
            'Keep movement controlled without relying on momentum'
        ]
    },
    {
        keys: ['agility', 'ladder', 'sprint', 'shuttle', 'slide', 'footwork', 'jump rope', 'fast feet'],
        name: 'Agility Ladder & Multi-Directional Footwork',
        muscles: 'Gastrocnemius, Soleus, Hip Abductors, Core',
        execution: 'Stay loaded on the balls of your feet with low center of gravity. Pump arms rhythmically and execute rapid multi-directional steps.',
        cues: [
            'Never let heels strike the ground during agility work',
            'Maintain active low defensive stance with wide base',
            'Keep ground contact light, elastic, and spring-loaded'
        ]
    },
    {
        keys: ['foam roll', 'mobility', 'stretch', 'tibialis', 'recovery', 'breathing', 'cooldown', 'decompress'],
        name: 'Active Mobility & Joint Restoration',
        muscles: 'Myofascial Tissue, Joint Capsules, Spinal Extensors, Calves',
        execution: 'Roll slowly over muscle bellies targeting tight areas. Perform active joint range-of-motion movements combined with diaphragmatic breathing.',
        cues: [
            'Inhale 4 seconds through nose, exhale 6 seconds through mouth',
            'Never apply direct rolling pressure to bony joint structures',
            'Hold active stretch positions for at least 30-45 seconds'
        ]
    }
];

function getExerciseGuide(taskText) {
    if (!taskText || typeof taskText !== 'string') {
        return {
            name: 'Standard Athletic Drill',
            muscles: 'Full Body Kinetic Chain & Core',
            execution: 'Perform the exercise with controlled tempo, full range of motion, and proper breathing cadence.',
            cues: ['Keep spine neutral and braced', 'Control the eccentric phase', 'Exhale during concentric exertion']
        };
    }

    const lower = taskText.toLowerCase();
    for (const guide of EXERCISE_GUIDES) {
        if (guide.keys.some(k => lower.includes(k))) {
            return guide;
        }
    }

    return {
        name: 'Standard Athletic Movement',
        muscles: 'Full Body Kinetic Chain & Core Stabilizers',
        execution: 'Perform the exercise with strict form, controlled tempo, and complete range of motion.',
        cues: [
            'Maintain neutral spinal alignment and braced core',
            'Control the descent / eccentric phase with precision',
            'Exhale on the concentric exertion phase of each repetition'
        ]
    };
}

function toggleExerciseGuide(idx) {
    playSound('click');
    const panel = document.getElementById(`guide-panel-${idx}`);
    const btn = document.getElementById(`guide-btn-${idx}`);
    if (!panel) return;

    if (panel.style.display === 'none' || !panel.style.display) {
        panel.style.display = 'block';
        if (btn) {
            btn.classList.add('active');
            btn.innerHTML = '✖ Hide Guide';
        }
    } else {
        panel.style.display = 'none';
        if (btn) {
            btn.classList.remove('active');
            btn.innerHTML = '📖 Form Guide';
        }
    }
}

/* ---------------------------------------------------------
   HUNTER TITLES CATALOG
--------------------------------------------------------- */
const HUNTER_TITLES = [
    {
        id: 't_novice',
        name: 'E-Rank Trainee',
        icon: '🔰',
        req: 'Default Starting Title',
        check: () => true
    },
    {
        id: 't_iron',
        name: 'Iron Body Trainee',
        icon: '🛡️',
        req: 'Reach Player Level 3',
        check: (s) => s.level >= 3
    },
    {
        id: 't_awakened',
        name: 'Awakened Hunter',
        icon: '⚡',
        req: 'Reach Player Level 5',
        check: (s) => s.level >= 5
    },
    {
        id: 't_court',
        name: 'Vanguard of the Court',
        icon: '🏀',
        req: 'Reach Player Level 10',
        check: (s) => s.level >= 10
    },
    {
        id: 't_limitless',
        name: 'Limitless Prodigy',
        icon: '🌌',
        req: 'Reach Player Level 15',
        check: (s) => s.level >= 15
    },
    {
        id: 't_mamba',
        name: 'Mamba Disciple',
        icon: '🐍',
        req: 'Reach Player Level 20',
        check: (s) => s.level >= 20
    },
    {
        id: 't_ofa',
        name: 'One For All Successor',
        icon: '✊',
        req: 'Reach Player Level 25',
        check: (s) => s.level >= 25
    },
    {
        id: 't_sovereign',
        name: 'S-Rank Sovereign',
        icon: '👑',
        req: 'Reach Player Level 30',
        check: (s) => s.level >= 30
    },
    {
        id: 't_honored',
        name: 'The Honored One',
        icon: '✨',
        req: 'Reach Player Level 40',
        check: (s) => s.level >= 40
    },
    {
        id: 't_monarch',
        name: 'Shadow Monarch',
        icon: '👑',
        req: 'Reach Player Level 50',
        check: (s) => s.level >= 50
    },
    {
        id: 't_gate_slayer',
        name: 'Gate Slayer',
        icon: '⚔️',
        req: 'Clear 3 Dungeon Gates',
        check: (s) => (s.dungeonGatesCleared || 0) >= 3
    },
    {
        id: 't_unbroken',
        name: 'Unbroken Legend',
        icon: '🔥',
        req: 'Reach 7-Day Login Streak',
        check: (s) => s.streak >= 7
    },
    {
        id: 't_conqueror',
        name: 'Dungeon Conqueror',
        icon: '🏆',
        req: 'Reach 14-Day Login Streak',
        check: (s) => s.streak >= 14
    },
    {
        id: 't_architect',
        name: 'Custom Protocol Architect',
        icon: '🛠️',
        req: 'Create a Custom Workout Program',
        check: () => getSavedCustomWorkouts().length > 0
    }
];

/* ---------------------------------------------------------
   AUDIO SYSTEM (Web Audio API)
--------------------------------------------------------- */
const AudioContextClass = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
let audioCtx = null;

function playSound(type) {
    try {
        if (!audioCtx && AudioContextClass) audioCtx = new AudioContextClass();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        if (!audioCtx) return;

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        const now = audioCtx.currentTime;

        if (type === 'click') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(750, now);
            osc.frequency.exponentialRampToValueAtTime(350, now + 0.08);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
        } else if (type === 'check') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523.25, now);
            osc.frequency.setValueAtTime(659.25, now + 0.06);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        } else if (type === 'levelup') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.setValueAtTime(554.37, now + 0.12);
            osc.frequency.setValueAtTime(659.25, now + 0.24);
            osc.frequency.setValueAtTime(880, now + 0.36);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.6);
            osc.start(now);
            osc.stop(now + 0.6);
        } else if (type === 'gate') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.linearRampToValueAtTime(880, now + 0.4);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.5);
            osc.start(now);
            osc.stop(now + 0.5);
        }
    } catch (e) {
        // audio error ignored safely
    }
}

/* ---------------------------------------------------------
   HOLOGRAPHIC COACH WEB SPEECH API
--------------------------------------------------------- */
function toggleVoiceAudio() {
    state.voiceEnabled = !state.voiceEnabled;
    playSound('click');
    const btn = document.getElementById('voice-toggle-btn');
    if (btn) {
        btn.textContent = state.voiceEnabled ? '🔊 VOICE: ON' : '🔇 VOICE: OFF';
    }
    if (!state.voiceEnabled && typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        stopAudioWave();
    }
    persistUserState();
}

function stopAudioWave() {
    document.querySelectorAll('.audio-wave-bars').forEach(w => w.classList.remove('active'));
}

function startAudioWave() {
    document.querySelectorAll('.audio-wave-bars').forEach(w => w.classList.add('active'));
}

function speakCoachGreeting(progId) {
    if (!state.voiceEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;

    try {
        window.speechSynthesis.cancel();
        const prog = findProgram(progId);
        const voiceCfg = prog.coachVoice || { pitch: 1.0, rate: 1.0, greeting: `Welcome to ${prog.title}. Execute every repetition with precision.` };
        const text = voiceCfg.greeting || `Welcome to ${prog.title}.`;

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.pitch = voiceCfg.pitch || 1.0;
        utterance.rate = voiceCfg.rate || 1.0;

        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
            const preferred = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('David') || v.name.includes('English')));
            if (preferred) utterance.voice = preferred;
        }

        utterance.onstart = () => startAudioWave();
        utterance.onend = () => stopAudioWave();
        utterance.onerror = () => stopAudioWave();

        window.speechSynthesis.speak(utterance);
    } catch (e) {
        stopAudioWave();
    }
}

function speakCurrentCoachGreeting() {
    playSound('click');
    if (currentModalProgramId) {
        speakCoachGreeting(currentModalProgramId);
    }
}

/* ---------------------------------------------------------
   THREE.JS HOLOGRAM (visual only — voice reuses the existing
   Web Speech API code above)
--------------------------------------------------------- */
function initHologram() {
    const canvas = document.getElementById('hologram-canvas');
    if (!canvas || typeof THREE === 'undefined' || threeRenderer) return;

    const width = canvas.clientWidth || 260;
    const height = canvas.clientHeight || 260;

    threeScene = new THREE.Scene();
    threeCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    threeCamera.position.z = 5;

    threeRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    threeRenderer.setSize(width, height);
    threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const geometry = new THREE.IcosahedronGeometry(1.5, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true, transparent: true, opacity: 0.85 });
    hologramMesh = new THREE.Mesh(geometry, material);
    threeScene.add(hologramMesh);

    const coreGeo = new THREE.IcosahedronGeometry(0.85, 0);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x60a5fa, wireframe: true, transparent: true, opacity: 0.5 });
    hologramMesh.add(new THREE.Mesh(coreGeo, coreMat));

    const particleCount = 120;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
        const angle = (i / particleCount) * Math.PI * 2;
        const radius = 2.1 + Math.random() * 0.3;
        positions[i * 3] = Math.cos(angle) * radius;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 0.6;
        positions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({ color: 0x00f0ff, size: 0.045, transparent: true, opacity: 0.8 });
    hologramParticles = new THREE.Points(particleGeo, particleMat);
    threeScene.add(hologramParticles);

    setHologramColor(HOLOGRAM_COACHES[currentHologramCoach].color);
    animateHologram();
    window.addEventListener('resize', resizeHologram);
}

function resizeHologram() {
    const canvas = document.getElementById('hologram-canvas');
    if (!canvas || !threeRenderer || !threeCamera) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    threeRenderer.setSize(width, height);
    threeCamera.aspect = width / height;
    threeCamera.updateProjectionMatrix();
}

function animateHologram() {
    requestAnimationFrame(animateHologram);
    if (!threeRenderer || !hologramMesh) return;

    hologramMesh.rotation.y += 0.006;
    hologramMesh.rotation.x += 0.002;
    if (hologramParticles) hologramParticles.rotation.y -= 0.003;

    const scale = hologramSpeakingPulse > 0 ? 1 + Math.sin(Date.now() * 0.015) * 0.06 : 1;
    hologramMesh.scale.set(scale, scale, scale);

    threeRenderer.render(threeScene, threeCamera);
}

function setHologramColor(hexColor) {
    if (!hologramMesh) return;
    hologramMesh.material.color.setHex(hexColor);
    if (hologramParticles) hologramParticles.material.color.setHex(hexColor);
}

/* ---------------------------------------------------------
   HOLOGRAM COACH SELECTOR + LIVE CHAT (JARVIS-style)
--------------------------------------------------------- */
function selectHologramCoach(coachId) {
    if (!HOLOGRAM_COACHES[coachId]) return;
    currentHologramCoach = coachId;
    hologramChatHistory = [];
    playSound('click');

    document.querySelectorAll('.coach-select-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('coach-btn-' + coachId);
    if (btn) btn.classList.add('active');

    const coach = HOLOGRAM_COACHES[coachId];
    setHologramColor(coach.color);

    const subtitleEl = document.getElementById('hologram-coach-subtitle');
    if (subtitleEl) subtitleEl.textContent = coach.subtitle;
    const nameEl = document.getElementById('hologram-coach-name');
    if (nameEl) nameEl.textContent = coach.label;

    renderHologramChatLog();
    appendHologramMessage('assistant', coach.greeting, true);
}

function appendHologramMessage(role, text, speak) {
    hologramChatHistory.push({ role, content: text });
    renderHologramChatLog();
    if (role === 'assistant' && speak) speakHologramText(text);
}

function renderHologramChatLog() {
    const log = document.getElementById('hologram-chat-log');
    if (!log) return;
    log.innerHTML = hologramChatHistory.map(m =>
        `<div class="holo-msg holo-msg-${m.role}">${escapeHtml(m.content)}</div>`
    ).join('');
    log.scrollTop = log.scrollHeight;
}

async function sendHologramChatMessage() {
    const input = document.getElementById('hologram-chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    appendHologramMessage('user', text, false);

    const sendBtn = document.getElementById('hologram-send-btn');
    if (sendBtn) sendBtn.disabled = true;

    try {
        const res = await fetch('/api/coach-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                coachId: currentHologramCoach,
                message: text,
                history: hologramChatHistory.slice(-10)
            })
        });
        const data = await res.json();
        if (data.success && data.reply) {
            appendHologramMessage('assistant', data.reply, true);
        } else {
            appendHologramMessage('assistant', data.message || "Coach's connection glitched — try again in a moment.", false);
        }
    } catch (e) {
        appendHologramMessage('assistant', "Can't reach the coach right now — check your connection.", false);
    } finally {
        if (sendBtn) sendBtn.disabled = false;
    }
}

function handleHologramChatKey(e) {
    if (e.key === 'Enter') sendHologramChatMessage();
}

function speakHologramText(text) {
    hologramSpeakingPulse = 1;
    if (state.voiceEnabled && typeof window !== 'undefined' && window.speechSynthesis) {
        try {
            window.speechSynthesis.cancel();
            const utter = new SpeechSynthesisUtterance(text);
            const pitchRate = {
                steph: { pitch: 1.0, rate: 1.0 },
                kobe: { pitch: 0.85, rate: 0.92 },
                kyrie: { pitch: 1.1, rate: 1.08 }
            }[currentHologramCoach] || { pitch: 1.0, rate: 1.0 };
            utter.pitch = pitchRate.pitch;
            utter.rate = pitchRate.rate;

            const voices = window.speechSynthesis.getVoices();
            if (voices && voices.length) {
                const preferred = voices.find(v => v.lang.startsWith('en'));
                if (preferred) utter.voice = preferred;
            }
            utter.onstart = () => { startAudioWave(); hologramSpeakingPulse = 1; };
            utter.onend = () => { stopAudioWave(); hologramSpeakingPulse = 0; };
            utter.onerror = () => { stopAudioWave(); hologramSpeakingPulse = 0; };
            window.speechSynthesis.speak(utter);
        } catch (e) {
            hologramSpeakingPulse = 0;
        }
    } else {
        setTimeout(() => { hologramSpeakingPulse = 0; }, 1200);
    }
}

function scrollToWorkouts() {
    playSound('click');
    const target = document.getElementById('enrolled-dashboard') || document.getElementById('graphic-cards-container');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------------------------------------------------------
   GROUNDED ATHLETIC WORKOUT PROGRAMS (WITH ANIME MENTORS)
--------------------------------------------------------- */
const BASE_PROGRAM_CATALOG = [
    {
        id: 'shooting_accuracy',
        mentor: 'Kakashi Hatake',
        anime: 'Naruto',
        avatar: '🎯',
        role: 'Tactical Precision Mentor',
        coachTitle: 'Copy Ninja of Athletic Biomechanics',
        title: 'Shooting Accuracy & Free Throw Precision',
        category: 'Shooting',
        rank: 'S-RANK',
        focus: 'Form Mechanics, Perimeter Jumpshots & Free Throw Percentage',
        duration: '2 Weeks (14 Days)',
        meta: 'Biomechanics-focused shooting progression to eliminate mechanical flaws and build automatic release consistency.',
        coachVoice: {
            pitch: 0.95,
            rate: 0.98,
            greeting: "Sharpen your focus and repeat each rep with mechanical perfection. Precision beats power every single time."
        },
        baseTasks: [
            { name: 'Form Shooting Swishes (Inside Paint Key)', baseReps: 30 },
            { name: 'Catch-and-Shoot Perimeter Jumpers', baseReps: 20 },
            { name: 'Off-the-Dribble Pull-Up Jumpers', baseReps: 20 },
            { name: 'Free Throws (Track Makes)', baseReps: 20 }
        ]
    },
    {
        id: 'ball_handling',
        mentor: 'Gojo Satoru',
        anime: 'Jujutsu Kaisen',
        avatar: '⚡',
        role: 'Spatial Flow & Handling Mentor',
        coachTitle: 'The Honored One of Court Control',
        title: 'Ball Handling & Dribble Control',
        category: 'Handling',
        rank: 'SPECIAL-GRADE',
        focus: 'Crossover Chains, Two-Ball Drills & Change of Pace',
        duration: '2 Weeks (14 Days)',
        meta: 'Progressive ball control series to master hand speed, low center of gravity, and unpredictable change-of-pace rhythm.',
        coachVoice: {
            pitch: 1.05,
            rate: 1.05,
            greeting: "Control the spatial tempo of the court. When your handles are seamless, the defense is completely powerless."
        },
        baseTasks: [
            { name: 'Low-Pound Crossover Combinations', baseReps: 40 },
            { name: 'Between-the-Legs & Behind-the-Back Series', baseReps: 30 },
            { name: 'Two-Ball Stationary Dribble Drill (Seconds)', baseReps: 60, isDuration: true },
            { name: 'In-and-Out Hesitation Drive Finishes', baseReps: 20 }
        ]
    },
    {
        id: 'plyometrics_power',
        mentor: 'Might Guy',
        anime: 'Naruto',
        avatar: '🔥',
        role: 'Taijutsu & Vertical Overload Mentor',
        coachTitle: 'Green Beast of Explosive Youth',
        title: 'Plyometrics & Explosive Vertical Power',
        category: 'Plyometrics',
        rank: 'SS-RANK',
        focus: 'Depth Jumps, Reactive Ground Force & Sprint Acceleration',
        duration: '2 Weeks (14 Days)',
        meta: 'Tendon stiffness and triple-extension overload to maximize vertical leap and fast-twitch force output.',
        coachVoice: {
            pitch: 1.2,
            rate: 1.1,
            greeting: "Burn with the flames of youth! Explode off the floor with every ounce of your spirit! GO ALL OUT!"
        },
        baseTasks: [
            { name: 'Depth Jumps to Maximum Vertical Reach', baseReps: 20 },
            { name: 'Explosive Box Jumps', baseReps: 20 },
            { name: 'Bulgarian Split Squats (10 per Leg)', baseReps: 20 },
            { name: '40-Yard Sprint Shuttle Runs', baseReps: 4 }
        ]
    },
    {
        id: 'upper_body_chest',
        mentor: 'All Might',
        anime: 'My Hero Academia',
        avatar: '✊',
        role: 'Strength & Chest Hypertrophy Mentor',
        coachTitle: 'Symbol of Muscular Mastery',
        title: 'Upper Body & Chest Hypertrophy',
        category: 'Upper Body',
        rank: 'S-RANK',
        focus: 'Chest Pressing, Pull-ups, Shoulder Stability & Arm Strength',
        duration: '2 Weeks (14 Days)',
        meta: 'Calisthenics and bodyweight strength volume to build powerful chest, back, and arm pressing mechanics.',
        coachVoice: {
            pitch: 0.9,
            rate: 1.0,
            greeting: "Fear not! Give every set your heart and soul, and push past your physical limits! PLUS ULTRA!"
        },
        baseTasks: [
            { name: 'Strict Standard Push-ups', baseReps: 30 },
            { name: 'Incline Diamond Push-ups', baseReps: 20 },
            { name: 'Bodyweight Pull-ups / Chin-ups', baseReps: 15 },
            { name: 'Bench Dips for Triceps', baseReps: 20 }
        ]
    },
    {
        id: 'full_body_conditioning',
        mentor: 'Izuku Midoriya',
        anime: 'My Hero Academia',
        avatar: '⚡',
        role: 'Conditioning & Stamina Mentor',
        coachTitle: '9th Successor of Full Cowl Endurance',
        title: 'Full Body Conditioning & Stamina',
        category: 'Full Body',
        rank: 'A-RANK',
        focus: 'Cardiovascular Work Capacity & High-Volume Calisthenics',
        duration: '2 Weeks (14 Days)',
        meta: 'Interval-based functional conditioning to increase lactate threshold and game-speed stamina.',
        coachVoice: {
            pitch: 1.22,
            rate: 1.1,
            greeting: "Every rep builds the foundation to master One For All. Stay disciplined, control your breathing, and ascend!"
        },
        baseTasks: [
            { name: 'Bodyweight Squats', baseReps: 30 },
            { name: 'Explosive Jump Squats', baseReps: 20 },
            { name: 'Core Crunches & Sit-ups', baseReps: 25 },
            { name: 'High Knees Sprint Interval (Seconds)', baseReps: 60, isDuration: true }
        ]
    },
    {
        id: 'core_stability',
        mentor: 'Kento Nanami',
        anime: 'Jujutsu Kaisen',
        avatar: '📐',
        role: '7:3 Ratio Discipline Mentor',
        coachTitle: 'Grade 1 Functional Core Specialist',
        title: 'Core Stability & Isometric Balance',
        category: 'Core',
        rank: 'A-RANK',
        focus: 'Plank Holds, Anti-Rotation, Obliques & Posterior Chain',
        duration: '2 Weeks (14 Days)',
        meta: 'Targeted isometric core endurance to protect the lumbar spine and transfer rotational athletic power.',
        coachVoice: {
            pitch: 0.85,
            rate: 0.95,
            greeting: "Training requires strict efficiency and posture. Maintain the 7:3 ratio in your core balance and complete the work."
        },
        baseTasks: [
            { name: 'Forearm Plank Hold (Seconds)', baseReps: 60, isDuration: true },
            { name: 'Alternating Bicycle Crunches', baseReps: 40 },
            { name: 'Hanging Knee / Leg Raises', baseReps: 30 },
            { name: 'Side Plank Holds (Seconds)', baseReps: 60, isDuration: true }
        ]
    },
    {
        id: 'agility_footwork',
        mentor: 'Katsuki Bakugo',
        anime: 'My Hero Academia',
        avatar: '💥',
        role: 'Explosive Reaction & Speed Mentor',
        coachTitle: 'Fast-Twitch Reaction Dynamo',
        title: 'Agility Ladder & Lateral Footwork',
        category: 'Agility',
        rank: 'S-RANK',
        focus: 'Fast-Twitch Foot Speed, Lateral Slides & Deceleration',
        duration: '2 Weeks (14 Days)',
        meta: 'High-frequency coordination drills to accelerate lateral change-of-direction and first-step quickness.',
        coachVoice: {
            pitch: 1.15,
            rate: 1.12,
            greeting: "Move your feet faster! Don't let your heels touch the floor! Explode through every single footwork drill!"
        },
        baseTasks: [
            { name: 'Fast-Feet Agility Ladder In-and-Outs (Seconds)', baseReps: 60, isDuration: true },
            { name: 'Lateral Defensive Slide Steps', baseReps: 40 },
            { name: 'Cone Jab-Step & Acceleration Bursts', baseReps: 20 },
            { name: 'Jump Rope Speed Intervals (Seconds)', baseReps: 60, isDuration: true }
        ]
    },
    {
        id: 'active_mobility',
        mentor: 'Shota Aizawa',
        anime: 'My Hero Academia',
        avatar: '🧘',
        role: 'Logical Mobility & Prehab Mentor',
        coachTitle: 'Eraserhead Joint Recovery Specialist',
        title: 'Active Mobility & Joint Recovery',
        category: 'Active Recovery',
        rank: 'A-RANK',
        focus: 'Myofascial Release, 90/90 Hips, Ankle Prehab & Deep Breathing',
        duration: '2 Weeks (14 Days)',
        meta: 'Joint decompression, fascia restoration, and tissue remodeling to eliminate soreness and prevent injuries.',
        coachVoice: {
            pitch: 0.88,
            rate: 0.92,
            greeting: "Neglecting recovery leads to irrational injuries. Mobilize your joints, decompress your spine, and heal properly."
        },
        baseTasks: [
            { name: 'Foam Rolling Quads, Calves & IT Bands (Minutes)', baseReps: 10 },
            { name: '90/90 Hip Mobility Stretches (Seconds)', baseReps: 60, isDuration: true },
            { name: 'Tibialis & Ankle Raises', baseReps: 30 },
            { name: 'Diaphragmatic Deep Breathing Cooldown (Minutes)', baseReps: 5 }
        ]
    }
];

// Alias lookup for backward compatibility
const ID_ALIASES = {
    'curry_3pt': 'shooting_accuracy',
    'kyrie_handles': 'ball_handling',
    'kobe_power': 'plyometrics_power',
    'kobe_mamba': 'agility_footwork',
    'deku_hero': 'full_body_conditioning',
    'gojo_speed': 'ball_handling',
    'active_recovery': 'active_mobility',
    'Shooter': 'shooting_accuracy',
    'handles': 'ball_handling',
    'vertical': 'plyometrics_power',
    'endurance': 'full_body_conditioning',
    'prehab': 'active_mobility',
    'strength': 'upper_body_chest'
};

function normalizeProgramId(id) {
    return ID_ALIASES[id] || id;
}

/* ---------------------------------------------------------
   PERMANENT CUSTOM WORKOUT STORAGE
--------------------------------------------------------- */
function getSavedCustomWorkouts() {
    try {
        const stored = localStorage.getItem('saved_custom_workouts');
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
}

function saveCustomWorkouts(list) {
    try {
        localStorage.setItem('saved_custom_workouts', JSON.stringify(list));
    } catch (e) {}
}

function deleteCustomWorkout(id) {
    playSound('click');
    if (!confirm("Are you sure you want to delete this custom workout program?")) return;
    const current = getSavedCustomWorkouts().filter(w => w.id !== id);
    saveCustomWorkouts(current);
    dropProgram(id);
    updateUI();
}

function getFullProgramCatalog() {
    const customList = getSavedCustomWorkouts();
    return [...BASE_PROGRAM_CATALOG, ...customList];
}

function findProgram(id) {
    const targetId = normalizeProgramId(id);
    const all = getFullProgramCatalog();
    return all.find(p => p.id === targetId || p.id === id) || all[0];
}

/* ---------------------------------------------------------
   14-DAY PROGRESSION SYSTEM (localStorage)
--------------------------------------------------------- */
function getProgressionStorageKey() {
    const user = state.username || 'guest';
    return `shonensweat_progression_${user}`;
}

function getProgressionData() {
    const key = getProgressionStorageKey();
    try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : {};
    } catch (e) {
        return {};
    }
}

function saveProgressionData(data) {
    const key = getProgressionStorageKey();
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {}
}

function getProgramProgress(progId) {
    const normId = normalizeProgramId(progId);
    const allProg = getProgressionData();
    if (!allProg[normId]) {
        allProg[normId] = { completedDays: [] };
    }
    return allProg[normId];
}

function isDayCompleted(progId, day) {
    const progress = getProgramProgress(progId);
    return progress.completedDays.includes(day);
}

function isDayUnlocked(progId, day) {
    if (day === 1) return true; // Day 1 is unlocked by default
    return isDayCompleted(progId, day - 1); // Day N unlocks only after Day N-1 is completed
}

function getFirstIncompleteUnlockedDay(progId) {
    for (let d = 1; d <= 14; d++) {
        if (!isDayCompleted(progId, d)) {
            return d;
        }
    }
    return 14;
}

function completeProgramDay(progId, day) {
    const normId = normalizeProgramId(progId);
    const allProg = getProgressionData();
    if (!allProg[normId]) {
        allProg[normId] = { completedDays: [] };
    }
    if (!allProg[normId].completedDays.includes(day)) {
        allProg[normId].completedDays.push(day);
        allProg[normId].completedDays.sort((a, b) => a - b);
        saveProgressionData(allProg);
    }
}

/* ---------------------------------------------------------
   DUNGEON GATE RAID TIMERS & 2.0x SURGE SYSTEM
--------------------------------------------------------- */
function getDungeonGateKey() {
    const user = state.username || 'guest';
    return `shonensweat_gate_${user}`;
}

function getDungeonGateData() {
    try {
        const stored = localStorage.getItem(getDungeonGateKey());
        const today = new Date().toDateString();
        if (stored) {
            const data = JSON.parse(stored);
            if (data.gateDate === today) return data;
        }
        const midnight = new Date();
        midnight.setHours(23, 59, 59, 999);
        const newGate = {
            gateDate: today,
            expiresAt: midnight.getTime(),
            cleared: false,
            rank: '🔴 S-RANK RED GATE (DAILY RAID)'
        };
        saveDungeonGateData(newGate);
        return newGate;
    } catch (e) {
        return { gateDate: new Date().toDateString(), expiresAt: Date.now() + 14400000, cleared: false };
    }
}

function saveDungeonGateData(data) {
    try {
        localStorage.setItem(getDungeonGateKey(), JSON.stringify(data));
    } catch (e) {}
}

function initDungeonGateTimer() {
    if (gateInterval) clearInterval(gateInterval);
    updateDungeonGateDisplay();
    gateInterval = setInterval(updateDungeonGateDisplay, 1000);
}

function updateDungeonGateDisplay() {
    const gate = getDungeonGateData();
    const widget = document.getElementById('dungeon-gate-widget');
    const timerDisplay = document.getElementById('gate-countdown-text');
    const statusText = document.getElementById('gate-status-text');
    const surgeTag = document.getElementById('gate-surge-tag');
    const typeDisplay = document.getElementById('gate-type-display');

    if (!timerDisplay) return;

    const now = Date.now();
    const remainingMs = Math.max(0, gate.expiresAt - now);

    if (gate.cleared) {
        if (widget) widget.className = 'dungeon-gate-panel gate-cleared';
        if (typeDisplay) typeDisplay.textContent = '🟢 S-RANK GATE CONQUERED (RAID CLEARED)';
        if (surgeTag) surgeTag.textContent = '🏆 2.0x XP SURGE CLAIMED';
        timerDisplay.textContent = '00:00:00';
        if (statusText) statusText.textContent = 'Gate Break prevented! You successfully claimed the 2.0x Dungeon XP Surge today.';
        return;
    }

    if (remainingMs <= 0) {
        if (widget) widget.className = 'dungeon-gate-panel';
        if (typeDisplay) typeDisplay.textContent = '⚠️ GATE BREAK IN PROGRESS';
        if (surgeTag) surgeTag.textContent = '⛔ XP SURGE EXPIRED';
        timerDisplay.textContent = '00:00:00';
        if (statusText) statusText.textContent = 'The Dungeon Gate has broken. Surge bonus expired until tomorrow\'s awakening.';
        return;
    }

    if (widget) widget.className = 'dungeon-gate-panel';
    if (typeDisplay) typeDisplay.textContent = gate.rank || '🔴 S-RANK RED GATE (DAILY RAID)';
    if (surgeTag) surgeTag.textContent = '⚡ 2.0x XP SURGE ACTIVE';
    if (statusText) statusText.textContent = 'Clear today\'s quest before Gate Break to claim 2x System XP Surge!';

    const totalSec = Math.floor(remainingMs / 1000);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;

    timerDisplay.textContent = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function isDungeonGateActive() {
    const gate = getDungeonGateData();
    return !gate.cleared && (gate.expiresAt > Date.now());
}

/* ---------------------------------------------------------
   MANA MULTIPLIER & AURA SYSTEM
--------------------------------------------------------- */
function getManaMultiplier() {
    return 1 + (state.streak * 0.15);
}

function getAuraTier(streak) {
    if (streak >= 14) return { name: '🔴 DIVINE NEN EXPLOSION', color: '#ef4444' };
    if (streak >= 7)  return { name: '🟡 MONARCH MANA OVERDRIVE', color: '#fbbf24' };
    if (streak >= 3)  return { name: '🟣 SURGE AURA', color: '#c084fc' };
    return { name: '🔵 AWAKENING AURA', color: '#60a5fa' };
}

/* ---------------------------------------------------------
   HUNTER TITLES SYSTEM
--------------------------------------------------------- */
function checkAndUnlockTitles() {
    let newlyUnlocked = [];
    if (!state.unlockedTitles) state.unlockedTitles = ['t_novice'];

    HUNTER_TITLES.forEach(t => {
        if (!state.unlockedTitles.includes(t.id)) {
            if (t.check(state)) {
                state.unlockedTitles.push(t.id);
                newlyUnlocked.push(t);
            }
        }
    });

    if (newlyUnlocked.length > 0) {
        playSound('levelup');
        persistUserState();
    }
}

function openTitlesModal() {
    playSound('click');
    checkAndUnlockTitles();

    const modal = document.getElementById('titles-modal');
    const container = document.getElementById('titles-grid-container');
    const activeLabel = document.getElementById('modal-active-title-label');

    if (activeLabel) activeLabel.textContent = `[${state.activeTitle || 'E-Rank Trainee'}]`;
    if (!container || !modal) return;

    container.innerHTML = '';
    HUNTER_TITLES.forEach(titleObj => {
        const isUnlocked = state.unlockedTitles.includes(titleObj.id);
        const isEquipped = (state.activeTitle === titleObj.name);

        let cardClass = 'title-card';
        let statusBadge = '🔒 LOCKED';

        if (isEquipped) {
            cardClass += ' equipped';
            statusBadge = '👑 EQUIPPED';
        } else if (isUnlocked) {
            cardClass += ' unlocked';
            statusBadge = '⚡ UNLOCKED (CLICK TO EQUIP)';
        } else {
            cardClass += ' locked';
            statusBadge = `🔒 ${titleObj.req}`;
        }

        const card = document.createElement('div');
        card.className = cardClass;
        card.innerHTML = `
            <div class="title-name">${titleObj.icon} ${escapeHtml(titleObj.name)}</div>
            <div class="title-desc">${escapeHtml(titleObj.req)}</div>
            <span class="title-status-tag">${statusBadge}</span>
        `;

        if (isUnlocked && !isEquipped) {
            card.onclick = () => equipTitle(titleObj.name);
        }

        container.appendChild(card);
    });

    modal.classList.add('active');
    modal.style.display = 'flex';
}

function closeTitlesModal() {
    playSound('click');
    const modal = document.getElementById('titles-modal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
}

function equipTitle(titleName) {
    playSound('levelup');
    state.activeTitle = titleName;
    persistUserState();
    updateUI();
    openTitlesModal();
}

/* ---------------------------------------------------------
   PRESETS for Manual Creator (Professional Athletic Routines)
--------------------------------------------------------- */
const PRESETS = {
    mobility: {
        title: 'Active Mobility & Joint Decompression',
        desc: 'Myofascial release, joint decompression, and active hip stretches to accelerate recovery.',
        tasks: [
            '10 Minutes - Foam Rolling (Quads, Calves & IT Bands)',
            '60 Seconds - 90/90 Hip Mobility Stretch per Side',
            '30 Reps - Tibialis & Ankle Raises',
            '5 Minutes - Diaphragmatic Deep Breathing Cooldown'
        ]
    },
    prehab: {
        title: 'Lower Body Prehab & Ligament Fortification',
        desc: 'Tendon loading and unilateral stability to bulletproof knees, ankles, and Achilles.',
        tasks: [
            '30 Reps - Tibialis Anterior Wall Raises',
            '60 Seconds - Single-Leg Balance Holds per Side',
            '20 Reps - Banded Ankle Inversions & Eversions',
            '15 Reps - Eccentric Hamstring Sliders'
        ]
    },
    shooting_touch: {
        title: 'Shooting Mechanics & Free Throw Precision',
        desc: 'Low-impact form shooting and release consistency to maintain tactile shooting touch.',
        tasks: [
            '30 Reps - Form Shooting Swishes (Inside Paint)',
            '20 Reps - Consecutive Free Throws (Track Makes)',
            '40 Reps - Stationary Ball-Handling Rhythm Drills',
            '15 Reps - Spot-Up Mid-Range Jumpers'
        ]
    },
    cooldown: {
        title: 'Post-Workout Hypertrophy & Lactate Flush',
        desc: 'Light dynamic flushing and deep static stretches to eliminate post-workout lactic acid.',
        tasks: [
            '5 Minutes - Light Low-Intensity Cool-down Walk',
            '60 Seconds - Standing Quadriceps & Hip Flexor Stretch per Side',
            '60 Seconds - Doorframe Hamstring & Calf Stretch per Side',
            '10 Minutes - Cold Water Contrast / Ice Compression'
        ]
    }
};

/* ---------------------------------------------------------
   INIT
--------------------------------------------------------- */
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        const savedUser = localStorage.getItem('shonensweat_current_user') || localStorage.getItem('arise_current_user');
        if (savedUser) {
            loadUserState(savedUser);
            showMainApp();
        } else {
            const authEl = document.getElementById('auth-container');
            const mainEl = document.getElementById('main-app');
            if (authEl) authEl.style.display = 'block';
            if (mainEl) mainEl.style.display = 'none';
        }
        if (document.querySelectorAll('.custom-task-val, .custom-task-input').length === 0) {
            addCustomTaskInput('');
        }
    });
}

/* ---------------------------------------------------------
   HELPER FUNCTIONS
--------------------------------------------------------- */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getAgeMultiplier(age) {
    const a = Number(age) || 18;
    if (a < 15) return { factor: 0.75, name: `YOUTH FORM MODE (0.75x Load • Age ${a})` };
    if (a <= 35) return { factor: 1.00, name: `PEAK OVERLOAD MODE (1.00x Load • Age ${a})` };
    return { factor: 0.85, name: `VETERAN PROTECTION MODE (0.85x Load • Age ${a})` };
}

function getRank(lvl) {
    if (lvl >= 50) return { name: 'SHADOW MONARCH', color: '#1d4ed8' };
    if (lvl >= 30) return { name: 'S-RANK PLAYER', color: '#0284c7' };
    if (lvl >= 20) return { name: 'A-RANK PLAYER', color: '#2563eb' };
    if (lvl >= 15) return { name: 'B-RANK PLAYER', color: '#3b82f6' };
    if (lvl >= 10) return { name: 'C-RANK PLAYER', color: '#60a5fa' };
    if (lvl >= 5)  return { name: 'D-RANK PLAYER', color: '#00f0ff' };
    return { name: 'E-RANK PLAYER', color: '#94a3b8' };
}

function getExpBoost() {
    return getManaMultiplier();
}

/* ---------------------------------------------------------
   AUTHENTICATION
--------------------------------------------------------- */
async function handleAuth(endpoint) {
    playSound('click');
    const errorEl = document.getElementById('auth-error');
    if (errorEl) errorEl.textContent = '';

    const username = document.getElementById('username') ? document.getElementById('username').value.trim() : '';
    const password = document.getElementById('password') ? document.getElementById('password').value.trim() : '';
    const ageInput = document.getElementById('player-age') ? document.getElementById('player-age').value : 18;
    const heightInput = document.getElementById('player-height') ? document.getElementById('player-height').value.trim() : '';
    const weightInput = document.getElementById('player-weight') ? document.getElementById('player-weight').value.trim() : '';

    if (!username || !password) {
        if (errorEl) errorEl.textContent = 'PLAYER NAME AND ACCESS CODE REQUIRED';
        return;
    }

    const age = parseInt(ageInput, 10) || 18;
    if (age < 8 || age > 99) {
        if (errorEl) errorEl.textContent = 'AGE MUST BE BETWEEN 8 AND 99';
        return;
    }

    let success = false;
    let data = null;

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username,
                password,
                age,
                height: heightInput,
                weight: weightInput
            })
        });
        data = await res.json();
        if (data && data.success) {
            success = true;
        } else if (data && data.message) {
            if (errorEl) errorEl.textContent = data.message;
            return;
        }
    } catch (e) {
        // Backend offline -> fallback
    }

    if (!success) {
        if (!USE_LOCAL_FALLBACK) {
            if (errorEl) errorEl.textContent = 'SYSTEM UNREACHABLE. TRY AGAIN LATER.';
            return;
        }
        success = localAuthFallback(endpoint, username, password, age, heightInput, weightInput, errorEl);
        if (!success) return;
    } else {
        state.username = data.username || username;
        state.level = data.level || 1;
        state.xp = data.xp || 0;
        state.streak = data.streak || 1;
        state.statPoints = data.statPoints !== undefined ? data.statPoints : 3;
        state.lastQuestDate = data.lastQuestDate || null;
        state.age = data.age || age;
        state.height = data.height || heightInput;
        state.weight = data.weight || weightInput;
        if (data.stats) state.stats = data.stats;
        if (data.activeWorkouts) state.activeWorkouts = data.activeWorkouts;
        if (data.activeTitle) state.activeTitle = data.activeTitle;
        if (data.unlockedTitles) state.unlockedTitles = data.unlockedTitles;
        if (data.dungeonGatesCleared !== undefined) state.dungeonGatesCleared = data.dungeonGatesCleared;
        persistUserState();
    }

    localStorage.setItem('shonensweat_current_user', state.username);
    localStorage.setItem('arise_current_user', state.username);
    loadUserState(state.username);
    applyDailyStreak();
    showMainApp();
    checkOrGenerateDailyQuest();
}

function localAuthFallback(endpoint, username, password, age, height, weight, errorEl) {
    const users = JSON.parse(localStorage.getItem('shonensweat_users') || localStorage.getItem('arise_users') || '{}');

    if (endpoint.includes('signup')) {
        if (users[username]) {
            if (errorEl) errorEl.textContent = 'PLAYER NAME ALREADY EXISTS';
            return false;
        }
        users[username] = { password };
        localStorage.setItem('shonensweat_users', JSON.stringify(users));
        initFreshState(username, age, height, weight);
        persistUserState();
        return true;
    } else {
        if (!users[username] || users[username].password !== password) {
            if (errorEl) errorEl.textContent = 'INVALID PLAYER NAME OR ACCESS CODE';
            return false;
        }
        if (!localStorage.getItem('shonensweat_state_' + username) && !localStorage.getItem('arise_state_' + username)) {
            initFreshState(username, age, height, weight);
            persistUserState();
        }
        return true;
    }
}

function initFreshState(username, age, height, weight) {
    state = {
        username: username,
        rank: 'E-RANK',
        level: 1,
        xp: 0,
        xpMax: 100,
        stats: { str: 10, agi: 10, end: 10, sho: 10, drb: 10, jmp: 10 },
        statPoints: 3,
        streak: 1,
        lastLogin: new Date().toDateString(),
        lastQuestDate: null,
        age: age || 18,
        height: height || '',
        weight: weight || '',
        enrolled: [],
        activeWorkouts: [],
        activeQuest: null,
        customQuests: {},
        activeTitle: 'E-Rank Trainee',
        unlockedTitles: ['t_novice'],
        voiceEnabled: true,
        dungeonGatesCleared: 0
    };
}

function loadUserState(username) {
    const saved = localStorage.getItem('shonensweat_state_' + username) || localStorage.getItem('arise_state_' + username);
    if (saved) {
        try {
            state = JSON.parse(saved);
        } catch (e) {
            initFreshState(username, 18, '', '');
        }
    } else {
        initFreshState(username, 18, '', '');
    }
    if (!state.enrolled) state.enrolled = [];
    if (!state.activeWorkouts) state.activeWorkouts = [];
    if (!state.stats) state.stats = { str: 10, agi: 10, end: 10, sho: 10, drb: 10, jmp: 10 };
    if (!state.activeTitle) state.activeTitle = 'E-Rank Trainee';
    if (!state.unlockedTitles || state.unlockedTitles.length === 0) state.unlockedTitles = ['t_novice'];
    if (state.voiceEnabled === undefined) state.voiceEnabled = true;
    if (state.dungeonGatesCleared === undefined) state.dungeonGatesCleared = 0;
}

function persistUserState() {
    if (!state.username) return;
    localStorage.setItem('shonensweat_state_' + state.username, JSON.stringify(state));
    localStorage.setItem('arise_state_' + state.username, JSON.stringify(state));
}

async function saveProgress() {
    persistUserState();
    if (!state.username) return;
    try {
        await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: state.username,
                level: state.level,
                xp: state.xp,
                dailyQuest: state.activeQuest ? (state.activeQuest.workout || state.activeQuest.title) : null,
                lastQuestDate: state.lastQuestDate,
                stats: state.stats,
                statPoints: state.statPoints,
                streak: state.streak,
                activeWorkouts: state.activeWorkouts,
                age: state.age,
                height: state.height,
                weight: state.weight,
                activeTitle: state.activeTitle,
                unlockedTitles: state.unlockedTitles,
                dungeonGatesCleared: state.dungeonGatesCleared
            })
        });
    } catch (e) {}
}

function logout() {
    playSound('click');
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    localStorage.removeItem('shonensweat_current_user');
    localStorage.removeItem('arise_current_user');
    state.username = '';
    const mainApp = document.getElementById('main-app');
    const authContainer = document.getElementById('auth-container');
    if (mainApp) mainApp.style.display = 'none';
    if (authContainer) authContainer.style.display = 'block';
    const userInp = document.getElementById('username');
    const passInp = document.getElementById('password');
    if (userInp) userInp.value = '';
    if (passInp) passInp.value = '';
    const err = document.getElementById('auth-error');
    if (err) err.textContent = '';
    resetTimer();
}

/* ---------------------------------------------------------
   DAILY STREAK
--------------------------------------------------------- */
function applyDailyStreak() {
    const today = new Date().toDateString();
    if (state.lastLogin !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        if (state.lastLogin === yesterday.toDateString()) {
            state.streak += 1;
        } else if (state.lastLogin) {
            state.streak = 1;
        }
        state.lastLogin = today;
        persistUserState();
    }
}

/* ---------------------------------------------------------
   MAIN APP RENDER
--------------------------------------------------------- */
function showMainApp() {
    const authContainer = document.getElementById('auth-container');
    const mainApp = document.getElementById('main-app');
    if (authContainer) authContainer.style.display = 'none';
    if (mainApp) mainApp.style.display = 'block';

    initDungeonGateTimer();
    checkAndUnlockTitles();
    updateUI();

    initHologram();
    selectHologramCoach(currentHologramCoach);
}

function updateUI() {
    state.xpMax = state.level * 100;
    const rankInfo = getRank(state.level);
    state.rank = rankInfo.name;

    const nameDisplay = document.getElementById('player-name-display');
    if (nameDisplay) nameDisplay.textContent = (state.username || 'PLAYER').toUpperCase();

    const titleDisplay = document.getElementById('active-title-display');
    if (titleDisplay) titleDisplay.textContent = `👑 [${(state.activeTitle || 'E-Rank Trainee').toUpperCase()}]`;

    const rankBadge = document.getElementById('rank-display');
    if (rankBadge) {
        rankBadge.textContent = state.rank;
        rankBadge.style.background = rankInfo.color;
    }

    const lvlDisplay = document.getElementById('lvl-display');
    if (lvlDisplay) lvlDisplay.textContent = state.level;

    const streakDisplay = document.getElementById('streak-count');
    if (streakDisplay) streakDisplay.textContent = state.streak;

    const manaMult = getManaMultiplier();
    const manaDisplay = document.getElementById('mana-multiplier-display');
    if (manaDisplay) manaDisplay.textContent = `🔮 MANA: ${manaMult.toFixed(2)}x`;

    const auraTier = getAuraTier(state.streak);
    const auraDisplay = document.getElementById('aura-tier-display');
    if (auraDisplay) {
        auraDisplay.textContent = auraTier.name;
        auraDisplay.style.color = auraTier.color;
    }

    const voiceBtn = document.getElementById('voice-toggle-btn');
    if (voiceBtn) {
        voiceBtn.textContent = state.voiceEnabled ? '🔊 VOICE: ON' : '🔇 VOICE: OFF';
    }

    const xpDisplay = document.getElementById('xp-display');
    if (xpDisplay) xpDisplay.textContent = state.xp;

    const xpMaxDisplay = document.getElementById('xp-max');
    if (xpMaxDisplay) xpMaxDisplay.textContent = state.xpMax;

    const xpBar = document.getElementById('xp-bar');
    if (xpBar) {
        const xpPct = Math.min(100, Math.max(0, (state.xp / state.xpMax) * 100));
        xpBar.style.width = `${xpPct}%`;
    }

    const statPointsDisplay = document.getElementById('stat-points-display');
    if (statPointsDisplay) statPointsDisplay.textContent = state.statPoints;

    for (const key of ['str', 'agi', 'end', 'sho', 'drb', 'jmp']) {
        const el = document.getElementById('stat-' + key);
        if (el) el.textContent = state.stats[key] || 10;
    }

    const ageInfo = getAgeMultiplier(state.age);
    let bioText = `AGE: ${state.age}`;
    if (state.height) bioText += ` • ${state.height}`;
    if (state.weight) bioText += ` • ${state.weight}`;
    const bioSummary = document.getElementById('biometrics-summary');
    if (bioSummary) bioSummary.textContent = bioText;

    const ageTag = document.getElementById('age-mode-tag');
    if (ageTag) ageTag.textContent = ageInfo.name;

    renderGraphicCards();
    renderEnrolledDashboard();
    updateDungeonGateDisplay();

    if (state.activeQuest) {
        renderQuest(state.activeQuest);
    }
}

/* ---------------------------------------------------------
   STAT POINTS
--------------------------------------------------------- */
function addStatPoint(statKey) {
    if (state.statPoints <= 0) {
        alert("No Stat Points available! Complete workouts to level up and earn points.");
        return;
    }
    playSound('click');
    state.statPoints -= 1;
    state.stats[statKey] = (state.stats[statKey] || 10) + 1;
    updateUI();
    saveProgress();
}

/* ---------------------------------------------------------
   BIOMETRICS MODAL
--------------------------------------------------------- */
function toggleBiometricsModal() {
    playSound('click');
    const modal = document.getElementById('biometrics-modal');
    if (!modal) return;
    if (modal.style.display === 'none' || !modal.style.display) {
        modal.style.display = 'block';
        const editAge = document.getElementById('edit-age');
        const editHeight = document.getElementById('edit-height');
        const editWeight = document.getElementById('edit-weight');
        if (editAge) editAge.value = state.age;
        if (editHeight) editHeight.value = state.height;
        if (editWeight) editWeight.value = state.weight;
    } else {
        modal.style.display = 'none';
    }
}

function saveBiometrics() {
    playSound('levelup');
    const editAge = document.getElementById('edit-age');
    const editHeight = document.getElementById('edit-height');
    const editWeight = document.getElementById('edit-weight');

    const ageVal = editAge ? (parseInt(editAge.value, 10) || 18) : 18;
    state.age = ageVal;
    state.height = editHeight ? editHeight.value.trim() : '';
    state.weight = editWeight ? editWeight.value.trim() : '';

    toggleBiometricsModal();
    updateUI();
    saveProgress();
}

/* ---------------------------------------------------------
   GRAPHIC WORKOUT PROGRAM CARDS
--------------------------------------------------------- */
function renderGraphicCards() {
    const container = document.getElementById('graphic-cards-container');
    if (!container) return;

    const allPrograms = getFullProgramCatalog();
    let html = '';

    allPrograms.forEach(prog => {
        const isEnrolled = state.enrolled.includes(prog.id) || state.activeWorkouts.some(w => w.id === prog.id);
        const progress = getProgramProgress(prog.id);
        const completedCount = progress.completedDays.length;

        html += `
            <div class="workout-card ${isEnrolled ? 'card-active' : ''}">
                <div>
                    <div class="card-mentor-badge">
                        <div class="card-avatar">${prog.avatar || '🏀'}</div>
                        <div>
                            <div class="card-mentor-name">${escapeHtml(prog.mentor)} ${prog.anime ? `<span style="font-size:0.75rem; color:var(--gold-glow);">(${escapeHtml(prog.anime)})</span>` : ''}</div>
                            <div class="card-category">${escapeHtml(prog.category || prog.role)}</div>
                        </div>
                    </div>
                    <div class="card-title">${escapeHtml(prog.title)}</div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span class="card-duration-tag" style="margin-bottom:0;">⏱️ ${escapeHtml(prog.duration)}</span>
                        <span style="font-size:0.75rem; color:var(--cyan-glow); font-weight:700;">${completedCount}/14 DAYS</span>
                    </div>
                    <div class="card-meta">
                        ${escapeHtml(prog.meta || 'Progressive Overload Rep Scaling: Reps increase cleanly over 14 days.')}
                    </div>
                </div>
                <div style="display:flex; gap:8px; margin-top:8px;">
                    <button class="card-btn" onclick="openProgramModal('${prog.id}')" style="flex:1;">
                        ${isEnrolled ? '✔ ENROLLED (LAUNCH)' : 'ENROLL PROGRAM'}
                    </button>
                    ${prog.isCustom ? `<button class="timer-btn" style="border-color:#ef4444; color:#ef4444; width:36px; padding:0;" onclick="deleteCustomWorkout('${prog.id}')" title="Delete Custom Workout">🗑️</button>` : ''}
                </div>
            </div>`;
    });

    container.innerHTML = html;
}

/* ---------------------------------------------------------
   ENROLLED PROGRAMS DASHBOARD
--------------------------------------------------------- */
function renderEnrolledDashboard() {
    const countSpan = document.getElementById('enrolled-count');
    const listDiv = document.getElementById('enrolled-list');
    if (!countSpan || !listDiv) return;

    const currentEnrolled = state.enrolled.slice(0, 3);
    countSpan.textContent = currentEnrolled.length;

    if (currentEnrolled.length === 0) {
        listDiv.innerHTML = `<div style="color:var(--text-muted); font-size:0.88rem;">No active 2-week programs selected. Enroll in up to 3 programs below!</div>`;
        return;
    }

    let html = '';
    currentEnrolled.forEach(progId => {
        const prog = findProgram(progId);
        const progress = getProgramProgress(prog.id);
        const nextDay = getFirstIncompleteUnlockedDay(prog.id);

        html += `
            <div class="enrolled-item">
                <div>
                    <div class="enrolled-name">${prog.avatar} ${escapeHtml(prog.title)}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(prog.mentor)} • ${escapeHtml(prog.category || 'Fitness')} (${progress.completedDays.length}/14 Cleared)</div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="enrolled-day">DAY ${nextDay}/14</span>
                    <button class="timer-btn" onclick="openProgramModal('${prog.id}')">LAUNCH</button>
                    <button class="timer-btn" style="border-color:#ef4444; color:#ef4444;" onclick="dropProgram('${prog.id}')" title="Unenroll">✖</button>
                </div>
            </div>`;
    });
    listDiv.innerHTML = html;
}

function toggleEnrollProgram(progId) {
    playSound('click');
    const normId = normalizeProgramId(progId);
    const idx = state.enrolled.indexOf(normId);

    if (idx !== -1) {
        state.enrolled.splice(idx, 1);
        state.activeWorkouts = state.activeWorkouts.filter(w => w.id !== normId);
    } else {
        if (state.enrolled.length >= 3) {
            alert("Maximum 3 active 2-week workout programs allowed at once! Unenroll from one first.");
            return false;
        }
        state.enrolled.push(normId);
        const prog = findProgram(normId);
        state.activeWorkouts.push({
            id: prog.id,
            title: prog.title,
            mentor: prog.mentor,
            category: prog.category,
            currentDay: getFirstIncompleteUnlockedDay(prog.id),
            totalDays: 14
        });
    }

    updateUI();
    saveProgress();
    return true;
}

function dropProgram(progId) {
    playSound('click');
    const normId = normalizeProgramId(progId);
    state.enrolled = state.enrolled.filter(id => id !== normId);
    state.activeWorkouts = state.activeWorkouts.filter(w => w.id !== normId);
    updateUI();
    saveProgress();
}

/* ---------------------------------------------------------
   CYAN SYSTEM HUD 14-DAY PROGRAM MODAL & HOLOGRAPHIC COACH
--------------------------------------------------------- */
function openProgramModal(progId) {
    playSound('click');
    const prog = findProgram(progId);
    currentModalProgramId = prog.id;

    const modal = document.getElementById('program-launch-modal');
    if (!modal) return;

    // Header & Meta Badges
    const titleEl = document.getElementById('modal-program-title');
    const mentorEl = document.getElementById('modal-program-mentor');
    const rankEl = document.getElementById('modal-program-rank');
    const focusEl = document.getElementById('modal-program-focus');
    const durEl = document.getElementById('modal-program-duration');

    if (titleEl) titleEl.textContent = prog.title.toUpperCase();
    if (mentorEl) mentorEl.textContent = `${prog.mentor} (${prog.anime || 'Anime Mentor'}) • ${prog.role}`;
    if (rankEl) rankEl.textContent = `RANK: ${prog.rank || 'S-RANK'}`;
    if (focusEl) focusEl.textContent = `CATEGORY: ${(prog.category || 'Athletic').toUpperCase()}`;
    if (durEl) durEl.textContent = `DURATION: ${prog.duration || '14 DAYS'}`;

    // Holographic Coach Card
    const coachAvatar = document.getElementById('modal-coach-avatar');
    const coachName = document.getElementById('modal-coach-name');
    const coachSub = document.getElementById('modal-coach-subtitle');
    const coachQuote = document.getElementById('modal-coach-quote');

    if (coachAvatar) coachAvatar.textContent = prog.avatar || '🏀';
    if (coachName) coachName.textContent = (prog.mentor || 'MENTOR').toUpperCase();
    if (coachSub) coachSub.textContent = `${prog.role} • ${prog.coachTitle || 'Ascension Coach'}`;
    if (coachQuote) {
        const quoteText = prog.coachVoice && prog.coachVoice.greeting ? prog.coachVoice.greeting : `"Lock in and conquer ${prog.title} today!"`;
        coachQuote.textContent = `"${quoteText.replace(/^"/, '').replace(/"$/, '')}"`;
    }

    // Progress Bar
    const progress = getProgramProgress(prog.id);
    const completedCount = progress.completedDays.length;
    const pct = Math.round((completedCount / 14) * 100);

    const countEl = document.getElementById('modal-progress-count');
    const barEl = document.getElementById('modal-progress-bar');
    if (countEl) countEl.textContent = `${completedCount} / 14 COMPLETED (${pct}%)`;
    if (barEl) barEl.style.width = `${pct}%`;

    // Render 14-Day Grid
    const daysGrid = document.getElementById('modal-days-grid');
    if (daysGrid) {
        daysGrid.innerHTML = '';
        for (let day = 1; day <= 14; day++) {
            const completed = isDayCompleted(prog.id, day);
            const unlocked = isDayUnlocked(prog.id, day);

            let cellClass = 'day-cell';
            let statusText = '🔒 LOCKED';

            if (completed) {
                cellClass += ' completed';
                statusText = '✔ CLEARED';
            } else if (unlocked) {
                cellClass += ' unlocked';
                statusText = '⚡ UNLOCKED';
            } else {
                cellClass += ' locked';
                statusText = '🔒 LOCKED';
            }

            const cell = document.createElement('div');
            cell.className = cellClass;
            cell.innerHTML = `
                <span class="day-cell-num">DAY ${day}</span>
                <span class="day-cell-status">${statusText}</span>
            `;

            if (unlocked) {
                cell.onclick = () => launchProgramDay(prog.id, day);
            } else {
                cell.onclick = () => {
                    playSound('click');
                    alert(`Day ${day} is LOCKED! Complete Day ${day - 1} first to unlock this workout.`);
                };
            }

            daysGrid.appendChild(cell);
        }
    }

    // Modal action buttons
    const isEnrolled = state.enrolled.includes(prog.id);
    const enrollBtn = document.getElementById('modal-enroll-toggle-btn');
    if (enrollBtn) {
        enrollBtn.textContent = isEnrolled ? 'UNENROLL' : 'ENROLL';
    }

    const nextDay = getFirstIncompleteUnlockedDay(prog.id);
    const primaryBtn = document.getElementById('modal-primary-action-btn');
    if (primaryBtn) {
        primaryBtn.textContent = `⚡ LAUNCH DAY ${nextDay} QUEST`;
    }

    modal.classList.add('active');
    modal.style.display = 'flex';

    // Speak Coach Greeting via Web Speech API
    speakCoachGreeting(prog.id);
}

function closeProgramModal() {
    playSound('click');
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    stopAudioWave();
    const modal = document.getElementById('program-launch-modal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
}

function toggleEnrollCurrentModalProgram() {
    if (!currentModalProgramId) return;
    const success = toggleEnrollProgram(currentModalProgramId);
    if (success) {
        openProgramModal(currentModalProgramId);
    }
}

function launchCurrentModalProgramDay() {
    if (!currentModalProgramId) return;
    const nextDay = getFirstIncompleteUnlockedDay(currentModalProgramId);
    launchProgramDay(currentModalProgramId, nextDay);
}

function launchProgramDay(progId, day) {
    playSound('levelup');
    const prog = findProgram(progId);
    const repScale = 1 + ((day - 1) * 0.08); // +8% reps each day
    const ageInfo = getAgeMultiplier(state.age);

    const taskObjects = (prog.baseTasks || []).map(t => {
        const rawScaled = (t.baseReps || 15) * repScale * ageInfo.factor;
        const cleanReps = roundToCleanReps(rawScaled, Boolean(t.isDuration));
        const unit = t.isDuration ? 'Seconds - ' : 'Reps - ';

        return {
            text: `${cleanReps} ${t.isDuration ? 'Seconds' : 'Reps'} - ${t.name.replace(/\s*\(Seconds\)/i, '')}`,
            done: false
        };
    });

    const rewardXp = Math.round((100 + state.level * 20) * (1 + (day * 0.05)) * getExpBoost());

    const questObj = {
        title: `[DAY ${day}/14] ${prog.title}`,
        desc: `"${prog.mentor}: Day ${day} of 14. ${ageInfo.name}."`,
        tasks: taskObjects,
        source: 'program',
        programMeta: {
            id: prog.id,
            day: day
        },
        xpReward: rewardXp,
        workout: `[DAY ${day}/14] ${prog.title}\n` + taskObjects.map(t => `- ${t.text}`).join('\n')
    };

    // Auto-enroll if not already enrolled (and room exists)
    if (!state.enrolled.includes(prog.id) && state.enrolled.length < 3) {
        state.enrolled.push(prog.id);
    }

    state.activeQuest = questObj;
    state.lastQuestDate = new Date().toDateString();

    closeProgramModal();
    renderQuest(questObj);
    updateUI();
    saveProgress();
}

/* ---------------------------------------------------------
   QUEST RENDERING WITH COLLAPSIBLE EXERCISE FORM GUIDES
--------------------------------------------------------- */
function parseTasksFromString(str) {
    if (!str || typeof str !== 'string') return [];
    const lines = str.split('\n');
    const tasks = [];
    lines.forEach(line => {
        const t = line.trim();
        if (t.startsWith('-') || t.startsWith('*') || /^\d+[\.\)]/.test(t)) {
            tasks.push(t.replace(/^[-*\d\.\)\s]+/, '').trim());
        } else if (t.length > 0 && !t.startsWith('[') && !t.startsWith('"') && !t.toLowerCase().includes('quest')) {
            tasks.push(t);
        }
    });
    return tasks;
}

function renderQuest(questData, title, description, tasks) {
    const questBox = document.getElementById('quest-box');
    if (!questBox) return;

    let questTitle = title || '';
    let questDesc = description || '';
    let taskItems = [];

    if (questData && typeof questData === 'object' && questData.tasks) {
        questTitle = questData.title || questTitle || '[DAILY QUEST: PROFESSIONAL PHYSICAL CONDITIONING]';
        questDesc = questData.desc || questData.description || questDesc || '"The System demands consistent athletic progression. Complete all target sets & reps."';
        taskItems = questData.tasks.map(t => typeof t === 'string' ? { text: t, done: false } : t);
        state.activeQuest = questData;
    } else if (Array.isArray(tasks) && tasks.length > 0) {
        questTitle = title || '[DAILY QUEST: PROFESSIONAL PHYSICAL CONDITIONING]';
        questDesc = description || '"The System demands consistent athletic progression. Complete all target sets & reps."';
        taskItems = tasks.map(t => typeof t === 'string' ? { text: t, done: false } : t);
        state.activeQuest = {
            title: questTitle,
            desc: questDesc,
            tasks: taskItems,
            source: 'custom',
            xpReward: 100 + state.level * 20
        };
    } else if (typeof questData === 'string') {
        const parsed = parseTasksFromString(questData);
        questTitle = title || '[DAILY QUEST: PROFESSIONAL PHYSICAL CONDITIONING]';
        questDesc = description || '"The System demands consistent athletic progression. Complete all target sets & reps."';
        taskItems = (parsed.length > 0 ? parsed : [
            "30 Reps - Form Shooting Swishes (Inside Paint Key)",
            "40 Reps - Low-Pound Crossover Combinations",
            "20 Reps - Depth Jumps to Maximum Vertical Reach",
            "4 Reps - 40-Yard Sprint Shuttle Runs",
            "30 Reps - Strict Standard Push-ups"
        ]).map(t => ({ text: t, done: false }));

        state.activeQuest = {
            title: questTitle,
            desc: questDesc,
            tasks: taskItems,
            source: 'server',
            xpReward: 100 + state.level * 20
        };
    } else if (state.activeQuest) {
        questTitle = state.activeQuest.title;
        questDesc = state.activeQuest.desc || state.activeQuest.description;
        taskItems = state.activeQuest.tasks;
    }

    if (taskItems.length === 0) {
        taskItems = [
            { text: "30 Reps - Form Shooting Swishes (Inside Paint Key)", done: false },
            { text: "40 Reps - Low-Pound Crossover Combinations", done: false },
            { text: "20 Reps - Depth Jumps to Maximum Vertical Reach", done: false },
            { text: "4 Reps - 40-Yard Sprint Shuttle Runs", done: false },
            { text: "30 Reps - Strict Standard Push-ups", done: false }
        ];
        if (state.activeQuest) state.activeQuest.tasks = taskItems;
    }

    let html = `<div class="quest-title">${escapeHtml(questTitle)}</div>`;
    html += `<div class="quest-desc">${escapeHtml(questDesc)}</div>`;
    html += `<div class="task-list">`;

    taskItems.forEach((task, idx) => {
        const guide = getExerciseGuide(task.text);
        const cuesListHtml = (guide.cues || []).map(cue => `<li><strong>•</strong> ${escapeHtml(cue)}</li>`).join('');

        html += `
            <div class="task-card">
                <div class="task-row">
                    <label class="task-item">
                        <input type="checkbox" class="quest-check" ${task.done ? 'checked' : ''} onchange="onTaskCheck(this, ${idx})">
                        <span class="task-text ${task.done ? 'task-completed' : ''}">${escapeHtml(task.text)}</span>
                    </label>
                    <button type="button" class="guide-toggle-btn" id="guide-btn-${idx}" onclick="toggleExerciseGuide(${idx})">
                        📖 Form Guide
                    </button>
                </div>
                <div class="exercise-guide-panel" id="guide-panel-${idx}" style="display:none;">
                    <div class="guide-header">
                        <span>⚡ ${escapeHtml(guide.name.toUpperCase())}</span>
                    </div>
                    <div class="guide-section">
                        <span class="guide-label">Target Muscles:</span>
                        <span>${escapeHtml(guide.muscles)}</span>
                    </div>
                    <div class="guide-section">
                        <span class="guide-label">How to Perform:</span>
                        <span>${escapeHtml(guide.execution)}</span>
                    </div>
                    <div class="guide-section">
                        <span class="guide-label">Key Form Cues:</span>
                        <ul class="guide-cues-list">${cuesListHtml}</ul>
                    </div>
                </div>
            </div>`;
    });

    html += `</div>`;
    questBox.innerHTML = html;

    updateClaimButtonVisibility();
}

function onTaskCheck(checkbox, idx) {
    playSound('check');
    const textSpan = checkbox.parentElement.querySelector('.task-text');
    if (textSpan) {
        if (checkbox.checked) {
            textSpan.classList.add('task-completed');
        } else {
            textSpan.classList.remove('task-completed');
        }
    }

    if (state.activeQuest && state.activeQuest.tasks && state.activeQuest.tasks[idx]) {
        state.activeQuest.tasks[idx].done = checkbox.checked;
        persistUserState();
    }

    updateClaimButtonVisibility();
}

function updateClaimButtonVisibility() {
    const allChecks = document.querySelectorAll('.quest-check');
    const checkedBoxes = document.querySelectorAll('.quest-check:checked');
    const claimBtn = document.getElementById('claim-btn');
    if (!claimBtn) return;

    if (allChecks.length > 0 && allChecks.length === checkedBoxes.length) {
        claimBtn.style.display = 'block';
        playSound('levelup');
    } else {
        claimBtn.style.display = 'none';
    }
}

/* ---------------------------------------------------------
   CLAIM REWARDS & LEVEL PROGRESSION
--------------------------------------------------------- */
function claimRewards() {
    playSound('levelup');
    const claimBtn = document.getElementById('claim-btn');
    if (claimBtn) claimBtn.style.display = 'none';

    const manaMult = getManaMultiplier();
    const isGateSurge = isDungeonGateActive();
    const gateSurgeMult = isGateSurge ? 2.0 : 1.0;

    const taskCount = state.activeQuest && state.activeQuest.tasks ? state.activeQuest.tasks.length : 5;
    const baseXp = (state.activeQuest && state.activeQuest.xpReward) || ((taskCount * 25) + (state.level * 10));
    const xpGained = Math.round(baseXp * manaMult * gateSurgeMult);

    state.xp += xpGained;

    // Handle Dungeon Gate Cleared
    let gateClearMsg = '';
    if (isGateSurge) {
        const gate = getDungeonGateData();
        gate.cleared = true;
        saveDungeonGateData(gate);
        state.dungeonGatesCleared = (state.dungeonGatesCleared || 0) + 1;
        playSound('gate');
        gateClearMsg = `<p style="color:#4ade80; font-weight:900; margin-top:8px;">⚔️ RED GATE CONQUERED! 2.0x DAILY RAID XP SURGE APPLIED! (${state.dungeonGatesCleared} Gates Cleared Total)</p>`;
        updateDungeonGateDisplay();
    }

    let leveledUp = false;
    while (state.xp >= state.xpMax) {
        state.xp -= state.xpMax;
        state.level += 1;
        state.statPoints += 3;
        state.xpMax = state.level * 100;
        leveledUp = true;
    }

    // If active quest was part of a 14-day program, record completion!
    let programMsg = '';
    if (state.activeQuest && state.activeQuest.programMeta) {
        const { id, day } = state.activeQuest.programMeta;
        completeProgramDay(id, day);
        const prog = findProgram(id);
        const nextDay = day + 1;
        if (nextDay <= 14) {
            programMsg = `<p style="color:var(--cyan-glow); font-weight:700; margin-top:8px;">🔥 DAY ${day} COMPLETED! Day ${nextDay} of ${prog.title} is now UNLOCKED in the System!</p>`;
        } else {
            programMsg = `<p style="color:var(--gold-glow); font-weight:900; margin-top:8px;">🏆 CONGRATULATIONS! You have completed all 14 Days of ${prog.title}!</p>`;
        }
    }

    // Check newly unlocked titles
    checkAndUnlockTitles();

    const questBox = document.getElementById('quest-box');
    if (questBox) {
        if (leveledUp) {
            questBox.innerHTML = `
                <div style="text-align:center; padding: 25px 10px;">
                    <h2 style="font-family:'Orbitron',sans-serif; color:var(--gold-glow); font-size:1.8rem; margin-bottom:10px;">
                        ⚡ SYSTEM AWAKENING: LEVEL UP! ⚡
                    </h2>
                    <p style="font-size:1.2rem; color:var(--cyan-glow); margin-bottom:8px;">
                        YOU ARE NOW LEVEL ${state.level} (${getRank(state.level).name})
                    </p>
                    <p style="color:var(--blue-bright); font-weight:700;">
                        +${xpGained} XP Gained (${manaMult.toFixed(2)}x Mana Multiplier${isGateSurge ? ' • 2x Gate Surge' : ''}) • +3 STAT POINTS AWARDED!
                    </p>
                    ${gateClearMsg}
                    ${programMsg}
                </div>`;
        } else {
            questBox.innerHTML = `
                <div style="text-align:center; padding: 25px 10px;">
                    <h3 style="font-family:'Orbitron',sans-serif; color:var(--cyan-glow); font-size:1.4rem; margin-bottom:8px;">
                        DAILY QUEST CLEARED!
                    </h3>
                    <p style="font-size:1.1rem; color:var(--text-primary);">
                        Gained +${xpGained} System XP (${manaMult.toFixed(2)}x Mana Boost${isGateSurge ? ' • 2x Gate Surge' : ''}). Your athletic abilities are ascending!
                    </p>
                    ${gateClearMsg}
                    ${programMsg}
                </div>`;
        }
    }

    state.activeQuest = null;
    updateUI();
    saveProgress();
}

/* ---------------------------------------------------------
   CHECK OR GENERATE DAILY QUEST
--------------------------------------------------------- */
async function checkOrGenerateDailyQuest() {
    const todayStr = new Date().toDateString();

    if (state.activeQuest && state.lastQuestDate === todayStr) {
        renderQuest(state.activeQuest);
        return;
    }

    if (state.enrolled && state.enrolled.length > 0) {
        const progId = state.enrolled[0];
        const nextDay = getFirstIncompleteUnlockedDay(progId);
        launchProgramDay(progId, nextDay);
        return;
    }

    await fetchNewDailyQuest();
}

async function fetchNewDailyQuest() {
    const claimBtn = document.getElementById('claim-btn');
    if (claimBtn) claimBtn.style.display = 'none';

    try {
        const response = await fetch('/api/generate-daily-quest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: state.username,
                mentor: 'Might Guy',
                category: 'Plyometrics',
                level: state.level,
                age: state.age,
                weight: state.weight
            })
        });

        const data = await response.json();
        if (data && data.success) {
            const questObj = {
                title: data.title || '[DAILY QUEST: ATHLETIC & PHYSICAL ASCENSION]',
                desc: data.description || '"Might Guy: Explode through every repetition with the flames of youth! PLUS ULTRA!"',
                tasks: (data.tasks || []).map(t => ({ text: typeof t === 'string' ? t : t.text, done: false })),
                workout: data.workout,
                source: 'server',
                xpReward: data.rewardXp || (100 + state.level * 20)
            };
            state.activeQuest = questObj;
            state.lastQuestDate = new Date().toDateString();
            renderQuest(questObj);
            saveProgress();
            return;
        }
    } catch (err) {
        // Backend unavailable -> fallback
    }

    // Local Fallback Quest with clean rounded reps
    const defaultTasks = [
        "30 Reps - Form Shooting Swishes (Inside Paint Key)",
        "40 Reps - Low-Pound Crossover Combinations",
        "20 Reps - Depth Jumps to Maximum Vertical Reach",
        "4 Reps - 40-Yard Sprint Shuttle Runs",
        "30 Reps - Strict Standard Push-ups"
    ];
    const questObj = {
        title: `[DAILY QUEST] Athletic Conditioning - Lvl ${state.level}`,
        desc: `"Might Guy: Focus on explosive ground force and perfect posture! Burn with the flames of youth!"`,
        tasks: defaultTasks.map(t => ({ text: t, done: false })),
        source: 'local_fallback',
        xpReward: Math.round((100 + state.level * 20) * getExpBoost())
    };
    state.activeQuest = questObj;
    state.lastQuestDate = new Date().toDateString();
    renderQuest(questObj);
    saveProgress();
}

/* ---------------------------------------------------------
   AI TEXT PROMPT GENERATOR
--------------------------------------------------------- */
function togglePromptGenerator() {
    playSound('click');
    const panel = document.getElementById('prompt-generator-panel');
    if (!panel) return;
    panel.style.display = (panel.style.display === 'none' || !panel.style.display) ? 'block' : 'none';
}

const KEYWORD_TASKS = [
    { keys: ['shoot', 'shooting', '3pt', 'three', 'jumper'], tasks: ['30 Reps - Form Shooting Swishes (Inside Key)', '20 Reps - Catch-and-Shoot Perimeter Jumpers', '20 Reps - Free Throws'] },
    { keys: ['free throw', 'free throws', 'ft'], tasks: ['20 Reps - Free Throws (Track Makes)', '15 Reps - Spot-Up Free Throw Rhythm Reps'] },
    { keys: ['handle', 'handles', 'dribbl', 'ball control'], tasks: ['40 Reps - Low-Pound Crossover Combinations', '60 Seconds - Two-Ball Stationary Dribble Drill', '20 Reps - In-and-Out Hesitation Drive Finishes'] },
    { keys: ['vertical', 'jump', 'explos', 'plyometric'], tasks: ['20 Reps - Depth Jumps to Maximum Vertical Reach', '20 Reps - Explosive Box Jumps', '20 Reps - Bulgarian Split Squats'] },
    { keys: ['ankle', 'sprain'], tasks: ['30 Reps - Tibialis & Ankle Raises', '60 Seconds - Single-Leg Balance Holds', '20 Reps - Banded Ankle Mobilizations'] },
    { keys: ['knee', 'jumper'], tasks: ['20 Reps - Terminal Knee Extensions', '45 Seconds - Wall Sit with Isometric Ball Squeeze', '30 Seconds - Spanish Squat Holds'] },
    { keys: ['chest', 'pushup', 'push-up', 'upper'], tasks: ['30 Reps - Strict Standard Push-ups', '20 Reps - Incline Diamond Push-ups', '15 Reps - Bodyweight Pull-ups'] },
    { keys: ['core', 'abs', 'plank'], tasks: ['60 Seconds - Forearm Plank Hold', '40 Reps - Alternating Bicycle Crunches', '30 Reps - Hanging Knee Raises'] },
    { keys: ['recovery', 'rest', 'cooldown', 'cool down', 'mobility', 'stretch'], tasks: ['10 Minutes - Foam Rolling Quads, Calves & IT Bands', '60 Seconds - 90/90 Hip Mobility Stretch per Side', '5 Minutes - Diaphragmatic Deep Breathing Cooldown'] },
    { keys: ['condition', 'cardio', 'endurance', 'stamina'], tasks: ['4 Reps - 40-Yard Sprint Shuttle Runs', '60 Seconds - High Knees Sprint Interval', '60 Seconds - Jump Rope Speed Intervals'] },
    { keys: ['strength', 'power', 'legs', 'squat'], tasks: ['30 Reps - Bodyweight Squats', '20 Reps - Bulgarian Split Squats', '30 Reps - Strict Push-ups'] }
];

async function generateFromTextPrompt() {
    playSound('click');
    const input = document.getElementById('prompt-input');
    const text = input ? input.value.trim() : '';

    if (!text) {
        alert("Please enter text specifying your athletic workout or recovery requirements.");
        return;
    }

    const questBox = document.getElementById('quest-box');
    if (questBox) {
        questBox.innerHTML = `<div style="color:var(--cyan-glow); text-align:center; padding:30px 0;">[ AI System Generating Athletic Workout from Prompt... ]</div>`;
    }

    try {
        const response = await fetch('/api/generate-from-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                promptText: text,
                username: state.username,
                level: state.level,
                age: state.age,
                weight: state.weight
            })
        });

        const data = await response.json();
        if (data && data.success) {
            const questObj = {
                title: data.title || `Generated Workout: "${text.slice(0, 30)}..."`,
                desc: data.description || `System generated based on prompt: "${text}"`,
                tasks: (data.tasks || []).map(t => ({ text: typeof t === 'string' ? t : t.text, done: false })),
                source: 'ai-prompt',
                xpReward: data.rewardXp || Math.round((100 + state.level * 20) * getExpBoost())
            };
            state.activeQuest = questObj;
            state.lastQuestDate = new Date().toDateString();
            renderQuest(questObj);
            saveProgress();
            togglePromptGenerator();
            if (input) input.value = '';
            return;
        }
    } catch (e) {
        // Backend unavailable -> local keyword heuristic
    }

    const lower = text.toLowerCase();
    let tasks = [];
    KEYWORD_TASKS.forEach(group => {
        if (group.keys.some(k => lower.includes(k))) {
            tasks = tasks.concat(group.tasks);
        }
    });

    if (tasks.length === 0) {
        tasks = [
            '10 Minutes - Dynamic Warm-up & Hip Mobility',
            '30 Reps - Bodyweight Squats',
            '20 Reps - Strict Standard Push-ups',
            '60 Seconds - Forearm Plank Hold'
        ];
    }

    tasks = [...new Set(tasks)].slice(0, 5);

    const questObj = {
        title: `[ATHLETIC PROMPT QUEST] ${text.length > 35 ? text.slice(0, 35) + '…' : text}`,
        desc: `System generated for athlete request: "${text}"`,
        tasks: tasks.map(t => ({ text: t, done: false })),
        source: 'ai-prompt',
        xpReward: Math.round((80 + tasks.length * 15) * getExpBoost())
    };

    state.activeQuest = questObj;
    state.lastQuestDate = new Date().toDateString();
    renderQuest(questObj);
    saveProgress();
    togglePromptGenerator();
    if (input) input.value = '';
}

/* ---------------------------------------------------------
   MANUAL CUSTOM WORKOUT CREATOR WITH PERMANENT STORAGE
--------------------------------------------------------- */
function toggleCustomCreator() {
    playSound('click');
    const panel = document.getElementById('custom-creator-panel');
    if (!panel) return;
    if (panel.style.display === 'none' || !panel.style.display) {
        panel.style.display = 'block';
        if (document.querySelectorAll('.custom-task-val, .custom-task-input').length === 0) {
            loadPreset('mobility');
        }
    } else {
        panel.style.display = 'none';
    }
}

function addCustomTaskInput(val = '') {
    playSound('click');
    const container = document.getElementById('custom-tasks-container');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'custom-task-row';
    row.style.cssText = 'display:flex; gap:8px; align-items:center;';
    row.innerHTML = `
        <input type="text" class="custom-task-val custom-task-input" placeholder="e.g. 20 Reps - Strict Push-ups" value="${val ? escapeHtml(val) : ''}" style="margin-bottom:0; flex:1;">
        <button type="button" onclick="this.parentElement.remove()" style="background:rgba(239, 68, 68, 0.2); border:1px solid #ef4444; color:#ef4444; width:34px; height:38px; border-radius:6px; font-weight:bold; cursor:pointer;">✖</button>
    `;
    container.appendChild(row);
}

function loadPreset(type) {
    playSound('click');
    const preset = PRESETS[type];
    if (!preset) return;

    const titleInput = document.getElementById('custom-title');
    const descInput = document.getElementById('custom-desc');
    const container = document.getElementById('custom-tasks-container');

    if (titleInput) titleInput.value = preset.title;
    if (descInput) descInput.value = preset.desc;

    if (container) {
        container.innerHTML = '';
        preset.tasks.forEach(t => addCustomTaskInput(t));
    }
}

function saveAndActivateCustomQuest() {
    playSound('levelup');
    const titleInput = document.getElementById('custom-title');
    const descInput = document.getElementById('custom-desc');

    const title = (titleInput && titleInput.value.trim()) || 'Custom Athletic Training Protocol';
    const desc = (descInput && descInput.value.trim()) || 'Custom training routine designed for functional athletic performance.';

    const taskInputs = document.querySelectorAll('.custom-task-val, .custom-task-input');
    const tasks = [];
    taskInputs.forEach(input => {
        const val = input.value.trim();
        if (val && !tasks.includes(val)) tasks.push(val);
    });

    if (tasks.length === 0) {
        alert("Please add at least 1 exercise movement to your custom workout!");
        return;
    }

    const customId = 'custom_' + Date.now();
    const baseTasks = tasks.map(t => {
        const isDuration = /second|sec|minute|min/i.test(t);
        const match = t.match(/^(\d+)\s*(.*)/);
        if (match) {
            const rawReps = parseInt(match[1], 10) || 15;
            return { name: match[2] || t, baseReps: roundToCleanReps(rawReps, isDuration), isDuration };
        }
        return { name: t, baseReps: 15, isDuration: false };
    });

    const newCustomProgram = {
        id: customId,
        mentor: 'All Might',
        anime: 'My Hero Academia',
        avatar: '🛠️',
        role: 'Custom Athletic Protocol',
        coachTitle: 'Symbol of Athlete Custom Creation',
        title: title,
        category: 'Custom Routine',
        rank: 'CUSTOM-RANK',
        focus: desc.length > 50 ? desc.slice(0, 50) + '…' : desc,
        duration: '14-Day Custom Program',
        meta: desc,
        isCustom: true,
        coachVoice: {
            pitch: 1.0,
            rate: 1.0,
            greeting: `Custom Athletic Protocol for ${title} activated. Execute each movement with clean form and Plus Ultra intensity!`
        },
        baseTasks: baseTasks
    };

    // Save to permanent localStorage array
    const savedCustoms = getSavedCustomWorkouts();
    savedCustoms.unshift(newCustomProgram);
    saveCustomWorkouts(savedCustoms);

    // Launch Day 1 immediately
    launchProgramDay(customId, 1);

    // Check for Custom Protocol Architect title unlock
    checkAndUnlockTitles();

    // Close Creator Panel and update UI
    const panel = document.getElementById('custom-creator-panel');
    if (panel) panel.style.display = 'none';

    updateUI();
    saveProgress();
}

/* ---------------------------------------------------------
   REST TIMER
--------------------------------------------------------- */
function startTimer(seconds) {
    playSound('click');
    clearInterval(timerInterval);
    timerSeconds = seconds;
    updateTimerDisplay();

    timerInterval = setInterval(() => {
        timerSeconds--;
        updateTimerDisplay();
        if (timerSeconds <= 0) {
            clearInterval(timerInterval);
            playSound('levelup');
            const timerText = document.getElementById('timer-text');
            if (timerText) timerText.textContent = "REST DONE!";
        }
    }, 1000);
}

function resetTimer() {
    playSound('click');
    clearInterval(timerInterval);
    timerSeconds = 60;
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const mins = Math.floor(timerSeconds / 60);
    const secs = timerSeconds % 60;
    const timerText = document.getElementById('timer-text');
    if (timerText) {
        timerText.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}
