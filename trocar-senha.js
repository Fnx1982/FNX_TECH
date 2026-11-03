// ============================================================
// trocar-senha.js — tela obrigatória exibida logo após login com
// senha temporária (gerada pela recuperação de senha).
// ============================================================

async function trocarSenha() {
  const novaSenha = document.getElementById("novaSenha").value;
  const confirmarSenha = document.getElementById("confirmarSenha").value;
  const mensagemErro = document.getElementById("mensagemErroTroca");
  mensagemErro.style.display = "none";

  if (novaSenha.length < 8) {
    mensagemErro.textContent = "A senha precisa ter pelo menos 8 caracteres.";
    mensagemErro.style.display = "block";
    return;
  }
  if (novaSenha !== confirmarSenha) {
    mensagemErro.textContent = "As duas senhas digitadas são diferentes.";
    mensagemErro.style.display = "block";
    return;
  }

  const botao = document.querySelector("button.login");
  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Salvando...";

  try {
    const resposta = await apiTrocarSenhaPrimeiroAcesso(novaSenha);
    if (!resposta.ok) {
      mensagemErro.textContent = resposta.erro || "Erro ao trocar a senha.";
      mensagemErro.style.display = "block";
      return;
    }
    navegarTrocarSenha("home.html");
  } catch (e) {
    mensagemErro.textContent = "Não foi possível conectar ao servidor.";
    mensagemErro.style.display = "block";
  } finally {
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
}

function navegarTrocarSenha(url) {
  window.location.href = url;
}