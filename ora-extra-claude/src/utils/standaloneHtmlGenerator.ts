import { RAW_FACTORY_TSV } from '../data/realSampleData';

export function buildStandaloneHtml(): string {
  const escapedTsv = RAW_FACTORY_TSV.replace(/\\/g, '\\\\').replace(/`/g, '\\`');

  return `<!DOCTYPE html>
<html lang="pt-BR" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0, user-scalable=no" />
  <meta name="theme-color" content="#0B0F19" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <title>HoraExtra — Diário de Bordo de Produção</title>
  <script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"><\/script>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0B0F19;
      --surface: #111827;
      --surface-elevated: #1E293B;
      --border: #1F2937;
      --border-strong: #334155;
      --text: #F8FAFC;
      --muted: #94A3B8;
      --green: #10B981;
      --green-bg: rgba(16, 185, 129, 0.14);
      --amber: #F59E0B;
      --amber-bg: rgba(245, 158, 11, 0.15);
      --red: #F43F5E;
      --red-bg: rgba(244, 63, 94, 0.15);
      --blue: #3B82F6;
      --blue-bg: rgba(59, 130, 246, 0.15);
    }
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body {
      margin: 0; padding: 0;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg); color: var(--text);
      overscroll-behavior-y: none;
    }
    button, input, select, textarea { font-family: inherit; touch-action: manipulation; color: inherit; }

    /* Header */
    .app-header {
      position: sticky; top: 0; z-index: 30;
      background: rgba(11, 15, 25, 0.94);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid var(--border);
      padding: max(10px, env(safe-area-inset-top)) 14px 10px 14px;
    }
    .header-inner {
      max-width: 960px; margin: 0 auto;
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;
    }
    .brand-title { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; white-space: nowrap; }
    .nav-tabs {
      display: flex; background: var(--surface); padding: 4px; border-radius: 12px; border: 1px solid var(--border);
    }
    .nav-btn {
      min-height: 44px; padding: 0 16px; border-radius: 9px; border: none;
      background: transparent; color: var(--muted); font-size: 14px; font-weight: 700; cursor: pointer;
    }
    .nav-btn.active { background: var(--blue); color: #fff; }
    .header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .ctrl-btn, .date-select {
      min-height: 48px; padding: 0 14px; border-radius: 12px;
      border: 1px solid var(--border-strong); background: var(--surface);
      font-size: 13px; font-weight: 700; color: var(--text);
      display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
      font-variant-numeric: tabular-nums;
    }
    .ctrl-btn.primary { background: #1E293B; border-color: #475569; }

    /* Container */
    .container {
      max-width: 960px; margin: 0 auto;
      padding: 16px 14px max(80px, env(safe-area-inset-bottom)) 14px;
    }

    /* Search & Filter */
    .toolbar { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
    .search-input {
      flex: 1; min-width: 200px; min-height: 48px; padding: 0 14px;
      border-radius: 12px; border: 1px solid var(--border-strong); background: var(--surface);
      font-size: 15px; outline: none;
    }
    .filter-strip { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 6px; margin-bottom: 14px; }
    .filter-btn {
      min-height: 44px; padding: 0 14px; border-radius: 10px;
      border: 1px solid var(--border); background: var(--surface);
      font-size: 13px; font-weight: 700; color: var(--muted); white-space: nowrap; cursor: pointer;
    }
    .filter-btn.active { background: var(--text); color: var(--bg); border-color: var(--text); }

    /* Piece Cards */
    .cards-list { display: flex; flex-direction: column; gap: 10px; }
    .piece-card {
      background: var(--surface); border-radius: 16px; border: 1px solid var(--border-strong);
      padding: 16px; cursor: pointer; transition: transform 0.1s ease, border-color 0.15s ease;
    }
    .piece-card:active { transform: scale(0.995); }
    .piece-card.status-noprazo { border-color: rgba(16, 185, 129, 0.55); }
    .piece-card.status-atrasou { border-color: rgba(245, 158, 11, 0.65); }
    .piece-card.status-naoproduzida { border-color: rgba(244, 63, 94, 0.65); }

    .card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .piece-title { font-size: 18px; font-weight: 800; color: var(--text); line-height: 1.25; }
    .status-tag {
      min-height: 36px; padding: 6px 12px; border-radius: 10px;
      font-size: 13px; font-weight: 800; white-space: nowrap; display: inline-flex; align-items: center;
    }
    .tag-pendente { background: #1E293B; color: #CBD5E1; }
    .tag-noprazo { background: var(--green-bg); color: #34D399; border: 1px solid rgba(16,185,129,0.4); }
    .tag-atrasou { background: var(--amber-bg); color: #FBBF24; border: 1px solid rgba(245,158,11,0.4); }
    .tag-naoproduzida { background: var(--red-bg); color: #FB7185; border: 1px solid rgba(244,63,94,0.4); }

    .welder-line { margin-top: 8px; font-size: 14px; font-weight: 600; color: #E2E8F0; }
    .meta-line {
      margin-top: 6px; font-size: 13px; color: var(--muted);
      display: flex; flex-wrap: wrap; gap: 8px; font-variant-numeric: tabular-nums;
    }
    .interference-line {
      margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border);
      font-size: 13px; font-weight: 600; color: #FBBF24;
    }

    /* Modal Bottom Sheet */
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(3px); z-index: 70;
      display: none; align-items: flex-end; justify-content: center;
    }
    .modal-backdrop.open { display: flex; }
    .modal-sheet {
      background: var(--surface); width: 100%; max-width: 680px;
      max-height: 92vh; overflow-y: auto;
      border-radius: 24px 24px 0 0; border-top: 1px solid var(--border-strong);
      padding: 20px 16px max(28px, env(safe-area-inset-bottom)) 16px;
    }
    .step-box {
      border: 1px solid var(--border-strong); border-radius: 16px; padding: 14px; margin-bottom: 14px;
      background: #0F172A;
    }
    .step-title { font-size: 14px; font-weight: 800; margin: 0 0 10px 0; color: #F8FAFC; }
    .btn-row { display: flex; gap: 8px; flex-wrap: wrap; }
    .big-btn {
      flex: 1; min-width: 120px; min-height: 50px; padding: 10px 14px;
      border-radius: 12px; border: 1px solid var(--border-strong); background: var(--surface);
      font-size: 14px; font-weight: 800; cursor: pointer; color: var(--text);
    }
    .big-btn.active-green { background: var(--green); border-color: var(--green); color: #052e16; }
    .big-btn.active-amber { background: var(--amber); border-color: var(--amber); color: #451a03; }
    .big-btn.active-red { background: var(--red); border-color: var(--red); color: #fff; }
    .big-btn.active-blue { background: var(--blue); border-color: var(--blue); color: #fff; }

    .check-item {
      display: flex; align-items: center; gap: 12px;
      min-height: 48px; padding: 10px 12px; border-radius: 12px;
      border: 1px solid var(--border); background: var(--surface);
      margin-bottom: 8px; cursor: pointer; font-size: 14px; font-weight: 600;
    }
    .check-item.checked { border-color: var(--amber); background: var(--amber-bg); }
    .check-item input { width: 20px; height: 20px; accent-color: var(--amber); }

    .text-input {
      width: 100%; min-height: 48px; padding: 10px 12px; border-radius: 12px;
      border: 1px solid var(--border-strong); font-size: 15px; background: var(--surface);
      margin-top: 8px;
    }

    /* Manager KPI Grid */
    .kpi-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 18px;
    }
    .kpi-card {
      background: var(--surface); border: 1px solid var(--border-strong); border-radius: 14px; padding: 14px;
      font-variant-numeric: tabular-nums;
    }
    .kpi-val { font-size: 26px; font-weight: 800; margin-top: 4px; }
    .kpi-lbl { font-size: 12px; color: var(--muted); font-weight: 600; }
  </style>
</head>
<body>
  <input type="file" id="excelInput" accept=".xlsx,.xls,.csv" style="display:none" />

  <header class="app-header">
    <div class="header-inner">
      <div class="brand-title">HoraExtra</div>
      <div class="nav-tabs">
        <button class="nav-btn active" id="tabLider" onclick="setView('lider')">Líder</button>
        <button class="nav-btn" id="tabGerente" onclick="setView('gerente')">Gerente</button>
      </div>
      <div class="header-actions">
        <select id="dateSelect" class="date-select" onchange="onDateChange(this.value)"></select>
        <button class="ctrl-btn" onclick="document.getElementById('excelInput').click()">Importar Excel</button>
        <button class="ctrl-btn primary" onclick="exportExcel()">Exportar Excel</button>
      </div>
    </div>
  </header>

  <main class="container">
    <div id="viewLider">
      <div class="toolbar">
        <input type="search" id="searchInput" class="search-input" placeholder="Buscar por peça, soldador ou chapa..." oninput="render()" />
      </div>
      <div class="filter-strip" id="filterStrip"></div>
      <div class="cards-list" id="cardsList"></div>
    </div>

    <div id="viewGerente" style="display:none">
      <div id="managerContent"></div>
    </div>
  </main>

  <div class="modal-backdrop" id="pieceModal" onclick="if(event.target===this)closeModal()">
    <div class="modal-sheet" id="modalBody"></div>
  </div>

  <script>
    const RAW_TSV = \`${escapedTsv}\`;
    const STORAGE_KEY = 'horaextra_standalone_pieces_v1';
    const INTERFERENCES = [
      'Soldador faltou',
      'Falta de material / peça não chegou na hora',
      'Ponte rolante parada',
      'Falta de energia',
      'Máquina com problema',
      'Aguardando outra área',
      'Outro'
    ];

    let records = [];
    let currentView = 'lider';
    let selectedDate = '02/10/2026';
    let statusFilter = 'ALL';
    let activePieceId = null;

    function parseDefaultData() {
      return RAW_TSV.trim().split('\\n').map((line, idx) => {
        const c = line.split('\\t').map(s => s.trim());
        const data = c[0] || '02/10/2026';
        const chapa = c[1] || '';
        const funcionario = c[2] || '';
        const motivoHe = c[3] || 'Peça';
        const de = c[7] || '';
        return {
          id: 'p-' + idx + '-' + chapa,
          key: data + '__' + chapa + '__' + motivoHe + '__' + de,
          data,
          chapa,
          funcionario,
          soldadorAtual: funcionario,
          motivoHe,
          cc: c[4] || '',
          local: c[5] || '',
          gestor: c[6] || '',
          de,
          ate: c[8] || '',
          transporte: c[9] || '',
          refeicao: c[10] || '',
          solicitacao: c[11] || '',
          aprovacao: c[12] || '',
          dataApv: c[13] || '',
          presence: 'Pendente',
          motivoFalta: '',
          pieceStatus: 'Pendente',
          interferences: [],
          outroMotivoTexto: '',
          delayMinutes: 0,
          observacao: '',
          absentAction: '',
          paradoAgora: false,
          motivoParadoAgora: '',
          justificativaAutomatica: ''
        };
      });
    }

    function loadData() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            records = parsed;
            return;
          }
        }
      } catch (e) {}
      records = parseDefaultData();
    }

    function saveData() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch (e) {}
    }

    function getSummaryLine(r) {
      const parts = [];
      if (r.paradoAgora) parts.push('Parado agora: ' + (r.motivoParadoAgora || 'Aguardando'));
      if (r.justificativaAutomatica) parts.push(r.justificativaAutomatica);
      else if (r.presence === 'Faltou') parts.push('Soldador faltou: ' + (r.motivoFalta || 'Sem motivo'));
      if (r.pieceStatus === 'Atrasou' || r.pieceStatus === 'Não produzida') {
        const list = (r.interferences || []).map(i => i === 'Outro' && r.outroMotivoTexto ? 'Outro (' + r.outroMotivoTexto + ')' : i);
        if (list.length) parts.push(list.join(', '));
        if (r.pieceStatus === 'Atrasou' && r.delayMinutes > 0) parts.push('+' + r.delayMinutes + ' min');
      }
      if (r.observacao) parts.push(r.observacao);
      return parts.join(' · ');
    }

    function setView(v) {
      currentView = v;
      document.getElementById('tabLider').className = 'nav-btn' + (v === 'lider' ? ' active' : '');
      document.getElementById('tabGerente').className = 'nav-btn' + (v === 'gerente' ? ' active' : '');
      document.getElementById('viewLider').style.display = v === 'lider' ? 'block' : 'none';
      document.getElementById('viewGerente').style.display = v === 'gerente' ? 'block' : 'none';
      render();
    }

    function onDateChange(d) {
      selectedDate = d;
      render();
    }

    function render() {
      const dates = Array.from(new Set(records.map(r => r.data)));
      if (!dates.includes(selectedDate) && dates.length > 0) selectedDate = dates[0];

      const sel = document.getElementById('dateSelect');
      sel.innerHTML = dates.map(d => '<option value="' + d + '"' + (d === selectedDate ? ' selected' : '') + '>Dia ' + d + '</option>').join('');

      const dayRecords = records.filter(r => r.data === selectedDate);

      if (currentView === 'lider') {
        const counts = {
          ALL: dayRecords.length,
          Pendente: dayRecords.filter(r => r.pieceStatus === 'Pendente').length,
          'No prazo': dayRecords.filter(r => r.pieceStatus === 'No prazo').length,
          Atrasou: dayRecords.filter(r => r.pieceStatus === 'Atrasou').length,
          'Não produzida': dayRecords.filter(r => r.pieceStatus === 'Não produzida').length
        };
        const filters = [
          ['ALL', 'Todas (' + counts.ALL + ')'],
          ['Pendente', 'Pendentes (' + counts.Pendente + ')'],
          ['No prazo', 'No prazo (' + counts['No prazo'] + ')'],
          ['Atrasou', 'Atrasou (' + counts.Atrasou + ')'],
          ['Não produzida', 'Não produzidas (' + counts['Não produzida'] + ')']
        ];
        document.getElementById('filterStrip').innerHTML = filters.map(([k, lbl]) =>
          '<button class="filter-btn' + (statusFilter === k ? ' active' : '') + '" onclick="statusFilter=\\'' + k + '\\';render()">' + lbl + '</button>'
        ).join('');

        const q = (document.getElementById('searchInput').value || '').toLowerCase().trim();
        const filtered = dayRecords.filter(r => {
          if (statusFilter !== 'ALL' && r.pieceStatus !== statusFilter) return false;
          if (!q) return true;
          return r.motivoHe.toLowerCase().includes(q) || r.funcionario.toLowerCase().includes(q) || r.soldadorAtual.toLowerCase().includes(q) || r.chapa.toLowerCase().includes(q);
        });

        document.getElementById('cardsList').innerHTML = filtered.map(r => {
          const stClass = r.pieceStatus === 'No prazo' ? 'status-noprazo' : r.pieceStatus === 'Atrasou' ? 'status-atrasou' : r.pieceStatus === 'Não produzida' ? 'status-naoproduzida' : '';
          const tagClass = r.pieceStatus === 'No prazo' ? 'tag-noprazo' : r.pieceStatus === 'Atrasou' ? 'tag-atrasou' : r.pieceStatus === 'Não produzida' ? 'tag-naoproduzida' : 'tag-pendente';
          const summary = getSummaryLine(r);
          return '<div class="piece-card ' + stClass + '" onclick="openModal(\\'' + r.id + '\\')">' +
            '<div class="card-top">' +
              '<div class="piece-title">' + r.motivoHe + '</div>' +
              '<span class="status-tag ' + tagClass + '">' + r.pieceStatus + '</span>' +
            '</div>' +
            '<div class="welder-line">' + r.soldadorAtual + ' <span style="color:var(--muted);font-weight:500">· Chapa ' + r.chapa + '</span>' +
              (r.soldadorAtual !== r.funcionario ? ' <span style="color:#60A5FA;font-size:12px">(Substituiu ' + r.funcionario + ')</span>' : '') +
            '</div>' +
            '<div class="meta-line"><span>Horário: ' + r.de + ' → ' + r.ate + '</span><span>·</span><span>CC ' + r.cc + '</span><span>·</span><span>Presença: ' + r.presence + '</span></div>' +
            (summary ? '<div class="interference-line">' + summary + '</div>' : '') +
          '</div>';
        }).join('');
      } else {
        renderManager(dayRecords);
      }
    }

    function renderManager(dayRecords) {
      const noPrazo = dayRecords.filter(r => r.pieceStatus === 'No prazo').length;
      const atrasou = dayRecords.filter(r => r.pieceStatus === 'Atrasou').length;
      const naoProd = dayRecords.filter(r => r.pieceStatus === 'Não produzida').length;
      const pendentes = dayRecords.filter(r => r.pieceStatus === 'Pendente').length;
      const paradas = dayRecords.filter(r => r.paradoAgora);
      const comProblema = dayRecords.filter(r => r.paradoAgora || r.pieceStatus === 'Atrasou' || r.pieceStatus === 'Não produzida' || r.presence === 'Faltou');

      const intCounts = {};
      dayRecords.forEach(r => {
        (r.interferences || []).forEach(i => { intCounts[i] = (intCounts[i] || 0) + 1; });
      });
      const sortedInts = Object.entries(intCounts).sort((a, b) => b[1] - a[1]);

      document.getElementById('managerContent').innerHTML =
        '<div class="kpi-grid">' +
          '<div class="kpi-card"><div class="kpi-lbl">Peças no plano</div><div class="kpi-val">' + dayRecords.length + '</div></div>' +
          '<div class="kpi-card"><div class="kpi-lbl">No prazo</div><div class="kpi-val" style="color:var(--green)">' + noPrazo + '</div></div>' +
          '<div class="kpi-card"><div class="kpi-lbl">Atrasaram</div><div class="kpi-val" style="color:var(--amber)">' + atrasou + '</div></div>' +
          '<div class="kpi-card"><div class="kpi-lbl">Não produzidas</div><div class="kpi-val" style="color:var(--red)">' + naoProd + '</div></div>' +
          '<div class="kpi-card"><div class="kpi-lbl">Pendentes</div><div class="kpi-val">' + pendentes + '</div></div>' +
        '</div>' +
        '<div class="step-box"><div class="step-title">Principais interferências do dia</div>' +
          (sortedInts.length === 0 ? '<div style="color:var(--muted);font-size:14px">Nenhuma interferência apontada até o momento.</div>' :
            sortedInts.map(([k, v]) => '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:14px"><span>' + k + '</span><strong>' + v + ' peça(s)</strong></div>').join('')) +
        '</div>' +
        '<div class="step-box"><div class="step-title">Atenção imediata (Peças com interferência, falta ou paradas)</div>' +
          (comProblema.length === 0 ? '<div style="color:var(--muted);font-size:14px">Nenhuma peça com problema registrado neste turno.</div>' :
            comProblema.map(r => '<div style="padding:10px 0;border-bottom:1px solid var(--border)">' +
              '<div style="display:flex;justify-content:space-between;font-weight:800"><span>' + r.motivoHe + ' (CC ' + r.cc + ')</span><span>' + r.pieceStatus + '</span></div>' +
              '<div style="font-size:13px;color:var(--muted);margin-top:2px">' + r.soldadorAtual + ' · ' + r.de + ' → ' + r.ate + '</div>' +
              '<div style="font-size:13px;color:#FBBF24;margin-top:4px">' + getSummaryLine(r) + '</div>' +
            '</div>').join('')) +
        '</div>';
    }

    function openModal(id) {
      activePieceId = id;
      renderModal();
      document.getElementById('pieceModal').classList.add('open');
    }

    function closeModal() {
      activePieceId = null;
      document.getElementById('pieceModal').classList.remove('open');
      render();
    }

    function updateActive(patch) {
      records = records.map(r => r.id === activePieceId ? Object.assign({}, r, patch) : r);
      saveData();
      renderModal();
    }

    function toggleInterference(item) {
      const r = records.find(x => x.id === activePieceId);
      if (!r) return;
      const exists = r.interferences.includes(item);
      const next = exists ? r.interferences.filter(i => i !== item) : [...r.interferences, item];
      updateActive({ interferences: next });
    }

    function reallocateWelder(newName) {
      const r = records.find(x => x.id === activePieceId);
      if (!r || !newName) return;
      const just = 'Peça realocada porque o soldador original ' + r.funcionario + ' faltou. Motivo da falta: ' + (r.motivoFalta || 'Não informado') + '.';
      const nextInt = r.interferences.includes('Soldador faltou') ? r.interferences : [...r.interferences, 'Soldador faltou'];
      updateActive({
        absentAction: 'Alocar outro soldador',
        soldadorAtual: newName,
        justificativaAutomatica: just,
        interferences: nextInt,
        paradoAgora: false
      });
    }

    function renderModal() {
      const r = records.find(x => x.id === activePieceId);
      if (!r) return;
      const otherWelders = records.filter(x => x.data === r.data && x.id !== r.id);

      let html = '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">' +
        '<div><div style="font-size:20px;font-weight:800">' + r.motivoHe + '</div>' +
        '<div style="font-size:13px;color:var(--muted);margin-top:2px">' + r.soldadorAtual + ' (Chapa ' + r.chapa + ') · ' + r.de + ' → ' + r.ate + ' · CC ' + r.cc + '</div></div>' +
        '<button class="ctrl-btn" onclick="closeModal()">Fechar</button>' +
      '</div>';

      // 1. Presença
      html += '<div class="step-box"><div class="step-title">1. Presença do soldador (' + r.funcionario + ')</div>' +
        '<div class="btn-row">' +
          '<button class="big-btn ' + (r.presence === 'Veio' ? 'active-green' : '') + '" onclick="updateActive({presence:\\'Veio\\',absentAction:\\'\\',paradoAgora:false})">Veio</button>' +
          '<button class="big-btn ' + (r.presence === 'Faltou' ? 'active-red' : '') + '" onclick="updateActive({presence:\\'Faltou\\'})">Faltou</button>' +
        '</div>' +
        (r.presence === 'Faltou' ? '<input class="text-input" placeholder="Motivo da falta (obrigatório)..." value="' + (r.motivoFalta || '') + '" oninput="updateActive({motivoFalta:this.value})" />' : '') +
      '</div>';

      // 4. Soldador faltou mas a peça continua
      if (r.presence === 'Faltou') {
        html += '<div class="step-box"><div class="step-title">Soldador faltou — O que acontece com a peça?</div>' +
          '<div class="btn-row">' +
            '<button class="big-btn ' + (r.absentAction === 'Alocar outro soldador' ? 'active-blue' : '') + '" onclick="updateActive({absentAction:\\'Alocar outro soldador\\'})">Alocar outro soldador</button>' +
            '<button class="big-btn ' + (r.absentAction === 'Processo parado' ? 'active-amber' : '') + '" onclick="updateActive({absentAction:\\'Processo parado\\',paradoAgora:true})">Processo parado</button>' +
            '<button class="big-btn ' + (r.absentAction === 'Não realizar a peça' ? 'active-red' : '') + '" onclick="updateActive({absentAction:\\'Não realizar a peça\\',pieceStatus:\\'Não produzida\\',interferences:[\\'Soldador faltou\\'],paradoAgora:false})">Não realizar a peça</button>' +
          '</div>' +
          (r.absentAction === 'Alocar outro soldador' ? '<select class="text-input" onchange="reallocateWelder(this.value)"><option value="">Selecione o soldador substituto do dia...</option>' +
            otherWelders.map(w => '<option value="' + w.funcionario + '"' + (r.soldadorAtual === w.funcionario ? ' selected' : '') + '>' + w.funcionario + ' (Chapa ' + w.chapa + ')</option>').join('') +
          '</select>' : '') +
          (r.absentAction === 'Processo parado' ? '<input class="text-input" placeholder="Por que a peça está parada?" value="' + (r.motivoParadoAgora || '') + '" oninput="updateActive({motivoParadoAgora:this.value})" />' : '') +
          (r.justificativaAutomatica ? '<div style="margin-top:8px;font-size:13px;color:#60A5FA">' + r.justificativaAutomatica + '</div>' : '') +
        '</div>';
      }

      // 2. Resultado da peça
      html += '<div class="step-box"><div class="step-title">2. Resultado da peça</div>' +
        '<div class="btn-row">' +
          '<button class="big-btn ' + (r.pieceStatus === 'No prazo' ? 'active-green' : '') + '" onclick="updateActive({pieceStatus:\\'No prazo\\',interferences:[],delayMinutes:0,paradoAgora:false})">Saiu no horário</button>' +
          '<button class="big-btn ' + (r.pieceStatus === 'Atrasou' ? 'active-amber' : '') + '" onclick="updateActive({pieceStatus:\\'Atrasou\\'})">Atrasou</button>' +
          '<button class="big-btn ' + (r.pieceStatus === 'Não produzida' ? 'active-red' : '') + '" onclick="updateActive({pieceStatus:\\'Não produzida\\'})">Não produzida</button>' +
        '</div>' +
      '</div>';

      // 3. Interferências
      if (r.pieceStatus === 'Atrasou' || r.pieceStatus === 'Não produzida') {
        html += '<div class="step-box"><div class="step-title">3. Por que não saiu no horário?</div>' +
          INTERFERENCES.map(item => {
            const checked = (r.interferences || []).includes(item);
            return '<div class="check-item ' + (checked ? 'checked' : '') + '" onclick="toggleInterference(\\'' + item + '\\')">' +
              '<input type="checkbox" ' + (checked ? 'checked' : '') + ' onclick="event.stopPropagation();toggleInterference(\\'' + item + '\\')" />' +
              '<span>' + item + '</span>' +
            '</div>';
          }).join('') +
          ((r.interferences || []).includes('Outro') ? '<input class="text-input" placeholder="Qual outro motivo?" value="' + (r.outroMotivoTexto || '') + '" oninput="updateActive({outroMotivoTexto:this.value})" />' : '') +
          (r.pieceStatus === 'Atrasou' ? '<input type="number" class="text-input" placeholder="Atraso em minutos (ex: 30)" value="' + (r.delayMinutes || '') + '" oninput="updateActive({delayMinutes:parseInt(this.value,10)||0})" />' : '') +
          '<input class="text-input" placeholder="Observação livre (opcional, 1 linha)" value="' + (r.observacao || '') + '" oninput="updateActive({observacao:this.value})" />' +
        '</div>';
      }

      document.getElementById('modalBody').innerHTML = html;
    }

    function exportExcel() {
      const ws = XLSX.utils.json_to_sheet(records.map(r => ({
        DATA: r.data, CHAPA: r.chapa, FUNCIONARIO: r.funcionario, MOTIVO: r.motivoHe,
        CC: r.cc, LOCAL: r.local, GESTOR: r.gestor, DE: r.de, ATE: r.ate,
        PRESENCA: r.presence, MOTIVO_FALTA: r.motivoFalta, SOLDADOR_ATUAL: r.soldadorAtual,
        RESULTADO_PECA: r.pieceStatus, ATRASO_MIN: r.delayMinutes,
        INTERFERENCIAS: (r.interferences || []).join(' | '),
        JUSTIFICATIVA: r.justificativaAutomatica, OBSERVACAO: r.observacao
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'HoraExtra');
      XLSX.writeFile(wb, 'HoraExtra_' + selectedDate.replace(/\\//g, '-') + '.xlsx');
    }

    loadData();
    render();
  <\/script>
</body>
</html>`;
}

export function downloadStandaloneHtmlFile(): void {
  const htmlContent = buildStandaloneHtml();
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'HoraExtra.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
