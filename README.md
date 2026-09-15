# Gastos do Motorista

App mobile-first para o motorista controlar **receitas e despesas** de fretes (caminhão e Fiorino).

## Funcionalidades

### Login e sessão
- Tela de login com a logo da marca (**Gastos do Motorista**)
- Autenticação por usuário e senha
- Sessão com token Bearer válido por **24 horas**, guardado no `localStorage`
- Ao reabrir o app, a sessão é restaurada automaticamente (se ainda válida)
- Botão **Sair** encerra a sessão no servidor e limpa o token local
- Mensagens de erro amigáveis (credenciais inválidas ou servidor offline)

### Início (caixa)
- Saldo líquido do período selecionado
- Cards de totais: **Receitas** e **Despesas**
- Contagem de lançamentos no período
- Lista dos **últimos 6 lançamentos**, com categoria, data, observação e valor
- Valores formatados em Real (R$)

### Lançamentos
- Lista completa de receitas e despesas do período
- Busca por **categoria** ou **observação**
- Filtros rápidos: Todos / Receitas / Despesas
- Toque em um item para **editar** ou **excluir**
- Estado vazio com orientação para usar o botão `+`

### Novo / editar lançamento (botão `+`)
- Formulário em bottom sheet
- Tipo: **Receita** ou **Despesa** (toggle)
- Campos: valor, categoria, data, forma de pagamento e observação (até 120 caracteres)
- Formas de pagamento: Pix, Dinheiro, Cartão, Outro
- Categorias de receita mudam conforme o tipo escolhido
- Salvar cria ou atualiza o lançamento
- Excluir remove o lançamento (na edição)

### Categorias de receita
- Frete caminhão
- Frete Fiorino
- Mudança / carga
- Diária
- Outras receitas

### Categorias de despesa
- Combustível
- Pedágio
- Manutenção
- Alimentação
- Estacionamento
- Lavagem
- Seguro
- Multa
- Outras despesas

### Filtro de período
- Disponível no topo em todas as telas autenticadas
- Ciclo ao tocar: **Hoje → Semana → Mês → Tudo**
- Semana considera segunda a domingo
- Mês usa o mês/ano correntes
- O filtro afeta Início, Lançamentos e Relatório

### Relatório
- Resultado líquido do período
- Totais de entradas e saídas
- Barras de **receitas por categoria**
- Barras de **despesas por categoria**

### Interface e experiência
- Layout pensado para celular (largura máx. ~480px)
- Navegação inferior: Início, Lançamentos, `+`, Relatório
- Paleta da marca: navy `#10253D` e amarelo `#FFB511` em fundo claro
- Toasts de confirmação (salvo, excluído, login, logout)
- Persistência local em arquivos JSON (sem banco externo)

## Requisitos

- [Node.js](https://nodejs.org/) 18 ou superior  
- Sem dependências npm — não precisa de `npm install`

## Como rodar

```bash
node server.js
```

Abra [http://localhost:3000](http://localhost:3000).

Outra porta:

```bash
PORT=4000 node server.js
```

### Acesso demo

| Usuário     | Senha |
|-------------|-------|
| `motorista` | `1234` |

## Estrutura

```
├── server.js              # API HTTP + arquivos estáticos
├── index.html
├── css/style.css
├── js/app.js
├── assets/logo.png
└── database/
    ├── users.json         # usuário do motorista
    ├── sessions.json      # sessões ativas
    └── transactions.json  # lançamentos
```

Os dados ficam em JSON na pasta `database/`. O processo do Node precisa de permissão de escrita nessa pasta.

## Deploy rápido (demo / VPS)

```bash
git clone <url-do-repositorio>
cd app-gastos-motorista
node server.js
```

Para manter rodando após fechar o SSH:

```bash
nohup node server.js > app.log 2>&1 &
```

Acesse `http://IP-DA-VPS:3000` (libere a porta 3000 no firewall).

## API

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `POST` | `/api/login` | Não | Login |
| `POST` | `/api/logout` | Sim | Logout |
| `GET` | `/api/data` | Sim | Usuário + lançamentos |
| `POST` | `/api/transactions` | Sim | Criar lançamento |
| `PUT` | `/api/transactions/:id` | Sim | Atualizar |
| `DELETE` | `/api/transactions/:id` | Sim | Excluir |

Autenticação: header `Authorization: Bearer <token>`.
