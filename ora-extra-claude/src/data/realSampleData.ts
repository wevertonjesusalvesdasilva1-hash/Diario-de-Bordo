import {
  AbsentPieceAction,
  AttendanceStatus,
  OperationalStatus,
  OvertimeRecord,
  ProducedState,
} from '../types';
import { resolveCollaboratorLeader } from './leaderDatabase';

export const RAW_FACTORY_TSV = `02/10/2026	10922	AIRTON ACACIO DA SILVA	Tw trave D61	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	VT - MUNICIPAL SUZANO	LANCHE	02/10/2026 10:56	Aprovado	02/10/2026 14:38
02/10/2026	12443	ALEX CORDEIRO NEVES	Deck	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	KDB - MAUA/RIBEIRAO PIRES	LANCHE	02/10/2026 10:47	Aprovado	02/10/2026 14:38
02/10/2026	11093	ANDRE LUIZ DE OLIVEIRA	Saw viga do PC	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 10:56	Aprovado	02/10/2026 14:38
02/10/2026	10832	ANTONIO MARCOS DE ALMEIDA	Chassis D61	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	VT - MUNICIPAL SUZANO	LANCHE	02/10/2026 10:47	Aprovado	02/10/2026 14:38
02/10/2026	12498	CARLOS MACIEL BRANT	Saw ponteira PC 220 FX	J24	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	KDB - ITAIM PAULISTA	LANCHE	02/10/2026 10:56	Aprovado	02/10/2026 14:38
02/10/2026	8979	CLAUDINEI DA SILVA MOTTA	Umc	F33	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	VT - MUNICIPAL SUZANO	LANCHE	02/10/2026 10:47	Aprovado	02/10/2026 14:38
02/10/2026	11089	CLAUDIO MONTEIRO DE CARVALHO	Mesa final	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	KDB - ARUJA	LANCHE	02/10/2026 10:47	Aprovado	02/10/2026 14:38
02/10/2026	12434	DANILO PEREIRA DE SOUZA	Deck	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	ARU - MOGI DAS CRUZES	LANCHE	02/10/2026 10:47	Aprovado	02/10/2026 14:38
02/10/2026	11370	DEIVID SAUL FREITAS SANTOS	Chassis PC	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 10:47	Aprovado	02/10/2026 14:38
02/10/2026	11667	DENIS SOUZA DE PAULA	Final lança	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 11:01	Aprovado	02/10/2026 14:38
02/10/2026	11596	DIEGO DO NASCIMENTO FERREIRA	Raw 12	F34	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	KDB - ESTACAO SUZANO (TURNO)	LANCHE	02/10/2026 10:56	Aprovado	02/10/2026 14:38
02/10/2026	8292	DOMINGOS DA SILVA GURUNGA	Chassis PC	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	KDB - RODEIO	LANCHE	02/10/2026 10:47	Aprovado	02/10/2026 14:38
02/10/2026	11374	EDIVAN BIBIANO DOS SANTOS	Saw estrutura	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 10:56	Aprovado	02/10/2026 14:38
02/10/2026	11515	EMERSON MESSIAS DE AMORIM	Tw WA traseiro	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	KDB - RODEIO	LANCHE	02/10/2026 11:01	Aprovado	02/10/2026 14:38
02/10/2026	11678	EVERTON OLIVEIRA LAPA	Raw	F34	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 11:01	Aprovado	02/10/2026 14:38
02/10/2026	11369	FABIANO DUARTE SANTIAGO	Saw contra peso	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	VT - MUNICIPAL SUZANO	LANCHE	02/10/2026 10:56	Aprovado	02/10/2026 14:38
02/10/2026	8089	FABIO NUNES PRESSOTO DE LIMA	Responsável	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 10:56	Aprovado	02/10/2026 14:38
02/10/2026	8516	GERALDO CORREA JUNIOR	Tw lança	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 11:01	Aprovado	02/10/2026 14:38
02/10/2026	11424	GUILHERME DO NASCIMENTO SCHIAVI	Saw lança	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 11:01	Aprovado	02/10/2026 14:38
02/10/2026	11637	JEFERSON DUTRA FREIRE	Empilhadeira	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	VT - MUNICIPAL SUZANO	LANCHE	02/10/2026 10:56	Aprovado	02/10/2026 14:38
02/10/2026	11438	JOSE DARCI DE OLIVEIRA	Saw viga do PC 210	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	VT - MUNICIPAL SUZANO	LANCHE	02/10/2026 10:56	Aprovado	02/10/2026 14:38
02/10/2026	11681	JOSE ROMILSON DA SILVA	Tw contra peso	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 10:56	Aprovado	02/10/2026 14:38
02/10/2026	10837	LEONARDO DE SOUZA CONCEICAO	Saw deck	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 10:47	Aprovado	02/10/2026 14:38
02/10/2026	11513	LEONARDO SILVA CANIL	Tw lateral lança	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	KDB - RODEIO	LANCHE	02/10/2026 11:01	Aprovado	02/10/2026 14:38
02/10/2026	10838	LUCAS DA SILVA FREITAS	Saw viga D61	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	ARU - SANTA ISABEL	LANCHE	02/10/2026 11:01	Aprovado	02/10/2026 14:38
02/10/2026	8264	LUIZ ALVES DE FARIAS	Responsável	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 10:47	Aprovado	02/10/2026 14:38
02/10/2026	9005	MAIKE DE SOUZA ALVES	Tw viga do PC	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	KDB - ESTACAO GUAIANAZES	LANCHE	02/10/2026 10:56	Aprovado	02/10/2026 14:38
02/10/2026	12707	MARCELO DA COSTA LIMA	Tw lança	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	KDB - ESTACAO SUZANO (TURNO)	LANCHE	02/10/2026 11:01	Aprovado	02/10/2026 14:38
02/10/2026	11377	MATHEUS VINICIUS CIRINO	Mesa	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	KDB - ESTACAO SUZANO (TURNO)	LANCHE	02/10/2026 10:47	Aprovado	02/10/2026 14:38
02/10/2026	11657	MAURICIO PENASCO BLANCO	Saw trave D61	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	KDB - ESTACAO SUZANO (TURNO)	LANCHE	02/10/2026 10:56	Aprovado	02/10/2026 14:38
02/10/2026	12575	MICHAELL DOUGLAS OLIVEIRA DA SILVA	Deck	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 10:47	Aprovado	02/10/2026 14:38
02/10/2026	10984	NELSON JOSE ROHDEN KEMPF	Tw estrutura	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	KDB - RODEIO	LANCHE	02/10/2026 10:56	Aprovado	02/10/2026 14:38
02/10/2026	11046	RAILTON NATALE DE OLIVEIRA	Raw	F34	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 10:47	Aprovado	02/10/2026 14:38
02/10/2026	7905	REGINALDO ALVES CARDOSO TEIXEIRA	Tw viga D61	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	KDB - RODEIO	LANCHE	02/10/2026 11:01	Aprovado	02/10/2026 14:38
02/10/2026	6879	RONALDO DOMINGOS CARDOSO	Responsável	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	KDB - RODEIO	LANCHE	02/10/2026 11:01	Aprovado	02/10/2026 14:38
02/10/2026	11415	RONALDO DOS SANTOS FERREIRA	Saw traseiro	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	VT - MUNICIPAL SUZANO	LANCHE	02/10/2026 11:01	Aprovado	02/10/2026 14:38
02/10/2026	8198	ROSALVO RIBEIRO DA SILVA	Mesa final	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	KDB - PEDREIRA	LANCHE	02/10/2026 10:47	Aprovado	02/10/2026 14:38
02/10/2026	11535	TAYLOR RIBEIRO DA SILVA	Chassis D61	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	KDB - RODEIO	LANCHE	02/10/2026 10:47	Aprovado	02/10/2026 14:38
02/10/2026	11660	VALDINEI AGOSTINI	Saw viga D51	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	VT - CARTAO TOP (INTERMUNICIPAL)	LANCHE	02/10/2026 11:01	Aprovado	02/10/2026 14:38
02/10/2026	11802	WEBERSON ELIAS DA SILVA PEREIRA	Mesa central	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 10:47	Aprovado	02/10/2026 14:38
02/10/2026	11537	WESLEY ALVES ZIMERMAN	Saw scase D61	F30	SUZANO	Isaac Messias Diniz Oliveira	18:40	20:40	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 10:56	Aprovado	02/10/2026 14:38
03/10/2026	11418	ADEMIR DA SILVA NEVES	Saw mesa	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - MAUA/RIBEIRAO PIRES	LANCHE	02/10/2026 11:27	Aprovado	02/10/2026 14:38
03/10/2026	10859	AGNALDO CESAR DA SILVA	Saw viga	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 11:45	Aprovado	02/10/2026 14:38
03/10/2026	12371	AIRTON DE SOUSA JUNIOR	Tw trave	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - COCUERA	LANCHE	02/10/2026 11:45	Aprovado	02/10/2026 14:38
03/10/2026	12480	ALEX APARECIDO DOS SANTOS	Tw deck	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - ARUJA	LANCHE	02/10/2026 11:27	Aprovado	02/10/2026 14:38
03/10/2026	8536	ALEXANDRE DOS SANTOS NASCIMENTO	Tw mesa	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - MAUA/RIBEIRAO PIRES	LANCHE	02/10/2026 11:27	Aprovado	02/10/2026 14:38
03/10/2026	8141	ALEXANDRE GONCALVES VIEIRA	Responsável	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - ITAIM PAULISTA	LANCHE	02/10/2026 11:45	Aprovado	02/10/2026 14:38
03/10/2026	11462	ANDERSON SILVA FAUSTINO	Saw chassis PC	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - SANTO ANGELO	LANCHE	02/10/2026 11:32	Aprovado	02/10/2026 14:38
03/10/2026	10985	ANDREI ANTONIO DOS SANTOS	Saw viga	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - SANTO ANGELO	LANCHE	02/10/2026 11:45	Aprovado	02/10/2026 14:38
03/10/2026	8213	ANTONIO CARLOS SCIARRETTA DA COSTA	Saw viga D61	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 11:41	Aprovado	02/10/2026 14:38
03/10/2026	11095	AUGUSTO FERNANDO LOUREIRO DE JESUS	Tw lança	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - ESTACAO GUAIANAZES	LANCHE	02/10/2026 11:40	Aprovado	02/10/2026 14:38
03/10/2026	11372	BRUNO BORGES FERREIRA	Saw chassi PC	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - COCUERA	LANCHE	02/10/2026 11:32	Aprovado	02/10/2026 14:38
03/10/2026	9189	DIEGO DOMINGUES DOS SANTOS	Responsável	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 11:32	Aprovado	02/10/2026 14:38
03/10/2026	11597	DIEGO MACHADO DE ARAUJO	Saw chassi D61	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - MAUA/RIBEIRAO PIRES	LANCHE	02/10/2026 11:32	Aprovado	02/10/2026 14:38
03/10/2026	10870	EDJAN EDSON DE LIMA	Saw lança	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - ARUJA	LANCHE	02/10/2026 11:40	Aprovado	02/10/2026 14:38
03/10/2026	10749	FABIO GONCALVES TABOADA	Saw chassi WA	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - JD AEROPORTO III	LANCHE	02/10/2026 11:32	Aprovado	02/10/2026 14:38
03/10/2026	12698	FABIO MOREIRA LINACRE	Saw boom WA	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 11:32	Aprovado	02/10/2026 14:38
03/10/2026	12359	FERNANDO DE SOUZA SILVA	Tos	F33	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - JD SAO PEDRO	LANCHE	02/10/2026 11:27	Aprovado	02/10/2026 14:38
03/10/2026	7910	FRANCISCO DENES DA SILVA	Raw	F34	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - ARUJA	LANCHE	02/10/2026 11:40	Aprovado	02/10/2026 14:38
03/10/2026	7913	GERALDO TEIXEIRA MENDES FILHO	Saw lança	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - ITAIM PAULISTA	LANCHE	02/10/2026 11:40	Aprovado	02/10/2026 14:38
03/10/2026	5056	ISAAC PINTO DE ALMEIDA	Tw articulação	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 11:45	Aprovado	02/10/2026 14:38
03/10/2026	11860	JAQUELINO PEREIRA DA SILVA	Saw mesa	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - PEDREIRA	LANCHE	02/10/2026 11:27	Aprovado	02/10/2026 14:38
03/10/2026	12657	JEFFERSON ELIEZER DA SILVA	Empilhadeira	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - MAUA/RIBEIRAO PIRES	LANCHE	02/10/2026 11:45	Aprovado	02/10/2026 14:38
03/10/2026	10835	JOAO BATISTA ALBUQUERQUE SILVA	Saw chassi D61	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - VILA DA PRATA	LANCHE	02/10/2026 11:32	Aprovado	02/10/2026 14:38
03/10/2026	8258	JOAO NUNES DE MATOS	Tw chassi WA	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - SANTO ANGELO	LANCHE	02/10/2026 11:32	Aprovado	02/10/2026 14:38
03/10/2026	6004	JORGE DE SOUZA	Tw viga	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - JD SAO PEDRO	LANCHE	02/10/2026 11:40	Aprovado	02/10/2026 14:38
03/10/2026	11373	JOSE ADAUTO DE FREITAS	Saw deck	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 11:27	Aprovado	02/10/2026 14:38
03/10/2026	10766	JUVENIL SOUZA DE JESUS	Saw chassi traseiro	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	ARU - SANTA ISABEL	LANCHE	02/10/2026 11:40	Aprovado	02/10/2026 14:38
03/10/2026	11381	LEANDRO RARISSON DA CONCEICAO	Tw estrutura	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - ESTACAO GUAIANAZES	LANCHE	02/10/2026 11:45	Aprovado	02/10/2026 14:38
03/10/2026	11100	LEONARDO NOGUEIRA DUARTE	Tw viga	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - SANTO ANGELO	LANCHE	02/10/2026 11:45	Aprovado	02/10/2026 14:38
03/10/2026	11598	LUCIANO DA SILVA	Sub deck	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - ESTACAO GUAIANAZES	LANCHE	02/10/2026 11:27	Aprovado	02/10/2026 14:38
03/10/2026	11008	LUIS CARLOS DA SILVA	Tw aranha	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - JD AEROPORTO III	LANCHE	02/10/2026 11:32	Aprovado	02/10/2026 14:38
03/10/2026	10784	LUIZ CARLOS DE ABREU DAS CHAGAS	Acompanhamento de produção	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - SANTO ANGELO	LANCHE	02/10/2026 12:35	Aprovado	02/10/2026 14:38
03/10/2026	12658	MARCELO HENRIQUE DE MELO NASCIMENTO	Empilhadeira	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - VILA DA PRATA	LANCHE	02/10/2026 11:45	Aprovado	02/10/2026 14:38
03/10/2026	11034	MARCIO DA SILVA	Saw trave	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - PEDREIRA	LANCHE	02/10/2026 11:45	Aprovado	02/10/2026 14:38
03/10/2026	7488	ODONEI DONIZETE GODOY DA CRUZ	Responsável	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - MAUA/RIBEIRAO PIRES	LANCHE	02/10/2026 11:40	Aprovado	02/10/2026 14:38
03/10/2026	11963	OSWALDIR DE JESUS SILVA	Tw lateral lança	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - ESTACAO GUAIANAZES	LANCHE	02/10/2026 11:40	Aprovado	02/10/2026 14:38
03/10/2026	11656	PAULO VINICIUS GUIMARAES GOMES	Tw mesa	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - ARUJA	LANCHE	02/10/2026 11:27	Aprovado	02/10/2026 14:38
03/10/2026	10977	PEDRO MORAIS PINTO	Raw 10	F34	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	VT - MUNICIPAL SUZANO	LANCHE	02/10/2026 11:32	Aprovado	02/10/2026 14:38
03/10/2026	11483	RAFAEL DA SILVA	Saw viga	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - DR. DEODATO	LANCHE	02/10/2026 11:45	Aprovado	02/10/2026 14:38
03/10/2026	12689	RAFAEL SILVA CONCEICAO	Final lança	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - SANTO ANGELO	LANCHE	02/10/2026 11:40	Aprovado	02/10/2026 14:38
03/10/2026	12273	RAPHAEL KENJI NAKAMURA	Raw	F34	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - COCUERA	LANCHE	02/10/2026 11:40	Aprovado	02/10/2026 14:38
03/10/2026	12415	RIAN SILVA PEREIRA	Sub deck	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - VILA DA PRATA	LANCHE	02/10/2026 11:27	Aprovado	02/10/2026 14:38
03/10/2026	11903	RICARDO CRISTIANO DE QUEIROZ	Empilhadeira	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 11:40	Aprovado	02/10/2026 14:38
03/10/2026	11825	ROBERTO BEZERRA DE MENEZES	Saw chassi PC	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - SANTO ANGELO	LANCHE	02/10/2026 11:32	Aprovado	02/10/2026 14:38
03/10/2026	12370	SANDRO BARBOSA DOS SANTOS	Umc	F33	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - JD AEROPORTO III	LANCHE	02/10/2026 11:34	Aprovado	02/10/2026 14:38
03/10/2026	12435	VINICIUS EDUARDO GONCALVES BARBOSA	Tw deck	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - ESTACAO SUZANO (TURNO)	LANCHE	02/10/2026 11:27	Aprovado	02/10/2026 14:38
03/10/2026	12735	VINICIUS GUTIERRES DE ALMEIDA	Saw deck	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - ESTACAO GUAIANAZES	LANCHE	02/10/2026 11:27	Aprovado	02/10/2026 14:38
03/10/2026	290049	VITOR PIUNA SILVA	Umc 01	F26	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	NÃO INFORMADO	LANCHE	02/10/2026 11:41	Aprovado	02/10/2026 14:38
03/10/2026	11727	WESLEI ROCHA RIBEIRO	Saw viga D61	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - SANTO ANGELO	LANCHE	02/10/2026 11:41	Aprovado	02/10/2026 14:38
04/10/2026	12443	ALEX CORDEIRO NEVES	Deck	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - MAUA/RIBEIRAO PIRES	LANCHE	02/10/2026 10:57	Aprovado	02/10/2026 14:38
04/10/2026	10832	ANTONIO MARCOS DE ALMEIDA	Chassis D61	F30	SUZANO	Isaac Messias Diniz Oliveira	01:00	07:00	VT - MUNICIPAL SUZANO	LANCHE	02/10/2026 10:51	Aprovado	02/10/2026 14:38
04/10/2026	8009	BRUNO DANIEL BASTOS	Umc 01	F33	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - SANTO ANGELO	LANCHE	02/10/2026 11:33	Aprovado	02/10/2026 14:38
04/10/2026	8979	CLAUDINEI DA SILVA MOTTA	Umc	F33	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	VT - MUNICIPAL SUZANO	LANCHE	02/10/2026 10:57	Aprovado	02/10/2026 14:38
04/10/2026	11089	CLAUDIO MONTEIRO DE CARVALHO	Mesa final	F30	SUZANO	Isaac Messias Diniz Oliveira	01:00	07:00	KDB - ARUJA	LANCHE	02/10/2026 10:51	Aprovado	02/10/2026 14:38
04/10/2026	12434	DANILO PEREIRA DE SOUZA	Deck	F30	SUZANO	Isaac Messias Diniz Oliveira	01:00	07:00	ARU - MOGI DAS CRUZES	LANCHE	02/10/2026 10:51	Aprovado	02/10/2026 14:38
04/10/2026	11370	DEIVID SAUL FREITAS SANTOS	Chassis PC	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 10:57	Aprovado	02/10/2026 14:38
04/10/2026	11667	DENIS SOUZA DE PAULA	Final lança	F30	SUZANO	Isaac Messias Diniz Oliveira	01:00	07:00	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 11:22	Aprovado	02/10/2026 14:38
04/10/2026	8292	DOMINGOS DA SILVA GURUNGA	Chassis PC	F30	SUZANO	Isaac Messias Diniz Oliveira	01:00	07:00	KDB - RODEIO	LANCHE	02/10/2026 10:51	Aprovado	02/10/2026 14:38
04/10/2026	11678	EVERTON OLIVEIRA LAPA	Raw lança e viga	F34	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 11:22	Aprovado	02/10/2026 14:38
04/10/2026	11073	FERNANDO MATIAS DA SILVA	Saw viga D61	F30	SUZANO	Isaac Messias Diniz Oliveira	22:00	04:00	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 11:18	Aprovado	02/10/2026 14:38
04/10/2026	8516	GERALDO CORREA JUNIOR	Tw lança/Viga	F30	SUZANO	Isaac Messias Diniz Oliveira	01:00	07:00	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 11:22	Aprovado	02/10/2026 14:38
04/10/2026	11009	JHON JOSE DOS SANTOS	Chassis PC	F30	SUZANO	Isaac Messias Diniz Oliveira	01:00	07:00	ARU - SANTA ISABEL	LANCHE	02/10/2026 10:51	Aprovado	02/10/2026 14:38
04/10/2026	8335	JOAO DE OLIVEIRA JUNIOR	Responsável	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - JD AEROPORTO III	LANCHE	02/10/2026 11:33	Aprovado	02/10/2026 14:38
04/10/2026	8259	JOSE CLAUDIO SANTOS DA SILVA	Deck	F30	SUZANO	Isaac Messias Diniz Oliveira	01:00	07:00	ARU - SANTA ISABEL	LANCHE	02/10/2026 10:51	Aprovado	02/10/2026 14:38
04/10/2026	10837	LEONARDO DE SOUZA CONCEICAO	Deck	F30	SUZANO	Isaac Messias Diniz Oliveira	01:00	07:00	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 10:51	Aprovado	02/10/2026 14:38
04/10/2026	11513	LEONARDO SILVA CANIL	Saw lança	F30	SUZANO	Isaac Messias Diniz Oliveira	22:00	04:00	KDB - RODEIO	LANCHE	02/10/2026 11:18	Aprovado	02/10/2026 14:38
04/10/2026	10838	LUCAS DA SILVA FREITAS	Tw viga D61	F30	SUZANO	Isaac Messias Diniz Oliveira	22:00	04:00	ARU - SANTA ISABEL	LANCHE	02/10/2026 11:18	Aprovado	02/10/2026 14:38
04/10/2026	12381	LUCAS PEREIRA BOTELHO SANTOS	Saw mesa	F30	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	KDB - PEDREIRA	LANCHE	02/10/2026 11:33	Aprovado	02/10/2026 14:38
04/10/2026	12707	MARCELO DA COSTA LIMA	Tw lança	F30	SUZANO	Isaac Messias Diniz Oliveira	01:00	07:00	KDB - ESTACAO SUZANO (TURNO)	LANCHE	02/10/2026 11:22	Aprovado	02/10/2026 14:38
04/10/2026	11377	MATHEUS VINICIUS CIRINO	Mesa central	F30	SUZANO	Isaac Messias Diniz Oliveira	01:00	07:00	KDB - ESTACAO SUZANO (TURNO)	LANCHE	02/10/2026 10:51	Aprovado	02/10/2026 14:38
04/10/2026	12575	MICHAELL DOUGLAS OLIVEIRA DA SILVA	Deck	F30	SUZANO	Isaac Messias Diniz Oliveira	01:00	07:00	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 10:51	Aprovado	02/10/2026 14:38
04/10/2026	11090	NEUSIVAN DE SOUSA	Saw viga D61	F30	SUZANO	Isaac Messias Diniz Oliveira	22:00	04:00	VT - MUNICIPAL SUZANO	LANCHE	02/10/2026 11:18	Aprovado	02/10/2026 14:38
04/10/2026	11046	RAILTON NATALE DE OLIVEIRA	Raw	F34	SUZANO	Isaac Messias Diniz Oliveira	06:00	12:00	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 10:57	Aprovado	02/10/2026 14:38
04/10/2026	10785	RENE DIAS DE SANTANA	Raw 11, 9, 5	F34	SUZANO	Isaac Messias Diniz Oliveira	22:00	04:00	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 11:18	Aprovado	02/10/2026 14:38
04/10/2026	11342	ROGERIO CARLOS DE ARAUJO	Raw 05, 11, 09	F30	SUZANO	Isaac Messias Diniz Oliveira	01:00	07:00	KDB - ARUJA	LANCHE	02/10/2026 11:22	Aprovado	02/10/2026 14:38
04/10/2026	6879	RONALDO DOMINGOS CARDOSO	Umc	F30	SUZANO	Isaac Messias Diniz Oliveira	22:00	04:00	KDB - RODEIO	LANCHE	02/10/2026 11:18	Aprovado	02/10/2026 14:38
04/10/2026	8198	ROSALVO RIBEIRO DA SILVA	Mesa final	F30	SUZANO	Isaac Messias Diniz Oliveira	01:00	07:00	KDB - PEDREIRA	LANCHE	02/10/2026 10:51	Aprovado	02/10/2026 14:38
04/10/2026	11660	VALDINEI AGOSTINI	Saw viga D61/51	F30	SUZANO	Isaac Messias Diniz Oliveira	22:00	04:00	VT - CARTAO TOP (INTERMUNICIPAL)	LANCHE	02/10/2026 11:18	Aprovado	02/10/2026 14:38
04/10/2026	11802	WEBERSON ELIAS DA SILVA PEREIRA	Mesa central	F30	SUZANO	Isaac Messias Diniz Oliveira	01:00	07:00	OUTROS MEIOS - N?O TEM DESCONTO	LANCHE	02/10/2026 10:51	Aprovado	02/10/2026 14:38`;

export function normalizeOvertimeRecord(raw: Partial<OvertimeRecord>, index = 0): OvertimeRecord {
  const data = raw.data || '02/10/2026';
  const [dd = '02', mm = '10', yyyy = '2026'] = data.split('/');
  const dataSortKey = raw.dataSortKey || `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  const status = raw.status || AttendanceStatus.Pendente;

  let operationalStatus = raw.operationalStatus || OperationalStatus.Aguardando;
  if (status === AttendanceStatus.Ausente) {
    operationalStatus = OperationalStatus.Ausente;
  }

  return {
    id: raw.id || `rec-${index}-${raw.chapa || '0'}-${dataSortKey}`,
    data,
    dataSortKey,
    chapa: raw.chapa || '',
    funcionario: raw.funcionario || '',
    motivoHe: raw.motivoHe || '',
    cc: raw.cc || '',
    local: raw.local || '',
    gestor: raw.gestor || '',
    lider:
      raw.lider && raw.lider !== 'Não identificado'
        ? raw.lider
        : resolveCollaboratorLeader(raw.chapa || '', raw.funcionario || ''),
    de: raw.de || '',
    ate: raw.ate || '',
    transporte: raw.transporte || '',
    refeicao: raw.refeicao || '',
    solicitacao: raw.solicitacao || '',
    aprovacao: raw.aprovacao || '',
    dataApv: raw.dataApv || '',
    status,
    motivoFalta: raw.motivoFalta || '',
    operationalStatus,
    motivoParadaAtual: raw.motivoParadaAtual || '',
    horaEntradaReal: raw.horaEntradaReal || raw.de || '',
    horaSaidaReal: raw.horaSaidaReal || '',
    motivoSaidaAntecipada: raw.motivoSaidaAntecipada || '',
    producedState: raw.producedState || ProducedState.NaoIniciado,
    qtyPlanned: typeof raw.qtyPlanned === 'number' ? raw.qtyPlanned : 1,
    qtyActual: typeof raw.qtyActual === 'number' ? raw.qtyActual : 0,
    delayMinutes: typeof raw.delayMinutes === 'number' ? raw.delayMinutes : 0,
    productionJustification: raw.productionJustification || '',
    absentPieceAction: raw.absentPieceAction || AbsentPieceAction.Nenhum,
    reallocatedToWelder: raw.reallocatedToWelder || '',
    reallocatedToChapa: raw.reallocatedToChapa || '',
    reallocatedAtTime: raw.reallocatedAtTime || '',
    coveringForEmployee: raw.coveringForEmployee || '',
    coveringForChapa: raw.coveringForChapa || '',
    coveringForPiece: raw.coveringForPiece || '',
    coveringSinceTime: raw.coveringSinceTime || '',
    coveringReason: raw.coveringReason || '',
    coveredPieceDelivered:
      typeof raw.coveredPieceDelivered === 'boolean' ? raw.coveredPieceDelivered : true,
    timeline: Array.isArray(raw.timeline) ? raw.timeline : [],
  };
}

export function getRealFactoryDataset(): OvertimeRecord[] {
  const baseRecords = RAW_FACTORY_TSV.trim()
    .split('\n')
    .map((line, index) => {
      const cols = line.split('\t').map((c) => c.trim());
      const [
        data = '',
        chapa = '',
        funcionario = '',
        motivoHe = '',
        cc = '',
        local = '',
        gestor = '',
        de = '',
        ate = '',
        transporte = '',
        refeicao = '',
        solicitacao = '',
        aprovacao = '',
        dataApv = '',
      ] = cols;

      return normalizeOvertimeRecord(
        {
          data,
          chapa,
          funcionario,
          motivoHe,
          cc,
          local,
          gestor,
          de,
          ate,
          transporte,
          refeicao,
          solicitacao,
          aprovacao,
          dataApv,
        },
        index
      );
    });

  return applyRealisticWeekendSimulation(baseRecords);
}

/**
 * Populates realistic factory weekend occurrences across 02/10, 03/10, and 04/10:
 * - 4 stops by "Ponte rolante ocupada" in different processes (Saw viga, Tw trave, Deck, Saw chassi PC)
 * - Other stops ("Aguardando material", "Manutenção máquina de solda", "Troca de arame / gás")
 * - Worker absences with piece reallocation and process stopped alerts
 * - Early departure (Airton 06:00 -> 10:00) with two-way priority reallocation to Ademir (#11418)
 */
export function applyRealisticWeekendSimulation(records: OvertimeRecord[]): OvertimeRecord[] {
  return records.map((r, idx) => {
    // --- SATURDAY 03/10/2026 (06:00 - 12:00) ---
    if (r.data === '03/10/2026') {
      // 0. ADEMIR DA SILVA NEVES (#11418, Saw mesa): Left his own piece at 10:00 to cover Airton's priority piece (Tw trave)
      if (r.chapa === '11418') {
        return {
          ...r,
          status: AttendanceStatus.Presente,
          operationalStatus: OperationalStatus.Finalizou,
          horaEntradaReal: '06:00',
          producedState: ProducedState.Nao,
          qtyPlanned: 1,
          qtyActual: 0,
          delayMinutes: 120,
          coveringForEmployee: 'AIRTON DE SOUSA JUNIOR (#12371)',
          coveringForChapa: '12371',
          coveringForPiece: 'Tw trave',
          coveringSinceTime: '10:00',
          coveringReason: 'Compromisso particular',
          coveredPieceDelivered: true,
          productionJustification:
            'Ademir acabou atrasando e não entregou sua peça (Saw mesa) devido à ausência mais cedo de AIRTON DE SOUSA JUNIOR às 10:00 por motivos particulares. Ademir saiu desta peça às 10:00 e entregou a peça prioritária (Tw trave) do Airton.',
          timeline: [
            {
              id: `sim-${idx}-1`,
              time: '06:00',
              description: 'Entrou no posto de trabalho (iniciou peça Saw mesa)',
              type: 'entry',
            },
            {
              id: `sim-${idx}-2`,
              time: '10:00',
              description:
                'Saiu da peça "Saw mesa" às 10:00 — Remanejado por prioridade para soldar a peça "Tw trave" porque AIRTON DE SOUSA JUNIOR foi embora às 10:00 (Compromisso particular)',
              type: 'reallocation',
            },
            {
              id: `sim-${idx}-3`,
              time: '12:00',
              description:
                'Entregou a peça prioritária "Tw trave" (de AIRTON DE SOUSA JUNIOR). A peça que Ademir iria entregar ("Saw mesa") não entregou devido ao remanejamento.',
              type: 'finish',
            },
          ],
        };
      }

      // 1. AIRTON DE SOUSA JUNIOR: Worked 06:00 to 10:00 (Early Exit) -> Priority piece (Tw trave) reallocated at 10:00 to ADEMIR DA SILVA NEVES (#11418)
      if (r.chapa === '12371') {
        return {
          ...r,
          status: AttendanceStatus.Presente,
          operationalStatus: OperationalStatus.SaiuMaisCedo,
          horaEntradaReal: '06:00',
          horaSaidaReal: '10:00',
          motivoSaidaAntecipada: 'Compromisso particular',
          producedState: ProducedState.Sim,
          qtyPlanned: 1,
          qtyActual: 1,
          delayMinutes: 30,
          absentPieceAction: AbsentPieceAction.AlocarOutro,
          reallocatedToWelder: 'ADEMIR DA SILVA NEVES (#11418)',
          reallocatedToChapa: '11418',
          reallocatedAtTime: '10:00',
          productionJustification:
            'Airton saiu mais cedo às 10:00 por motivos particulares. ADEMIR DA SILVA NEVES (#11418) deixou sua peça (Saw mesa) às 10:00 por prioridade e entregou a peça (Tw trave) do Airton.',
          timeline: [
            {
              id: `sim-${idx}-1`,
              time: '06:00',
              description: 'Entrou no posto de trabalho',
              type: 'entry',
            },
            {
              id: `sim-${idx}-2`,
              time: '08:00',
              description: 'Parou: Ponte rolante ocupada',
              type: 'stop',
            },
            {
              id: `sim-${idx}-3`,
              time: '08:30',
              description: 'Retomou produção (após parada: Ponte rolante ocupada · 30 min)',
              type: 'resume',
            },
            {
              id: `sim-${idx}-4`,
              time: '10:00',
              description:
                'Foi embora mais cedo (trabalhou das 06:00 às 10:00) — Motivo: Compromisso particular',
              type: 'early_exit',
            },
            {
              id: `sim-${idx}-5`,
              time: '10:00',
              description:
                'Remanejamento de prioridade: ADEMIR DA SILVA NEVES (#11418) saiu da peça "Saw mesa" às 10:00 para assumir e concluir "Tw trave"',
              type: 'reallocation',
            },
            {
              id: `sim-${idx}-6`,
              time: '12:00',
              description:
                'Peça prioritária (Tw trave) concluída e entregue por ADEMIR DA SILVA NEVES (#11418)',
              type: 'finish',
            },
          ],
        };
      }

      // 2. AGNALDO CESAR DA SILVA (Saw viga): Stopped by Ponte rolante ocupada
      if (r.chapa === '10859') {
        return {
          ...r,
          status: AttendanceStatus.Presente,
          operationalStatus: OperationalStatus.Parado,
          motivoParadaAtual: 'Ponte rolante ocupada',
          horaEntradaReal: '06:00',
          producedState: ProducedState.Parcial,
          delayMinutes: 40,
          productionJustification: 'Parada às 09:00: Ponte rolante ocupada',
          timeline: [
            {
              id: `sim-${idx}-1`,
              time: '06:00',
              description: 'Entrou no posto de trabalho',
              type: 'entry',
            },
            {
              id: `sim-${idx}-2`,
              time: '09:00',
              description: 'Parou: Ponte rolante ocupada',
              type: 'stop',
            },
          ],
        };
      }

      // 3. ALEX APARECIDO DOS SANTOS (Tw deck): Stopped by Ponte rolante ocupada & resumed
      if (r.chapa === '12480') {
        return {
          ...r,
          status: AttendanceStatus.Presente,
          operationalStatus: OperationalStatus.Soldando,
          horaEntradaReal: '06:00',
          producedState: ProducedState.Sim,
          qtyActual: 1,
          delayMinutes: 35,
          productionJustification: 'Parada às 07:30: Ponte rolante ocupada',
          timeline: [
            {
              id: `sim-${idx}-1`,
              time: '06:00',
              description: 'Entrou no posto de trabalho',
              type: 'entry',
            },
            {
              id: `sim-${idx}-2`,
              time: '07:30',
              description: 'Parou: Ponte rolante ocupada',
              type: 'stop',
            },
            {
              id: `sim-${idx}-3`,
              time: '08:05',
              description: 'Retomou produção (após parada: Ponte rolante ocupada · 35 min)',
              type: 'resume',
            },
            {
              id: `sim-${idx}-4`,
              time: '11:30',
              description: 'Peça finalizada (Tw deck)',
              type: 'finish',
            },
          ],
        };
      }

      // 4. ANDERSON SILVA FAUSTINO (Saw chassis PC): Stopped by Ponte rolante ocupada
      if (r.chapa === '11462') {
        return {
          ...r,
          status: AttendanceStatus.Presente,
          operationalStatus: OperationalStatus.Parado,
          motivoParadaAtual: 'Ponte rolante ocupada',
          horaEntradaReal: '06:00',
          producedState: ProducedState.Parcial,
          delayMinutes: 45,
          productionJustification: 'Parada às 09:30: Ponte rolante ocupada',
          timeline: [
            {
              id: `sim-${idx}-1`,
              time: '06:00',
              description: 'Entrou no posto de trabalho',
              type: 'entry',
            },
            {
              id: `sim-${idx}-2`,
              time: '09:30',
              description: 'Parou: Ponte rolante ocupada',
              type: 'stop',
            },
          ],
        };
      }

      // 5. BRUNO BORGES FERREIRA (Saw chassi PC): Stopped by Aguardando material
      if (r.chapa === '11372') {
        return {
          ...r,
          status: AttendanceStatus.Presente,
          operationalStatus: OperationalStatus.Parado,
          motivoParadaAtual: 'Aguardando material',
          horaEntradaReal: '06:00',
          producedState: ProducedState.Parcial,
          delayMinutes: 30,
          productionJustification: 'Parada às 08:30: Aguardando material',
          timeline: [
            {
              id: `sim-${idx}-1`,
              time: '06:00',
              description: 'Entrou no posto de trabalho',
              type: 'entry',
            },
            {
              id: `sim-${idx}-2`,
              time: '08:30',
              description: 'Parou: Aguardando material',
              type: 'stop',
            },
          ],
        };
      }

      // 6. EDJAN EDSON DE LIMA (Saw lança): Stopped by Manutenção máquina de solda
      if (r.chapa === '10870') {
        return {
          ...r,
          status: AttendanceStatus.Presente,
          operationalStatus: OperationalStatus.Soldando,
          horaEntradaReal: '06:00',
          producedState: ProducedState.Sim,
          qtyActual: 1,
          delayMinutes: 25,
          productionJustification: 'Parada às 07:00: Manutenção máquina de solda',
          timeline: [
            {
              id: `sim-${idx}-1`,
              time: '06:00',
              description: 'Entrou no posto de trabalho',
              type: 'entry',
            },
            {
              id: `sim-${idx}-2`,
              time: '07:00',
              description: 'Parou: Manutenção máquina de solda',
              type: 'stop',
            },
            {
              id: `sim-${idx}-3`,
              time: '07:25',
              description: 'Retomou produção (após parada: Manutenção máquina de solda · 25 min)',
              type: 'resume',
            },
          ],
        };
      }

      // 7. ABSENT WORKERS ON SATURDAY 03/10
      if (r.chapa === '10985') {
        return {
          ...r,
          status: AttendanceStatus.Ausente,
          operationalStatus: OperationalStatus.Ausente,
          motivoFalta: 'Falta injustificada',
          producedState: ProducedState.Nao,
          qtyActual: 0,
          absentPieceAction: AbsentPieceAction.AlocarOutro,
          reallocatedToWelder: 'RAFAEL DA SILVA (#11483)',
          timeline: [
            {
              id: `sim-${idx}-abs`,
              time: '06:00',
              description: 'Ausente no turno — Peça (Saw viga): Alocar outro soldador',
              type: 'absence',
            },
          ],
        };
      }

      if (r.chapa === '11597') {
        return {
          ...r,
          status: AttendanceStatus.Ausente,
          operationalStatus: OperationalStatus.Ausente,
          motivoFalta: 'Problema de transporte',
          producedState: ProducedState.Nao,
          qtyActual: 0,
          absentPieceAction: AbsentPieceAction.ProcessoParado,
          timeline: [
            {
              id: `sim-${idx}-abs`,
              time: '06:00',
              description: 'Ausente no turno — Peça (Saw chassi D61): Processo parado',
              type: 'absence',
            },
          ],
        };
      }

      if (r.chapa === '10749') {
        return {
          ...r,
          status: AttendanceStatus.Ausente,
          operationalStatus: OperationalStatus.Ausente,
          motivoFalta: 'Atestado médico',
          producedState: ProducedState.Nao,
          qtyActual: 0,
          absentPieceAction: AbsentPieceAction.AlocarOutro,
          reallocatedToWelder: 'JOAO NUNES DE MATOS (#8258)',
          timeline: [
            {
              id: `sim-${idx}-abs`,
              time: '06:00',
              description: 'Ausente no turno — Peça (Saw chassi WA): Alocar outro soldador',
              type: 'absence',
            },
          ],
        };
      }
    }

    // --- FRIDAY 02/10/2026 (18:40 - 20:40) ---
    if (r.data === '02/10/2026') {
      // AIRTON ACACIO DA SILVA (Tw trave D61) - Presente + Concluído
      if (r.chapa === '10922') {
        return {
          ...r,
          status: AttendanceStatus.Presente,
          operationalStatus: OperationalStatus.Finalizou,
          horaEntradaReal: '18:40',
          producedState: ProducedState.Sim,
          qtyActual: 1,
          timeline: [
            {
              id: `sim-${idx}-1`,
              time: '18:40',
              description: 'Entrou no posto de trabalho',
              type: 'entry',
            },
            {
              id: `sim-${idx}-2`,
              time: '20:30',
              description: 'Peça finalizada (Tw trave D61)',
              type: 'finish',
            },
          ],
        };
      }

      // ALEX CORDEIRO NEVES (Deck) - Faltou na Sexta e no Domingo (Reincidência!)
      if (r.chapa === '12443') {
        return {
          ...r,
          status: AttendanceStatus.Ausente,
          operationalStatus: OperationalStatus.Ausente,
          motivoFalta: 'Falta injustificada',
          producedState: ProducedState.Nao,
          qtyActual: 0,
          absentPieceAction: AbsentPieceAction.AlocarOutro,
          reallocatedToWelder: 'DANILO PEREIRA DE SOUZA (#12434)',
          timeline: [
            {
              id: `sim-${idx}-abs`,
              time: '18:40',
              description: 'Ausente no turno — Motivo: Falta injustificada',
              type: 'absence',
            },
          ],
        };
      }

      // ANDRE LUIZ DE OLIVEIRA (Saw viga do PC) - Parada por Ponte rolante ocupada
      if (r.chapa === '11093') {
        return {
          ...r,
          status: AttendanceStatus.Presente,
          operationalStatus: OperationalStatus.Soldando,
          horaEntradaReal: '18:40',
          producedState: ProducedState.Sim,
          qtyActual: 1,
          delayMinutes: 25,
          productionJustification: 'Parada às 19:10: Ponte rolante ocupada',
          timeline: [
            {
              id: `sim-${idx}-1`,
              time: '18:40',
              description: 'Entrou no posto de trabalho',
              type: 'entry',
            },
            {
              id: `sim-${idx}-2`,
              time: '19:10',
              description: 'Parou: Ponte rolante ocupada',
              type: 'stop',
            },
            {
              id: `sim-${idx}-3`,
              time: '19:35',
              description: 'Retomou produção (após parada: Ponte rolante ocupada · 25 min)',
              type: 'resume',
            },
            {
              id: `sim-${idx}-4`,
              time: '20:35',
              description: 'Peça finalizada (Saw viga do PC)',
              type: 'finish',
            },
          ],
        };
      }

      // DEIVID SAUL FREITAS SANTOS (Chassis PC) - Parada por Troca de arame / gás
      if (r.chapa === '11370') {
        return {
          ...r,
          status: AttendanceStatus.Presente,
          operationalStatus: OperationalStatus.Soldando,
          horaEntradaReal: '18:40',
          producedState: ProducedState.Sim,
          qtyActual: 1,
          delayMinutes: 20,
          productionJustification: 'Parada às 19:30: Troca de arame / gás',
          timeline: [
            {
              id: `sim-${idx}-1`,
              time: '18:40',
              description: 'Entrou no posto de trabalho',
              type: 'entry',
            },
            {
              id: `sim-${idx}-2`,
              time: '19:30',
              description: 'Parou: Troca de arame / gás',
              type: 'stop',
            },
            {
              id: `sim-${idx}-3`,
              time: '19:50',
              description: 'Retomou produção (após parada: Troca de arame / gás · 20 min)',
              type: 'resume',
            },
          ],
        };
      }

      // Mark several others on Friday as Presente & Concluído so Friday has realistic numbers
      if (idx < 26) {
        return {
          ...r,
          status: AttendanceStatus.Presente,
          operationalStatus: idx % 3 === 0 ? OperationalStatus.Finalizou : OperationalStatus.Soldando,
          horaEntradaReal: r.de,
          producedState: idx % 3 === 0 ? ProducedState.Sim : ProducedState.Parcial,
          qtyActual: idx % 3 === 0 ? 1 : 0,
          timeline: [
            {
              id: `sim-${idx}-entry`,
              time: r.de || '18:40',
              description: 'Entrou no posto de trabalho',
              type: 'entry',
            },
          ],
        };
      }
    }

    // --- SUNDAY 04/10/2026 ---
    if (r.data === '04/10/2026') {
      // ALEX CORDEIRO NEVES (#12443) - Faltou novamente no Domingo (2ª falta no fim de semana!)
      if (r.chapa === '12443') {
        return {
          ...r,
          status: AttendanceStatus.Ausente,
          operationalStatus: OperationalStatus.Ausente,
          motivoFalta: 'Desistiu da HE',
          producedState: ProducedState.Nao,
          qtyActual: 0,
          absentPieceAction: AbsentPieceAction.ProcessoParado,
          timeline: [
            {
              id: `sim-${idx}-abs`,
              time: '06:00',
              description: 'Ausente no turno — Motivo: Desistiu da HE (2ª falta no fim de semana)',
              type: 'absence',
            },
          ],
        };
      }

      // ANTONIO MARCOS DE ALMEIDA (#10832, Chassis D61) - Parada por Ponte rolante ocupada
      if (r.chapa === '10832') {
        return {
          ...r,
          status: AttendanceStatus.Presente,
          operationalStatus: OperationalStatus.Soldando,
          horaEntradaReal: '01:00',
          producedState: ProducedState.Sim,
          qtyActual: 1,
          delayMinutes: 30,
          productionJustification: 'Parada às 03:00: Ponte rolante ocupada',
          timeline: [
            {
              id: `sim-${idx}-1`,
              time: '01:00',
              description: 'Entrou no posto de trabalho',
              type: 'entry',
            },
            {
              id: `sim-${idx}-2`,
              time: '03:00',
              description: 'Parou: Ponte rolante ocupada',
              type: 'stop',
            },
            {
              id: `sim-${idx}-3`,
              time: '03:30',
              description: 'Retomou produção (após parada: Ponte rolante ocupada · 30 min)',
              type: 'resume',
            },
          ],
        };
      }
    }

    return r;
  });
}
