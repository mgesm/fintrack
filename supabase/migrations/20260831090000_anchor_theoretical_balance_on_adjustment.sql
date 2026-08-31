-- Cada ajuste de saldo establece el nuevo punto de partida de la cuenta.
-- El desfase anterior sigue existiendo en su movimiento de conciliación.
update public.patrimony p
set theoretical_amount = p.amount
where exists (
  select 1
  from public.transactions t
  where t.user_id = p.user_id
    and t.balance_adjustment_patrimony_id = p.id
);
