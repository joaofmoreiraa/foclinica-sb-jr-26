# Foclínica

Site da clínica **Foclínica** com o slogan **"Foca na saúde"** e mascote foca 🦭.

Este projeto usa:

- React + Vite
- Supabase Auth
- Supabase Postgres com Row Level Security
- Deploy estático na Vercel

## Funcionalidades implementadas

### Autenticação

- Login
- Logout
- Cadastro com nome, e-mail, telefone, senha e papel:
  - Paciente
  - Médico, com seleção de áreas
  - Atendente

### Paciente

- Visualiza horários disponíveis
- Filtra por especialidade
- Solicita agendamento
- Cancela agendamento
- Solicita reagendamento com base em horários disponíveis

### Médico

- Visualiza horários ocupados com pacientes
- Filtra por área médica
- Solicita cancelamento de horário

### Atendente

- Visualiza horários marcados
- Filtra por área
- Aceita ou rejeita agendamentos
- Aceita ou rejeita reagendamentos
- Aceita ou rejeita cancelamento solicitado por médico
- Adiciona novos horários e associa a médicos

## Áreas disponíveis

- Dermatologia
- Cardiologia
- Pediatria
- Veterinária (apenas focas)
- Urologia
- Nutrição
- Ortopedia
- Oftalmologia

## Como rodar localmente

1. Instale as dependências:

```bash
npm install
```

2. Crie um projeto no Supabase.

3. Abra o **SQL Editor** no Supabase e execute todo o conteúdo de:

```text
sql/schema.sql
```

4. Copie o arquivo de ambiente:

```bash
cp .env.example .env.local
```

5. Preencha as variáveis no `.env.local`:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON_PUBLIC
```

6. Rode o projeto:

```bash
npm run dev
```

7. Acesse o endereço exibido no terminal, geralmente:

```text
http://localhost:5173
```

## Configuração recomendada no Supabase

Para testes em sala/aula/protótipo, você pode desativar confirmação de e-mail em:

```text
Authentication > Providers > Email > Confirm email
```

Se deixar a confirmação ativa, o cadastro será criado, mas o usuário precisará confirmar o e-mail antes de entrar.

## Como fazer o deploy na Vercel

1. Suba este projeto para um repositório no GitHub.
2. Na Vercel, clique em **Add New Project**.
3. Importe o repositório.
4. Em **Environment Variables**, adicione:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON_PUBLIC
```

5. Faça o deploy.

O arquivo `vercel.json` já inclui a regra de fallback necessária para rotas do app React.

## Observações importantes

- O projeto já vem com políticas RLS para limitar permissões por papel.
- A atendente é o papel com permissão para criar horários e aprovar/rejeitar solicitações.
- Um horário fica indisponível enquanto há agendamento pendente, confirmado ou em solicitação de reagendamento/cancelamento.
- Para produção real, recomenda-se adicionar notificações por e-mail/WhatsApp, auditoria, logs, validação de CPF/CRM, horários com duração configurável e tela administrativa para editar perfis.
