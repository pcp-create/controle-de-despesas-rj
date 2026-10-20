-- Aplicar no Supabase do projeto. Não recria tabelas nem altera políticas existentes.
BEGIN;
CREATE OR REPLACE FUNCTION public.corrigir_despesa_grupo(p_id uuid, p_campos jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  original public.despesas%ROWTYPE;
  parcela public.despesas%ROWTYPE;
  novos public.despesas%ROWTYPE;
  total_centavos bigint;
  base_centavos bigint;
  quantidade integer;
  indice integer := 0;
  alteradas integer;
  ids uuid[];
  grupo uuid;
  solicitadas integer;
  nova_id uuid;
  existentes integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND ativo AND perfil IN ('administrador', 'financeiro')) THEN
    RAISE EXCEPTION 'Somente Administrador e Financeiro podem corrigir despesas';
  END IF;
  IF p_campos IS NULL OR jsonb_typeof(p_campos) <> 'object' OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_campos) AS k(key)
    WHERE key NOT IN ('tipo_despesa_id','pagamento_tipo','cartao_id','cliente','numero_os','documento','observacao','data_despesa','hora_despesa','data_checkin','data_checkout','numero_diarias','frota_id','km_atual','litros_abastecidos','valor_litro','tipo_combustivel','comprovante_nome','comprovante_url','valor','numero_parcelas')
  ) THEN RAISE EXCEPTION 'Campos inválidos'; END IF;
  IF jsonb_typeof(p_campos->'valor') IS DISTINCT FROM 'number' OR (p_campos->>'valor')::numeric <= 0 THEN
    RAISE EXCEPTION 'Informe um valor total maior que zero';
  END IF;
  total_centavos := round((p_campos->>'valor')::numeric * 100);
  SELECT * INTO STRICT original FROM public.despesas WHERE id = p_id;
  -- Bloqueia o grupo inteiro antes de calcular e salvar. Qualquer erro desfaz tudo.
  PERFORM id FROM public.despesas
    WHERE id = p_id OR (original.grupo_parcela_id IS NOT NULL AND grupo_parcela_id = original.grupo_parcela_id)
    ORDER BY id FOR UPDATE;
  SELECT array_agg(id ORDER BY parcela_atual, id) INTO ids FROM public.despesas
    WHERE id = p_id OR (original.grupo_parcela_id IS NOT NULL AND grupo_parcela_id = original.grupo_parcela_id);
  quantidade := cardinality(ids);
  existentes := quantidade;
  solicitadas := quantidade;
  IF p_campos ? 'numero_parcelas' THEN
    IF jsonb_typeof(p_campos->'numero_parcelas') IS DISTINCT FROM 'number'
       OR (p_campos->>'numero_parcelas')::numeric <> trunc((p_campos->>'numero_parcelas')::numeric)
       OR (p_campos->>'numero_parcelas')::numeric NOT BETWEEN 1 AND 48 THEN
      RAISE EXCEPTION 'Informe entre 1 e 48 parcelas';
    END IF;
    solicitadas := (p_campos->>'numero_parcelas')::integer;
  END IF;
  IF solicitadas <> quantidade AND EXISTS (
    SELECT 1 FROM public.despesas WHERE id = ANY(ids) AND
      (lancado_erp OR lancado_sistema OR aprovado_financeiro OR reembolso_processado OR erp_status = 'integrado' OR erp_id IS NOT NULL OR lancamento_cancelado)
  ) THEN RAISE EXCEPTION 'Estorne os lançamentos financeiros/ERP antes de alterar a quantidade de parcelas'; END IF;
  grupo := CASE WHEN solicitadas > 1 THEN coalesce(original.grupo_parcela_id, gen_random_uuid()) ELSE NULL END;
  IF solicitadas > quantidade THEN
    FOR i IN quantidade + 1 .. solicitadas LOOP
      nova_id := gen_random_uuid();
      INSERT INTO public.despesas (id, tecnico_id, tipo_despesa_id, cliente, numero_os, valor, data_despesa,
        status_aprovacao, status_erp, gestor_aprovador_id, justificativa_reprovacao, data_envio, data_aprovacao,
        grupo_parcela_id, parcela_atual, numero_parcelas, parcelado, data_vencimento)
      VALUES (nova_id, original.tecnico_id, original.tipo_despesa_id, original.cliente, original.numero_os, 0.01, original.data_despesa,
        original.status_aprovacao, original.status_erp, original.gestor_aprovador_id, original.justificativa_reprovacao, original.data_envio, original.data_aprovacao,
        grupo, i, solicitadas, true,
        (date_trunc('month', coalesce((p_campos->>'data_despesa')::date, original.data_despesa)) +
         make_interval(months => i - 1 + CASE WHEN extract(day FROM coalesce((p_campos->>'data_despesa')::date, original.data_despesa)) > 8 THEN 1 ELSE 0 END) + interval '18 days')::date);
      ids := array_append(ids, nova_id);
    END LOOP;
  ELSIF solicitadas < quantidade THEN
    DELETE FROM public.despesas WHERE id = ANY(ids[solicitadas + 1:quantidade]);
    ids := ids[1:solicitadas];
  END IF;
  quantidade := solicitadas;
  IF total_centavos < quantidade THEN RAISE EXCEPTION 'O total deve permitir pelo menos um centavo por parcela'; END IF;
  base_centavos := total_centavos / quantidade;
  FOR parcela IN SELECT * FROM public.despesas
    WHERE id = ANY(ids)
    ORDER BY parcela_atual, id
  LOOP
    indice := indice + 1;
    novos := jsonb_populate_record(CASE WHEN indice > existentes THEN original ELSE parcela END, p_campos - 'numero_parcelas');
    IF novos.pagamento_tipo <> 'cartao' THEN novos.cartao_id := NULL; END IF;
    UPDATE public.despesas SET
      grupo_parcela_id = grupo, parcela_atual = indice, numero_parcelas = quantidade, parcelado = quantidade > 1,
      tipo_despesa_id = novos.tipo_despesa_id, pagamento_tipo = novos.pagamento_tipo,
      cartao_id = novos.cartao_id, cliente = novos.cliente, numero_os = novos.numero_os,
      documento = novos.documento, observacao = novos.observacao,
      data_despesa = novos.data_despesa, hora_despesa = novos.hora_despesa,
      data_checkin = novos.data_checkin, data_checkout = novos.data_checkout, numero_diarias = novos.numero_diarias,
      frota_id = novos.frota_id, km_atual = novos.km_atual,
      litros_abastecidos = novos.litros_abastecidos, valor_litro = novos.valor_litro,
      tipo_combustivel = novos.tipo_combustivel,
      comprovante_nome = novos.comprovante_nome, comprovante_url = novos.comprovante_url,
      valor = (CASE WHEN indice = quantidade THEN total_centavos - base_centavos * (quantidade - 1) ELSE base_centavos END)::numeric / 100,
      updated_at = now()
    WHERE id = parcela.id;
    GET DIAGNOSTICS alteradas = ROW_COUNT;
    IF alteradas <> 1 THEN RAISE EXCEPTION 'Sem permissão para atualizar uma das parcelas'; END IF;
  END LOOP;
  RETURN quantidade;
END;
$$;
REVOKE ALL ON FUNCTION public.corrigir_despesa_grupo(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.corrigir_despesa_grupo(uuid, jsonb) TO authenticated;
COMMIT;
