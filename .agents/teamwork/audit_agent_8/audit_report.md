# Auditoría Integral: Presupuestos, Recurrencias, Exclusiones y Planificación (Agente 8)

**Documento:** Informe Técnico de Auditoría de Código y Arquitectura Financiera  
**Módulo Asignado:** Motor de Transacciones Recurrentes, Exclusiones/Anulaciones, Presupuestos Mensuales, Invariante de Previsión Completa y Proyecciones Patrimoniales/Flujo de Caja  
**Entorno:** fintrack (Vanilla JS SPA + PostgreSQL / Supabase)  
**Fecha:** 2026-11-14  
**Auditor:** Agente 8 (Budgets, Recurring Schedules & Planning Auditor)  
**Modalidad:** Inspección estricta de solo lectura (Read-Only Audit)  

---

## 1. Resumen Ejecutivo y Alcance del Dominio

El presente informe constituye la auditoría técnica exhaustiva del subsistema de **presupuestos, programación recurrente y planificación financiera** de `fintrack`. Se ha analizado minuciosamente el código fuente monolítico en `index.html`, las migraciones SQL en `supabase/migrations/` y las Edge Functions de Supabase (`monthly-report` y `automatic-backup`), con el objetivo de verificar la robustez matemática, la integridad en condiciones de frontera (bisiestos, meses de longitud variable, anulaciones de cuotas), el cumplimiento de invariantes de negocio y la consistencia entre clientes y servicios remotos.

### Hallazgos Principales:
1. **Resurrección involuntaria de series periódicas al editar (`saveTx` + `future`):** Al modificar una cuota existente y desmarcar "Gasto recurrente" seleccionando "Esta y todas las futuras", `syncRecurSeries` solo actualiza movimientos con `date >= fromDate`. Las cuotas pasadas retienen `recurring: true` y `recur_series_id`, lo que provoca que en la siguiente sincronización `processRecurring` trate la serie como activa y regenere automáticamente todas las cuotas futuras desde la última transacción pasada.
2. **Inmutabilidad del día ancla al modificar fechas (`recur_anchor_date`):** Al desplazar una cuota mensual a un nuevo día del mes seleccionando "Esta y todas las futuras", el código preserva forzosamente `oldTx.recur_anchor_date` (línea 7253), ignorando el nuevo día introducido por el usuario. Al llegar el siguiente mes, `processRecurring` vuelve a forzar la fecha al día ancla original antiguo.
3. **Omisión permanente de cuotas intermedias por registros adelantados:** Si un usuario registra manualmente una cuota futura por adelantado (por ejemplo, pago anticipado de dos meses), `processRecurring` toma `lastDate = max(tx.date)` de la serie (línea 3988). El puntero de avance salta directamente a partir de la fecha adelantada, omitiendo de manera irreversible todos los meses intermedios que no se habían materializado.
4. **Discrepancia en umbrales de alerta presupuestaria (80% warning vs color de barra):** En `renderCatTab`, el texto de aviso ámbar evalúa `Math.round(amt / budget * 100) >= 80` (línea 5183), mientras que la coloración de la barra de progreso evalúa `amt >= budget * 0.8` (línea 5257). Un gasto de 79,99 € con presupuesto de 100 € redondea a 80% (texto de alerta ámbar) pero muestra la barra en verde/color base, provocando una contradicción visual.
5. **Divergencia entre frontend y Edge Function `monthly-report`:** El invariante de "previsión completa" para suscripciones se computa dinámicamente en el cliente mediante `autoRecurBudgetBreakdown`, sin persistir un registro estático en `budgets`. La función remota `monthly-report` solo consulta la tabla física `budgets`. Como consecuencia, en el informe mensual PDF por correo, la categoría Suscripciones figura con presupuesto 0,00 €, marcándola erróneamente como presupuesto superado y falseando las estadísticas del correo.
6. **Distorsión retroactiva de presupuestos pasados por cambios de cuota:** `autoRecurBudgetBreakdown` extrae el importe unitario de la última cuota histórica disponible en toda la serie (`latest`, línea 3114). Si una suscripción incrementa de precio en julio, consultar meses pasados (marzo) recalcula retroactivamente el presupuesto de marzo con la tarifa incrementada de julio.

---

## 2. Arquitectura y Modelo de Datos

### 2.1 Entidades y Persistencia en Supabase
A diferencia de otros sistemas financieros que disponen de una tabla maestra `recurring_series` o `schedules`, `fintrack` implementa un modelo **implícito descentralizado** embebido en las filas de `transactions`.

```
┌────────────────────────────────────────────────────────┐
│                   transactions                         │
├────────────────────────────────────────────────────────┤
│ id: text (PK)                                          │
│ user_id: uuid (FK auth.users)                          │
│ type: text ('expense' | 'income' | 'transfer')         │
│ amount: numeric(12,2)                                  │
│ category: text (FK categories)                         │
│ subcategory: text                                      │
│ note: text                                             │
│ date: date                                             │
│ recurring: boolean                                     │
│ recur_interval: text ('weekly','biweekly','monthly',  │
│                       'quarterly','semiannual','yearly')│
│ recur_end_date: date                                   │
│ recur_series_id: text                                  │
│ recur_anchor_date: date                                │
│ tags: text[]                                           │
│ account_id: text (FK accounts)                         │
│ to_account_id: text                                    │
│ exclude_from_calc: boolean                             │
│ is_balance_adjustment: boolean                         │
└────────────────────────────────────────────────────────┘
            │                                 │
            ▼ (1:N)                           ▼ (1:N)
┌───────────────────────────────┐ ┌───────────────────────────────┐
│     recurrence_exclusions     │ │       transaction_voids       │
├───────────────────────────────┤ ├───────────────────────────────┤
│ id: text (PK)                 │ │ id: text (PK)                 │
│ user_id: uuid (FK auth.users) │ │ user_id: uuid (FK auth.users) │
│ recur_series_id: text         │ │ transaction_id: text          │
│ skipped_date: date            │ │ transaction_data: jsonb       │
│ created_at: timestamptz       │ │ voided_at: timestamptz        │
│ UNIQUE(user_id,               │ │ UNIQUE(user_id,               │
│        recur_series_id,       │ │        transaction_id)        │
│        skipped_date)          │ └───────────────────────────────┘
└───────────────────────────────┘
```

```
┌────────────────────────────────────────────────────────┐
│                        budgets                         │
├────────────────────────────────────────────────────────┤
│ id: text (PK)                                          │
│ user_id: uuid (FK auth.users)                          │
│ category_id: text (FK categories)                      │
│ amount: numeric(12,2)                                  │
│ is_total: boolean (siempre false en frontend actual)   │
│ month_year: text ('YYYY-MM')                           │
│ note: text                                             │
│ UNIQUE(user_id, month_year, category_id)               │
└────────────────────────────────────────────────────────┘
```

---

## 3. Auditoría del Motor de Recurrencias (`processRecurring` y `addInterval`)

### 3.1 Algoritmo de Avance Temporal (`addInterval`, líneas 3933–3946)

```javascript
// index.html:3933-3945
function addInterval(d,interval,anchorDay){
  var nd=new Date(d.getTime());
  if(interval==='weekly'){nd.setDate(nd.getDate()+7);return nd;}
  if(interval==='biweekly'){nd.setDate(nd.getDate()+14);return nd;}
  var targetDay=anchorDay||nd.getDate();
  nd.setDate(1);
  if(interval==='yearly')nd.setFullYear(nd.getFullYear()+1);
  else if(interval==='quarterly')nd.setMonth(nd.getMonth()+3);
  else if(interval==='semiannual')nd.setMonth(nd.getMonth()+6);
  else nd.setMonth(nd.getMonth()+1);
  var dim=new Date(nd.getFullYear(),nd.getMonth()+1,0).getDate();
  nd.setDate(Math.min(targetDay,dim));
  return nd;
}
```

#### Análisis de Aritmética de Calendario:
- **Protección contra desbordamiento de meses:** La instrucción `nd.setDate(1)` previa a `setMonth(...)` es una excelente salvaguarda. Evita el clásico error de JavaScript en el que sumar un mes a un objeto `Date` situado a día 31 desborda automáticamente a dos meses vista (ej. 31 de enero -> 3 de marzo).
- **Tratamiento de meses cortos y años bisiestos:** La variable `dim = new Date(nd.getFullYear(), nd.getMonth()+1, 0).getDate()` calcula de forma precisa los días del mes de destino.
  - Enero 31 -> Febrero (no bisiesto): `dim = 28`, `Math.min(31, 28) = 28` (28 de febrero).
  - Enero 31 -> Febrero (año bisiesto 2028): `dim = 29`, `Math.min(31, 29) = 29` (29 de febrero).
  - Febrero 28/29 -> Marzo: si `anchorDay = 31` se preserva, `Math.min(31, 31) = 31` (31 de marzo).

#### Vulnerabilidad de Deriva en Semanales / Quincenales:
Para intervalos `weekly` y `biweekly`, la función ejecuta directamente:
`nd.setDate(nd.getDate() + 7)` o `+ 14`.
El parámetro `anchorDay` se ignora por completo. Si el usuario modifica la fecha de una cuota individual desplazándola de lunes a miércoles, `lastDate` en `processRecurring` se convierte en miércoles. A partir de ese momento, todas las cuotas subsiguientes se generan en miércoles.

---

### 3.2 Generación y Materialización de Cuotas (`processRecurring`, líneas 3947–4045)

```javascript
// index.html:3986-3995
var anchorDateStr=root.recur_anchor_date||latest.recur_anchor_date||root.date||latest.date;
var anchorDay=parseInt(anchorDateStr.slice(8,10),10);
var effectiveEndDate=latest.recur_end_date||root.recur_end_date;
var endDate=effectiveEndDate?new Date(effectiveEndDate+'T12:00:00'):null;
var lastDate=new Date(root.date+'T12:00:00');
related.forEach(function(tx){var d=new Date(tx.date+'T12:00:00');if(d>lastDate)lastDate=d;});
var next=addInterval(lastDate,interval,anchorDay);
while(next<=today&&(!endDate||next<=endDate)){
  var newDate=next.getFullYear()+'-'+pad(next.getMonth()+1)+'-'+pad(next.getDate());
  var dup=transactions.find(function(tx){
    if(root.recur_series_id)return tx.recur_series_id===root.recur_series_id&&tx.date===newDate;
    return tx.category===root.category&&tx.type===root.type&&tx.account_id===root.account_id&&Math.abs(tx.amount-root.amount)<0.01&&(tx.recur_interval||'monthly')===interval&&tx.date===newDate;
  });
  if(!dup&&!isRecurrenceExcluded(seriesKey,newDate)){
    // inserción de newTx
  }
  next=addInterval(next,interval,anchorDay);
}
```

#### Hallazgos Críticos en `processRecurring`:

1. **Salto Destructivo por Movimientos Anticipados (Línea 3988):**
   ```javascript
   var lastDate=new Date(root.date+'T12:00:00');
   related.forEach(function(tx){var d=new Date(tx.date+'T12:00:00');if(d>lastDate)lastDate=d;});
   var next=addInterval(lastDate,interval,anchorDay);
   ```
   Si una serie tiene cuotas en enero y febrero, y el usuario inserta manualmente una cuota para mayo (por ejemplo, fianza o pago anticipado trimestral asignado a la misma serie), `lastDate` se fija en mayo. `next` se calcula a partir de mayo (`addInterval(mayo) = junio`). Como `next <= today` (en marzo) es falso, el bucle finaliza sin generar marzo ni abril. Las cuotas de marzo y abril quedan permanentemente perdidas.

2. **Resurrección de Series al Apagar Recurrencia en Edición (`saveTx`, líneas 7254–7259):**
   Al editar una cuota recurrente y desmarcar el switch de recurrencia (`payload.recurring = false`) con opción "Esta y todas las futuras" (`future`):
   ```javascript
   // index.html:7256-7257
   if(!payload.recurring){payload.recur_series_id=null;seriesFields.recur_series_id=null;}
   try{await syncRecurSeries(seriesIdForSync,editingTxId,payload.date,seriesFields);}catch(ex){}
   ```
   `syncRecurSeries` ejecuta:
   ```javascript
   // index.html:7180
   var siblings=transactions.filter(function(t){return t.recur_series_id===seriesId&&t.id!==editedId&&t.date>=fromDate;});
   ```
   Las transacciones pasadas (`date < fromDate`) **no se modifican**: conservan `recurring: true`, `recur_series_id: seriesIdForSync` y `recur_end_date: null`.
   En el siguiente arranque (`loadData -> processRecurring`), el motor encuentra las cuotas pasadas, detecta una serie recurrente activa sin fecha de fin, toma la última cuota pasada como `lastDate` y **vuelve a generar todas las cuotas futuras**. La recurrencia eliminada resucita.
   *Contraste:* En `deleteRecurringFromHere` (línea 7367), esto sí se contempló correctamente actualizando las cuotas pasadas con `stopFields = {recurring:false, recur_interval:null, recur_end_date:null, recur_series_id:null}`. En `saveTx` se omitió este saneamiento.

3. **Inmutabilidad del Día Ancla al Desplazar Cuotas Futuras (`saveTx`, líneas 7253–7255):**
   ```javascript
   // index.html:7253-7254
   var preservedAnchor=(oldTx&&oldTx.recur_anchor_date)||payload.date;
   payload.recur_anchor_date=payload.recurring?preservedAnchor:null;
   ```
   Si una serie se inició el día 5 de enero (`recur_anchor_date = 2026-01-05`) y el usuario edita la cuota de abril para moverla al día 20 con "Esta y todas las futuras", `oldTx.recur_anchor_date` tiene valor, por lo que `preservedAnchor` sigue valiendo `2026-01-05`. La nueva cuota de abril se guarda con fecha 20, pero su ancla sigue siendo el día 5. En mayo, `processRecurring` lee `anchorDay = 5` y genera mayo en el día 5, anulando el cambio solicitado por el usuario.

4. **Desaparición de Series al Eliminar la Única Ocurrencia:**
   Si una serie recién creada cuenta únicamente con la cuota inicial y el usuario pulsa "Eliminar esta ocurrencia" (`deleteOnlyRecurringOccurrence`), la fila se traslada a `transaction_voids` y `recurrence_exclusions`. Al no quedar ninguna fila en `transactions` con ese `recur_series_id`, `processRecurring` (línea 3949) no tiene sobre qué iterar, provocando la pérdida total y silenciosa de la serie periódica.

---

## 4. Auditoría de Exclusiones y Anulaciones (`recurrence_exclusions` y `transaction_voids`)

### 4.1 Mecánica de Exclusiones de Recurrencia
- La tabla `recurrence_exclusions` almacena triples `(user_id, recur_series_id, skipped_date)`.
- En el cliente, `isRecurrenceExcluded(seriesKey, date)` comprueba si una fecha concreta ha sido excluida para evitar su regeneración.
- Al deshacer un borrado (`undoRecurringOccurrenceDelete`, líneas 7420–7438), se elimina la exclusión por clave compuesta y se invoca `restoreTx`.

### 4.2 Mecánica de Transacciones Anuladas (`transaction_voids`)
- La RPC `void_fintrack_transaction` y la RPC `skip_fintrack_recurring_occurrence` guardan una copia íntegra en JSONB de la transacción antes de eliminarla de `transactions`.
- Esto previene la resurrección accidental y permite restaurar movimientos con precisión.

### 4.3 Fallos y Vulnerabilidades Detectadas:

1. **Omisión de `transaction_voids` en la ruta offline/fallback de `deleteOnlyRecurringOccurrence`:**
   ```javascript
   // index.html:7351-7357
   }catch(ex){
     recurrenceExclusions.push(exclusion);
     queueOp({type:'insert',table:'recurrence_exclusions',data:exclusion});
     queueOp({type:'delete',table:'transactions',id:tx.id});
     transactions=transactions.filter(function(item){return item.id!==tx.id;});
     saveLocalCache();setSync('err');refreshTab();
     showUndoToast('Transacción eliminada',function(){undoRecurringOccurrenceDelete(tx,exclusion);});
   }
   ```
   En la línea 7353, se encola la inserción en `recurrence_exclusions` y el borrado de `transactions`, **pero no se encola la inserción en `transaction_voids`**. Si el usuario elimina una ocurrencia recurrente sin conexión y luego se produce una sincronización, la anulación no queda registrada en el histórico de auditoría de Supabase.

2. **Bucle Redundante de Borrado en `restoreTx` (Línea 7447):**
   ```javascript
   // index.html:7447
   for(var vi=0;vi<voids.length;vi++){
     var vr=await sb.from('transaction_voids').delete().eq('transaction_id',tx.id);
     if(vr.error)throw vr.error;
   }
   ```
   La consulta `sb.from('transaction_voids').delete().eq('transaction_id', tx.id)` borra todos los registros coincidentes en una sola llamada. Ejecutarla dentro de un bucle `for` de longitud `voids.length` dispara $N$ peticiones idénticas a Supabase.

---

## 5. Auditoría de Presupuestos Mensuales y Alertas de Umbral

### 5.1 Desglose Automático de Recurrencias (`autoRecurBudgetBreakdown`, líneas 3086–3124)

```javascript
// index.html:3086-3123
function autoRecurBudgetBreakdown(catId,year,month){
  var seriesMap={};
  transactions.forEach(function(t){
    if(!t.recurring||t.type!=='expense'||t.category!==catId||isTxExcludedFromExpense(t))return;
    var interval=t.recur_interval||'monthly';
    var key=recurrenceSeriesKey(t);
    (seriesMap[key]=seriesMap[key]||[]).push(t);
  });
  var total=0,items=[];
  Object.keys(seriesMap).forEach(function(key){
    var group=seriesMap[key];
    var root=group[0];
    group.forEach(function(t){if(new Date(t.date+'T12:00:00')<new Date(root.date+'T12:00:00'))root=t;});
    var interval=root.recur_interval||'monthly';
    var latestCandidate=group[0]; group.forEach(function(t){if(new Date(t.date+'T12:00:00')>new Date(latestCandidate.date+'T12:00:00'))latestCandidate=t;});
    var interval=latestCandidate.recur_interval||root.recur_interval||'monthly';
    var anchorSource=latestCandidate.recur_anchor_date||latestCandidate.date||root.recur_anchor_date||root.date;
    var anchorDay=parseInt(anchorSource.slice(8,10),10);
    var effectiveEndDate=latestCandidate.recur_end_date||root.recur_end_date;
    var endDate=effectiveEndDate?new Date(effectiveEndDate+'T12:00:00'):null;
    var rootDate=new Date(root.date+'T12:00:00');
    var monthStart=new Date(year,month,1,12,0,0);
    var monthEnd=new Date(year,month+1,0,12,0,0);
    if(rootDate>monthEnd)return;
    if(endDate&&endDate<monthStart)return;
    var occ=rootDate,guard=0,count=0;
    while(occ<=monthEnd&&guard<5000){
      var occDate=occ.getFullYear()+'-'+pad(occ.getMonth()+1)+'-'+pad(occ.getDate());
      if(occ>=monthStart&&occ<=monthEnd&&(!endDate||occ<=endDate)&&!isRecurrenceExcluded(key,occDate))count++;
      occ=addInterval(occ,interval,anchorDay);
      guard++;
    }
    var latest=group[0];
    group.forEach(function(t){if(new Date(t.date+'T12:00:00')>new Date(latest.date+'T12:00:00'))latest=t;});
    var unitAmount=Number(latest.amount!=null?latest.amount:root.amount);
    if(count>0){
      var amt=unitAmount*count;
      total+=amt;
      items.push({label:latest.note||root.note||'Gasto recurrente',amount:Math.round(amt*100)/100,count:count});
    }
  });
  return {total:Math.round(total*100)/100,items:items};
}
```

#### Hallazgos en el Cálculo Presupuestario:

1. **Distorsión Retroactiva por Precios Futuros:**
   En las líneas 3113–3115, `latest` se busca sobre **todo el array de transacciones del grupo**, sin acotar por la fecha del mes consultado (`monthEnd`).
   *Escenario de error:* Un servicio de suscripción cuesta 10 € de enero a junio de 2026. En julio sube a 15 €. Al consultar el presupuesto de marzo de 2026, `unitAmount` toma 15 € (el valor de julio). Los presupuestos cerrados pasados sufren una modificación retroactiva artificial.

2. **Divergencia por Transacciones en Modo "No computar" (`_no_calc`):**
   Si una cuota recurrente individual de un mes específico es marcada como "No computar" (`getEffectiveTxCalcMode(t) === 2`):
   - Al iterar `transactions` en la línea 3089, esa cuota concreta se descarta de `seriesMap`.
   - Sin embargo, las demás cuotas de la misma serie (de meses anteriores o posteriores) sí entran en `seriesMap`.
   - En el bucle `while(occ <= monthEnd)`, al llegar a la fecha de ese mes, `isRecurrenceExcluded(key, occDate)` devuelve `false` (porque no se ha eliminado la cuota, solo se ha marcado como no computable).
   - Resultado: El presupuesto automático sigue sumando el importe de esa cuota en el presupuesto del mes, pero el gasto real `calcPeriodTotals` lo excluye. El usuario verá un presupuesto que incluye un gasto que explícitamente marcó como no computable.

3. **Inconsistencia de Alertas de Umbral (Línea 5183 vs Línea 5257):**
   ```javascript
   // index.html:5178-5186
   var used=Math.round(amt/budget*100);
   if(diff>0){ ... }
   else if(used>=80){
     statusText='Quedan '+fmt(budget-amt)+' ('+used+'% usado)';
     alertClass+=' budget-alert-warn'; // Ámbar
     amtColor='var(--amber)';
   }
   // index.html:5257
   var barColor = isExcluded ? 'var(--separator2)' : (budget>0 ? (amt>budget ? 'var(--red)' : (amt>=budget*0.8 ? 'var(--amber)' : c.color)) : c.color);
   ```
   - Si `amt = 79.99 €` y `budget = 100.00 €`:
     - `used = Math.round(79.99) = 80`.
     - Condición de texto: `used >= 80` -> Verdadero. El texto muestra: *"Quedan 20,01 € (80% usado)"* coloreado en **ámbar**.
     - Condición de barra: `79.99 >= 100 * 0.8` (`79.99 >= 80.00`) -> Falso. La barra se pinta con `c.color` (**verde/azul normal**).
   - Se produce una incongruencia cromática inmediata en el dashboard.

4. **Gradiente de la Barra Total (`budgetGradientColor`, líneas 2726–2732):**
   ```javascript
   function budgetGradientColor(pct){
     pct=Math.max(0,Math.min(pct,100));
     var green=[52,199,89],amber=[255,149,0],red=[255,59,48],c1,c2,t;
     if(pct<=80){c1=green;c2=amber;t=pct/80;}else{c1=amber;c2=red;t=(pct-80)/20;}
     var r=Math.round(c1[0]+(c2[0]-c1[0])*t),g=Math.round(c1[1]+(c2[1]-c1[1])*t),b=Math.round(c1[2]+(c2[2]-c1[2])*t);
     return 'rgb('+r+','+g+','+b+')';
   }
   ```
   La función interpola limpiamente en RGB desde Verde (`#34C759`) en 0% hasta Ámbar (`#FF9500`) en 80%, y desde Ámbar hasta Rojo (`#FF3B30`) en 100%. En móvil y desktop, si `tExp / tb * 100 >= 100`, se asigna directamente `'var(--red)'`. El gradiente funciona de manera fluida y matemáticamente correcta.

---

## 6. Verificación del Invariante: "Previsión Completa" frente a "Gasto Real"

### 6.1 Regla Financiera Innegociable (§4.3 de `PROJECT_CONTEXT.md`)
> *"El presupuesto mensual, en cambio, es una previsión completa: debe sumar los gastos recurrentes previstos de ese mes, aunque todavía no se hayan producido. No se debe cambiar esta regla para hacer que presupuesto y gasto real sean iguales."*

### 6.2 Evaluación del Cumplimiento en el Frontend
- **En la categoría "Suscripciones" (sin presupuesto manual fijado):**
  - **Día 1 del mes:** Gasto ejecutado = 0,00 €. Presupuesto = suma de todas las recurrencias proyectadas para el mes completo (ej. 150,00 €). Cumplimiento = 0%.
  - **A lo largo del mes:** A medida que las cuotas se ejecutan (mediante `processRecurring`), el gasto ejecutado se incrementa (ej. 50,00 €, 100,00 €), mientras que el presupuesto se mantiene estable en 150,00 €.
  - **Conclusión:** El invariante se cumple de forma impecable en la categoría Suscripciones.

### 6.3 Quiebra del Invariante en el Ecosistema General:

1. **Restricción Exclusiva por Nombre de Categoría:**
   `isAutoSubBudgetCat(catId)` exige taxativamente que `category.name.trim().toLowerCase() === 'suscripciones'`.
   Si el usuario tiene gastos periódicos recurrentes en otras categorías fundamentales:
   - "Hogar" (Alquiler o Hipoteca periódica)
   - "Suministros" (Internet, Electricidad, Agua)
   - "Educación" (Colegio, Guardería)
   - "Seguros" (Seguro de coche, Seguro de hogar)
   Dichas categorías **no reciben presupuesto proyectado automático**. Su presupuesto devuelve `0,00 €` (salvo que el usuario introduzca manualmente una cifra fija). Cuando las cuotas se ejecutan, el gasto salta repentinamente y desborda el presupuesto.

2. **Quiebra Absoluta en Edge Function `monthly-report`:**
   En `supabase/functions/monthly-report/index.ts` (líneas 372 y 394):
   ```typescript
   db.from("budgets").select("category_id,amount").eq("user_id", targetUserId).eq("month_year", key)
   ```
   La función remota **no implementa `autoRecurBudgetBreakdown`**. Solo lee la tabla `budgets`.
   Si el usuario utiliza el cálculo automático para Suscripciones, no existe ninguna fila en la base de datos para esa categoría. La Edge Function asume presupuesto `0,00 €`, imprime `Suscripciones: 120,00 € / 0,00 €` y la clasifica erróneamente en la sección *"Presupuestos superados"*, generando alarma injustificada en el correo mensual del usuario.

---

## 7. Auditoría de Proyecciones de Flujo de Caja y Patrimonio

### 7.1 Visualización Anual y Patrimonio (`renderAnnualTab`, líneas 6318–6375)
- El gráfico de evolución patrimonial (`#lineChartCanvas`) traza la curva de saldos a final de cada mes (`lastDayOfMonthStr(chartYear, m+1)`) invocando `accountCalcBalanceAsOf(a.id, endOfMonth)`.
- `accountCalcBalanceAsOf` computa el saldo sumando las transacciones reales persistidas en `transactions` a partir del último snapshot de conciliación.
- **Comportamiento en Meses Futuros:**
  Las recurrencias futuras no materializadas **no existen físicamente en `transactions`**. Por tanto, para los meses posteriores al mes en curso, `accountCalcBalanceAsOf` devuelve un saldo constante plano igual al saldo actual. El gráfico no proyecta el impacto de las cuotas recurrentes venideras en el saldo bancario futuro.

### 7.2 Coherencia con Decisiones Vinculantes del Usuario (§12 de `PROJECT_CONTEXT.md`)
Es imperativo contrastar este comportamiento con las decisiones vinculantes registradas en el proyecto:
- **Decisión 691 (2026-09-08):** *"Previsión de tesorería a final de mes (Cash Flow Runway / proyección lineal basada en ritmo de gasto diario). Descartado por el usuario: se mantiene el balance real y presupuestos sin proyecciones lineales estimadas."*
- **Decisión 668 (2026-09-17):** *"Nuevos módulos y widgets de previsión (Run-rate fin de mes, Safe-to-Spend... Rechazado expresamente por el usuario)."*
- **Sección 13 (Ideas futuras priorizadas):** *"Planificación | Previsión de tesorería a 30/60/90 días y calendario financiero. | Distinguir previsión de gasto ejecutado y explicar las hipótesis."*

**Dictamen del Auditor:**  
La ausencia de proyecciones lineales de runway o estimaciones especulativas en el dashboard cumple estrictamente la voluntad del usuario. Sin embargo, en el cálculo de patrimonio futuro del año en curso, el gráfico dibuja una línea plana que ignora las recurrencias ya programadas y comprometidas.

---

## 8. Matriz de Priorización Impacto vs. Esfuerzo

| ID | Hallazgo / Propuesta | Impacto | Esfuerzo | Justificación Técnica |
|---|---|:---:|:---:|---|
| **H1** | **Blindar `saveTx` contra la resurrección de recurrencias apagadas** | **Alto** | **Bajo** | Cuando se apaga `recurring` con opción "futuras", deben actualizarse también las cuotas pasadas con `stopFields` (igual que en `deleteRecurringFromHere`), evitando que `processRecurring` las resucite. |
| **H2** | **Permitir cambio de día ancla (`recur_anchor_date`) en edición** | **Alto** | **Bajo** | En `saveTx` (línea 7253), si el usuario editó la fecha y eligió "futuras", el nuevo día ancla debe ser el día de `payload.date`, no el día antiguo `oldTx.recur_anchor_date`. |
| **H3** | **Sincronizar cálculo de previsión automática en `monthly-report`** | **Alto** | **Medio** | Portar `autoRecurBudgetBreakdown` a TypeScript Deno en la Edge Function para que el informe PDF por correo refleje el presupuesto real de suscripciones y no marque 0 € de presupuesto. |
| **H4** | **Subsanar omisión de meses intermedios ante cuotas adelantadas** | **Medio** | **Medio** | En `processRecurring`, no calcular `lastDate` como el máximo global de la serie si este supera `today`. El bucle debe verificar la existencia de huecos mensuales entre cuotas. |
| **H5** | **Armonizar umbral del 80% en Categorías (`used >= 80` vs barra)** | **Medio** | **Bajo** | Alinear línea 5257 con línea 5183: `amt >= budget * 0.8` frente a `used >= 80`, evitando discrepancia de color entre texto y barra de progreso. |
| **H6** | **Encolar `transaction_voids` en la ruta offline de `deleteOnlyRecurringOccurrence`** | **Medio** | **Bajo** | Añadir `queueOp({type:'insert', table:'transaction_voids', data:voided})` en el bloque offline y catch de la línea 7353 para garantizar la paridad con `deleteTx`. |
| **H7** | **Acotar `latest` por fecha en `autoRecurBudgetBreakdown`** | **Bajo** | **Bajo** | Filtrar `group` para que `latest` sea la transacción más reciente con `date <= monthEnd`, impidiendo que subidas de precio futuras alteren presupuestos pasados. |
| **H8** | **Optimizar bucle de borrado en `restoreTx`** | **Bajo** | **Bajo** | Sustituir el bucle `for` redundante que borra por `transaction_id` en `transaction_voids` por una única llamada a Supabase. |

---

## 9. Análisis de Riesgos de Regresión

1. **Riesgo en Modificaciones de `processRecurring`:**
   `processRecurring` se ejecuta en cada inicio de sesión y sincronización en segundo plano. Un cambio erróneo en la condición del bucle `while` o en `addInterval` podría generar bucles infinitos, congelar el hilo principal de la UI o insertar cuotas duplicadas en masa en Supabase.
   *Mitigación:* Toda modificación debe preservar la comprobación `dup` en memoria, la deduplicación por clave de transacción en la RPC `create_fintrack_recurring_occurrence` y el watchdog de seguridad de arranque de 5 segundos.

2. **Riesgo en Migración de Días Ancla:**
   Modificar `recur_anchor_date` no debe alterar cuotas pasadas ya contabilizadas en periodos cerrados ni distorsionar los desfases de conciliación bancaria de meses anteriores.

3. **Riesgo en Edge Function `monthly-report`:**
   Introducir la lógica de proyección en Deno requiere cargar la tabla `transactions` de la serie recurrente completa (no solo el rango del mes actual). Debe controlarse el consumo de memoria y el tiempo de ejecución para evitar exceder el límite de Deno Deploy (50 ms CPU / 150 s wall clock).

---

## 10. Plan de Verificación y Banco de Pruebas

Para validar independientemente estos hallazgos y futuras correcciones, se establece el siguiente protocolo de prueba:

### Test 1: Simulación de Resurrección de Serie al Apagar Recurrencia
- **Entrada:** Serie recurrente mensual con cuotas en enero, febrero y marzo de 2026.
- **Acción:** Abrir cuota de marzo en modal de edición. Desactivar switch de recurrencia. Guardar seleccionando "Esta y todas las futuras".
- **Comprobación:** Avanzar reloj a abril de 2026 y disparar `processRecurring()`.
- **Criterio de Éxito:** No debe generarse ninguna cuota en abril. Si se genera cuota en abril, se confirma el bug H1.

### Test 2: Cambio de Día Ancla (Día 5 al Día 20)
- **Entrada:** Serie recurrente el día 5 de cada mes.
- **Acción:** Editar cuota de marzo, cambiar fecha al 20 de marzo. Guardar con "Esta y todas las futuras".
- **Comprobación:** Simular llegada de abril y disparar `processRecurring()`.
- **Criterio de Éxito:** La cuota de abril debe generarse el 20 de abril. Si se genera el 5 de abril, se confirma el bug H2.

### Test 3: Registro Anticipado y Salto de Meses
- **Entrada:** Serie mensual al día 1. Cuotas registradas en enero y febrero.
- **Acción:** Registrar manualmente una cuota para el 1 de mayo con el mismo `recur_series_id`.
- **Comprobación:** Situar fecha del sistema en 15 de marzo y ejecutar `processRecurring()`.
- **Criterio de Éxito:** Deben generarse automáticamente las cuotas del 1 de marzo y 1 de abril. Si `processRecurring` devuelve 0, se confirma el bug H4.

### Test 4: Verificación de Umbral de Alerta Presupuestaria al 79.99%
- **Entrada:** Presupuesto de categoría de 100,00 €.
- **Acción:** Registrar un gasto de 79,99 €.
- **Comprobación:** Inspeccionar clases CSS de texto (`.cat-sub-text`) y barra (`.cat-bar-fill`).
- **Criterio de Éxito:** Ambos indicadores deben compartir la misma semántica cromática.

---

*Fin del Informe de Auditoría — Agente 8 (Budgets, Recurring Schedules & Planning Auditor)*
