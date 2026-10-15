# Studio KS

Sistema de gestão de clientes, serviços e finanças com React e SQLite local.

## Rodar no computador

Requer Node.js 24 ou superior.

```sh
npm ci
npm run dev
```

Abra http://127.0.0.1:5173 e mantenha o processo aberto. Na primeira abertura, crie o usuário e a senha pela tela de configuração.

O banco é criado em `data/studio.sqlite`. Esta versão pública inicia sem clientes ou lançamentos. Bancos de dados, senhas, sessões, planilhas privadas e o histórico anterior não fazem parte deste repositório.

Para compilar: `npm run build`. Para executar a versão compilada: `npm start` (porta 3000 por padrão; configurável pela variável PORT).

Os dados ficam no computador que executa a aplicação. Não há sincronização automática entre instalações.
