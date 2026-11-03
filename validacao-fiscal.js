// ============================================================
// validacao-fiscal.js — validação de CPF/CNPJ (dígito verificador,
// cálculo matemático local, sem depender de nenhuma API) e busca
// automática de dados de empresa via BrasilAPI (gratuita, sem
// necessidade de chave/token — https://brasilapi.com.br).
//
// IMPORTANTE: a BrasilAPI devolve dados cadastrais da Receita
// Federal (razão social, endereço, situação cadastral) — ela NÃO
// devolve Inscrição Estadual (isso é controlado por cada estado,
// não pela Receita) nem dados de CPF (pessoa física não tem
// consulta pública, por proteção de dados pessoais).
// ============================================================

function somenteDigitos(valor) {
  return (valor || "").replace(/\D/g, "");
}

function validarCPF(cpfBruto) {
  const cpf = somenteDigitos(cpfBruto);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i], 10) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== parseInt(cpf[9], 10)) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i], 10) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  return resto === parseInt(cpf[10], 10);
}

function validarCNPJ(cnpjBruto) {
  const cnpj = somenteDigitos(cnpjBruto);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

  const calcularDigito = (base) => {
    const pesos = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += parseInt(base[i], 10) * pesos[i];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const dv1 = calcularDigito(cnpj.slice(0, 12));
  const dv2 = calcularDigito(cnpj.slice(0, 12) + dv1);
  return parseInt(cnpj[12], 10) === dv1 && parseInt(cnpj[13], 10) === dv2;
}

// Valida CPF (11 dígitos) ou CNPJ (14 dígitos) automaticamente,
// conforme o tamanho do documento informado.
function validarDocumento(valor) {
  const digitos = somenteDigitos(valor);
  if (digitos.length === 11) return validarCPF(digitos);
  if (digitos.length === 14) return validarCNPJ(digitos);
  return false;
}

function formatarCNPJ(cnpj) {
  const d = somenteDigitos(cnpj);
  if (d.length !== 14) return cnpj;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`;
}

function formatarCPF(cpf) {
  const d = somenteDigitos(cpf);
  if (d.length !== 11) return cpf;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9,11)}`;
}

// Busca dados cadastrais de uma empresa na BrasilAPI a partir do CNPJ.
// Retorna { ok: true, dados: {...} } ou { ok: false, erro: "..." }.
async function buscarCnpjNaBrasilApi(cnpj) {
  const digitos = somenteDigitos(cnpj);
  if (digitos.length !== 14) return { ok: false, erro: "CNPJ precisa ter 14 dígitos." };
  if (!validarCNPJ(digitos)) return { ok: false, erro: "CNPJ com dígito verificador inválido — confira se digitou certo." };

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digitos}`);
    if (!res.ok) {
      if (res.status === 404) return { ok: false, erro: "CNPJ não encontrado na base da Receita Federal." };
      return { ok: false, erro: `Não foi possível consultar agora (erro ${res.status}). Preencha manualmente.` };
    }
    const dados = await res.json();
    return {
      ok: true,
      dados: {
        nome: dados.razao_social || "",
        nomeFantasia: dados.nome_fantasia || "",
        cep: dados.cep || "",
        logradouro: dados.logradouro || "",
        numero: dados.numero || "",
        complemento: dados.complemento || "",
        bairro: dados.bairro || "",
        cidade: dados.municipio || "",
        uf: dados.uf || "",
        telefone: dados.ddd_telefone_1 || "",
        email: dados.email || "",
        situacaoCadastral: dados.descricao_situacao_cadastral || "",
      },
    };
  } catch (e) {
    return { ok: false, erro: "Falha de conexão ao consultar o CNPJ. Preencha manualmente." };
  }
}