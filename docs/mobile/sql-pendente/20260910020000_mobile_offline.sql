-- Additive migration. Apply after the existing schema, using Supabase SQL Editor
-- or the CLI. No existing business data is deleted or rewritten.
begin;

create table if not exists public.mobile_sync_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);
alter table public.mobile_sync_receipts enable row level security;
revoke all on public.mobile_sync_receipts from anon, authenticated;

-- Username lookup returns only the email needed by password authentication.
-- It does not authenticate, create a session, or return profile data.
create or replace function public.mobile_login_email(p_usuario text)
returns text language sql stable security definer set search_path = '' as $$
  select p.email from public.profiles p
  where p.usuario = lower(trim(p_usuario)) and p.ativo = true limit 1;
$$;
revoke all on function public.mobile_login_email(text) from public;
grant execute on function public.mobile_login_email(text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprovantes', 'comprovantes', false, 13631488,
  array['image/jpeg','image/png','image/gif','image/webp','application/pdf'])
on conflict (id) do nothing;

-- Independent names preserve policies already installed for the web app.
drop policy if exists mobile_receipt_insert on storage.objects;
create policy mobile_receipt_insert on storage.objects for insert to authenticated
with check (bucket_id = 'comprovantes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.profiles where id = (select auth.uid()) and ativo));
drop policy if exists mobile_receipt_select on storage.objects;
create policy mobile_receipt_select on storage.objects for select to authenticated
using (bucket_id = 'comprovantes'
  and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Same odometer window used by lib/consumo-frota.ts, now evaluated on the
-- server for mobile writes. Never accepts calculated metrics from the APK.
create or replace function public.mobile_refresh_fleet(p_frota uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_last public.despesas%rowtype;
  v_previous numeric;
  v_actual numeric;
  v_expected numeric;
  v_ratio numeric;
  v_alert text;
begin
  if exists (select 1 from public.controle_km where frota_id = p_frota and status = 'aberto') then return; end if;
  select * into v_last from public.despesas where frota_id = p_frota and litros_abastecidos > 0 and km_atual > 0
    order by km_atual desc, id limit 1;
  select km_atual into v_previous from public.despesas where frota_id = p_frota and litros_abastecidos > 0 and km_atual > 0
    order by km_atual desc, id offset 1 limit 1;
  if v_previous is null or v_last.km_atual <= v_previous then return; end if;
  v_expected := v_last.km_atual - v_previous;
  select coalesce(sum(greatest(0,coalesce(km_percorrido,km_final-km_inicial))),0) into v_actual
    from public.controle_km where frota_id = p_frota and status = 'finalizado'
      and km_inicial >= v_previous and km_final <= v_last.km_atual;
  v_ratio := round(v_actual/v_expected,4);
  v_alert := p_frota::text || '_' || v_last.data_despesa::text;
  if not exists (select 1 from public.alertas_consumo where id = v_alert and not ativo and resolvido_por is not null and resolvido_em is not null) then
    insert into public.alertas_consumo(id,frota_id,placa,modelo,data,litros,km_apontado,km_esperado,percentual,valor,ativo)
      select v_alert,id,placa,modelo,v_last.data_despesa,v_last.litros_abastecidos,v_actual,v_expected,v_ratio,v_last.valor,v_ratio < 0.8
      from public.frotas where id = p_frota
    on conflict(id) do update set km_apontado = excluded.km_apontado,km_esperado = excluded.km_esperado,
      percentual = excluded.percentual,ativo = excluded.ativo,updated_at = now();
  end if;
  update public.frotas set ultimo_calculo_em = now(),ultimo_calculo_km_apontado = v_actual,
    ultimo_calculo_km_esperado = v_expected,ultimo_calculo_percentual = v_ratio,
    alerta_ativo = exists(select 1 from public.alertas_consumo where frota_id = p_frota and ativo)
    where id = p_frota;
end;
$$;
revoke all on function public.mobile_refresh_fleet(uuid) from public,anon,authenticated;

-- Privileged body, narrow API: auth.uid determines ownership; no actor, approval,
-- ERP, reimbursement or arbitrary column is accepted from the device.
-- Receipt and business mutations commit together. Replays return the same result.
create or replace function public.mobile_apply_operation(
  p_operation_id uuid, p_kind text, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_receipt public.mobile_sync_receipts%rowtype;
  v_tipo public.tipos_despesa%rowtype;
  v_km public.controle_km%rowtype;
  v_id uuid;
  v_frota uuid;
  v_card uuid;
  v_payment text;
  v_total numeric;
  v_cents bigint;
  v_parts integer;
  v_i integer;
  v_value numeric;
  v_date date;
  v_due date;
  v_days integer;
  v_auto boolean;
  v_count integer;
  v_send boolean;
  v_start timestamptz;
  v_end timestamptz;
  v_initial numeric;
  v_final numeric;
  v_path text;
  v_row public.despesas%rowtype;
  v_rows jsonb := '[]'::jsonb;
  v_result jsonb;
  v_envelope jsonb := jsonb_build_object('kind',p_kind,'data',p_payload);
begin
  if v_user is null then raise exception 'Sessão expirada. Entre novamente.' using errcode = '28000'; end if;
  select * into v_profile from public.profiles where id = v_user;
  if not found or not v_profile.ativo then raise exception 'Usuário inativo ou sem perfil.' using errcode = '42501'; end if;
  if v_profile.primeiro_acesso then raise exception 'Altere sua senha antes de sincronizar.' using errcode = '42501'; end if;
  if p_operation_id is null or p_payload is null then raise exception 'Operação inválida.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mobile-user:' || v_user::text,0));
  select * into v_receipt from public.mobile_sync_receipts
    where user_id = v_user and operation_id = p_operation_id;
  if found then
    if v_receipt.payload <> v_envelope then raise exception 'Identificador reutilizado com dados diferentes.'; end if;
    return v_receipt.result;
  end if;
  v_id := (p_payload->>'id')::uuid;
  if v_id is null then raise exception 'Identificador do registro ausente.'; end if;

  if p_kind = 'expense.create' then
    select * into v_tipo from public.tipos_despesa where id = (p_payload->>'tipo_despesa_id')::uuid and ativo;
    if not found then raise exception 'Tipo de despesa indisponível. Atualize os cadastros.'; end if;
    v_total := (p_payload->>'valor')::numeric;
    v_parts := coalesce((p_payload->>'numero_parcelas')::integer,1);
    v_date := (p_payload->>'data_despesa')::date;
    v_due := coalesce((p_payload->>'data_vencimento')::date,v_date);
    v_payment := p_payload->>'pagamento_tipo';
    v_card := nullif(p_payload->>'cartao_id','')::uuid;
    v_frota := nullif(p_payload->>'frota_id','')::uuid;
    v_send := coalesce((p_payload->>'enviar')::boolean,true);
    if v_total is null or v_total <= 0 or v_total > 9999999999.99 or v_total <> round(v_total,2)
      or v_parts not between 1 and 48 or v_date is null or v_due is null
      or v_payment is null or v_payment not in ('cartao','dinheiro','faturado','boleto')
      or coalesce(trim(p_payload->>'documento'),'') = '' then
      raise exception 'Valor, parcelas, datas, documento ou pagamento inválidos.';
    end if;
    v_cents := (v_total * 100)::bigint;
    if v_cents < v_parts then raise exception 'O valor não permite parcelas de pelo menos um centavo.'; end if;
    if v_payment = 'cartao' then
      if not exists (select 1 from public.cartoes where id = v_card and user_id = v_user and ativo) then
        raise exception 'Cartão inválido ou de outro usuário.';
      end if;
    else v_card := null;
    end if;
    v_path := nullif(p_payload->>'comprovante_path','');
    if v_tipo.exige_comprovante and v_path is null then raise exception 'O tipo de despesa exige comprovante.'; end if;
    if v_path is not null then
      if split_part(v_path,'/',1) <> v_user::text
        or split_part(v_path,'/',2) <> p_operation_id::text
        or not exists (select 1 from storage.objects where bucket_id = 'comprovantes' and name = v_path)
        or nullif(p_payload->>'comprovante_url','') is null
        or position('/storage/v1/object/sign/comprovantes/' || v_path || '?' in (p_payload->>'comprovante_url')) = 0 then
        raise exception 'Comprovante ausente ou pertencente a outra operação.';
      end if;
    end if;
    v_days := null;
    if v_tipo.calcula_diarias then
      v_days := (p_payload->>'data_checkout')::date - (p_payload->>'data_checkin')::date;
      if v_days is null or v_days <= 0 then raise exception 'Informe check-in e check-out válidos.'; end if;
    end if;
    if lower(v_tipo.nome) like '%combust%' then
      if v_frota is null or not exists (select 1 from public.frotas where id = v_frota and ativo)
        or coalesce((p_payload->>'km_atual')::numeric,-1) < 0
        or coalesce((p_payload->>'litros_abastecidos')::numeric,0) <= 0
        or coalesce((p_payload->>'valor_litro')::numeric,0) <= 0
        or coalesce(p_payload->>'tipo_combustivel','') = '' then
        raise exception 'Dados de abastecimento inválidos.';
      end if;
    else v_frota := null;
    end if;
    -- Total of the purchase (not the first installment) governs approval.
    v_auto := v_send and v_tipo.limite_maximo is not null
      and v_total / coalesce(v_days,1) <= v_tipo.limite_maximo;
    if v_tipo.limite_maximo is not null and v_total / coalesce(v_days,1) > v_tipo.limite_maximo
      and coalesce(trim(p_payload->>'observacao'),'') = '' then
      raise exception 'Informe a justificativa para o valor acima do limite.';
    end if;
    if v_auto and v_tipo.limite_ocorrencias_diarias is not null then
      select count(distinct coalesce(grupo_parcela_id,id)) into v_count from public.despesas
        where tecnico_id = v_user and tipo_despesa_id = v_tipo.id and data_despesa = v_date
          and status_aprovacao = 'AprovadoGestor';
      v_auto := v_count < v_tipo.limite_ocorrencias_diarias;
    end if;
    for v_i in 1..v_parts loop
      v_value := ((v_cents / v_parts) + case when v_i <= (v_cents % v_parts) then 1 else 0 end)::numeric / 100;
      insert into public.despesas (
        id,tecnico_id,tipo_despesa_id,cartao_id,cliente,numero_os,valor,documento,observacao,
        data_despesa,hora_despesa,data_vencimento,pagamento_tipo,
        comprovante_nome,comprovante_url,data_checkin,data_checkout,numero_diarias,
        frota_id,km_atual,litros_abastecidos,valor_litro,tipo_combustivel,
        parcelado,numero_parcelas,parcela_atual,grupo_parcela_id,
        status_aprovacao,status_erp,data_envio,data_aprovacao
      ) values (
        case when v_i = 1 then v_id else gen_random_uuid() end,v_user,v_tipo.id,v_card,
        coalesce(p_payload->>'cliente',''),coalesce(p_payload->>'numero_os',''),v_value,
        p_payload->>'documento',p_payload->>'observacao',v_date,p_payload->>'hora_despesa',
        (v_due + make_interval(months => v_i - 1))::date,v_payment,
        p_payload->>'comprovante_nome',p_payload->>'comprovante_url',
        case when v_days is not null then (p_payload->>'data_checkin')::date end,
        case when v_days is not null then (p_payload->>'data_checkout')::date end,v_days,
        v_frota,case when v_frota is not null then (p_payload->>'km_atual')::numeric end,
        -- Only the first installment represents a physical refueling.
        case when v_frota is not null and v_i = 1 then (p_payload->>'litros_abastecidos')::numeric end,
        case when v_frota is not null and v_i = 1 then (p_payload->>'valor_litro')::numeric end,
        case when v_frota is not null and v_i = 1 then p_payload->>'tipo_combustivel' end,
        v_parts > 1,v_parts,v_i,case when v_parts > 1 then v_id end,
        case when v_auto then 'AprovadoGestor' else 'AguardandoGestor' end,
        case when not v_send then 'Rascunho' when v_auto then 'AprovadoGestorERPAtualizado' else 'EnviadoAguardandoGestor' end,
        case when v_send then now() end,case when v_auto then now() end
      ) returning * into v_row;
      v_rows := v_rows || jsonb_build_array(to_jsonb(v_row));
    end loop;
    if v_frota is not null then
      update public.frotas set quilometragem = greatest(quilometragem,(p_payload->>'km_atual')::numeric),
        km_atualizado_em = now(),updated_at = now() where id = v_frota;
      perform public.mobile_refresh_fleet(v_frota);
    end if;
    v_result := jsonb_build_object('expenses',v_rows);
  elsif p_kind = 'km.start' then
    v_frota := (p_payload->>'frota_id')::uuid;
    v_initial := (p_payload->>'km_inicial')::numeric;
    v_start := (p_payload->>'data_inicio')::timestamptz;
    if v_frota is null or v_initial is null or v_initial < 0 or v_initial > 999999999
      or v_initial <> trunc(v_initial) or v_start is null or v_start > now() + interval '10 minutes' then
      raise exception 'Veículo, horário ou KM inicial inválido.';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mobile-fleet:' || v_frota::text,0));
    if not exists (select 1 from public.frotas where id = v_frota and ativo) then raise exception 'Veículo inativo ou inexistente.'; end if;
    if exists (select 1 from public.controle_km where status = 'aberto' and (usuario_id = v_user or frota_id = v_frota)) then
      raise exception 'Conflito: já existe viagem aberta para você ou para este veículo. Confira com o gestor.';
    end if;
    insert into public.controle_km (id,usuario_id,frota_id,km_inicial,data_inicio,destino,motivo,observacao,status)
      values (v_id,v_user,v_frota,v_initial,v_start,p_payload->>'destino',p_payload->>'motivo',p_payload->>'observacao','aberto')
      returning * into v_km;
    update public.frotas set quilometragem = greatest(quilometragem,v_initial),km_atualizado_em = now(),updated_at = now() where id = v_frota;
    v_result := jsonb_build_object('trip',to_jsonb(v_km));
  elsif p_kind = 'km.finish' then
    select * into v_km from public.controle_km where id = v_id and usuario_id = v_user for update;
    if not found then raise exception 'Viagem não encontrada para este usuário.'; end if;
    if v_km.status <> 'aberto' or v_km.km_inicial is distinct from (p_payload->>'km_inicial')::numeric
      or v_km.data_inicio is distinct from (p_payload->>'data_inicio')::timestamptz then
      raise exception 'Conflito: a viagem foi alterada no servidor. Confira com o gestor.';
    end if;
    v_final := (p_payload->>'km_final')::numeric;
    v_end := (p_payload->>'data_fim')::timestamptz;
    if v_final is null or v_final < v_km.km_inicial or v_final > 999999999 or v_final <> trunc(v_final)
      or v_end is null or v_end < v_km.data_inicio or v_end > now() + interval '10 minutes' then
      raise exception 'Horário ou KM final inválido.';
    end if;
    update public.controle_km set km_final = v_final, km_percorrido = (v_final-km_inicial)::integer,
      data_fim = v_end,duracao_minutos = round(extract(epoch from (v_end-data_inicio))/60)::integer,
      status = 'finalizado',ocorrencia = p_payload->>'ocorrencia',updated_at = now()
      where id = v_id returning * into v_km;
    update public.frotas set quilometragem = greatest(quilometragem,v_final),km_atualizado_em = now(),updated_at = now() where id = v_km.frota_id;
    perform public.mobile_refresh_fleet(v_km.frota_id);
    v_result := jsonb_build_object('trip',to_jsonb(v_km));
  else raise exception 'Tipo de operação não permitido.';
  end if;

  insert into public.auditoria (user_id,acao,entidade,entidade_id,detalhes)
    values (v_user,'CREATE','mobile_sync',v_id::text,'Sincronização Android: ' || p_kind || ' / ' || p_operation_id::text);
  insert into public.mobile_sync_receipts (user_id,operation_id,payload,result)
    values (v_user,p_operation_id,v_envelope,v_result);
  return v_result;
end;
$$;
revoke all on function public.mobile_apply_operation(uuid,text,jsonb) from public, anon;
grant execute on function public.mobile_apply_operation(uuid,text,jsonb) to authenticated;
commit;
