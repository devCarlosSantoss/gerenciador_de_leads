# Backup e Restauração - Leads Pro (PostgreSQL/Neon)

## Backup Automático (cron)

### Diário (02:00)
```bash
# Adicionar ao crontab: 0 2 * * * /caminho/backup-daily.sh
```

```bash
#!/bin/bash
# backup-daily.sh
set -e

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/leads-pro"
DB_URL="postgresql://user:pass@host:5432/dbname?schema=public"

mkdir -p "$BACKUP_DIR"

# Backup completo (schema + dados)
pg_dump "$DB_URL" \
  --no-owner \
  --no-privileges \
  --format=custom \
  --compress=9 \
  --file="$BACKUP_DIR/leads-pro_$DATE.dump"

# Manter apenas últimos 30 dias
find "$BACKUP_DIR" -name "leads-pro_*.dump" -mtime +30 -delete

echo "Backup concluído: leads-pro_$DATE.dump"
```

### Semanal (domingo 03:00) - Backup lógico (SQL)
```bash
#!/bin/bash
# backup-weekly-sql.sh
DATE=$(date +%Y%m%d)
pg_dump "$DB_URL" --no-owner --no-privileges > "/backups/leads-pro/leads-pro_$DATE.sql"
gzip "/backups/leads-pro/leads-pro_$DATE.sql"
```

---

## Restauração

### Opção 1: Restore completo (produção)
```bash
# Parar aplicação
pm2 stop leads-pro-backend

# Restaurar
pg_restore --clean --if-exists --no-owner --no-privileges \
  -d "$DB_URL" \
  /backups/leads-pro/leads-pro_20260814_020000.dump

# Reiniciar
pm2 start leads-pro-backend
```

### Opção 2: Restore em banco novo (staging/teste)
```bash
# Criar banco vazio
createdb leads_pro_staging

# Restaurar
pg_restore --clean --if-exists --no-owner --no-privileges \
  -d postgresql://user:pass@host:5432/leads_pro_staging \
  /backups/leads-pro/leads-pro_20260814_020000.dump
```

### Opção 3: Restore parcial (apenas dados, mantém schema atual)
```bash
pg_restore --data-only --no-owner --no-privileges \
  -d "$DB_URL" \
  /backups/leads-pro/leads-pro_20260814_020000.dump
```

---

## Verificação de Integridade

```bash
# Testar restore em banco temporário
createdb leads_pro_test_restore
pg_restore -d leads_pro_test_restore /backups/leads-pro/leads-pro_latest.dump

# Contar registros principais
psql -d leads_pro_test_restore -c "
  SELECT 'leads' as tabela, count(*) FROM lead
  UNION ALL SELECT 'contacts', count(*) FROM lead_contact
  UNION ALL SELECT 'websites', count(*) FROM lead_website
  UNION ALL SELECT 'analysis_runs', count(*) FROM analysis_run
  UNION ALL SELECT 'messages', count(*) FROM message_draft
  UNION ALL SELECT 'suppressions', count(*) FROM suppression_list
  UNION ALL SELECT 'tasks', count(*) FROM task;
"

# Limpar
dropdb leads_pro_test_restore
```

---

## Variáveis de Ambiente Necessárias

```env
# .env.backup
DB_URL="postgresql://user:pass@host:5432/dbname?schema=public"
BACKUP_DIR="/backups/leads-pro"
RETENTION_DAYS=30
```

---

## Monitoramento

- Logar sucesso/falha em `/var/log/leads-pro-backup.log`
- Alertar (email/Slack) se backup falhar por 2 dias consecutivos
- Verificar tamanho do dump (deve crescer gradualmente, não zerar)

---

## Checklist Pós-Restore

- [ ] Aplicação inicia sem erros
- [ ] Login funciona (usuário admin existe)
- [ ] Leads listam corretamente
- [ ] Análise de um lead funciona
- [ ] Geração de mensagem funciona
- [ ] Link WhatsApp abre corretamente
- [ ] Opt-out bloqueia contato