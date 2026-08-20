-- Codex integration tokens remain valid until the user explicitly revokes them.
alter table public.integration_tokens
  alter column expires_at drop default,
  alter column expires_at drop not null;

update public.integration_tokens
set expires_at = null
where expires_at is not null;
