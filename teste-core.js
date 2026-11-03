// Teste do pontos-core.js em Node (sem DOM)
global.document = { addEventListener: () => {} };

const fs = require("fs");
const caminho = process.argv[2] || "./pontos-core.js";
const codigoCore = fs.readFileSync(caminho, "utf-8");
eval(codigoCore);

let pass = 0, fail = 0;
function teste(nome, condicao, detalhes = "") {
  if (condicao) { pass++; console.log(`✅ ${nome}`); }
  else { fail++; console.log(`❌ ${nome} ${detalhes}`); }
}
function grupo(t) { console.log(`\n=== ${t} ===`); }

const DATA_TESTE = "2026-07-28";
const diasUteisJul2026 = [1,2,3, 6,7,8,9,10, 13,14,15,16,17, 20,21,22,23,24, 27,28,29,30,31];

// Testes resumidos (checa o essencial)
grupo("1. Cálculo básico (8h com almoço)");
const regs1 = [
  { userId: "u1", data: DATA_TESTE, hora: "08:00:00", tipo: "E" },
  { userId: "u1", data: DATA_TESTE, hora: "12:00:00", tipo: "S" },
  { userId: "u1", data: DATA_TESTE, hora: "13:00:00", tipo: "E" },
  { userId: "u1", data: DATA_TESTE, hora: "17:00:00", tipo: "S" },
];
teste("4h + 4h = 480 min", calcularMinutosTrabalhados(regs1, "u1", DATA_TESTE) === 480);

grupo("2. Saldo do dia");
teste("8h trab + jornada 8h = 0", calcularResumoDia(regs1, [], { u1: { jornadaDiaria: 8 } }, "u1", DATA_TESTE).saldo === 0);

const regsHE = [...regs1, { userId: "u1", data: DATA_TESTE, hora: "18:00:00", tipo: "E" }, { userId: "u1", data: DATA_TESTE, hora: "19:00:00", tipo: "S" }];
teste("9h trab + jornada 8h = +1h (60 min)", calcularResumoDia(regsHE, [], { u1: { jornadaDiaria: 8 } }, "u1", DATA_TESTE).saldo === 60);

grupo("3. Atestado e Abono cobrem ausência");
const ocsAt4 = [{ id: "oc1", userId: "u1", tipo: "atestado", dataInicio: DATA_TESTE, dataFim: DATA_TESTE, horasConsideradas: 4 }];
const rAt = calcularResumoDia(regs1.filter(r => r.hora >= "13:00:00"), ocsAt4, { u1: { jornadaDiaria: 8 } }, "u1", DATA_TESTE);
teste("4h trab + 4h atestado = 0", rAt.saldo === 0);

grupo("4. Faltas geram saldo negativo");
teste("Sem batida, sem ocorrência = -8h", calcularResumoDia([], [], { u1: { jornadaDiaria: 8 } }, "u1", DATA_TESTE).saldo === -480);

grupo("5. Férias zera a jornada");
const ocsFerias = [{ id: "oc2", userId: "u1", tipo: "ferias", dataInicio: DATA_TESTE, dataFim: "2026-08-01" }];
teste("Férias = saldo 0 mesmo sem batida", calcularResumoDia([], ocsFerias, { u1: { jornadaDiaria: 8 } }, "u1", DATA_TESTE).saldo === 0);

grupo("6. Mês cheio (julho/2026) — 23 dias úteis × 8h = saldo 0");
const regsMes = [];
for (const dia of diasUteisJul2026) {
  const data = `2026-07-${String(dia).padStart(2,"0")}`;
  regsMes.push(
    { userId: "u1", data, hora: "08:00:00", tipo: "E" },
    { userId: "u1", data, hora: "12:00:00", tipo: "S" },
    { userId: "u1", data, hora: "13:00:00", tipo: "E" },
    { userId: "u1", data, hora: "17:00:00", tipo: "S" }
  );
}
const rMes = calcularResumoPeriodo(regsMes, [], { u1: { jornadaDiaria: 8 } }, "u1", "2026-07-01", "2026-07-31");
teste("Total = 23 × 480 = 11040", rMes.totalTrabalhado === 11040);
teste("Saldo = 0", rMes.saldo === 0);
teste("23 dias úteis", rMes.diasUteis === 23);

console.log(`\n=== RESULTADO ===`);
console.log(`${pass} testes passaram · ${fail} falharam`);
process.exit(fail === 0 ? 0 : 1);
