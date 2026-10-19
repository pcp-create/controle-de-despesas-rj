-- Permite ao Financeiro/Admin escolher cartões de qualquer titular na edição.
-- Somente leitura; não altera as permissões de gravação de cartões.
BEGIN;
DROP POLICY IF EXISTS financeiro_cartoes_select ON public.cartoes;
CREATE POLICY financeiro_cartoes_select ON public.cartoes
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id = (SELECT auth.uid())
    AND p.ativo
    AND p.perfil IN ('financeiro', 'administrador')
));
COMMIT;
