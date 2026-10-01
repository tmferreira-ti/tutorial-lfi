(() => {
  'use strict';

  const root = document.documentElement;
  const themeToggle = document.querySelector('#theme-toggle');
  const themeIcon = themeToggle.querySelector('.theme-icon');

  function applyTheme(theme) {
    root.dataset.theme = theme;
    localStorage.setItem('lfi-theme', theme);
    const isDark = theme === 'dark';
    themeToggle.setAttribute('aria-pressed', String(isDark));
    themeToggle.setAttribute('aria-label', isDark ? 'Ativar tema claro' : 'Ativar tema escuro');
    themeIcon.textContent = isDark ? '☀' : '☾';
  }

  applyTheme(root.dataset.theme || 'dark');
  themeToggle.addEventListener('click', () => applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));

  const progress = document.querySelector('#reading-progress');
  function updateProgress() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = `${max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0}%`;
  }
  updateProgress();
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);

  const toc = document.querySelector('#toc');
  const tocToggle = document.querySelector('#toc-toggle');
  const tocClose = document.querySelector('#toc-close');
  const backdrop = document.querySelector('#toc-backdrop');

  function setToc(open) {
    toc.classList.toggle('open', open);
    tocToggle.setAttribute('aria-expanded', String(open));
    backdrop.hidden = !open;
    document.body.style.overflow = open ? 'hidden' : '';
  }
  tocToggle.addEventListener('click', () => setToc(true));
  tocClose.addEventListener('click', () => setToc(false));
  backdrop.addEventListener('click', () => setToc(false));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') setToc(false); });

  const tocLinks = [...document.querySelectorAll('.toc nav a')];
  const sections = [...document.querySelectorAll('[data-section]')];
  const linkById = new Map(tocLinks.map(link => [link.getAttribute('href').slice(1), link]));
  const observer = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    tocLinks.forEach(link => link.classList.remove('active'));
    linkById.get(visible.target.id)?.classList.add('active');
  }, { rootMargin: '-18% 0px -62% 0px', threshold: [0, .2, .5] });
  sections.forEach(section => observer.observe(section));
  tocLinks.forEach(link => link.addEventListener('click', () => setToc(false)));

  document.querySelectorAll('.copy-button').forEach(button => {
    button.addEventListener('click', async () => {
      const code = button.closest('.code-block').querySelector('code').textContent;
      const original = button.textContent;
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = 'Copiado';
      } catch {
        button.textContent = 'Selecione o código';
      }
      window.setTimeout(() => { button.textContent = original; }, 1800);
    });
  });

  const form = document.querySelector('#simulator-form');
  const payloadInput = document.querySelector('#payload');
  const resultStatus = document.querySelector('#result-status');
  const resultInput = document.querySelector('#result-input');
  const resultPath = document.querySelector('#result-path');
  const resultExplanation = document.querySelector('#result-explanation');
  const base = '/var/www/app/pages/';
  const allowed = new Set(['home.php', 'about.php', 'contact.php']);

  function safelyDecode(value) {
    try { return decodeURIComponent(value); } catch { return value; }
  }

  function normalizePath(value) {
    const parts = [];
    value.replace(/\\/g, '/').split('/').forEach(part => {
      if (!part || part === '.') return;
      if (part === '..') parts.pop();
      else parts.push(part);
    });
    return '/' + parts.join('/');
  }

  function simulate(payload, filter) {
    const decoded = safelyDecode(payload.trim());
    let processed = payload.trim();
    let unsafe = false;
    let status = 'PERMITIDA / SEGURA';
    let explanation = '';

    if (filter === 'none') {
      processed = base + decoded;
      unsafe = decoded.includes('..') || decoded.includes('://') || decoded.startsWith('/') || !allowed.has(decoded);
      status = unsafe ? 'BURLADA / VULNERÁVEL' : 'PERMITIDA / VULNERÁVEL';
      explanation = unsafe
        ? 'A entrada foi concatenada sem uma fronteira de confiança. O backend pode sair da pasta prevista ou interpretar um esquema especial.'
        : 'A página parece legítima, mas o mecanismo continua vulnerável porque nenhuma entrada futura é validada.';
    }

    if (filter === 'remove') {
      const filtered = payload.trim().replaceAll('../', '');
      const decodedAfterFilter = safelyDecode(filtered);
      processed = base + decodedAfterFilter;
      unsafe = decodedAfterFilter.includes('..') || decodedAfterFilter.includes('://') || decodedAfterFilter.startsWith('/');
      status = unsafe ? 'BURLADA / VULNERÁVEL' : 'BLOQUEADA NESTE TESTE';
      explanation = unsafe
        ? 'O filtro textual foi burlado por uma representação que continua perigosa após decodificação ou interpretação.'
        : 'Esta entrada específica foi alterada, mas remover padrões não constitui uma defesa completa: variantes de codificação e normalização podem escapar.';
    }

    if (filter === 'allowlist') {
      const rejected = !allowed.has(decoded);
      unsafe = false;
      status = rejected ? 'BLOQUEADA / SEGURA' : 'PERMITIDA / SEGURA';
      processed = rejected ? '[nenhum caminho resolvido]' : base + decoded;
      explanation = rejected
        ? 'A entrada não corresponde a um identificador permitido e foi rejeitada antes do acesso ao sistema de arquivos.'
        : 'A entrada corresponde exatamente a uma rota conhecida. O caminho vem da configuração confiável, não do usuário.';
    }

    if (filter === 'realpath') {
      const hasScheme = decoded.includes('://');
      const normalizedBase = normalizePath(base);
      const normalized = hasScheme ? decoded : normalizePath(base + decoded);
      const insideBase = !hasScheme && (normalized === normalizedBase || normalized.startsWith(normalizedBase + '/'));
      unsafe = false;
      status = insideBase ? 'PERMITIDA / SEGURA' : 'BLOQUEADA / SEGURA';
      processed = normalized;
      explanation = !insideBase
        ? 'Após a normalização, o destino ficou fora da pasta base (ou usou um esquema não permitido) e foi bloqueado.'
        : 'O caminho normalizado permanece dentro da pasta base confiável. Em produção, a verificação deve usar APIs reais do sistema e lidar com links simbólicos.';
    }

    return { processed, unsafe, status, explanation };
  }

  function runSimulation() {
    const payload = payloadInput.value || '';
    const filter = new FormData(form).get('filter');
    const result = simulate(payload, filter);
    resultInput.textContent = payload || '(vazio)';
    resultPath.textContent = result.processed || '(vazio)';
    resultStatus.textContent = result.status;
    resultStatus.className = result.unsafe ? 'is-danger' : 'is-safe';
    resultExplanation.textContent = result.explanation;
  }

  form.addEventListener('submit', event => { event.preventDefault(); runSimulation(); });
  form.querySelectorAll('input[name="filter"]').forEach(input => input.addEventListener('change', runSimulation));
  document.querySelectorAll('[data-sample]').forEach(button => {
    button.addEventListener('click', () => { payloadInput.value = button.dataset.sample; runSimulation(); });
  });
  runSimulation();
})();
