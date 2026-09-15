# Vínculos empregatícios por CPF na LEXOFFICE

## Objetivo
Disponibilizar em Investigações e Consultas uma pesquisa de vínculos empregatícios por CPF sem apresentar como consulta automática aquilo que não está autorizado pela fonte.

## Fontes oficiais verificadas em 15/09/2026

### Extrato de vínculos do CAGED
O serviço oficial do MTE permite ao próprio trabalhador obter seus vínculos via CTPS Digital/Emprega Brasil. O canal de Protocolo do MTE também atende Tribunais de Justiça, por intermédio de servidores de Varas/Secretarias, e Defensoria Pública para solicitações de vínculos e endereço do empregador.

Página oficial: https://www.gov.br/pt-br/servicos/solicitar-vinculos-empregaticios-do-caged

### Bases identificadas RAIS/CAGED
O MTE prevê acesso a bases identificadas mediante instrumento de cooperação e finalidade legal compatível. O uso de informações pessoais por terceiros depende das hipóteses legais aplicáveis e de compromissos de sigilo.

Página oficial: https://www.gov.br/pt-br/servicos/solicitar-acesso-aos-dados-identificados-rais-e-caged

### Microdados públicos
Os microdados públicos são não identificados e não devem ser tratados como fonte de consulta individual por CPF.

Página oficial: https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/acoes-e-programas/programas-projetos-acoes-obras-e-atividades/estatisticas-trabalho/microdados-rais-e-caged

## Arquitetura da LEXOFFICE
1. Card `Vínculos empregatícios por CPF` na categoria Trabalhista.
2. Entrada obrigatória em CPF.
3. O motor tenta somente provedores/integrações identificadas e autorizadas que venham a ser configuradas.
4. Na ausência de credencial autorizada, retorna estado `provider_required`, com orientação para obtenção oficial do extrato ou requisição judicial.
5. Nunca pesquisar CPF nos microdados públicos desidentificados.
6. Quando houver fonte autorizada, normalizar resposta em: empregador, CNPJ, data de admissão, data de desligamento, situação do vínculo, cargo/CBO, remuneração quando legalmente disponível, fonte e data da consulta.
7. Permitir relatório PDF e registro da fonte/data da pesquisa.

## Segurança
A consulta deve permanecer autenticada e vinculada à organização do usuário. Não registrar credenciais de provedor no frontend. Segredos ficam apenas no backend/Supabase.