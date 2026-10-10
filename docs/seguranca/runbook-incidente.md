# Runbook de incidente (esqueleto)

> Esqueleto criado na Fase 0. Será completado nas fases seguintes, conforme surgirem
> banco de dados, worker e alertas.

## 1. Reconhecer

Exemplos de incidente: acesso indevido a uma conta, vazamento de dados de um escritório
para outro, segredo (senha SMTP, chave de API) exposto, falha da vigília sem aviso,
intimação perdida.

## 2. Conter

- Segredo exposto: troque-o no provedor (SMTP, Resend, banco) e atualize a variável de
  ambiente no servidor. Nunca grave segredo no repositório.
- Conta comprometida: encerre as sessões do usuário (Minha conta › Dispositivos) e force a
  troca de senha.
- Suspeita de vazamento entre escritórios: tire o app do ar até entender a causa.

## 3. Registrar

Anote em ordem: quando foi percebido, o que foi visto, quem foi afetado, o que foi feito.
Preserve a trilha de auditoria (`.data/auditoria/` hoje).

## 4. Comunicar

Vazamento de dados pessoais pode exigir comunicação à ANPD e aos titulares (LGPD, art. 48).
Avalie com um advogado.

## 5. Corrigir e aprender

Corrija a causa por PR, com teste que reproduza o problema, e registre o aprendizado
em `docs/decisoes/` se mudar alguma regra.
