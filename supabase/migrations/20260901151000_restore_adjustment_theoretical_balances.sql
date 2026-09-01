-- Un ajuste conserva dos importes: el saldo real observado y el saldo teórico
-- que generan los movimientos. Una migración anterior igualó ambos por error.
-- Recuperamos el teórico desde el movimiento de conciliación vinculado.
update public.patrimony p
set theoretical_amount = case
  when t.type = 'expense' then p.amount + t.amount
  when t.type = 'income' then p.amount - t.amount
  else p.theoretical_amount
end
from public.transactions t
where t.user_id = p.user_id
  and t.balance_adjustment_patrimony_id = p.id
  and t.is_balance_adjustment = true
  and t.type in ('expense', 'income');
