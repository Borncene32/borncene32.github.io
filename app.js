const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/10rlU4ejcj0fDFcuGciRMRuiPUVHqg-B2zW2IEz_KkBk/edit?gid=0#gid=0";
    const SHEET_REFRESH_MS = 20000;

    const demoRows = [
      {
        TOPIC: "TYPING",
        QUESTIONS: "How often do you type on a keyboard?",
        SAMPLE: "I type on a keyboard pretty much every single day. You could say it's part and parcel of my daily routine. Since I'm quite tech-savvy, I spend a lot of time typing school documents, chatting with my friends, and sometimes even coding or designing websites. On busy days, my fingers are basically glued to the keyboard from morning till night.",
        VOCAB: "part and parcel: a normal and important part of life\ntech-savvy\nfingers are glued to the keyboard"
      },
      {
        TOPIC: "TYPING",
        QUESTIONS: "Did you learn how to type at school when you were younger?",
        SAMPLE: "Not really. My school only taught very basic typing skills, like which finger should be responsible for certain keys on the keyboard. To be honest, I found that method a bit rigid and suffocating, so I decided to learn in my own way instead. Later on, I discovered a website called TypeRacer, where players compete in typing races and the car moves according to your typing speed. I found it incredibly fun and motivating because I got the chance to compete with other typists from around the world.",
        VOCAB: "rigid and suffocating\nlearn in my own way\ntyping races\npicked up speed"
      },
      {
        TOPIC: "TYPING",
        QUESTIONS: "When did you learn how to type on a keyboard?",
        SAMPLE: "I started learning when I was around 10 or 11 years old, after I started using a computer for my studies and online competitions. At first, I typed really slowly and had to look at every key, but after years of practice, typing became second nature to me. Coding and website design also helped me improve my speed and accuracy a lot.",
        VOCAB: "had to look at every key\nbecame second nature: very natural and automatic\ncoding and website design"
      },
      {
        TOPIC: "WORK",
        QUESTIONS: "Do you work or are you a student?",
        SAMPLE: "At the moment, I'm a student, but I also take on freelance projects from time to time. It gives me a chance to apply what I learn in class and develop practical skills. I think balancing both study and work can be challenging, but it has made me more disciplined.",
        VOCAB: "take on freelance projects\napply what I learn\nbalancing both study and work\nmore disciplined"
      },
      {
        TOPIC: "WORK",
        QUESTIONS: "Why did you choose that field?",
        SAMPLE: "I chose this field because it gives me room to be creative and solve real problems. I enjoy learning how people think and how technology can make their daily routines smoother. It also offers many career opportunities, so it feels like a sensible long-term choice.",
        VOCAB: "room to be creative\nsolve real problems\ndaily routines\nlong-term choice"
      }
    ];

    let rows = [...demoRows];
    let currentTopic = "TYPING";
    let currentIndex = 0;
    let voices = [];
    let startedAt = null;
    let timerId = null;
    let timerElapsedMs = 0;
    let pauseStartedAt = null;
    let speechRunId = 0;
    let speechState = "idle";
    let wakeLock = null;
    let activeSheetUrl = DEFAULT_SHEET_URL;
    let activeSheetName = "";
    let refreshTimerId = null;
    let lastRowsSignature = "";
    let isRefreshingSheet = false;

    const els = {
      dataStatus: document.getElementById("dataStatus"),
      sheetForm: document.getElementById("sheetForm"),
      sheetUrl: document.getElementById("sheetUrl"),
      sheetPart: document.getElementById("sheetPart"),
      stageTopic: document.getElementById("stageTopic"),
      stageProgress: document.getElementById("stageProgress"),
      conversation: document.getElementById("conversation"),
      timer: document.getElementById("timer"),
      prevBtn: document.getElementById("prevBtn"),
      playBtn: document.getElementById("playBtn"),
      nextBtn: document.getElementById("nextBtn"),
      topicList: document.getElementById("topicList"),
      questionList: document.getElementById("questionList"),
      detailTitle: document.getElementById("detailTitle"),
      speakTopicBtn: document.getElementById("speakTopicBtn"),
      demoBtn: document.getElementById("demoBtn"),
      ttsProvider: document.getElementById("ttsProvider"),
      examinerVoice: document.getElementById("examinerVoice"),
      candidateVoice: document.getElementById("candidateVoice"),
      examinerSpeed: document.getElementById("examinerSpeed"),
      candidateSpeed: document.getElementById("candidateSpeed"),
      examinerSpeedValue: document.getElementById("examinerSpeedValue"),
      candidateSpeedValue: document.getElementById("candidateSpeedValue")
    };

    function normalizeKey(key) {
      return key.trim().toUpperCase().replace(/\s+/g, "");
    }

    function normalizeRows(items) {
      let lastTopic = "GENERAL";
      return items.map((item) => {
        const topic = String(item.TOPIC || "").trim();
        if (topic) lastTopic = topic;
        return {
          TOPIC: lastTopic,
          QUESTIONS: String(item.QUESTIONS || item.QUESTION || "").trim(),
          SAMPLE: String(item.SAMPLE || item.ANSWER || "").trim(),
          VOCAB: String(item.VOCAB || item.VOCABULARY || "").trim()
        };
      }).filter((item) => item.QUESTIONS);
    }

    function parseCSV(text) {
      const table = [];
      let row = [];
      let cell = "";
      let quoted = false;

      for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        const next = text[i + 1];

        if (char === '"' && quoted && next === '"') {
          cell += '"';
          i += 1;
        } else if (char === '"') {
          quoted = !quoted;
        } else if (char === "," && !quoted) {
          row.push(cell);
          cell = "";
        } else if ((char === "\n" || char === "\r") && !quoted) {
          if (char === "\r" && next === "\n") i += 1;
          row.push(cell);
          if (row.some(Boolean)) table.push(row);
          row = [];
          cell = "";
        } else {
          cell += char;
        }
      }

      row.push(cell);
      if (row.some(Boolean)) table.push(row);
      if (table.length < 2) return [];

      const headers = table[0].map(normalizeKey);
      return normalizeRows(table.slice(1).map((cells) => {
        const item = {};
        headers.forEach((header, index) => {
          item[header] = (cells[index] || "").trim();
        });
        return item;
      }));
    }

    function parseGoogleTable(table) {
      const headers = table.cols.map((col, index) => normalizeKey(col.label || col.id || `COL${index}`));
      return normalizeRows(table.rows.map((row) => {
        const item = {};
        headers.forEach((header, index) => {
          const cell = row.c[index];
          item[header] = cell && cell.v != null ? String(cell.v).trim() : "";
        });
        return item;
      }));
    }

    function extractUrl(value) {
      const match = String(value).match(/https?:\/\/[^\s)\]]+/);
      return match ? match[0] : String(value).trim();
    }

    function getSheetInfo(url, sheetName = "") {
      const match = url.match(/\/spreadsheets\/d\/([^/]+)/);
      if (!match) return null;
      const parsed = new URL(url);
      const hashGid = parsed.hash.match(/gid=(\d+)/);
      return {
        id: match[1],
        gid: parsed.searchParams.get("gid") || (hashGid ? hashGid[1] : "0"),
        sheetName: String(sheetName || "").trim()
      };
    }

    function toCsvUrl(url, sheetName = "") {
      const sheet = getSheetInfo(url, sheetName);
      if (!sheet) return url;
      return `https://docs.google.com/spreadsheets/d/${sheet.id}/export?format=csv&gid=${sheet.gid}`;
    }

    function loadGoogleSheetJsonp(url, sheetName = "") {
      const sheet = getSheetInfo(url, sheetName);
      if (!sheet) return Promise.reject(new Error("Không phải link Google Sheets"));

      return new Promise((resolve, reject) => {
        const callbackName = `sheetCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const script = document.createElement("script");
        const sheetParam = sheet.sheetName ? `&sheet=${encodeURIComponent(sheet.sheetName)}` : `&gid=${sheet.gid}`;
        const endpoint = `https://docs.google.com/spreadsheets/d/${sheet.id}/gviz/tq?tqx=out:json;responseHandler:${callbackName}${sheetParam}&headers=1&_=${Date.now()}`;
        const cleanup = () => {
          delete window[callbackName];
          script.remove();
        };

        window[callbackName] = (payload) => {
          cleanup();
          if (!payload || !payload.table) {
            reject(new Error("Google Sheets không trả về table"));
            return;
          }
          resolve(parseGoogleTable(payload.table));
        };

        script.onerror = () => {
          cleanup();
          reject(new Error("Không tải được Google Sheets JSONP"));
        };

        script.src = endpoint;
        document.head.appendChild(script);
      });
    }

    async function loadSheetRows(input, sheetName = "") {
      const url = extractUrl(input);
      if (getSheetInfo(url, sheetName)) {
        try {
          return await loadGoogleSheetJsonp(url, sheetName);
        } catch (error) {
          console.warn("JSONP failed, trying CSV export", error);
        }
      }

      const response = await fetch(toCsvUrl(url, sheetName));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return parseCSV(await response.text());
    }

    function getRowsSignature(nextRows) {
      return JSON.stringify(nextRows.map((row) => [
        row.TOPIC,
        row.QUESTIONS,
        row.SAMPLE,
        row.VOCAB
      ]));
    }

    function applySheetRows(nextRows, options = {}) {
      const previousTopic = currentTopic;
      const previousQuestion = getTopicRows()[currentIndex]?.QUESTIONS;

      rows = nextRows;
      const topics = getTopics();

      if (options.reset || !topics.includes(previousTopic)) {
        currentTopic = topics[0] || "GENERAL";
        currentIndex = 0;
      } else {
        currentTopic = previousTopic;
        const updatedRows = getTopicRows();
        const matchedIndex = updatedRows.findIndex((row) => row.QUESTIONS === previousQuestion);
        currentIndex = matchedIndex >= 0 ? matchedIndex : Math.min(currentIndex, Math.max(updatedRows.length - 1, 0));
      }

      renderAll();
    }

    async function refreshSheet(options = {}) {
      if (!activeSheetUrl || isRefreshingSheet) return;
      isRefreshingSheet = true;

      try {
        if (!options.silent) setStatus("Đang tải Google Sheets...", true);
        const parsed = await loadSheetRows(activeSheetUrl, activeSheetName);
        if (!parsed.length) throw new Error("Sheet không có dòng hợp lệ");

        const signature = getRowsSignature(parsed);
        if (signature !== lastRowsSignature) {
          lastRowsSignature = signature;
          applySheetRows(parsed, { reset: options.reset });
          setStatus(`Đã đồng bộ ${rows.length} câu từ Sheets${activeSheetName ? ` / ${activeSheetName}` : ""}`, true);
        } else if (!options.silent) {
          setStatus(`Sheet không có thay đổi (${rows.length} câu)`, true);
        }
      } catch (error) {
        if (!options.silent) setStatus("Không tải được Sheet, kiểm tra link public", false);
        console.error(error);
      } finally {
        isRefreshingSheet = false;
      }
    }

    function startSheetAutoRefresh() {
      clearInterval(refreshTimerId);
      if (!activeSheetUrl) return;
      refreshTimerId = setInterval(() => {
        refreshSheet({ silent: true, reset: false });
      }, SHEET_REFRESH_MS);
    }

    function getTopics() {
      return [...new Set(rows.map((row) => row.TOPIC.trim() || "GENERAL"))];
    }

    function getTopicRows(topic = currentTopic) {
      return rows.filter((row) => (row.TOPIC.trim() || "GENERAL") === topic);
    }

    function setStatus(text, loaded = false) {
      els.dataStatus.innerHTML = `<span class="status-dot"></span><span>${text}</span>`;
      els.dataStatus.querySelector(".status-dot").style.background = loaded ? "var(--red)" : "var(--green)";
    }

    function renderTopics() {
      const topics = getTopics();
      if (!topics.includes(currentTopic)) currentTopic = topics[0] || "GENERAL";

      els.topicList.innerHTML = topics.map((topic) => {
        const count = getTopicRows(topic).length;
        const active = topic === currentTopic ? " active" : "";
        return `<button class="topic-btn${active}" type="button" data-topic="${escapeHtml(topic)}">
          <span>${escapeHtml(topic)}</span><span class="count">${count}</span>
        </button>`;
      }).join("");

      els.topicList.querySelectorAll(".topic-btn").forEach((button) => {
        button.addEventListener("click", () => {
          currentTopic = button.dataset.topic;
          currentIndex = 0;
          renderAll();
        });
      });
    }

    function renderConversation() {
      const topicRows = getTopicRows();
      const item = topicRows[currentIndex] || topicRows[0];
      if (!item) {
        els.conversation.innerHTML = `<div class="empty">Chưa có dữ liệu câu hỏi.</div>`;
        return;
      }

      els.stageTopic.textContent = `Topic: ${item.TOPIC}`;
      els.stageProgress.textContent = `Question ${currentIndex + 1} of ${topicRows.length}`;
      els.conversation.innerHTML = [
        messageTemplate("examiner", "Ex", "Examiner", item.QUESTIONS),
        messageTemplate("candidate", "C", "Candidate", item.SAMPLE)
      ].join("");
    }

    function messageTemplate(type, avatar, role, text) {
      return `<article class="message ${type}">
        <div class="avatar">${avatar}</div>
        <div class="bubble"><span class="role">${role}</span>${formatText(text)}</div>
      </article>`;
    }

    function renderQuestions() {
      const topicRows = getTopicRows();
      els.detailTitle.textContent = currentTopic;
      els.questionList.innerHTML = topicRows.length ? topicRows.map((item, index) => {
        const open = index === currentIndex ? " open" : "";
        return `<article class="qa-card${open}">
          <button class="qa-question" type="button" data-index="${index}">
            <span>${escapeHtml(item.QUESTIONS)}</span><span>${index === currentIndex ? "−" : "+"}</span>
          </button>
          <div class="qa-body">
            <div class="sample"><span class="label">Sample answer</span>${formatText(item.SAMPLE)}</div>
            <div class="vocab"><span class="label">Vocabulary</span>${formatVocab(item.VOCAB)}</div>
          </div>
        </article>`;
      }).join("") : `<div class="empty">Không có câu hỏi trong topic này.</div>`;

      els.questionList.querySelectorAll(".qa-question").forEach((button) => {
        button.addEventListener("click", () => {
          currentIndex = Number(button.dataset.index);
          renderAll();
        });
      });
    }

    function renderAll() {
      renderTopics();
      renderConversation();
      renderQuestions();
      updateNav();
    }

    function getFlatQuestions() {
      return getTopics().flatMap((topic) => getTopicRows(topic).map((item, index) => ({
        topic,
        index,
        item
      })));
    }

    function getCurrentFlatIndex(flatQuestions = getFlatQuestions()) {
      return flatQuestions.findIndex((entry) => entry.topic === currentTopic && entry.index === currentIndex);
    }

    function updateNav() {
      const flatQuestions = getFlatQuestions();
      const flatIndex = getCurrentFlatIndex(flatQuestions);
      els.prevBtn.disabled = flatIndex <= 0;
      els.nextBtn.disabled = flatIndex < 0 || flatIndex >= flatQuestions.length - 1;
    }

    function escapeHtml(value) {
      return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function formatText(text) {
      return escapeHtml(text).replace(/\n{2,}/g, "<br><br>").replace(/\n/g, "<br>");
    }

    function formatVocab(text) {
      const words = String(text || "").split(/\n|;/).map((item) => item.trim()).filter(Boolean);
      if (!words.length) return `<p class="hint">Chưa có vocab cho câu này.</p>`;
      return `<ul>${words.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
    }

    function loadVoices() {
      voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
      populateVoiceSelects();
    }

    function voiceLabel(voice) {
      const quality = /natural|neural|online/i.test(voice.name) ? "Natural" : "Standard";
      return `${voice.name} (${voice.lang}, ${quality})`;
    }

    const MALE_VOICE_NAME_RE = /\b(guy|david|mark|daniel|ryan|brian|andrew|george|james|john|paul|matthew|michael|christopher|liam|william|thomas|arthur|oliver|charles|roger|fred|alex|eric|steffan|jacob|sean|tony|wayne)\b/i;
    const FEMALE_VOICE_NAME_RE = /\b(jenny|aria|ava|emma|samantha|sonia|libby|zira|susan|victoria|karen|moira|tessa|fiona|serena|salli|joanna|kendra|kimberly|ivy|amy|nicole|olivia|mia|lily|kate|sarah|michelle|ana|natasha|clara|elsie|freya|jane|monica)\b/i;

    function englishVoices() {
      return voices
        .map((voice, index) => ({ voice, index }))
        .filter(({ voice }) => /^en/i.test(voice.lang));
    }

    function voiceMatchesRole(voice, role) {
      const name = String(voice.name || "");
      if (role === "examiner") {
        return MALE_VOICE_NAME_RE.test(name) && !FEMALE_VOICE_NAME_RE.test(name);
      }
      return FEMALE_VOICE_NAME_RE.test(name) && !MALE_VOICE_NAME_RE.test(name);
    }

    function roleVoiceOptions(role) {
      const english = englishVoices();
      const matched = english.filter(({ voice }) => voiceMatchesRole(voice, role));
      return matched.length ? matched : english;
    }

    function voiceScore(voice, role) {
      const text = `${voice.name} ${voice.lang}`.toLowerCase();
      let score = 0;
      if (/^en-us/i.test(voice.lang)) score += 40;
      if (/^en-gb/i.test(voice.lang)) score += 34;
      if (/^en/i.test(voice.lang)) score += 24;
      if (/natural|neural|online|premium/.test(text)) score += 45;
      if (/microsoft|google/.test(text)) score += 16;
      if (voiceMatchesRole(voice, role)) score += 80;
      if (role === "examiner" && FEMALE_VOICE_NAME_RE.test(text)) score -= 40;
      if (role === "candidate" && MALE_VOICE_NAME_RE.test(text)) score -= 40;
      if (/jenny|aria|ava|emma|samantha|sonia|libby|zira/.test(text)) score += role === "candidate" ? 18 : 8;
      if (/guy|david|mark|daniel|ryan|brian|andrew|george/.test(text)) score += role === "examiner" ? 18 : 8;
      if (/desktop|compact/.test(text)) score -= 8;
      return score;
    }

    function rankedVoices(role) {
      return roleVoiceOptions(role)
        .map(({ voice }) => voice)
        .sort((a, b) => voiceScore(b, role) - voiceScore(a, role));
    }

    function populateVoiceSelects() {
      if (els.ttsProvider.value === "elevenlabs") {
        populateElevenVoiceSelects();
        return;
      }
      if (!voices.length) return;
      const currentExaminer = els.examinerVoice.value;
      const currentCandidate = els.candidateVoice.value;

      const options = voices
        .map((voice, index) => ({ voice, index }))
        .filter(({ voice }) => /^en/i.test(voice.lang))
        .map(({ voice, index }) => `<option value="${index}">${escapeHtml(voiceLabel(voice))}</option>`)
        .join("");

      els.examinerVoice.innerHTML = `<option value="auto">Auto: giọng tự nhiên nhất</option>${options}`;
      els.candidateVoice.innerHTML = `<option value="auto">Auto: giọng tự nhiên nhất</option>${options}`;
      els.examinerVoice.value = currentExaminer && [...els.examinerVoice.options].some((option) => option.value === currentExaminer) ? currentExaminer : "auto";
      els.candidateVoice.value = currentCandidate && [...els.candidateVoice.options].some((option) => option.value === currentCandidate) ? currentCandidate : "auto";
    }

    function elevenVoiceLabel(voice) {
      const labels = voice.labels || {};
      const meta = [labels.gender, labels.accent, labels.use_case].filter(Boolean).join(", ");
      return meta ? `${voice.name} (${meta})` : voice.name;
    }

    function findElevenVoiceIdByName(name) {
      const match = elevenVoices.find((voice) => String(voice.name || "").trim().toLowerCase() === name.toLowerCase());
      return match?.voice_id || "";
    }

    function populateElevenVoiceSelects() {
      const currentExaminer = els.examinerVoice.value;
      const currentCandidate = els.candidateVoice.value;
      const options = elevenVoices
        .map((voice) => `<option value="${escapeHtml(voice.voice_id)}">${escapeHtml(elevenVoiceLabel(voice))}</option>`)
        .join("");

      els.examinerVoice.innerHTML = options;
      els.candidateVoice.innerHTML = options;
      const defaultExaminer = findElevenVoiceIdByName(DEFAULT_ELEVEN_EXAMINER_NAME) || "21m00Tcm4TlvDq8ikWAM";
      const defaultCandidate = findElevenVoiceIdByName(DEFAULT_ELEVEN_CANDIDATE_NAME) || "EXAVITQu4vr4xnSDxMaL";
      const optionValues = [...els.examinerVoice.options].map((option) => option.value);
      els.examinerVoice.value = optionValues.includes(currentExaminer) && currentExaminer !== defaultCandidate ? currentExaminer : defaultExaminer;
      els.candidateVoice.value = optionValues.includes(currentCandidate) && currentCandidate !== defaultExaminer ? currentCandidate : defaultCandidate;
    }

    function syncTtsProviderUI() {
      els.elevenPanel.classList.toggle("active", els.ttsProvider.value === "elevenlabs");
      populateVoiceSelects();
    }

    function chooseVoice(role) {
      if (!voices.length) return null;
      const select = role === "examiner" ? els.examinerVoice : els.candidateVoice;
      if (select.value !== "auto" && voices[Number(select.value)]) return voices[Number(select.value)];
      const ranked = rankedVoices(role);
      if (role === "candidate") {
        const examinerVoice = chooseVoice("examiner");
        return ranked.find((voice) => voice !== examinerVoice) || ranked[0];
      }
      return ranked[0];
    }

    function chooseElevenVoiceId(role) {
      return role === "examiner" ? els.examinerVoice.value : els.candidateVoice.value;
    }

    function wait(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function splitForSpeech(text) {
      return String(text || "")
        .replace(/\s+/g, " ")
        .split(/(?<=[.!?])\s+/)
        .map((part) => part.trim())
        .filter(Boolean);
    }

    async function loadElevenVoices() {
      const apiKey = ELEVEN_API_KEY;
      if (!apiKey) {
        setStatus("Chưa cấu hình ElevenLabs API key", false);
        return;
      }

      try {
        setStatus("Đang tải ElevenLabs voices...", true);
        const response = await fetch("https://api.elevenlabs.io/v1/voices", {
          headers: {
            "xi-api-key": apiKey
          }
        });
        if (!response.ok) throw new Error(`ElevenLabs HTTP ${response.status}`);
        const payload = await response.json();
        const accountVoices = Array.isArray(payload.voices) ? payload.voices : [];
        elevenVoices = [...accountVoices, ...ELEVEN_PRESET_VOICES]
          .filter((voice, index, list) => voice.voice_id && list.findIndex((item) => item.voice_id === voice.voice_id) === index);
        populateElevenVoiceSelects();
        setStatus(`Đã tải ${accountVoices.length} voice từ ElevenLabs`, true);
      } catch (error) {
        setStatus("Không tải được ElevenLabs voices", false);
        console.error(error);
      }
    }

    function getElevenPlayer() {
      if (!elevenPlayer) {
        elevenPlayer = new Audio();
        elevenPlayer.preload = "auto";
        elevenPlayer.playsInline = true;
      }
      return elevenPlayer;
    }

    function unlockElevenPlayback() {
      if (elevenPlaybackUnlocked || els.ttsProvider.value !== "elevenlabs") return;
      const player = getElevenPlayer();
      const previousMuted = player.muted;
      player.muted = true;
      player.src = SILENT_AUDIO_SRC;
      player.play()
        .then(() => {
          if (player.currentSrc === SILENT_AUDIO_SRC || player.src === SILENT_AUDIO_SRC) {
            player.pause();
            player.currentTime = 0;
            player.muted = previousMuted;
          }
          elevenPlaybackUnlocked = true;
        })
        .catch(() => {
          if (player.currentSrc === SILENT_AUDIO_SRC || player.src === SILENT_AUDIO_SRC) {
            player.muted = previousMuted;
          }
        });
    }

    function cleanupElevenAudio() {
      if (currentElevenAudio) {
        currentElevenAudio.pause();
        currentElevenAudio.removeAttribute("src");
        currentElevenAudio.load();
        currentElevenAudio = null;
      }
      if (currentElevenUrl) {
        URL.revokeObjectURL(currentElevenUrl);
        currentElevenUrl = "";
      }
      if (currentElevenResolve) {
        currentElevenResolve();
        currentElevenResolve = null;
      }
    }

    async function fetchElevenAudio(text, role) {
      const apiKey = ELEVEN_API_KEY;
      if (!apiKey) {
        throw new Error("Missing ElevenLabs API key");
      }

      const voiceId = chooseElevenVoiceId(role);
      const rate = Number(role === "examiner" ? els.examinerSpeed.value : els.candidateSpeed.value);
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: String(text || "").trim(),
          model_id: els.elevenModel.value,
          voice_settings: {
            stability: role === "examiner" ? 0.58 : 0.46,
            similarity_boost: 0.78,
            style: role === "candidate" ? 0.22 : 0.12,
            use_speaker_boost: true
          }
        })
      });

      if (!response.ok) {
        let message = `ElevenLabs HTTP ${response.status}`;
        try {
          const payload = await response.json();
          const detail = payload.detail || {};
          if (detail.code === "quota_exceeded") {
            message = detail.message || "ElevenLabs đã hết quota.";
          } else if (detail.message) {
            message = detail.message;
          }
        } catch (error) {
          // Keep the HTTP status message when ElevenLabs does not return JSON.
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      return {
        url: URL.createObjectURL(blob),
        rate
      };
    }

    async function playElevenAudio(audioData) {
      cleanupElevenAudio();
      currentElevenUrl = audioData.url;
      currentElevenAudio = getElevenPlayer();
      currentElevenAudio.src = currentElevenUrl;
      currentElevenAudio.preload = "auto";
      currentElevenAudio.muted = false;
      currentElevenAudio.playbackRate = audioData.rate;

      await new Promise((resolve, reject) => {
        currentElevenResolve = resolve;
        currentElevenAudio.onended = () => {
          cleanupElevenAudio();
          resolve();
        };
        currentElevenAudio.onerror = () => {
          cleanupElevenAudio();
          resolve();
        };
        currentElevenAudio.play().catch((error) => {
          cleanupElevenAudio();
          reject(error || new Error("Browser blocked ElevenLabs audio playback"));
        });
      });
    }

    async function speakElevenLabs(text, role) {
      const audioData = await fetchElevenAudio(text, role);
      await playElevenAudio(audioData);
    }

    function speakBrowser(text, role) {
      return new Promise(async (resolve) => {
        if (!window.speechSynthesis) {
          resolve();
          return;
        }

        const chunks = splitForSpeech(text);
        const rate = Number(role === "examiner" ? els.examinerSpeed.value : els.candidateSpeed.value);
        const voice = chooseVoice(role);
        const runId = speechRunId;

        for (let index = 0; index < chunks.length; index += 1) {
          if (runId !== speechRunId) break;
          await new Promise((done) => {
            const utterance = new SpeechSynthesisUtterance(chunks[index]);
            utterance.voice = voice;
            utterance.lang = voice ? voice.lang : "en-US";
            utterance.rate = rate;
            utterance.pitch = role === "examiner" ? 0.9 : 1.04;
            utterance.volume = 1;
            utterance.onend = done;
            utterance.onerror = done;
            window.speechSynthesis.speak(utterance);
          });
          if (runId !== speechRunId) break;
          if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
            await wait(role === "examiner" ? 170 : 120);
          }
        }
        resolve();
      });
    }

    async function speak(text, role) {
      if (els.ttsProvider.value === "elevenlabs") {
        try {
          await speakElevenLabs(text, role);
        } catch (error) {
          setStatus("ElevenLabs không đọc được, kiểm tra API key/voice/quota", false);
          console.error(error);
        }
        return;
      }

      await speakBrowser(text, role);
    }

    function buildTopicSpeechQueue(topicRows, startIndex = 0, topic = currentTopic) {
      return topicRows.slice(startIndex).flatMap((item, offset) => {
        const index = startIndex + offset;
        const parts = [
          { topic, index, role: "examiner", text: item.QUESTIONS }
        ];
        if (item.SAMPLE) {
          parts.push({ topic, index, role: "candidate", text: item.SAMPLE });
        }
        return parts;
      }).filter((item) => String(item.text || "").trim());
    }

    function buildRemainingSpeechQueue() {
      const flatQuestions = getFlatQuestions();
      const flatIndex = getCurrentFlatIndex(flatQuestions);
      if (flatIndex < 0) return [];

      return flatQuestions.slice(flatIndex).flatMap((entry) => {
        const parts = [
          { topic: entry.topic, index: entry.index, role: "examiner", text: entry.item.QUESTIONS }
        ];
        if (entry.item.SAMPLE) {
          parts.push({ topic: entry.topic, index: entry.index, role: "candidate", text: entry.item.SAMPLE });
        }
        return parts;
      }).filter((item) => String(item.text || "").trim());
    }

    async function playSpeechQueue(queue, runId) {
      if (els.ttsProvider.value === "elevenlabs") {
        await playElevenSpeechQueue(queue, runId);
        return;
      }

      for (const item of queue) {
        if (runId !== speechRunId) return;
        currentTopic = item.topic;
        currentIndex = item.index;
        renderAll();
        await speak(item.text, item.role);
        if (runId !== speechRunId) return;
        if (item.role === "candidate") await wait(180);
      }
    }

    async function playElevenSpeechQueue(queue, runId) {
      const preload = (item) => fetchElevenAudio(item.text, item.role);
      let currentAudioPromise = queue[0] ? preload(queue[0]) : null;
      let nextAudioPromise = queue[1] ? preload(queue[1]) : null;

      for (let index = 0; index < queue.length; index += 1) {
        if (runId !== speechRunId) return;
        const item = queue[index];
        currentTopic = item.topic;
        currentIndex = item.index;
        renderAll();

        const audioData = await currentAudioPromise;
        currentAudioPromise = nextAudioPromise;
        nextAudioPromise = queue[index + 2] ? preload(queue[index + 2]) : null;

        if (runId !== speechRunId) {
          URL.revokeObjectURL(audioData.url);
          return;
        }
        await playElevenAudio(audioData);
      }
    }

    function populateVoiceSelects() {
      if (!voices.length) return;
      const currentExaminer = els.examinerVoice.value;
      const currentCandidate = els.candidateVoice.value;
      const examinerOptions = roleVoiceOptions("examiner")
        .map(({ voice, index }) => `<option value="${index}">${escapeHtml(voiceLabel(voice))}</option>`)
        .join("");
      const candidateOptions = roleVoiceOptions("candidate")
        .map(({ voice, index }) => `<option value="${index}">${escapeHtml(voiceLabel(voice))}</option>`)
        .join("");

      els.examinerVoice.innerHTML = `<option value="auto">Auto male voice</option>${examinerOptions}`;
      els.candidateVoice.innerHTML = `<option value="auto">Auto female voice</option>${candidateOptions}`;
      els.examinerVoice.value = currentExaminer && [...els.examinerVoice.options].some((option) => option.value === currentExaminer) ? currentExaminer : "auto";
      els.candidateVoice.value = currentCandidate && [...els.candidateVoice.options].some((option) => option.value === currentCandidate) ? currentCandidate : "auto";
    }

    function syncTtsProviderUI() {
      populateVoiceSelects();
    }

    async function speak(text, role) {
      await speakBrowser(text, role);
    }

    async function playSpeechQueue(queue, runId) {
      for (const item of queue) {
        if (runId !== speechRunId) return;
        currentTopic = item.topic;
        currentIndex = item.index;
        renderAll();
        await speak(item.text, item.role);
        if (runId !== speechRunId) return;
        if (item.role === "candidate") await wait(180);
      }
    }

    function updatePlayButton() {
      els.playBtn.textContent = speechState === "paused" ? "Resume" : speechState === "playing" ? "Pause" : "Play";
    }

    function setupMediaSession() {
      if (!("mediaSession" in navigator)) return;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "IELTS Speaking Sample Room",
        artist: "Speaking practice"
      });
      navigator.mediaSession.setActionHandler("play", () => {
        if (speechState !== "playing") togglePlay();
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        if (speechState === "playing") togglePlay();
      });
    }

    async function requestWakeLock() {
      if (!("wakeLock" in navigator) || wakeLock) return;
      try {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => {
          wakeLock = null;
        });
      } catch (error) {
        wakeLock = null;
      }
    }

    async function releaseWakeLock() {
      if (!wakeLock) return;
      const lock = wakeLock;
      wakeLock = null;
      try {
        await lock.release();
      } catch (error) {
        // Some browsers release the lock automatically when the page is hidden.
      }
    }

    async function playFromCurrentToEnd() {
      const queue = buildRemainingSpeechQueue();
      if (!queue.length) return;
      stopSpeech(false);
      const runId = ++speechRunId;
      speechState = "playing";
      updatePlayButton();
      requestWakeLock();
      startTimer();

      try {
        await playSpeechQueue(queue, runId);
      } catch (error) {
        if (runId === speechRunId) {
          setStatus(error.message || "Browser voices không đọc được.", false);
          console.error(error);
        }
      }

      if (runId === speechRunId) {
        speechState = "idle";
        updatePlayButton();
        stopTimer();
        releaseWakeLock();
      }
    }

    async function playAllTopics() {
      const topics = getTopics();
      stopSpeech(false);
      const runId = ++speechRunId;
      const queue = topics.flatMap((topic) => buildTopicSpeechQueue(getTopicRows(topic), 0, topic));
      speechState = "playing";
      updatePlayButton();
      requestWakeLock();
      startTimer();

      try {
        await playSpeechQueue(queue, runId);
      } catch (error) {
        if (runId === speechRunId) {
          setStatus(error.message || "Browser voices không đọc được.", false);
          console.error(error);
        }
      }

      if (runId === speechRunId) {
        speechState = "idle";
        updatePlayButton();
        stopTimer();
        releaseWakeLock();
      }
    }

    function stopSpeech(resetTimer = true) {
      speechRunId += 1;
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (resetTimer) stopTimer();
      speechState = "idle";
      pauseStartedAt = null;
      updatePlayButton();
      releaseWakeLock();
    }

    function resumeSpeechSynthesis() {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.resume();
      setTimeout(() => {
        if (speechState === "playing" && window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }, 80);
    }

    function togglePlay() {
      if (speechState === "idle") {
        playFromCurrentToEnd();
        return;
      }

      if (!window.speechSynthesis) return;
      if (speechState === "paused") {
        resumeSpeechSynthesis();
        speechState = "playing";
        resumeTimer();
        requestWakeLock();
      } else if (speechState === "playing" && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
        window.speechSynthesis.pause();
        speechState = "paused";
        pauseTimer();
      }
      updatePlayButton();
    }

    function startTimer() {
      startedAt = Date.now();
      timerElapsedMs = 0;
      pauseStartedAt = null;
      clearInterval(timerId);
      timerId = setInterval(() => {
        renderTimer();
      }, 250);
      renderTimer();
    }

    function renderTimer() {
      const elapsed = timerElapsedMs + (startedAt ? Date.now() - startedAt : 0);
      const seconds = Math.floor(elapsed / 1000);
      const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
      const secs = String(seconds % 60).padStart(2, "0");
      els.timer.textContent = `${mins}:${secs}`;
    }

    function pauseTimer() {
      if (!startedAt || pauseStartedAt) return;
      timerElapsedMs += Date.now() - startedAt;
      startedAt = null;
      pauseStartedAt = Date.now();
      renderTimer();
    }

    function resumeTimer() {
      if (startedAt) return;
      startedAt = Date.now();
      pauseStartedAt = null;
    }

    function stopTimer() {
      clearInterval(timerId);
      timerId = null;
      startedAt = null;
      timerElapsedMs = 0;
      pauseStartedAt = null;
    }

    function nextQuestion(delta) {
      const flatQuestions = getFlatQuestions();
      const flatIndex = getCurrentFlatIndex(flatQuestions);
      if (flatIndex < 0) return;
      const targetIndex = Math.min(Math.max(flatIndex + delta, 0), flatQuestions.length - 1);
      const target = flatQuestions[targetIndex];
      currentTopic = target.topic;
      currentIndex = target.index;
      renderAll();
    }

    els.sheetForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const url = extractUrl(els.sheetUrl.value);
      if (!url) return;

      activeSheetUrl = url;
      activeSheetName = els.sheetPart.value;
      lastRowsSignature = "";
      await refreshSheet({ reset: true });
      startSheetAutoRefresh();
    });

    els.sheetPart.addEventListener("change", async () => {
      const url = extractUrl(els.sheetUrl.value);
      if (!url) return;

      activeSheetUrl = url;
      activeSheetName = els.sheetPart.value;
      lastRowsSignature = "";
      stopSpeech();
      await refreshSheet({ reset: true });
      startSheetAutoRefresh();
    });

    els.prevBtn.addEventListener("click", () => nextQuestion(-1));
    els.nextBtn.addEventListener("click", () => nextQuestion(1));
    els.playBtn.addEventListener("click", togglePlay);
    els.speakTopicBtn.addEventListener("click", playAllTopics);
    els.ttsProvider.addEventListener("change", () => {
      stopSpeech();
      syncTtsProviderUI();
    });
    function updateSpeedLabel(input, label) {
      label.textContent = `${Number(input.value).toFixed(2)}x`;
    }

    els.examinerSpeed.addEventListener("input", () => {
      updateSpeedLabel(els.examinerSpeed, els.examinerSpeedValue);
    });
    els.candidateSpeed.addEventListener("input", () => {
      updateSpeedLabel(els.candidateSpeed, els.candidateSpeedValue);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && speechState === "playing") {
        requestWakeLock();
      }
    });
    els.demoBtn.addEventListener("click", () => {
      rows = [...demoRows];
      currentTopic = "TYPING";
      currentIndex = 0;
      activeSheetUrl = "";
      activeSheetName = "";
      clearInterval(refreshTimerId);
      lastRowsSignature = getRowsSignature(rows);
      els.sheetUrl.value = DEFAULT_SHEET_URL;
      els.sheetPart.value = "";
      stopSpeech();
      renderAll();
      setStatus("Đang dùng dữ liệu demo, auto-sync tạm dừng", false);
    });

    if ("speechSynthesis" in window) {
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    syncTtsProviderUI();
    setupMediaSession();

    els.sheetUrl.value = DEFAULT_SHEET_URL;
    renderAll();
    refreshSheet({ reset: true });
    startSheetAutoRefresh();
