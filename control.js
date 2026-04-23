// ============================================================
// PROMPT LIBRARY — control.js
// Connects to Flask /get endpoint, falls back to /static/prompts.json
// ============================================================
// =============================
// USER BEHAVIOR TRACKING
// =============================
let userHistory = JSON.parse(localStorage.getItem("userHistory") || "[]");

function trackUsage(prompt) {
    userHistory.push({
        id: prompt.id,
        time: Date.now(),
        category: prompt.category
    });
    localStorage.setItem("userHistory", JSON.stringify(userHistory));
}
let PROMPT_LIBRARY = [];

// ── Brand → productLine + industry mapping ──────────────────
function mapBrandToProductLine(brand) {
    if (!brand) return 'other';
    const b = brand.toUpperCase();
    if (b === 'PERFLY') return 'perfly';
    if (b === 'KIPSTA') return 'kipsta';
    return 'other';
}

function mapBrandToIndustry(brand, category, productType) {
    if (!brand) return 'Other';
    const b = brand.toUpperCase();
    if (b === 'PERFLY') return 'Badminton';
    if (b === 'KIPSTA') return 'Football';
    // Fallback: derive from product_type or category
    const pt = (productType || '').toLowerCase();
    const cat = (category || '').toLowerCase();
    if (pt === 'beauty' || cat.includes('ugc') || cat.includes('review') || cat.includes('lip')) return 'Beauty';
    if (pt === 'footwear' || cat.includes('footwear') || cat.includes('shoe')) return 'Footwear';
    if (pt === 'beverage' || cat.includes('beverage') || cat.includes('tea') || cat.includes('coffee')) return 'Beverage';
    if (pt === 'football' || cat.includes('football')) return 'Football';
    return 'Other';
}

function mapCategoryToVisualStyle(category) {
    if (!category) return 'Cinematic';
    const c = category.toLowerCase();
    if (c.includes('holographic') || c.includes('sonar') || c.includes('effect')) return 'Holographic';
    if (c.includes('technical') || c.includes('engineering') || c.includes('visualization') || c.includes('infographic')) return 'Technical';
    if (c.includes('macro') || c.includes('close-up') || c.includes('detail') || c.includes('material') || c.includes('moisture') || c.includes('sensory')) return 'Macro';
    if (c.includes('ugc') || c.includes('review')) return 'UGC';
    return 'Cinematic';
}

function mapCategoryToFormat(category) {
    if (!category) return 'Image';
    const c = category.toLowerCase();
    if (c.includes('video') || c.includes('animation') || c.includes('stop motion') || c.includes('rotation') || c.includes('reveal') || c.includes('assembly') || c.includes('sequence') || c.includes('product animation')) return 'Animation';
    return 'Image';
}

// ── Transform raw JSON item → UI object ─────────────────────
function transformItem(item) {
    return {
        id: item.id,
        title: item.title || 'Untitled',
        brand: item.brand || '',
        productLine: mapBrandToProductLine(item.brand),
        industry: mapBrandToIndustry(item.brand, item.category, item.product_type),
        visualStyle: mapCategoryToVisualStyle(item.category),
        formatType: mapCategoryToFormat(item.category),
        category: item.category || '',
        tags: [
            (item.brand || '').toLowerCase(),
            (item.category || '').toLowerCase().replace(/[\s\/]/g, '-')
        ].filter(Boolean),
        fullPrompt: item.content || '',
        imagePrompts: '',
        videoPrompts: '',
        favorite: item.favorite || false,
        created_at: item.created_at || ''
    };
}

// ── Load: Flask /get first, then /static/prompts.json ───────
async function loadPromptsDirectFromJSON() {
    try {
        const response = await fetch('/static/prompts.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (Array.isArray(data) && data.length) {
            console.log(`[Fallback] Loaded ${data.length} prompts from /static/prompts.json`);
            return data.map(transformItem);
        }
        return [];
    } catch (err) {
        console.warn('[Fallback] Direct prompts.json load failed:', err);
        return [];
    }
}

async function fetchPromptsFromJSON() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.classList.add('active');
    try {
        const response = await fetch('/get');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (Array.isArray(data) && data.length) {
            PROMPT_LIBRARY = data.map(transformItem);
            console.log(`[Flask] Loaded ${PROMPT_LIBRARY.length} prompts from /get`);
        } else {
            const directData = await loadPromptsDirectFromJSON();
            PROMPT_LIBRARY = directData.length ? directData : [];
        }
    } catch (err) {
        console.warn('[Flask] Backend not available, trying direct JSON fallback...', err);
        const directData = await loadPromptsDirectFromJSON();
        PROMPT_LIBRARY = directData.length ? directData : [];
    } finally {
        if (loadingOverlay) loadingOverlay.classList.remove('active');
        updateUIBadgeCount();
        updateUI();
    }
}

// ── Badge count ──────────────────────────────────────────────
function updateUIBadgeCount() {
    const el = document.getElementById('dynamicPromptCount');
    if (el) el.innerText = PROMPT_LIBRARY.length;
}

// ── Translation API (MyMemory) ────────────────────────────────
async function translateText(text, sourceLang, targetLang) {
    if (!text || !text.trim()) return '';
    
    // Detect if translation is needed (simple check for Tamil/Kannada/Hindi characters)
    const sourceRegex = sourceLang === 'ta' ? /[\u0B80-\u0BFF]/ : 
                        sourceLang === 'kn' ? /[\u0C80-\u0CFF]/ :
                        sourceLang === 'hi' ? /[\u0900-\u097F]/ : null;
    
    if (sourceRegex && !sourceRegex.test(text)) return text;
    
    try {
        const langpair = `${sourceLang}|${targetLang}`;
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langpair}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data?.responseData?.translatedText) {
            const translated = data.responseData.translatedText;
            // Check if translation is different from original
            if (translated && translated !== text) {
                return translated;
            }
        }
        return text;
    } catch (err) {
        console.warn(`Translation error (${sourceLang}→${targetLang}):`, err);
        return text;
    }
}

// ── Tamil Translation (backward compatibility) ────────────────
async function translateTamilToEnglish(text) {
    return translateText(text, 'ta', 'en');
}

// ── State ────────────────────────────────────────────────────
let currentEnglishSearchTerm = '';

const tamilInput = document.getElementById('tamilSearchInput');
const englishPreviewDiv = document.getElementById('translationPreview');
const englishPreviewSpan = document.getElementById('englishPreviewText');
const normalSearchInput = document.getElementById('searchInput');

// ── Filter ───────────────────────────────────────────────────
function filterPrompts() {
    const keyword = currentEnglishSearchTerm.toLowerCase().trim();
    const productVal = document.getElementById('productFilter')?.value || 'all';
    const industryVal = document.getElementById('industryFilter')?.value || 'all';
    const styleVal = document.getElementById('styleFilter')?.value || 'all';
    const formatVal = document.getElementById('formatFilter')?.value || 'all';

    let results = [...PROMPT_LIBRARY];

    if (productVal !== 'all') results = results.filter(p => p.productLine === productVal);
    if (industryVal !== 'all') results = results.filter(p => p.industry === industryVal);
    if (styleVal !== 'all') results = results.filter(p => p.visualStyle === styleVal);
    if (formatVal !== 'all') results = results.filter(p => p.formatType === formatVal);

    if (keyword) {
        results = results.filter(p => {
            const haystack = [
                p.title, p.fullPrompt, p.imagePrompts, p.videoPrompts,
                p.brand, p.category, ...(p.tags || [])
            ].join(' ').toLowerCase();
            return haystack.includes(keyword);
        });
    }
    return results;
}

// ── HTML escape ──────────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// ── Render ───────────────────────────────────────────────────
function parseStructured(text) {
    if (!text) return {};
    const lines = text.split('\n');
    function extract(keys) {
        for (const line of lines) {
            const l = line.toLowerCase();
            for (const k of keys) {
                if (l.includes(k + ':') || l.startsWith(k + ' ')) {
                    const val = line.split(':').slice(1).join(':').trim() || line.replace(new RegExp(k, 'i'), '').trim();
                    if (val.length > 2 && val.length < 200) return val;
                }
            }
        }
        const matches = keys.flatMap(k => {
            const re = new RegExp(k + '[\\s:]+([^.,\\n]{3,80})', 'i');
            const m = text.match(re);
            return m ? [m[1].trim()] : [];
        });
        return matches[0] || '';
    }
    return {
        subject: extract(['subject', 'product', 'object', 'hero', 'item', 'shoe', 'ball', 'shuttle']),
        lighting: extract(['lighting', 'light', 'illuminat', 'rim light', 'neon', 'ambient']),
        camera: extract(['camera', 'lens', 'shot', 'angle', 'view', 'perspective', 'close-up', 'macro', 'wide']),
        style: extract(['style', 'aesthetic', 'visual', 'cinematic', 'holographic', 'technical', 'ugc', 'mood'])
    };
}

function highlightKeyword(text, keyword) {
    if (!keyword || !text) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const kw = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped.replace(new RegExp('(' + kw + ')', 'gi'), '<mark class="highlight">$1</mark>');
}

let activePanelId = null;

function buildStructRows(s) {
    return [
        s.subject ? '<div class="struct-row"><span class="struct-label"><i class="fas fa-cube"></i> Subject</span><span class="struct-value">' + escapeHtml(s.subject) + '</span></div>' : '',
        s.lighting ? '<div class="struct-row"><span class="struct-label"><i class="fas fa-lightbulb"></i> Lighting</span><span class="struct-value">' + escapeHtml(s.lighting) + '</span></div>' : '',
        s.camera ? '<div class="struct-row"><span class="struct-label"><i class="fas fa-camera"></i> Camera</span><span class="struct-value">' + escapeHtml(s.camera) + '</span></div>' : '',
        s.style ? '<div class="struct-row"><span class="struct-label"><i class="fas fa-palette"></i> Style</span><span class="struct-value">' + escapeHtml(s.style) + '</span></div>' : ''
    ].filter(Boolean).join('');
}

function openSidePanel(p) {
    activePanelId = p.id;
    const panel = document.getElementById('sidePanel');
    const mainArea = document.getElementById('appMainArea');
    const brandLabel = p.productLine === 'kipsta' ? '⚽ KIPSTA' : p.productLine === 'perfly' ? '🏸 PERFLY' : '🏷️ ' + escapeHtml(p.brand || 'Other');
    const brandClass = p.productLine === 'kipsta' ? 'green' : p.productLine === 'perfly' ? 'amber' : 'neutral';
    
    const titleEl = document.getElementById('sidePanelTitle');
    const metaEl = document.getElementById('sidePanelMeta');
    const bodyEl = document.getElementById('sidePanelBody');
    const structContainer = document.getElementById('sidePanelStruct');
    
    if (titleEl) titleEl.textContent = p.title;
    if (metaEl) {
        metaEl.innerHTML =
            '<span class="pill ' + brandClass + '">' + brandLabel + '</span>' +
            '<span class="pill">🎨 ' + escapeHtml(p.visualStyle) + '</span>' +
            '<span class="pill">📼 ' + escapeHtml(p.formatType) + '</span>' +
            '<span class="pill neutral">🗂 ' + escapeHtml(p.industry) + '</span>';
    }
    if (bodyEl) bodyEl.innerHTML = highlightKeyword(p.fullPrompt, currentEnglishSearchTerm);
    
    const s = parseStructured(p.fullPrompt);
    const structHtml = buildStructRows(s);
    if (structContainer) {
        const rowsContainer = structContainer.querySelector('.struct-rows');
        if (rowsContainer) {
            rowsContainer.innerHTML = structHtml || '<span style="color:var(--text-muted);font-size:0.72rem">No structured fields detected</span>';
        }
        structContainer.style.display = '';
    }
    
    const copyBtn = document.getElementById('sidePanelCopyBtn');
    if (copyBtn) {
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(p.fullPrompt).then(() => showToast('📋 Prompt copied!', false));
        };
    }
    
    if (panel) panel.classList.add('visible');
    if (mainArea) mainArea.classList.add('panel-open');
    
    document.querySelectorAll('.preview-btn').forEach(b => {
        b.classList.toggle('active', String(b.dataset.id) === String(p.id));
        b.setAttribute('aria-pressed', String(b.dataset.id) === String(p.id));
    });
}

function closeSidePanel() {
    activePanelId = null;
    const panel = document.getElementById('sidePanel');
    const mainArea = document.getElementById('appMainArea');
    if (panel) panel.classList.remove('visible');
    if (mainArea) mainArea.classList.remove('panel-open');
    document.querySelectorAll('.preview-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
    });
}

function updateUI() {
    const filtered = filterPrompts();
    const container = document.getElementById('promptResultsContainer');
    const resultSpan = document.getElementById('resultCountSpan');
    if (resultSpan) resultSpan.innerText = '(' + filtered.length + ')';

    if (!container) return;

    if (filtered.length === 0) {
        container.innerHTML = '<div class="no-results"><i class="fas fa-search"></i> No prompts match.<br>✨ Try typing in Tamil or English.</div>';
        closeSidePanel();
        return;
    }

    container.innerHTML = filtered.map(p => {
        const brandLabel = p.productLine === 'kipsta' ? '⚽ KIPSTA' : p.productLine === 'perfly' ? '🏸 PERFLY' : '🏷️ ' + escapeHtml(p.brand || 'Other');
        const brandClass = p.productLine === 'kipsta' ? 'green' : p.productLine === 'perfly' ? 'amber' : 'neutral';
        const tagChips = (p.tags || []).filter(t => t && t.length > 1).slice(0, 4)
            .map(t => '<span class="pill">#' + escapeHtml(t) + '</span>').join('');
        const isActive = String(p.id) === String(activePanelId);
        const eid = escapeHtml(String(p.id));

        return '<div class="prompt-card" data-id="' + eid + '" data-brand="' + escapeHtml(p.productLine) + '">' +
            '<div class="card-header"><div>' +
            '<h4><i class="fas fa-cube" aria-hidden="true"></i> ' + escapeHtml(p.title) + '</h4>' +
            '<div class="product-badge">' +
            '<span class="pill ' + brandClass + '">' + brandLabel + '</span>' +
            '<span class="pill">🎨 ' + escapeHtml(p.visualStyle) + '</span>' +
            '<span class="pill">📼 ' + escapeHtml(p.formatType) + '</span>' +
            tagChips +
            '</div></div>' +
            '<div class="card-actions" role="group" aria-label="Prompt actions">' +
            '<button class="copy-btn" data-id="' + eid + '" aria-label="Copy prompt: ' + escapeHtml(p.title) + '"><i class="far fa-copy" aria-hidden="true"></i> COPY</button>' +
            '<button class="preview-btn' + (isActive ? ' active' : '') + '" data-id="' + eid + '" aria-label="Preview in side panel" aria-pressed="' + isActive + '"><i class="fas fa-columns" aria-hidden="true"></i> PANEL</button>' +
            '<button class="delete-btn" data-id="' + eid + '" aria-label="Delete prompt: ' + escapeHtml(p.title) + '"><i class="fas fa-trash-alt" aria-hidden="true"></i></button>' +
            '</div></div>' +
            '<div class="prompt-body-wrap">' +
            '<div class="prompt-body" id="body-' + eid + '">' + highlightKeyword(p.fullPrompt, currentEnglishSearchTerm) + '</div>' +
            '<div class="prompt-fade" aria-hidden="true"></div>' +
            '</div>' +
            '<div class="prompt-structured" id="struct-' + eid + '"></div>' +
            '<div class="card-expand-row">' +
            '<button class="view-more-btn" data-id="' + eid + '" aria-expanded="false" aria-controls="body-' + eid + '"><i class="fas fa-chevron-down" aria-hidden="true"></i> VIEW MORE</button>' +
            '<button class="struct-toggle-btn" data-id="' + eid + '" aria-expanded="false" aria-controls="struct-' + eid + '"><i class="fas fa-layer-group" aria-hidden="true"></i> BREAKDOWN</button>' +
            '</div>' +
            '</div>';
    }).join('');

    // Attach event listeners for dynamic buttons
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const p = PROMPT_LIBRARY.find(x => String(x.id) === String(btn.dataset.id));
            if (!p) return;
            navigator.clipboard.writeText(p.fullPrompt).then(() => {
                btn.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> COPIED!';
                setTimeout(() => { btn.innerHTML = '<i class="far fa-copy" aria-hidden="true"></i> COPY'; }, 1500);
            });
        });
    });

    document.querySelectorAll('.preview-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const p = PROMPT_LIBRARY.find(x => String(x.id) === String(btn.dataset.id));
            if (!p) return;
            if (String(activePanelId) === String(p.id)) { closeSidePanel(); } else { openSidePanel(p); }
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            if (!confirm('Delete this prompt?')) return;
            try { await fetch('/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); } catch (_) { }
            PROMPT_LIBRARY = PROMPT_LIBRARY.filter(p => String(p.id) !== String(id));
            if (String(activePanelId) === String(id)) closeSidePanel();
            updateUIBadgeCount();
            updateUI();
            showToast('🗑️ Prompt deleted', false);
        });
    });

    document.querySelectorAll('.view-more-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const body = document.getElementById('body-' + btn.dataset.id);
            if (!body) return;
            const expanded = body.classList.toggle('expanded');
            btn.setAttribute('aria-expanded', String(expanded));
            btn.classList.toggle('expanded', expanded);
            btn.innerHTML = expanded
                ? '<i class="fas fa-chevron-up" aria-hidden="true"></i> VIEW LESS'
                : '<i class="fas fa-chevron-down" aria-hidden="true"></i> VIEW MORE';
        });
    });

    document.querySelectorAll('.struct-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const structEl = document.getElementById('struct-' + btn.dataset.id);
            if (!structEl) return;
            const visible = !structEl.classList.contains('visible');
            if (visible) {
                const p = PROMPT_LIBRARY.find(x => String(x.id) === String(btn.dataset.id));
                structEl.innerHTML = (p ? buildStructRows(parseStructured(p.fullPrompt)) : '') ||
                    '<div style="padding:4px 0;color:var(--text-muted);font-size:0.72rem">No structured fields detected</div>';
            }
            structEl.classList.toggle('visible', visible);
            btn.classList.toggle('active', visible);
            btn.setAttribute('aria-expanded', String(visible));
        });
    });
}

// ── Tamil input handler ──────────────────────────────────────
async function onTamilInput(e) {
    const val = e.target.value;
    if (!val.trim()) {
        currentEnglishSearchTerm = normalSearchInput ? normalSearchInput.value : '';
        if (englishPreviewDiv) englishPreviewDiv.style.display = 'none';
        updateUI();
        return;
    }
    if (englishPreviewSpan) englishPreviewSpan.innerText = 'translating...';
    if (englishPreviewDiv) englishPreviewDiv.style.display = 'flex';
    
    const translated = await translateTamilToEnglish(val);
    if (englishPreviewSpan) englishPreviewSpan.innerText = translated;
    
    if (translated && translated !== val) {
        currentEnglishSearchTerm = translated;
        if (normalSearchInput) normalSearchInput.value = translated;
        showToast(`🔍 Tamil → English: "${translated.slice(0, 50)}${translated.length > 50 ? '…' : ''}"`, false);
    } else {
        currentEnglishSearchTerm = val;
        if (normalSearchInput) normalSearchInput.value = val;
    }
    updateUI();
}

function onNormalSearchChange() {
    currentEnglishSearchTerm = normalSearchInput ? normalSearchInput.value : '';
    if (tamilInput && tamilInput.value.trim()) {
        tamilInput.value = '';
        if (englishPreviewDiv) englishPreviewDiv.style.display = 'none';
    }
    updateUI();
}

function resetAllFilters() {
    const tamilInputEl = document.getElementById('tamilSearchInput');
    if (tamilInputEl) tamilInputEl.value = '';
    const preview = document.getElementById('translationPreview');
    if (preview) preview.style.display = 'none';
    if (normalSearchInput) normalSearchInput.value = '';
    currentEnglishSearchTerm = '';
    
    const productFilter = document.getElementById('productFilter');
    const industryFilter = document.getElementById('industryFilter');
    const styleFilter = document.getElementById('styleFilter');
    const formatFilter = document.getElementById('formatFilter');
    
    if (productFilter) productFilter.value = 'all';
    if (industryFilter) industryFilter.value = 'all';
    if (styleFilter) styleFilter.value = 'all';
    if (formatFilter) formatFilter.value = 'all';
    
    updateUI();
    showToast('✨ All filters cleared', false);
}

async function translateAllTamilPrompts() {
    showToast('🔄 Translating library Tamil → English...', false);
    const tamilRegex = /[\u0B80-\u0BFF]/;
    let changed = false;
    for (const p of PROMPT_LIBRARY) {
        if (p.fullPrompt && tamilRegex.test(p.fullPrompt)) {
            p.fullPrompt = await translateTamilToEnglish(p.fullPrompt);
            changed = true;
        }
        if (p.title && tamilRegex.test(p.title)) {
            p.title = await translateTamilToEnglish(p.title);
            changed = true;
        }
    }
    if (changed) updateUI();
    showToast(changed ? '✅ Tamil prompts converted to English' : 'ℹ️ No Tamil found in library', false);
}

// ── Toast ────────────────────────────────────────────────────
function showToast(msg, isErr) {
    let toast = document.querySelector('.toast-message');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast-message';
        document.body.appendChild(toast);
    }
    toast.innerHTML = `<i class="fas ${isErr ? 'fa-exclamation-triangle' : 'fa-check-circle'}"></i> ${msg}`;
    toast.style.display = 'block';
    toast.style.opacity = '1';
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => { toast.style.display = 'none'; toast.style.opacity = '1'; }, 400);
    }, 2500);
}

// ── Smart format for new prompts ─────────────────────────────
function smartFormatPrompt(raw, overrideProduct, overrideStyle) {
    const lower = raw.toLowerCase();
    let productLine = 'other', brand = 'Other', industry = 'Other';

    if (overrideProduct === 'kipsta' || lower.includes('kipsta') || lower.includes('football')) {
        productLine = 'kipsta'; brand = 'KIPSTA'; industry = 'Football';
    } else if (overrideProduct === 'perfly' || lower.includes('perfly') || lower.includes('badminton')) {
        productLine = 'perfly'; brand = 'PERFLY'; industry = 'Badminton';
    } else if (overrideProduct !== 'auto') {
        productLine = overrideProduct;
    }

    let visualStyle = overrideStyle !== 'auto' ? overrideStyle
        : lower.includes('holographic') ? 'Holographic'
            : lower.includes('technical') ? 'Technical'
                : lower.includes('macro') ? 'Macro'
                    : lower.includes('ugc') ? 'UGC'
                        : 'Cinematic';

    const formatType = lower.includes('video') || lower.includes('animation') || lower.includes('seedance') ? 'Animation' : 'Image';
    const title = raw.split('\n')[0].slice(0, 60) || `Custom Prompt`;

    return {
        id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        title, brand, productLine, industry, visualStyle, formatType,
        category: visualStyle,
        tags: ['custom', productLine],
        fullPrompt: raw,
        imagePrompts: '',
        videoPrompts: '',
        favorite: false
    };
}

// ── Modal ────────────────────────────────────────────────────
const modal = document.getElementById('addPromptModal');
const openBtn = document.getElementById('openAddPromptBtn');
const closeBtn = document.getElementById('closeModalBtn');
const confirmBtn = document.getElementById('confirmAddPromptBtn');

if (openBtn) {
    openBtn.onclick = () => { if (modal) modal.classList.add('active'); };
}
if (closeBtn) {
    closeBtn.onclick = () => { if (modal) modal.classList.remove('active'); };
}
if (modal) {
    modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('active'); };
}

if (confirmBtn) {
    confirmBtn.onclick = async () => {
        const raw = document.getElementById('rawPromptText')?.value.trim();
        if (!raw) { alert('Please enter some prompt text.'); return; }
        const overrideProd = document.getElementById('overrideProduct')?.value || 'auto';
        const overrideStyle = document.getElementById('overrideStyle')?.value || 'auto';
        const newP = smartFormatPrompt(raw, overrideProd, overrideStyle);

        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';

        let savedToFlask = false;
        try {
            const res = await fetch('/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: newP.title,
                    category: newP.category,
                    brand: newP.brand,
                    product_type: newP.industry.toLowerCase(),
                    content: newP.fullPrompt
                })
            });
            const result = await res.json();
            if (result.success) {
                savedToFlask = true;
                const freshRes = await fetch('/get');
                const freshData = await freshRes.json();
                if (Array.isArray(freshData)) {
                    PROMPT_LIBRARY = freshData.map(transformItem);
                }
            }
        } catch (err) {
            console.warn('Flask not reachable — prompt saved in memory only:', err);
            PROMPT_LIBRARY.unshift(newP);
            showToast('⚠️ Flask not running — prompt added in memory only (not saved to file)', true);
        }

        if (savedToFlask) {
            showToast('✅ Prompt saved to prompts.json!', false);
        }

        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="fas fa-check-double"></i> CONVERT & ADD';

        updateUIBadgeCount();
        updateUI();
        if (modal) modal.classList.remove('active');
        const rawTextarea = document.getElementById('rawPromptText');
        if (rawTextarea) rawTextarea.value = '';
    };
}

// ── Bind events ──────────────────────────────────────────────
let tamDebounce = null;

function bindEvents() {
    if (tamilInput) tamilInput.addEventListener('input', onTamilInput);
    if (normalSearchInput) normalSearchInput.addEventListener('input', onNormalSearchChange);
    
    const productFilter = document.getElementById('productFilter');
    const industryFilter = document.getElementById('industryFilter');
    const styleFilter = document.getElementById('styleFilter');
    const formatFilter = document.getElementById('formatFilter');
    const clearBtn = document.getElementById('clearAllBtn');
    const gTransBtn = document.getElementById('globalTranslateBtn');
    
    if (productFilter) productFilter.addEventListener('change', updateUI);
    if (industryFilter) industryFilter.addEventListener('change', updateUI);
    if (styleFilter) styleFilter.addEventListener('change', updateUI);
    if (formatFilter) formatFilter.addEventListener('change', updateUI);
    if (clearBtn) clearBtn.addEventListener('click', resetAllFilters);
    if (gTransBtn) gTransBtn.addEventListener('click', translateAllTamilPrompts);

    // Theme toggle
    const themeToggle = document.getElementById('themeToggleBtn');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', next === 'dark' ? '' : next);
            if (next === 'light') {
                document.documentElement.setAttribute('data-theme', 'light');
            } else {
                document.documentElement.removeAttribute('data-theme');
            }
            themeToggle.innerHTML = next === 'light'
                ? '<i class="fas fa-moon" aria-hidden="true"></i> Dark'
                : '<i class="fas fa-sun" aria-hidden="true"></i> Light';
            localStorage.setItem('pl_theme', next);
        });
    }

    // Side panel close button
    const closePanelBtn = document.getElementById('closePanelBtn');
    if (closePanelBtn) closePanelBtn.addEventListener('click', closeSidePanel);

    // Restore theme on load
    const savedTheme = localStorage.getItem('pl_theme');
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        if (themeToggle) themeToggle.innerHTML = '<i class="fas fa-moon" aria-hidden="true"></i> Dark';
    }
}

// ── Translator Functions (Fixed) ─────────────────────────────

// Toggle open/close a translator card
function toggleTranslator(lang) {
    const key = lang.charAt(0).toUpperCase() + lang.slice(1);
    const card = document.getElementById('card' + key);
    const btn = document.getElementById('toggle' + key);
    const chev = document.getElementById('chev' + key);

    if (!card) return;

    const isOpen = card.classList.contains('open');

    if (isOpen) {
        card.classList.remove('open');
        if (btn) btn.classList.remove('active');
        if (chev) chev.classList.remove('open');
    } else {
        card.classList.add('open');
        if (btn) btn.classList.add('active');
        if (chev) chev.classList.add('open');
        setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
    }
}

// Translate via MyMemory API
async function doTranslate(inputId, outputId, langpair) {
    const inputEl = document.getElementById(inputId);
    const outputEl = document.getElementById(outputId);
    
    if (!inputEl || !outputEl) return;
    
    const prefix = inputId.startsWith('kan') ? 'kan' : inputId.startsWith('tam') ? 'tam' : 'hin';
    const statusEl = document.getElementById(prefix + 'Status');
    const btn = outputEl.closest('.translator-card-body')?.querySelector('.translate-action-btn');

    const text = inputEl.value.trim();
    if (!text) {
        if (statusEl) setStatus(statusEl, '⚠️ Please enter some text first.', 'err');
        return;
    }

    if (btn) btn.disabled = true;
    if (outputEl) outputEl.value = '';
    if (statusEl) setStatus(statusEl, '⏳ Translating…', '');

    try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langpair}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data?.responseData?.translatedText) {
            const translated = data.responseData.translatedText;
            outputEl.value = translated;
            if (statusEl) setStatus(statusEl, '✅ Translation complete!', 'ok');
            
            // Auto-search when Tamil card translates
            if (inputId === 'tamInput') {
                currentEnglishSearchTerm = translated;
                if (normalSearchInput) normalSearchInput.value = translated;
                updateUI();
            }
        } else {
            if (statusEl) setStatus(statusEl, '❌ Translation failed. Try again.', 'err');
        }
    } catch (e) {
        if (statusEl) setStatus(statusEl, '❌ Network error: ' + e.message, 'err');
    } finally {
        if (btn) btn.disabled = false;
    }
}

function setStatus(el, msg, cls) {
    if (!el) return;
    el.textContent = msg;
    el.className = 'translator-status ' + cls;
}

// Use translated text for search
function useTranslationForSearch(outputId) {
    const outputEl = document.getElementById(outputId);
    if (!outputEl) return;
    
    const text = outputEl.value.trim();
    if (!text) {
        showToast('⚠️ No translation yet — translate first.', true);
        return;
    }

    if (normalSearchInput) normalSearchInput.value = text;

    const tamilInputEl = document.getElementById('tamilSearchInput');
    if (tamilInputEl) tamilInputEl.value = '';
    const preview = document.getElementById('translationPreview');
    if (preview) preview.style.display = 'none';

    currentEnglishSearchTerm = text;
    updateUI();
    showToast(`🔍 Searching: "${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"`, false);

    setTimeout(() => {
        const resultsContainer = document.getElementById('promptResultsContainer');
        if (resultsContainer) resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

// Copy translated text to clipboard
function copyTranslation(outputId) {
    const outputEl = document.getElementById(outputId);
    if (!outputEl) return;
    
    const text = outputEl.value.trim();
    if (!text) {
        showToast('⚠️ Nothing to copy yet.', true);
        return;
    }
    navigator.clipboard.writeText(text).then(() => showToast('📋 Copied to clipboard!', false));
}

// Inline mic for translator cards
function startInlineMic(targetInputId, lang) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btn = document.querySelector(`[onclick="startInlineMic('${targetInputId}','${lang}')"]`);

    if (!SpeechRecognition) {
        showToast('⚠️ Voice not supported. Use Chrome or Edge.', true);
        return;
    }

    if (btn && btn.classList.contains('recording')) {
        if (btn._recognition) {
            try { btn._recognition.stop(); } catch (_) { }
        }
        return;
    }

    const r = new SpeechRecognition();
    r.lang = lang;
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 1;
    
    if (btn) btn._recognition = r;

    r.onstart = () => {
        if (btn) {
            btn.classList.add('recording');
            btn.innerHTML = '<i class="fas fa-stop"></i> Stop';
        }
    };
    
    r.onresult = (e) => {
        let final = '', interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            const t = e.results[i][0].transcript;
            if (e.results[i].isFinal) final += t;
            else interim += t;
        }
        const inputEl = document.getElementById(targetInputId);
        if (inputEl) {
            inputEl.value = final || interim;
            inputEl.dispatchEvent(new Event('input'));
        }
    };
    
    r.onerror = (e) => {
        showToast('Mic error: ' + e.error, true);
    };
    
    r.onend = () => {
        if (btn) {
            btn.classList.remove('recording');
            const isKan = targetInputId.startsWith('kan');
            const isTam = targetInputId.startsWith('tam');
            btn.innerHTML = `<i class="fas fa-microphone"></i> Speak ${isKan ? 'Kannada' : isTam ? 'Tamil' : 'Hindi'}`;
            btn._recognition = null;
        }
    };

    try {
        r.start();
    } catch (e) {
        showToast('Could not start mic: ' + e.message, true);
    }
}

// ── Recommendations & Personalization ─────────────────────────
function getRecommendations() {
    if (!userHistory.length) return PROMPT_LIBRARY.slice(0, 6);

    const categoryCount = {};

    userHistory.forEach(item => {
        categoryCount[item.category] = (categoryCount[item.category] || 0) + 1;
    });

    return PROMPT_LIBRARY
        .sort((a, b) => (categoryCount[b.category] || 0) - (categoryCount[a.category] || 0))
        .slice(0, 6);
}

function renderRecommendations() {
    const container = document.getElementById("recommendationGrid");
    if (!container) return;
    
    const recs = getRecommendations();

    container.innerHTML = recs.map(p => `
        <div class="prompt-card">
            <h4>${escapeHtml(p.title)}</h4>
            <button onclick="copyPromptToClipboard('${escapeHtml(p.fullPrompt).replace(/'/g, "\\'")}')">Copy</button>
        </div>
    `).join("");
}

function copyPromptToClipboard(text) {
    navigator.clipboard.writeText(text);
    showToast("Copied!");
}

function personalizeHero() {
    const title = document.getElementById("heroTitle");
    if (!title) return;

    if (userHistory.length > 5) {
        title.innerText = "Welcome Back — Continue Creating";
    } else {
        title.innerText = "AI Prompt Intelligence";
    }
}

function improvePrompt(text) {
    return text + " | Enhanced with cinematic lighting, ultra realism";
}

function generateVariations(text) {
    return [
        text + " (wide angle)",
        text + " (macro shot)",
        text + " (cinematic lighting)"
    ];
}

// ── Intersection Observer for animations ─────────────────────
const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
        if (e.isIntersecting) {
            e.target.classList.add("visible");
        }
    });
});

// ── Boot ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    fetchPromptsFromJSON().then(() => {
        bindEvents();
        updateUI();
        personalizeHero();
        renderRecommendations();
    });
    
    // Observe prompt cards after they're rendered
    setTimeout(() => {
        document.querySelectorAll(".prompt-card").forEach(el => observer.observe(el));
    }, 500);
});

// ============================================================
// VOICE / MICROPHONE — Web Speech API
// Supports Tamil (ta-IN) and English (en-IN / en-US)
// ============================================================

(function () {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const micBtn = document.getElementById('micBtn');
    const micIcon = document.getElementById('micIcon');
    const micLabel = document.getElementById('micLabel');
    const micStatus = document.getElementById('micStatus');
    const micStatusTxt = document.getElementById('micStatusText');
    const micStopBtn = document.getElementById('micStopBtn');

    if (!SpeechRecognition) {
        if (micBtn) {
            micBtn.title = 'Voice search not supported in this browser. Use Chrome or Edge.';
            micBtn.style.opacity = '0.4';
            micBtn.style.cursor = 'not-allowed';
            micBtn.onclick = () => showToast('⚠️ Voice not supported. Please use Chrome or Edge.', true);
        }
        return;
    }

    let recognition = null;
    let isRecording = false;

    function buildRecognition() {
        const r = new SpeechRecognition();
        r.continuous = false;
        r.interimResults = true;
        r.maxAlternatives = 1;
        r.lang = 'ta-IN';
        return r;
    }

    function setRecordingUI(active) {
        isRecording = active;
        if (active) {
            if (micBtn) micBtn.classList.add('recording');
            if (micIcon) micIcon.className = 'fas fa-stop';
            if (micLabel) micLabel.textContent = 'STOP';
            if (micStatus) micStatus.style.display = 'flex';
            if (micStatusTxt) micStatusTxt.textContent = 'Listening… speak now';
        } else {
            if (micBtn) micBtn.classList.remove('recording');
            if (micIcon) micIcon.className = 'fas fa-microphone';
            if (micLabel) micLabel.textContent = 'SPEAK';
            if (micStatus) micStatus.style.display = 'none';
        }
    }

    function startRecording() {
        recognition = buildRecognition();

        recognition.onstart = () => {
            setRecordingUI(true);
        };

        recognition.onresult = (event) => {
            let interimText = '';
            let finalText = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const t = event.results[i][0].transcript;
                if (event.results[i].isFinal) finalText += t;
                else interimText += t;
            }

            const spoken = (finalText || interimText).trim();
            if (spoken && tamilInput) {
                if (micStatusTxt) micStatusTxt.textContent = `Heard: "${spoken}"`;
                tamilInput.value = spoken;
                tamilInput.dispatchEvent(new Event('input'));
            }
        };

        recognition.onerror = (e) => {
            console.warn('Speech error:', e.error);
            let msg = 'Mic error. Try again.';
            if (e.error === 'not-allowed') msg = '🚫 Mic access denied. Allow microphone in browser settings.';
            if (e.error === 'no-speech') msg = '🔇 No speech detected. Try again.';
            if (e.error === 'network') msg = '🌐 Network error during voice recognition.';
            showToast(msg, true);
            stopRecording();
        };

        recognition.onend = () => {
            stopRecording();
        };

        try {
            recognition.start();
        } catch (e) {
            showToast('⚠️ Could not start mic: ' + e.message, true);
            setRecordingUI(false);
        }
    }

    function stopRecording() {
        if (recognition) {
            try { recognition.stop(); } catch (_) { }
            recognition = null;
        }
        setRecordingUI(false);
    }

    if (micBtn) {
        micBtn.addEventListener('click', () => {
            if (isRecording) stopRecording();
            else startRecording();
        });
    }

    if (micStopBtn) {
        micStopBtn.addEventListener('click', () => stopRecording());
    }
})();




// ============================================================
// STANDALONE MICROPHONE BUTTON WITH ANIMATION
// ============================================================

(function() {
    // Get DOM elements
    const micButton = document.getElementById('MicBtn');
    if (!micButton) return;

    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        micButton.disabled = true;
        micButton.title = 'Voice not supported in this browser';
        micButton.style.opacity = '0.5';
        micButton.style.cursor = 'not-allowed';
        console.warn('Speech recognition not supported');
        return;
    }

    let recognition = null;
    let isRecording = false;
    let animationInterval = null;

    // Create animation overlay if it doesn't exist
    let animationOverlay = null;
    
    function createAnimationOverlay() {
        if (animationOverlay) return animationOverlay;
        
        const overlay = document.createElement('div');
        overlay.className = 'mic-animation-overlay';
        overlay.innerHTML = `
            <div class="mic-wave-container">
                <div class="mic-wave"></div>
                <div class="mic-wave"></div>
                <div class="mic-wave"></div>
                <div class="mic-wave"></div>
                <div class="mic-wave"></div>
            </div>
            <div class="mic-recording-text">Listening...</div>
        `;
        overlay.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, rgba(0,0,0,0.9), rgba(30,30,40,0.95));
            backdrop-filter: blur(12px);
            border-radius: 60px;
            padding: 12px 24px;
            display: none;
            align-items: center;
            gap: 15px;
            z-index: 10000;
            border: 1px solid rgba(255,255,255,0.2);
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            animation: slideUpMic 0.3s ease;
        `;
        document.body.appendChild(overlay);
        animationOverlay = overlay;
        return overlay;
    }

    // Add CSS animations to document
    function addAnimationStyles() {
        if (document.getElementById('mic-animation-styles')) return;
        
        const styles = document.createElement('style');
        styles.id = 'mic-animation-styles';
        styles.textContent = `
            @keyframes slideUpMic {
                from {
                    opacity: 0;
                    transform: translateX(-50%) translateY(20px);
                }
                to {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
            }
            
            @keyframes waveAnimation {
                0%, 100% {
                    height: 12px;
                    opacity: 0.3;
                }
                50% {
                    height: 40px;
                    opacity: 1;
                }
            }
            
            .mic-wave-container {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                height: 50px;
            }
            
            .mic-wave {
                width: 4px;
                background: linear-gradient(180deg, #f9f2f2ff, #e7e1deff);
                border-radius: 2px;
                animation: waveAnimation 0.8s ease-in-out infinite;
            }
            
            .mic-wave:nth-child(1) { animation-delay: 0s; height: 20px; }
            .mic-wave:nth-child(2) { animation-delay: 0.1s; height: 30px; }
            .mic-wave:nth-child(3) { animation-delay: 0.2s; height: 40px; }
            .mic-wave:nth-child(4) { animation-delay: 0.3s; height: 30px; }
            .mic-wave:nth-child(5) { animation-delay: 0.4s; height: 20px; }
            
            .mic-recording-text {
                color: #f1eeeeff;
                font-size: 14px;
                font-weight: 600;
                letter-spacing: 1px;
                font-family: monospace;
            }
            
            .mic-btn.recording {
                background: #f3efefff !important;
                animation: pulseMic 1s infinite;
            }
            
            @keyframes pulseMic {
                0%, 100% {
                    box-shadow: 0 0 0 0 rgba(245, 241, 241, 0.4);
                }
                50% {
                    box-shadow: 0 0 0 8px rgba(255,68,68,0);
                }
            }
        `;
        document.head.appendChild(styles);
    }

    // Show animation overlay
    function showAnimation() {
        const overlay = createAnimationOverlay();
        if (overlay) {
            overlay.style.display = 'flex';
        }
        
        // Add recording class to button
        if (micButton) {
            micButton.classList.add('recording');
            const icon = micButton.querySelector('i');
            if (icon) icon.className = 'fas fa-stop';
        }
    }

    // Hide animation overlay
    function hideAnimation() {
        if (animationOverlay) {
            animationOverlay.style.display = 'none';
        }
        
        if (micButton) {
            micButton.classList.remove('recording');
            const icon = micButton.querySelector('i');
            if (icon) icon.className = 'fas fa-microphone';
        }
    }

    // Show toast message
    function showMicToast(message, isError = false) {
        let toast = document.querySelector('.mic-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'mic-toast';
            toast.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: ${isError ? '#f7f1f1ff' : '#10b981'};
                color: black;
                padding: 10px 20px;
                border-radius: 1px;
                font-size: 14px;
                z-index: 10001;
                animation: slideUpMic 0.3s ease;
                font-family: system-ui, -apple-system, sans-serif;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            `;
            document.body.appendChild(toast);
        }
        
        toast.textContent = message;
        toast.style.display = 'block';
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                toast.style.display = 'none';
                toast.style.opacity = '1';
            }, 300);
        }, 2500);
    }

    // Start recording
    function startRecording() {
        if (recognition) {
            try { recognition.stop(); } catch(e) {}
        }
        
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.lang = 'ta-IN'; // Tamil
        
        recognition.onstart = () => {
            console.log('🎤 Recording started');
            isRecording = true;
            showAnimation();
            showMicToast('🎙️ Listening... speak now');
        };
        
        recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }
            
            const spokenText = finalTranscript || interimTranscript;
            
            if (spokenText && spokenText.trim()) {
                console.log('🎤 Heard:', spokenText);
                showMicToast(`📝 "${spokenText.slice(0, 50)}${spokenText.length > 50 ? '...' : ''}"`);
                
                // Find the search input and set value
                const searchInput = document.getElementById('searchInput');
                if (searchInput) {
                    searchInput.value = spokenText;
                    // Trigger search event
                    searchInput.dispatchEvent(new Event('input'));
                }
                
                // Also update any Tamil input if exists
                const tamilInput = document.getElementById('tamilSearchInput');
                if (tamilInput) {
                    tamilInput.value = spokenText;
                    tamilInput.dispatchEvent(new Event('input'));
                }
            }
            
            stopRecording();
        };
        
        recognition.onerror = (event) => {
            console.error('🎤 Error:', event.error);
            let errorMsg = 'Voice error';
            switch(event.error) {
                case 'not-allowed':
                    errorMsg = ' Please allow mic permissions.';
                    break;
                case 'no-speech':
                    errorMsg = 'No speech detected. Try again.';
                    break;
                case 'network':
                    errorMsg = 'Network error. Check connection.';
                    break;
                default:
                    errorMsg = `Error: ${event.error}`;
            }
            showMicToast(errorMsg, true);
            stopRecording();
        };
        
        recognition.onend = () => {
            console.log(' Recording ended');
            stopRecording();
        };
        
        try {
            recognition.start();
        } catch (e) {
            console.error('Failed to start:', e);
            showMicToast(' Could not start microphone', true);
            stopRecording();
        }
    }
    
    // Stop recording
    function stopRecording() {
        if (recognition) {
            try { 
                recognition.stop();
                recognition = null;
            } catch(e) {}
        }
        
        if (isRecording) {
            isRecording = false;
            hideAnimation();
        }
    }
    
    // Toggle recording on button click
    function toggleMicrophone() {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    }
    
    // Initialize button click handler
    function initMicrophoneButton() {
        addAnimationStyles();
        createAnimationOverlay();
        
        micButton.addEventListener('click', toggleMicrophone);
        
        // Optional: Add keyboard shortcut (Ctrl/Cmd + M)
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
                e.preventDefault();
                toggleMicrophone();
            }
        });
        
        console.log(' Microphone button initialized');
    }
    
    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMicrophoneButton);
    } else {
        initMicrophoneButton();
    }
})();