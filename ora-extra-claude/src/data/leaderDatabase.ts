export interface CollaboratorLeaderEntry {
  chapa: string;
  aliasChapas?: string[];
  nome: string;
  aliasNomes?: string[];
  lider: string; // Ex: "Alexandre / Odonei", "Fábio", "Luiz", "Diego", "Ronaldo", "Odonei", "João", "Não identificado"
}

export const OFFICIAL_LEADERS = [
  'Alexandre',
  'Diego',
  'Fábio',
  'João',
  'Luiz',
  'Odonei',
  'Ronaldo',
] as const;

export type OfficialLeaderName = (typeof OFFICIAL_LEADERS)[number];

export const LEADER_OVERRIDES_STORAGE_KEY = 'horaextra_leader_overrides_v1';

/**
 * Relação geral de colaboradores por líder (em ordem alfabética pelo nome),
 * com chapa, nome completo conforme a referência disponível e líder(es) que enviaram a lista.
 */
export const COLLABORATOR_LEADER_DIRECTORY: CollaboratorLeaderEntry[] = [
  {
    chapa: '11418',
    nome: 'ADEMIR DA SILVA NEVES',
    lider: 'João / Alexandre / Odonei',
  },
  {
    chapa: '10859',
    nome: 'AGNALDO CESAR DA SILVA',
    lider: 'Alexandre',
  },
  {
    chapa: '11348',
    aliasChapas: ['10922'],
    nome: 'AILTON',
    aliasNomes: ['AIRTON ACACIO DA SILVA', 'AILTON ACACIO DA SILVA'],
    lider: 'Fábio',
  },
  {
    chapa: '12371',
    nome: 'AIRTON DE SOUSA JUNIOR',
    aliasNomes: ['AIRTON DE SOUZA JUNIOR'],
    lider: 'Alexandre',
  },
  {
    chapa: '12480',
    nome: 'ALEX APARECIDO DOS SANTOS',
    lider: 'João',
  },
  {
    chapa: '12443',
    nome: 'ALEX CORDEIRO NEVES',
    lider: 'Luiz',
  },
  {
    chapa: '8536',
    nome: 'ALEXANDRE DOS SANTOS NASCIMENTO',
    lider: 'João',
  },
  {
    chapa: '8141',
    nome: 'ALEXANDRE GONCALVES VIEIRA',
    lider: 'Alexandre',
  },
  {
    chapa: '11413',
    nome: 'ALEXANDRE GUSMAO SANTOS PAIVA',
    lider: 'Luiz',
  },
  {
    chapa: '11462',
    nome: 'ANDERSON SILVA FAUSTINO',
    lider: 'Diego',
  },
  {
    chapa: '10093',
    aliasChapas: ['11093'],
    nome: 'ANDRÉ',
    aliasNomes: ['ANDRE LUIZ DE OLIVEIRA', 'ANDRE'],
    lider: 'Fábio',
  },
  {
    chapa: '10985',
    nome: 'ANDREI ANTONIO DOS SANTOS',
    lider: 'Alexandre',
  },
  {
    chapa: '8213',
    nome: 'ANTONIO CARLOS SCIARRETTA DA COSTA',
    lider: 'Odonei',
  },
  {
    chapa: '10832',
    nome: 'ANTONIO MARCOS DE ALMEIDA',
    lider: 'Luiz',
  },
  {
    chapa: '11095',
    nome: 'AUGUSTO FERNANDO LOUREIRO DE JESUS',
    lider: 'Odonei',
  },
  {
    chapa: '11372',
    nome: 'BRUNO BORGES FERREIRA',
    lider: 'Diego',
  },
  {
    chapa: '8009',
    nome: 'BRUNO DANIEL BASTOS',
    lider: 'João',
  },
  {
    chapa: '10833',
    nome: 'CAIO DE ALMEIDA ROSA',
    lider: 'Não identificado',
  },
  {
    chapa: '12498',
    nome: 'CARLOS BRANT',
    aliasNomes: ['CARLOS MACIEL BRANT'],
    lider: 'Fábio',
  },
  {
    chapa: '8979',
    nome: 'CLAUDINEI DA SILVA MOTTA',
    lider: 'Luiz / João',
  },
  {
    chapa: '11089',
    nome: 'CLAUDIO MONTEIRO DE CARVALHO',
    lider: 'Luiz',
  },
  {
    chapa: '290044',
    nome: 'CRISTIANO ROBERTO DE FREITAS',
    lider: 'Alexandre',
  },
  {
    chapa: '12434',
    nome: 'DANILO PEREIRA DE SOUZA',
    lider: 'Luiz',
  },
  {
    chapa: '11370',
    nome: 'DAVID SAUL',
    aliasNomes: ['DEIVID SAUL FREITAS SANTOS', 'DAVID SAUL FREITAS SANTOS'],
    lider: 'Luiz',
  },
  {
    chapa: '11667',
    nome: 'DENIS',
    aliasNomes: ['DENIS SOUZA DE PAULA'],
    lider: 'Ronaldo',
  },
  {
    chapa: '11596',
    nome: 'DIEGO DO NASCIMENTO FERREIRA',
    lider: 'Fábio',
  },
  {
    chapa: '9189',
    nome: 'DIEGO DOMINGUES DOS SANTOS',
    lider: 'Diego',
  },
  {
    chapa: '11597',
    nome: 'DIEGO MACHADO DE ARAUJO',
    lider: 'Fábio / Diego',
  },
  {
    chapa: '8292',
    nome: 'DOMINGOS DA SILVA GURUNGA',
    lider: 'Luiz',
  },
  {
    chapa: '10870',
    nome: 'EDJAN EDSON DE LIMA',
    lider: 'Odonei',
  },
  {
    chapa: '11374',
    nome: 'EDVAN',
    aliasNomes: ['EDIVAN BIBIANO DOS SANTOS', 'EDVAN BIBIANO DOS SANTOS'],
    lider: 'Fábio',
  },
  {
    chapa: '11515',
    nome: 'EMERSON MESSIAS DE AMORIM',
    lider: 'Ronaldo',
  },
  {
    chapa: '11738',
    nome: 'ERIVELTON BEZERRA DA SILVA',
    lider: 'Ronaldo',
  },
  {
    chapa: '11678',
    nome: 'EVERTON OLIVEIRA LAPA',
    lider: 'Ronaldo',
  },
  {
    chapa: '11369',
    nome: 'FABIANO DUARTE SANTIAGO',
    lider: 'Fábio',
  },
  {
    chapa: '7173',
    nome: 'FABIO DO NASCIMENTO',
    lider: 'Odonei',
  },
  {
    chapa: '10749',
    nome: 'FABIO GONCALVES TABOADA',
    lider: 'Diego',
  },
  {
    chapa: '12698',
    nome: 'FABIO MOREIRA LINACRE',
    lider: 'Diego',
  },
  {
    chapa: '8089',
    nome: 'FABIO NUNES PRESSOTO DE LIMA',
    lider: 'Fábio',
  },
  {
    chapa: '12359',
    nome: 'FERNANDO DE SOUZA SILVA',
    lider: 'João',
  },
  {
    chapa: '11073',
    nome: 'FERNANDO MATIAS DA SILVA',
    lider: 'Ronaldo',
  },
  {
    chapa: '7910',
    nome: 'FRANCISCO DENES DA SILVA',
    lider: 'Odonei',
  },
  {
    chapa: '8516',
    nome: 'GERALDO CORREA JUNIOR',
    lider: 'Ronaldo',
  },
  {
    chapa: '7913',
    nome: 'GERALDO TEIXEIRA MENDES FILHO',
    lider: 'Odonei',
  },
  {
    chapa: '11424',
    nome: 'GUILHERME DO NASCIMENTO SCHIAVI',
    lider: 'Ronaldo',
  },
  {
    chapa: '5056',
    nome: 'ISAAC PINTO DE ALMEIDA',
    lider: 'Alexandre',
  },
  {
    chapa: '11860',
    nome: 'JAQUELINO PEREIRA DA SILVA',
    lider: 'João',
  },
  {
    chapa: '11637',
    nome: 'JEFERSON DUTRA',
    aliasNomes: ['JEFERSON DUTRA FREIRE'],
    lider: 'Fábio',
  },
  {
    chapa: '12657',
    nome: 'JEFFERSON ELIEZER DA SILVA',
    lider: 'Não identificado',
  },
  {
    chapa: '11009',
    nome: 'JHON JOSE DOS SANTOS',
    lider: 'Luiz',
  },
  {
    chapa: '10835',
    nome: 'JOAO BATISTA ALBUQUERQUE SILVA',
    lider: 'Diego',
  },
  {
    chapa: '8335',
    nome: 'JOÃO JR',
    aliasNomes: ['JOAO DE OLIVEIRA JUNIOR', 'JOAO JR'],
    lider: 'João',
  },
  {
    chapa: '8258',
    nome: 'JOAO NUNES DE MATOS',
    lider: 'Diego',
  },
  {
    chapa: '12739',
    nome: 'JOEZER ALAN DE SOUZA',
    lider: 'Odonei',
  },
  {
    chapa: '6004',
    nome: 'JORGE DE SOUZA',
    lider: 'Odonei',
  },
  {
    chapa: '11373',
    nome: 'JOSE ADAUTO DE FREITAS',
    lider: 'João',
  },
  {
    chapa: '8259',
    nome: 'JOSE CLAUDIO SANTOS DA SILVA',
    lider: 'Luiz',
  },
  {
    chapa: '11956',
    aliasChapas: ['11438'],
    nome: 'JOSÉ DARCI',
    aliasNomes: ['JOSE DARCI DE OLIVEIRA', 'JOSE DARCI'],
    lider: 'Fábio',
  },
  {
    chapa: '11685',
    aliasChapas: ['11681'],
    nome: 'JOSÉ ROMILSON DA SILVA',
    aliasNomes: ['JOSE ROMILSON DA SILVA'],
    lider: 'Fábio',
  },
  {
    chapa: '10967',
    nome: 'JUAREZ SEBASTIAO DA SILVA',
    lider: 'Alexandre',
  },
  {
    chapa: '11928',
    nome: 'JULIO CESAR ALVES DE MATTOS',
    lider: 'Luiz',
  },
  {
    chapa: '10766',
    nome: 'JUVENIL SOUZA DE JESUS',
    lider: 'Odonei',
  },
  {
    chapa: '11381',
    nome: 'LEANDRO RARISSON DA CONCEICAO',
    lider: 'Alexandre',
  },
  {
    chapa: '10837',
    nome: 'LEONARDO DE SOUZA CONCEICAO',
    lider: 'Luiz',
  },
  {
    chapa: '11100',
    nome: 'LEONARDO NOGUEIRA DUARTE',
    lider: 'Alexandre',
  },
  {
    chapa: '11513',
    nome: 'LEONARDO SILVA CANIL',
    lider: 'Ronaldo',
  },
  {
    chapa: '12381',
    nome: 'LUCAS',
    aliasNomes: ['LUCAS PEREIRA BOTELHO SANTOS'],
    lider: 'João',
  },
  {
    chapa: '10838',
    nome: 'LUCAS DA SILVA FREITAS',
    lider: 'Ronaldo',
  },
  {
    chapa: '11598',
    nome: 'LUCIANO DA SILVA',
    lider: 'João',
  },
  {
    chapa: '8294',
    aliasChapas: ['8264'],
    nome: 'LUIS ALVES',
    aliasNomes: ['LUIZ ALVES DE FARIAS', 'LUIZ ALVES'],
    lider: 'Luiz',
  },
  {
    chapa: '11008',
    nome: 'LUIS CARLOS DA SILVA',
    lider: 'Diego',
  },
  {
    chapa: '10784',
    nome: 'LUIZ CARLOS DE ABREU DAS CHAGAS',
    lider: 'Luiz',
  },
  {
    chapa: '12707',
    nome: 'MARCELO DA COSTA LIMA',
    lider: 'Ronaldo',
  },
  {
    chapa: '12658',
    nome: 'MARCELO HENRIQUE DE MELO NASCIMENTO',
    lider: 'Alexandre',
  },
  {
    chapa: '11034',
    nome: 'MARCIO DA SILVA',
    lider: 'Alexandre',
  },
  {
    chapa: '12717',
    nome: 'MATHEUS',
    lider: 'João',
  },
  {
    chapa: '11377',
    nome: 'MATHEUS VINICIUS CIRINO',
    lider: 'Luiz',
  },
  {
    chapa: '11657',
    nome: 'MAURICIO PENASCO BLANCO',
    lider: 'Fábio',
  },
  {
    chapa: '8338',
    nome: 'MAURO HIROSHI SAKAKI',
    aliasNomes: ['MAURO H.', 'MAURO H'],
    lider: 'Alexandre',
  },
  {
    chapa: '9005',
    nome: 'MAYKE',
    aliasNomes: ['MAIKE DE SOUZA ALVES', 'MAYKE DE SOUZA ALVES'],
    lider: 'Fábio',
  },
  {
    chapa: '13585',
    nome: 'MICHAEL',
    lider: 'Luiz',
  },
  {
    chapa: '12575',
    nome: 'MICHAELL DOUGLAS OLIVEIRA DA SILVA',
    lider: 'Não identificado',
  },
  {
    chapa: '10984',
    nome: 'NELSON JOSE ROHDEN KEMPF',
    lider: 'Fábio',
  },
  {
    chapa: '11090',
    nome: 'NEUSIVAN DE SOUSA',
    lider: 'Não identificado',
  },
  {
    chapa: '11833',
    nome: 'NICOLAS DE CALIS MUNHOZ',
    lider: 'Odonei',
  },
  {
    chapa: '7488',
    nome: 'ODONEI DONIZETE GODOY DA CRUZ',
    lider: 'Odonei',
  },
  {
    chapa: '11963',
    nome: 'OSWALDIR DE JESUS SILVA',
    lider: 'Odonei',
  },
  {
    chapa: '11656',
    nome: 'PAULO',
    aliasNomes: ['PAULO VINICIUS GUIMARAES GOMES'],
    lider: 'João',
  },
  {
    chapa: '7132',
    nome: 'PAULO ROBERTO DE FARIA MOREIRA',
    lider: 'Diego',
  },
  {
    chapa: '10977',
    nome: 'PEDRO MORAIS PINTO',
    lider: 'Diego',
  },
  {
    chapa: '11096',
    nome: 'PETERSON LUIZ APARECIDO DA SILVA',
    lider: 'Odonei',
  },
  {
    chapa: '11483',
    nome: 'RAFAEL DA SILVA',
    lider: 'Alexandre',
  },
  {
    chapa: '12689',
    nome: 'RAFAEL SILVA CONCEICAO',
    lider: 'Odonei',
  },
  {
    chapa: '11046',
    nome: 'RAILTON NATALE DE OLIVEIRA',
    lider: 'Luiz',
  },
  {
    chapa: '12273',
    nome: 'RAPHAEL KENJI NAKAMURA',
    lider: 'Odonei',
  },
  {
    chapa: '7905',
    nome: 'REGINALDO ALVES CARDOSO TEIXEIRA',
    lider: 'Ronaldo',
  },
  {
    chapa: '10785',
    nome: 'RENE DIAS DE SANTANA',
    lider: 'Ronaldo',
  },
  {
    chapa: '12415',
    nome: 'RIAN SILVA PEREIRA',
    lider: 'João',
  },
  {
    chapa: '11903',
    nome: 'RICARDO CRISTIANO DE QUEIROZ',
    lider: 'Odonei',
  },
  {
    chapa: '11825',
    nome: 'ROBERTO BEZERRA DE MENEZES',
    lider: 'Diego',
  },
  {
    chapa: '12700',
    nome: 'RODOLFO DE OLIVEIRA FERNANDES DE FR',
    aliasNomes: ['RODOLFO DE OLIVEIRA FERNANDES DE FREITAS', 'RODOLFO DE OLIVEIRA FERNANDES'],
    lider: 'Diego',
  },
  {
    chapa: '11342',
    nome: 'ROGERIO CARLOS DE ARAUJO',
    lider: 'Ronaldo',
  },
  {
    chapa: '6879',
    nome: 'RONALDO DOMINGOS CARDOSO',
    lider: 'Ronaldo',
  },
  {
    chapa: '11415',
    nome: 'RONALDO DOS SANTOS FERREIRA',
    lider: 'Ronaldo',
  },
  {
    chapa: '8198',
    nome: 'ROSALVO RIBEIRO DA SILVA',
    lider: 'Luiz',
  },
  {
    chapa: '12370',
    nome: 'SANDRO BARBOSA DOS SANTOS',
    lider: 'Diego',
  },
  {
    chapa: '11535',
    nome: 'TAYLOR',
    aliasNomes: ['TAYLOR RIBEIRO DA SILVA'],
    lider: 'Luiz',
  },
  {
    chapa: '11660',
    nome: 'VALDINEI AGOSTINI',
    lider: 'Ronaldo',
  },
  {
    chapa: '12435',
    nome: 'VINICIUS EDUARDO GONCALVES BARBOSA',
    lider: 'João',
  },
  {
    chapa: '12735',
    nome: 'VINÍCIUS GUTIERRES',
    aliasNomes: ['VINICIUS GUTIERRES DE ALMEIDA', 'VINICIUS GUTIERRES'],
    lider: 'João',
  },
  {
    chapa: '290049',
    nome: 'VITOR',
    aliasNomes: ['VITOR PIUNA SILVA'],
    lider: 'João',
  },
  {
    chapa: '11802',
    nome: 'WEBERSON ELIAS DA SILVA PEREIRA',
    lider: 'Luiz',
  },
  {
    chapa: '11547',
    aliasChapas: ['11727'],
    nome: 'WESLEI ROCHA RIBEIRO',
    aliasNomes: ['WESLEY ROCHA RIBEIRO', 'WILLIAM'],
    lider: 'João / Odonei',
  },
  {
    chapa: '11537',
    nome: 'WESLEY ALVES ZIMERMAN',
    lider: 'Fábio',
  },
];

export function normalizePersonName(raw: string): string {
  return (raw || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ');
}

export function loadLeaderOverrides(): Record<string, string> {
  try {
    const saved = localStorage.getItem(LEADER_OVERRIDES_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return {};
}

export function saveLeaderOverride(chapaOrNameKey: string, lider: string): Record<string, string> {
  const current = loadLeaderOverrides();
  const next = {
    ...current,
    [chapaOrNameKey]: lider,
  };
  try {
    localStorage.setItem(LEADER_OVERRIDES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
  return next;
}

/**
 * Cruza automaticamente a Chapa e o Nome do colaborador (vindo do Excel ou da memória)
 * com a Base Geral de Colaboradores por Líder.
 */
export function resolveCollaboratorLeader(
  chapa: string,
  funcionario: string,
  overrides?: Record<string, string>
): string {
  const cleanChapa = (chapa || '').trim().replace(/^0+/, '');
  const normName = normalizePersonName(funcionario);
  const activeOverrides = overrides || loadLeaderOverrides();

  // 1. Check user custom overrides first
  if (cleanChapa && activeOverrides[`chapa:${cleanChapa}`]) {
    return activeOverrides[`chapa:${cleanChapa}`];
  }
  if (normName && activeOverrides[`nome:${normName}`]) {
    return activeOverrides[`nome:${normName}`];
  }

  // 2. Match by exact Chapa or Alias Chapa
  if (cleanChapa && cleanChapa !== '—' && cleanChapa !== '-') {
    const byChapa = COLLABORATOR_LEADER_DIRECTORY.find(
      (entry) =>
        entry.chapa === cleanChapa ||
        (entry.aliasChapas && entry.aliasChapas.includes(cleanChapa))
    );
    if (byChapa) {
      return byChapa.lider;
    }
  }

  // 3. Match by exact Normalized Name or Alias Name
  if (normName) {
    const byExactName = COLLABORATOR_LEADER_DIRECTORY.find((entry) => {
      if (normalizePersonName(entry.nome) === normName) return true;
      if (entry.aliasNomes && entry.aliasNomes.some((a) => normalizePersonName(a) === normName)) {
        return true;
      }
      return false;
    });
    if (byExactName) {
      return byExactName.lider;
    }

    // 4. Match when spreadsheet has full name and table has short name (or vice-versa)
    const byPrefixOrTokens = COLLABORATOR_LEADER_DIRECTORY.find((entry) => {
      const entryNorm = normalizePersonName(entry.nome);
      if (entryNorm.length >= 4 && normName.startsWith(entryNorm + ' ')) {
        return true;
      }
      if (normName.length >= 4 && entryNorm.startsWith(normName + ' ')) {
        return true;
      }
      // First + Last token match when at least 2 tokens
      const tokensA = normName.split(' ').filter((t) => !['DE', 'DA', 'DO', 'DOS', 'DAS'].includes(t));
      const tokensB = entryNorm.split(' ').filter((t) => !['DE', 'DA', 'DO', 'DOS', 'DAS'].includes(t));
      if (
        tokensA.length >= 2 &&
        tokensB.length >= 2 &&
        tokensA[0] === tokensB[0] &&
        tokensA[1] === tokensB[1]
      ) {
        return true;
      }
      return false;
    });

    if (byPrefixOrTokens) {
      return byPrefixOrTokens.lider;
    }
  }

  return 'Não identificado';
}

/**
 * Verifica se o colaborador pertence à equipe do Líder selecionado.
 * Ex: Se o colaborador tem "Alexandre / Odonei", ele aparece tanto quando "Alexandre"
 * é selecionado quanto quando "Odonei" é selecionado.
 */
export function matchesSelectedLeader(
  recordLider: string | undefined,
  selectedLeader: string
): boolean {
  if (!selectedLeader || selectedLeader === 'ALL') return true;

  const cleanRecordLider = (recordLider || 'Não identificado').trim();
  if (selectedLeader === 'Não identificado') {
    return (
      !cleanRecordLider ||
      cleanRecordLider.toLowerCase() === 'não identificado' ||
      cleanRecordLider.toLowerCase() === 'nao identificado'
    );
  }

  const normSelected = normalizePersonName(selectedLeader);
  const parts = cleanRecordLider
    .split('/')
    .map((p) => normalizePersonName(p))
    .filter(Boolean);

  return parts.some((p) => p === normSelected || p.includes(normSelected));
}

/**
 * Registros salvos antes de uma correção da base podem ter um líder composto antigo
 * ("Alexandre / Odonei"). Reaplica a base atual (e as escolhas do usuário) nesses casos.
 */
export function refreshCompositeLeader<T extends { chapa: string; funcionario: string; lider?: string }>(rec: T): T {
  if (!rec.lider || !rec.lider.includes('/')) return rec;
  const fresh = resolveCollaboratorLeader(rec.chapa, rec.funcionario);
  return fresh && fresh !== rec.lider && fresh !== 'Não identificado' ? { ...rec, lider: fresh } : rec;
}
